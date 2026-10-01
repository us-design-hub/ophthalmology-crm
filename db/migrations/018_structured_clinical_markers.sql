-- Add structured clinical annotations alongside freehand drawing strokes.
ALTER TABLE app.doctor_event DISABLE TRIGGER doctor_event_immutable;

UPDATE app.doctor_event
SET drawings = jsonb_set(
  jsonb_set(drawings, '{OD,markers}', '[]'::jsonb, true),
  '{OS,markers}',
  '[]'::jsonb,
  true
)
WHERE NOT (drawings->'OD' ? 'markers')
   OR NOT (drawings->'OS' ? 'markers');

ALTER TABLE app.doctor_event ENABLE TRIGGER doctor_event_immutable;

ALTER TABLE app.doctor_event
  ALTER COLUMN drawings SET DEFAULT
    '{"OD":{"template":"fundus","strokes":[],"markers":[]},"OS":{"template":"fundus","strokes":[],"markers":[]}}'::jsonb,
  ADD CONSTRAINT doctor_event_drawings_structure CHECK (
    jsonb_typeof(drawings->'OD') = 'object'
    AND jsonb_typeof(drawings->'OS') = 'object'
    AND jsonb_typeof(drawings->'OD'->'strokes') = 'array'
    AND jsonb_typeof(drawings->'OS'->'strokes') = 'array'
    AND jsonb_typeof(drawings->'OD'->'markers') = 'array'
    AND jsonb_typeof(drawings->'OS'->'markers') = 'array'
  );
