-- Configurable clinic pathways with encounter-level snapshots and specialty worklist stages.

CREATE FUNCTION app.valid_clinical_pathway(steps text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT cardinality(steps) BETWEEN 1 AND 4
   AND steps[1] = 'workup'
   AND NOT EXISTS (
     SELECT 1 FROM unnest(steps) AS step
     WHERE step NOT IN ('workup','testing','imaging','dilation')
   )
   AND cardinality(steps) = (SELECT count(DISTINCT step) FROM unnest(steps) AS step);
$fn$;

REVOKE ALL ON FUNCTION app.valid_clinical_pathway(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.valid_clinical_pathway(text[]) TO openeyes_app;

ALTER TABLE app.facility
  ADD COLUMN pathway_steps text[] NOT NULL DEFAULT ARRAY['workup']::text[],
  ADD COLUMN pathway_target_minutes integer NOT NULL DEFAULT 30 CHECK(pathway_target_minutes BETWEEN 5 AND 240),
  ADD CONSTRAINT facility_pathway_steps_check CHECK(app.valid_clinical_pathway(pathway_steps));

UPDATE app.facility
SET pathway_steps = CASE lower(specialty)
  WHEN 'glaucoma' THEN ARRAY['workup','testing']::text[]
  WHEN 'retina' THEN ARRAY['workup','imaging','dilation']::text[]
  ELSE ARRAY['workup']::text[]
END
WHERE type='clinic';

ALTER TABLE app.encounter
  ADD COLUMN pathway_steps text[] NOT NULL DEFAULT ARRAY['workup']::text[],
  ADD COLUMN pathway_target_minutes integer NOT NULL DEFAULT 30 CHECK(pathway_target_minutes BETWEEN 5 AND 240),
  ADD CONSTRAINT encounter_pathway_steps_check CHECK(app.valid_clinical_pathway(pathway_steps));

UPDATE app.encounter encounter
SET pathway_steps = CASE
      WHEN encounter.closed_at IS NULL AND encounter.stage IN ('waiting','workup') THEN facility.pathway_steps
      WHEN encounter.closed_at IS NULL AND encounter.stage='dilation' THEN ARRAY['workup','dilation']::text[]
      ELSE ARRAY['workup']::text[]
    END,
    pathway_target_minutes = facility.pathway_target_minutes
FROM app.facility facility
WHERE facility.id=encounter.facility_id AND facility.tenant_id=encounter.tenant_id;

CREATE FUNCTION app.snapshot_encounter_pathway() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $fn$
DECLARE configured record;
BEGIN
  SELECT pathway_steps,pathway_target_minutes INTO configured
  FROM app.facility
  WHERE id=NEW.facility_id AND tenant_id=NEW.tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encounter facility pathway is unavailable';
  END IF;
  NEW.pathway_steps := configured.pathway_steps;
  NEW.pathway_target_minutes := configured.pathway_target_minutes;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION app.snapshot_encounter_pathway() FROM PUBLIC;

CREATE TRIGGER encounter_pathway_snapshot
  BEFORE INSERT ON app.encounter
  FOR EACH ROW EXECUTE FUNCTION app.snapshot_encounter_pathway();

ALTER TABLE app.encounter DROP CONSTRAINT encounter_stage_check;
ALTER TABLE app.encounter ADD CONSTRAINT encounter_stage_check
  CHECK(stage IN ('waiting','workup','testing','imaging','dilation','consultation','completed','left_before_seen'));

ALTER TABLE app.queue_transition DROP CONSTRAINT queue_transition_to_stage_check;
ALTER TABLE app.queue_transition ADD CONSTRAINT queue_transition_to_stage_check
  CHECK(to_stage IN ('waiting','workup','testing','imaging','dilation','consultation','completed','left_before_seen'));

GRANT UPDATE(pathway_steps,pathway_target_minutes) ON app.facility TO openeyes_app;
