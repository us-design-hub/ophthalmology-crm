-- Safe template authoring, assignment, and encounter context for configurable examinations.
ALTER TABLE app.examination_template
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE app.facility
  ADD COLUMN specialty text NOT NULL DEFAULT 'Ophthalmology'
    CHECK (length(specialty) BETWEEN 3 AND 80);

ALTER TABLE app.encounter
  ADD COLUMN visit_type text NOT NULL DEFAULT 'general'
    CHECK (visit_type IN ('general','new','follow_up','emergency','post_op'));

CREATE TABLE app.examination_template_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenant(id),
  template_id uuid NOT NULL,
  facility_id uuid,
  specialty text NOT NULL CHECK (length(specialty) BETWEEN 3 AND 80),
  visit_type text NOT NULL CHECK (visit_type IN ('general','new','follow_up','emergency','post_op')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, template_id) REFERENCES app.examination_template(tenant_id, id),
  FOREIGN KEY (tenant_id, facility_id) REFERENCES app.facility(tenant_id, id)
);

CREATE UNIQUE INDEX examination_template_assignment_scope
  ON app.examination_template_assignment
  (tenant_id, (coalesce(facility_id, '00000000-0000-0000-0000-000000000000'::uuid)), specialty, visit_type)
  WHERE active;

ALTER TABLE app.examination_template_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.examination_template_assignment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.examination_template_assignment
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE FUNCTION app.guard_examination_template() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,app AS $fn$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'Published examination templates cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'Published examination templates are immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.code <> OLD.code THEN
    RAISE EXCEPTION 'Template code cannot change';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $fn$;

REVOKE ALL ON FUNCTION app.guard_examination_template() FROM PUBLIC;
CREATE TRIGGER examination_template_immutable
  BEFORE UPDATE OR DELETE ON app.examination_template
  FOR EACH ROW EXECUTE FUNCTION app.guard_examination_template();

INSERT INTO app.examination_template_assignment
  (tenant_id, template_id, facility_id, specialty, visit_type)
SELECT tenant_id, id, NULL, specialty, 'general'
FROM app.examination_template
WHERE status = 'published' AND is_default
ON CONFLICT DO NOTHING;

CREATE FUNCTION app.assign_default_examination_template() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $fn$
BEGIN
  IF NEW.status = 'published' AND NEW.is_default THEN
    INSERT INTO app.examination_template_assignment
      (tenant_id, template_id, facility_id, specialty, visit_type)
    VALUES (NEW.tenant_id, NEW.id, NULL, NEW.specialty, 'general')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION app.assign_default_examination_template() FROM PUBLIC;
CREATE TRIGGER examination_template_default_assignment
  AFTER INSERT ON app.examination_template
  FOR EACH ROW EXECUTE FUNCTION app.assign_default_examination_template();

GRANT SELECT,INSERT,UPDATE,DELETE ON app.examination_template_assignment TO openeyes_app;
GRANT INSERT,UPDATE,DELETE ON app.examination_template TO openeyes_app;
GRANT UPDATE(specialty) ON app.facility TO openeyes_app;


