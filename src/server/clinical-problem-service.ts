import 'server-only';

import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { AuthUser } from '@/lib/access';
import type { AuditContext } from './audit';
import { audit } from './audit';
import { withTenant } from './db';
import { ApiError } from './http';

const problemStatusSchema=z.object({
  id:z.uuid(),
  version:z.number().int().positive(),
  status:z.enum(['active','resolved']),
  reason:z.string().trim().min(8).max(500),
}).strict();

async function accessiblePatient(db:PoolClient,user:AuthUser,patientId:string){
  const result=await db.query(
    'SELECT 1 FROM app.encounter WHERE patient_id=$1 AND facility_id=ANY($2::uuid[]) LIMIT 1',
    [patientId,user.facilityIds],
  );
  if(!result.rowCount)throw new ApiError(404,'patientNotFound');
}

async function rows(db:PoolClient,user:AuthUser,patientId:string){
  await accessiblePatient(db,user,patientId);
  return (await db.query(`
    SELECT p.id,p.patient_id AS "patientId",p.source_event_id AS "sourceEventId",
      p.latest_event_id AS "latestEventId",p.eye,p.label,p.code_system AS "codeSystem",
      p.code,p.status,p.onset_at AS "onsetAt",p.resolved_at AS "resolvedAt",
      p.resolution_reason AS "resolutionReason",p.version,p.updated_at AS "updatedAt",
      creator.full_name AS "createdBy",updater.full_name AS "updatedBy",
      coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id',t.id,'fromStatus',t.from_status,'toStatus',t.to_status,
          'reason',t.reason,'actor',actor.full_name,'at',t.at
        ) ORDER BY t.at DESC,t.id DESC)
        FROM app.clinical_problem_transition t
        JOIN app.user_account actor ON actor.id=t.actor_id AND actor.tenant_id=t.tenant_id
        WHERE t.problem_id=p.id
      ),'[]'::jsonb) AS history
    FROM app.clinical_problem p
    JOIN app.user_account creator ON creator.id=p.created_by AND creator.tenant_id=p.tenant_id
    JOIN app.user_account updater ON updater.id=p.updated_by AND updater.tenant_id=p.tenant_id
    WHERE p.patient_id=$1
    ORDER BY (p.status='active') DESC,p.updated_at DESC,p.id DESC
  `,[patientId])).rows;
}

export async function problemList(user:AuthUser,input:unknown,context:AuditContext){
  const parsed=z.uuid().safeParse(input);
  if(!parsed.success)throw new ApiError(400,'clinicalInvalid');
  return withTenant(user.tenantId,user.id,async db=>{
    const problems=await rows(db,user,parsed.data);
    await audit(db,{tenantId:user.tenantId,actorId:user.id,action:'clinical.problem_list',entityType:'patient',entityId:parsed.data,metadata:{count:problems.length},context});
    return {problems};
  });
}

export async function updateProblemStatus(user:AuthUser,input:unknown,context:AuditContext){
  const parsed=problemStatusSchema.safeParse(input);
  if(!parsed.success)throw new ApiError(400,'clinicalInvalid');
  const data=parsed.data;
  return withTenant(user.tenantId,user.id,async db=>{
    const problem=(await db.query(`
      SELECT p.*
      FROM app.clinical_problem p
      WHERE p.id=$1 AND EXISTS (
        SELECT 1 FROM app.encounter e
        WHERE e.patient_id=p.patient_id AND e.facility_id=ANY($2::uuid[])
      )
      FOR UPDATE
    `,[data.id,user.facilityIds])).rows[0];
    if(!problem)throw new ApiError(404,'clinicalProblemNotFound');
    if(problem.version!==data.version)throw new ApiError(409,'clinicalConflict');
    if(problem.status===data.status)throw new ApiError(409,'clinicalProblemUnchanged');
    if(data.status==='active'){
      const duplicate=await db.query(`
        SELECT 1 FROM app.clinical_problem
        WHERE patient_id=$1 AND status='active' AND id<>$2 AND eye=$3
          AND lower(btrim(label))=lower(btrim($4))
          AND code_system IS NOT DISTINCT FROM $5
          AND code IS NOT DISTINCT FROM $6
        LIMIT 1
      `,[problem.patient_id,problem.id,problem.eye,problem.label,problem.code_system,problem.code]);
      if(duplicate.rowCount)throw new ApiError(409,'clinicalProblemAlreadyActive');
    }
    const nextVersion=problem.version+1;
    await db.query(`
      UPDATE app.clinical_problem
      SET status=$2,
        resolved_at=CASE WHEN $2='resolved' THEN now() ELSE NULL END,
        resolution_reason=CASE WHEN $2='resolved' THEN $3 ELSE NULL END,
        version=$4,updated_by=$5,updated_at=now()
      WHERE id=$1
    `,[problem.id,data.status,data.reason,nextVersion,user.id]);
    await db.query(
      'INSERT INTO app.clinical_problem_transition(tenant_id,problem_id,from_status,to_status,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6)',
      [user.tenantId,problem.id,problem.status,data.status,data.reason,user.id],
    );
    await audit(db,{tenantId:user.tenantId,actorId:user.id,action:'clinical.problem_status_changed',entityType:'clinical_problem',entityId:problem.id,metadata:{fromStatus:problem.status,toStatus:data.status,version:nextVersion},context});
    return {id:problem.id,status:data.status,version:nextVersion};
  });
}

export async function syncSignedProblems(db:PoolClient,user:AuthUser,eventId:string){
  const source=(await db.query(`
    SELECT d.id,d.author_id,e.patient_id,d.signed_at,d.diagnoses
    FROM app.doctor_event d
    JOIN app.encounter e ON e.id=d.encounter_id AND e.tenant_id=d.tenant_id
    WHERE d.id=$1 AND d.status='signed'
  `,[eventId])).rows[0] as {id:string;author_id:string;patient_id:string;signed_at:string;diagnoses:{eye:'OD'|'OS'|'OU';label:string;codeSystem?:string;code?:string}[]}|undefined;
  if(!source)return 0;
  let created=0;
  for(const diagnosis of source.diagnoses){
    const inserted=await db.query(`
      INSERT INTO app.clinical_problem
        (tenant_id,patient_id,source_event_id,latest_event_id,eye,label,code_system,code,onset_at,created_by,updated_by,updated_at)
      VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$9,$8)
      ON CONFLICT DO NOTHING
      RETURNING id
    `,[user.tenantId,source.patient_id,source.id,diagnosis.eye,diagnosis.label,diagnosis.codeSystem??null,diagnosis.code||null,source.signed_at,source.author_id]);
    if(inserted.rowCount){
      created++;
      await db.query(
        "INSERT INTO app.clinical_problem_transition(tenant_id,problem_id,from_status,to_status,reason,actor_id,at) VALUES($1,$2,NULL,'active','Recorded in signed Doctor Event',$3,$4)",
        [user.tenantId,inserted.rows[0].id,source.author_id,source.signed_at],
      );
    }else{
      await db.query(`
        UPDATE app.clinical_problem
        SET latest_event_id=$3,updated_by=$4,updated_at=$5
        WHERE patient_id=$1 AND status='active' AND eye=$2
          AND lower(btrim(label))=lower(btrim($6))
          AND code_system IS NOT DISTINCT FROM $7
          AND code IS NOT DISTINCT FROM $8
      `,[source.patient_id,diagnosis.eye,source.id,source.author_id,source.signed_at,diagnosis.label,diagnosis.codeSystem??null,diagnosis.code||null]);
    }
  }
  return created;
}
