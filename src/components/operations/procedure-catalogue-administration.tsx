"use client";

import { useState } from 'react';
import { procedureDefinitionSchema, type AdministrationData, type ProcedureCatalogueRecord, type ProcedureDefinition } from '@/lib/administration';

const DEFAULT_DEFINITION:ProcedureDefinition={
  allowedEyes:['OD','OS'],
  preoperativeChecks:[],
  operationNoteFields:[],
  followupSchedule:[],
};

export function ProcedureCatalogueAdministration({data,busy,canWrite,save}:{data:AdministrationData;busy:boolean;canWrite:boolean;save:(resource:string,body:unknown)=>Promise<void>}){
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [creating,setCreating]=useState(false);
  const [jsonError,setJsonError]=useState('');
  const [retireId,setRetireId]=useState<string|null>(null);
  const selected=data.procedureCatalogue.find(item=>item.id===selectedId)??null;

  function definition(form:HTMLFormElement){
    try{
      const parsed=procedureDefinitionSchema.safeParse(JSON.parse(String(new FormData(form).get('definition'))));
      if(!parsed.success){setJsonError('The workflow definition does not match the procedure catalogue rules.');return null;}
      setJsonError('');return parsed.data;
    }catch{setJsonError('The workflow definition is not valid JSON.');return null;}
  }
  async function create(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();const value=definition(event.currentTarget);if(!value)return;const form=new FormData(event.currentTarget);
    await save('procedures',{action:'createDraft',code:form.get('code'),name:form.get('name'),specialty:form.get('specialty'),definition:value});setCreating(false);
  }
  async function saveDraft(event:React.FormEvent<HTMLFormElement>,item:ProcedureCatalogueRecord){
    event.preventDefault();const value=definition(event.currentTarget);if(!value)return;const form=new FormData(event.currentTarget);
    await save('procedures',{action:'saveDraft',id:item.id,revision:item.revision,name:form.get('name'),specialty:form.get('specialty'),definition:value});
  }

  return <section className="panel">
    <div className="registry-heading">
      <div><h2>Procedure catalogue</h2><p className="admin-note">Surgery cases retain their exact procedure version. Published versions are permanent; create a new version for clinical changes.</p></div>
      {canWrite&&<button type="button" className="primary-button" onClick={()=>{setCreating(true);setSelectedId(null);setJsonError('');}}>Add procedure</button>}
    </div>
    <div className="patient-table-wrap"><table className="patient-table">
      <thead><tr><th>Procedure</th><th>Specialty</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{data.procedureCatalogue.map(item=><tr key={item.id}>
        <td><strong>{item.name}</strong><small>{item.code} / version {item.version}</small></td>
        <td>{item.specialty}</td><td>{item.status}</td>
        <td>{canWrite&&<div className="admin-actions">
          {item.status==='draft'?<button type="button" className="text-button" onClick={()=>{setSelectedId(item.id);setCreating(false);setJsonError('');}}>Edit draft</button>:<button type="button" className="text-button" disabled={busy} onClick={()=>void save('procedures',{action:'createVersion',sourceId:item.id})}>Create new version</button>}
          {item.status==='published'&&<button type="button" className="text-button" disabled={busy} onClick={()=>setRetireId(item.id)}>Retire</button>}
        </div>}</td>
      </tr>)}</tbody>
    </table></div>

    {creating&&<form className="admin-form" onSubmit={event=>void create(event)}>
      <h3>New procedure draft</h3><div className="admin-grid">
        <label>Code<input name="code" required minLength={3} maxLength={80} pattern="[a-z][a-z0-9_-]{2,79}" placeholder="retina-vitrectomy"/></label>
        <label>Name<input name="name" required minLength={3} maxLength={160}/></label>
        <label>Specialty<input name="specialty" required minLength={3} maxLength={80}/></label>
      </div>
      <DefinitionEditor value={DEFAULT_DEFINITION}/>{jsonError&&<p className="form-error" role="alert">{jsonError}</p>}
      <div className="admin-actions"><button className="primary-button" disabled={busy}>Create draft</button><button type="button" className="secondary-button" onClick={()=>setCreating(false)}>Cancel</button></div>
    </form>}

    {selected?.status==='draft'&&<form className="admin-form" onSubmit={event=>void saveDraft(event,selected)}>
      <h3>Edit {selected.code} version {selected.version}</h3><div className="admin-grid">
        <label>Name<input name="name" defaultValue={selected.name} required minLength={3} maxLength={160}/></label>
        <label>Specialty<input name="specialty" defaultValue={selected.specialty} required minLength={3} maxLength={80}/></label>
      </div>
      <DefinitionEditor value={selected.definition}/>{jsonError&&<p className="form-error" role="alert">{jsonError}</p>}
      <div className="admin-actions">
        <button className="primary-button" disabled={busy}>Save draft</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={()=>{if(window.confirm('Publish this version? The live version will be retired and this version cannot be edited afterward.'))void save('procedures',{action:'publish',id:selected.id,revision:selected.revision});}}>Publish version</button>
        <button type="button" className="secondary-button" onClick={()=>setSelectedId(null)}>Cancel</button>
      </div>
    </form>}

    {retireId&&<form className="admin-form" onSubmit={event=>{event.preventDefault();const item=data.procedureCatalogue.find(row=>row.id===retireId);if(!item)return;void save('procedures',{action:'retire',id:item.id,revision:item.revision,reason:new FormData(event.currentTarget).get('reason')}).then(()=>setRetireId(null));}}>
      <h3>Retire procedure</h3><p className="admin-note">Existing surgery cases will keep this version. The procedure will no longer be offered for new cases.</p>
      <label>Reason<textarea name="reason" required minLength={8} maxLength={500}/></label>
      <div className="admin-actions"><button className="primary-button" disabled={busy}>Retire procedure</button><button type="button" className="secondary-button" onClick={()=>setRetireId(null)}>Cancel</button></div>
    </form>}
  </section>;
}

function DefinitionEditor({value}:{value:ProcedureDefinition}){return <><label>Workflow definition (JSON)<textarea name="definition" className="template-json-editor" defaultValue={JSON.stringify(value,null,2)} required spellCheck={false}/></label><p className="admin-note">Allowed eyes control case creation. Preoperative checks may be biometry_verified, medical_clearance, and pupil_dilation. Operation-note fields and follow-up schedules define the procedure workflow.</p></>}
