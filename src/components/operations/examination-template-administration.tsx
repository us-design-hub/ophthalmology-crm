"use client";

import { useState } from 'react';
import { VISIT_TYPES, type AdministrationData, type ExaminationTemplateRecord } from '@/lib/administration';
import {
  examinationTemplateDefinitionSchema,
  type ExaminationAnswers,
  type ExaminationTemplateDefinition,
} from '@/lib/clinical';
import { ExaminationTemplateFields } from '../clinical/examination-template-fields';

type PreviewRole = 'doctor'|'nurse'|'optometrist';

export function ExaminationTemplateAdministration({
  data,
  busy,
  save,
}: {
  data: AdministrationData;
  busy: boolean;
  save: (resource: string, body: unknown) => Promise<void>;
}) {
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [jsonError,setJsonError]=useState('');
  const [preview,setPreview]=useState<ExaminationTemplateDefinition|null>(null);
  const [previewRole,setPreviewRole]=useState<PreviewRole>('doctor');
  const [previewAnswers,setPreviewAnswers]=useState<ExaminationAnswers>({});
  const selected=data.templates.find(template=>template.id===selectedId)??null;
  const published=data.templates.filter(template=>template.status==='published');

  function readDefinition(form:HTMLFormElement){
    try{
      const parsed=examinationTemplateDefinitionSchema.safeParse(JSON.parse(String(new FormData(form).get('definition'))));
      if(!parsed.success){
        setJsonError('The definition does not match the examination template rules.');
        return null;
      }
      setJsonError('');
      return parsed.data;
    }catch{
      setJsonError('The template definition is not valid JSON.');
      return null;
    }
  }

  async function saveDraft(event:React.FormEvent<HTMLFormElement>,template:ExaminationTemplateRecord){
    event.preventDefault();
    const definition=readDefinition(event.currentTarget);
    if(!definition)return;
    const form=new FormData(event.currentTarget);
    await save('templates',{action:'saveDraft',id:template.id,revision:template.revision,name:form.get('name'),specialty:form.get('specialty'),definition});
  }

  return <section className="panel">
    <div className="registry-heading">
      <div><h2>Examination templates</h2><p className="admin-note">Published versions are permanent. Create a new draft version before changing a live template.</p></div>
    </div>
    <div className="patient-table-wrap"><table className="patient-table">
      <thead><tr><th>Template</th><th>Specialty</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{data.templates.map(template=><tr key={template.id}>
        <td><strong>{template.name}</strong><small>{template.code} / version {template.version}</small></td>
        <td>{template.specialty}</td><td>{template.status}</td>
        <td>
          {template.status==='draft'
            ? <button type="button" className="text-button" onClick={()=>{setSelectedId(template.id);setJsonError('');setPreview(null);setPreviewAnswers({});}}>Edit draft</button>
            : <button type="button" className="text-button" disabled={busy} onClick={()=>void save('templates',{action:'createVersion',sourceId:template.id})}>Create new version</button>}
        </td>
      </tr>)}</tbody>
    </table></div>

    {selected?.status==='draft'&&<form className="admin-form" onSubmit={event=>void saveDraft(event,selected)}>
      <h3>Edit {selected.code} version {selected.version}</h3>
      <div className="admin-grid">
        <label>Name<input name="name" defaultValue={selected.name} required minLength={3} maxLength={120}/></label>
        <label>Specialty<input name="specialty" defaultValue={selected.specialty} required minLength={3} maxLength={80}/></label>
      </div>
      <label>Template definition (JSON)<textarea name="definition" className="template-json-editor" defaultValue={JSON.stringify(selected.definition,null,2)} required spellCheck={false}/></label>
      <p className="admin-note">Fields may include <code>roles</code> (doctor, nurse, optometrist) and <code>visibleWhen</code> rules. A rule may use equals, not_equals, or answered and must reference an earlier non-lateral field.</p>
      {jsonError&&<p className="form-error" role="alert">{jsonError}</p>}
      <div className="admin-actions">
        <button className="primary-button" disabled={busy}>Save draft</button>
        <button type="button" className="secondary-button" onClick={event=>{const definition=readDefinition(event.currentTarget.form!);if(definition){setPreview(definition);setPreviewAnswers({});}}}>Preview</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={()=>{if(window.confirm('Publish this version? Published templates cannot be edited or deleted.'))void save('templates',{action:'publish',id:selected.id,revision:selected.revision});}}>Publish version</button>
        <button type="button" className="secondary-button" onClick={()=>{setSelectedId(null);setPreview(null);}}>Cancel</button>
      </div>
      {preview&&<div className="template-preview">
        <div className="registry-heading"><h3>Role preview</h3><label>View as<select value={previewRole} onChange={event=>{setPreviewRole(event.target.value as PreviewRole);setPreviewAnswers({});}}><option value="doctor">Doctor</option><option value="nurse">Nurse / technician</option><option value="optometrist">Optometrist</option></select></label></div>
        <ExaminationTemplateFields template={{id:selected.id,code:selected.code,version:selected.version,name:selected.name,specialty:selected.specialty,definition:preview}} answers={previewAnswers} disabled={false} roles={[previewRole]} onChange={setPreviewAnswers}/>
      </div>}
    </form>}

    <form className="admin-form" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void save('templates',{action:'assign',templateId:form.get('templateId'),facilityId:form.get('facilityId')||null,specialty:form.get('specialty'),visitType:form.get('visitType')});}}>
      <h3>Assign a published template</h3>
      <div className="admin-grid">
        <label>Template<select name="templateId" required>{published.map(template=><option key={template.id} value={template.id}>{template.name} / v{template.version}</option>)}</select></label>
        <label>Clinic<select name="facilityId"><option value="">All clinics (fallback)</option>{data.facilities.filter(facility=>facility.type==='clinic'&&facility.active).map(facility=><option key={facility.id} value={facility.id}>{facility.name}</option>)}</select></label>
        <label>Specialty<input name="specialty" defaultValue="Ophthalmology" required minLength={3} maxLength={80}/></label>
        <label>Visit type<select name="visitType">{VISIT_TYPES.map(type=><option key={type} value={type}>{type.replace('_',' ')}</option>)}</select></label>
      </div>
      <button className="primary-button" disabled={busy||!published.length}>Save assignment</button>
    </form>

    <div className="patient-table-wrap"><table className="patient-table">
      <thead><tr><th>Clinic</th><th>Specialty</th><th>Visit type</th><th>Template</th></tr></thead>
      <tbody>{data.templateAssignments.map(assignment=><tr key={assignment.id}>
        <td>{data.facilities.find(facility=>facility.id===assignment.facilityId)?.name??'All clinics'}</td>
        <td>{assignment.specialty}</td><td>{assignment.visitType.replace('_',' ')}</td>
        <td>{data.templates.find(template=>template.id===assignment.templateId)?.name??'Unknown'} / v{data.templates.find(template=>template.id===assignment.templateId)?.version??'?'}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}