"use client";

import type {
  ExaminationAnswers,
  ExaminationField,
  ExaminationTemplate,
} from '@/lib/clinical';
import { isExaminationFieldVisible } from '@/lib/clinical';
import { useSession } from '../session-provider';

type Scalar = string | number | boolean;

function emptyValue(field: ExaminationField): Scalar {
  if (field.type === 'boolean') return false;
  return '';
}

function scalarValue(value: unknown, field: ExaminationField): Scalar {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return emptyValue(field);
}

function FieldControl({
  field,
  value,
  disabled,
  label,
  onChange,
}: {
  field: ExaminationField;
  value: Scalar;
  disabled: boolean;
  label: string;
  onChange: (value: Scalar) => void;
}) {
  const required = field.required;
  if (field.type === 'textarea') {
    return <label><span>{label}{required ? ' *' : ''}</span><textarea aria-label={label} disabled={disabled} required={required} maxLength={field.maxLength} value={String(value)} onChange={event => onChange(event.target.value)}/></label>;
  }
  if (field.type === 'select') {
    return <label><span>{label}{required ? ' *' : ''}</span><select aria-label={label} disabled={disabled} required={required} value={String(value)} onChange={event => onChange(event.target.value)}><option value="">Select...</option>{field.options?.map(option => <option key={option}>{option}</option>)}</select></label>;
  }
  if (field.type === 'boolean') {
    return <label className="examination-boolean"><input aria-label={label} disabled={disabled} type="checkbox" checked={value === true} onChange={event => onChange(event.target.checked)}/><span>{label}</span></label>;
  }
  return <label><span>{label}{required ? ' *' : ''}{field.unit ? ` (${field.unit})` : ''}</span><input aria-label={label} disabled={disabled} required={required} type={field.type === 'number' ? 'number' : 'text'} maxLength={field.maxLength} min={field.min} max={field.max} step={field.step} value={value === '' ? '' : String(value)} onChange={event => onChange(field.type === 'number' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)}/></label>;
}

export function ExaminationTemplateFields({
  template,
  answers,
  disabled,
  onChange,
  roles,
}: {
  template: ExaminationTemplate;
  answers: ExaminationAnswers;
  disabled: boolean;
  onChange: (answers: ExaminationAnswers) => void;
  roles?: readonly string[];
}) {
  const user = useSession();
  const visible = (field: ExaminationField, next = answers) => isExaminationFieldVisible(field, next, roles??user.roles);
  const clean = (next: ExaminationAnswers) => {
    const cleaned = {...next};
    template.definition.sections.flatMap(section => section.fields).forEach(field => {
      if (!visible(field, next)) delete cleaned[field.id];
    });
    return cleaned;
  };
  const setScalar = (field: ExaminationField, value: Scalar) => onChange(clean({ ...answers, [field.id]: value }));
  const setEye = (field: ExaminationField, eye: 'OD' | 'OS', value: Scalar) => {
    const current = answers[field.id];
    const pair = current && typeof current === 'object' && !Array.isArray(current)
      ? current
      : { OD: emptyValue(field), OS: emptyValue(field) };
    onChange(clean({ ...answers, [field.id]: { ...pair, [eye]: value } }));
  };

  return <div className="examination-template">
    <div className="examination-template-header">
      <div><strong>{template.name}</strong><span>{template.specialty}</span></div>
      <small>Template v{template.version}</small>
    </div>
    {template.definition.sections.map(section => {
      const fields = section.fields.filter(field => visible(field));
      if (!fields.length) return null;
      return <details key={section.id} open className="examination-section">
        <summary>{section.title}</summary>
        {section.description && <p className="intake-help">{section.description}</p>}
        <div className="clinical-fields">
          {fields.map(field => field.laterality === 'bilateral'
            ? <div key={field.id} className="examination-bilateral-field">
                <h4>{field.label}{field.required ? ' *' : ''}</h4>
                <div className="clinical-bilateral" dir="ltr">
                  {(['OD', 'OS'] as const).map(eye => {
                    const current = answers[field.id];
                    const value = current && typeof current === 'object' && !Array.isArray(current)
                      ? scalarValue(current[eye], field)
                      : emptyValue(field);
                    return <FieldControl key={eye} field={field} value={value} disabled={disabled} label={`${eye} - ${field.label}`} onChange={next => setEye(field, eye, next)}/>;
                  })}
                </div>
              </div>
            : <FieldControl key={field.id} field={field} value={scalarValue(answers[field.id], field)} disabled={disabled} label={field.label} onChange={value => setScalar(field, value)}/>
          )}
        </div>
      </details>;
    })}
  </div>;
}