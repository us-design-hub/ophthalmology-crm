-- Bind each eye drawing to the examination section it documents.
ALTER TABLE app.doctor_event DISABLE TRIGGER doctor_event_immutable;

UPDATE app.doctor_event
SET drawings = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(drawings, '{OD,sectionId}', '"clinical_drawing"'::jsonb, true),
      '{OD,sectionLabel}', '"Clinical drawing"'::jsonb, true
    ),
    '{OS,sectionId}', '"clinical_drawing"'::jsonb, true
  ),
  '{OS,sectionLabel}', '"Clinical drawing"'::jsonb, true
)
WHERE NOT (drawings->'OD' ? 'sectionId')
   OR NOT (drawings->'OD' ? 'sectionLabel')
   OR NOT (drawings->'OS' ? 'sectionId')
   OR NOT (drawings->'OS' ? 'sectionLabel');

ALTER TABLE app.doctor_event ENABLE TRIGGER doctor_event_immutable;

ALTER TABLE app.doctor_event
  ALTER COLUMN drawings SET DEFAULT
    '{"OD":{"template":"fundus","sectionId":"clinical_drawing","sectionLabel":"Clinical drawing","strokes":[],"markers":[]},"OS":{"template":"fundus","sectionId":"clinical_drawing","sectionLabel":"Clinical drawing","strokes":[],"markers":[]}}'::jsonb,
  ADD CONSTRAINT doctor_event_drawing_sections CHECK (
    jsonb_typeof(drawings->'OD'->'sectionId') = 'string'
    AND jsonb_typeof(drawings->'OD'->'sectionLabel') = 'string'
    AND jsonb_typeof(drawings->'OS'->'sectionId') = 'string'
    AND jsonb_typeof(drawings->'OS'->'sectionLabel') = 'string'
  );
