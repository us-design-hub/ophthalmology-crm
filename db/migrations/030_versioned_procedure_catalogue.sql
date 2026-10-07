-- Version and administer surgical procedures without changing historical cases.

CREATE FUNCTION app.cataract_procedure_definition() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,app AS $fn$
 SELECT $definition$
{
 "allowedEyes":["OD","OS"],
 "preoperativeChecks":["biometry_verified","medical_clearance","pupil_dilation"],
 "operationNoteFields":[
  {"code":"procedure_performed","label":"Procedure performed","type":"text","required":true},
  {"code":"anaesthesia","label":"Anaesthesia","type":"select","required":true,"options":["topical","local","general"]},
  {"code":"incision","label":"Incision","type":"text","required":true},
  {"code":"capsulorhexis","label":"Capsulorhexis","type":"text","required":true},
  {"code":"phaco_technique","label":"Phaco technique","type":"text","required":true},
  {"code":"iol_model","label":"IOL model","type":"text","required":true},
  {"code":"iol_power","label":"IOL power","type":"number","required":true},
  {"code":"complications","label":"Complications","type":"textarea","required":true},
  {"code":"postoperative_instructions","label":"Postoperative instructions","type":"textarea","required":true}
 ],
 "followupSchedule":[
  {"code":"day_1","label":"Day 1","daysAfter":1,"required":true},
  {"code":"week_1","label":"Week 1","daysAfter":7,"required":true},
  {"code":"month_1","label":"Month 1","daysAfter":30,"required":true}
 ]
}
 $definition$::jsonb;
$fn$;
REVOKE ALL ON FUNCTION app.cataract_procedure_definition() FROM PUBLIC;

ALTER TABLE app.procedure_catalogue
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version>0),
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  ADD COLUMN status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','retired')),
  ADD COLUMN definition jsonb NOT NULL DEFAULT '{"allowedEyes":["OD","OS"],"preoperativeChecks":[],"operationNoteFields":[],"followupSchedule":[]}'::jsonb CHECK (jsonb_typeof(definition)='object'),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN published_at timestamptz;

UPDATE app.procedure_catalogue
SET status=CASE WHEN active THEN 'published' ELSE 'retired' END,
    definition=CASE WHEN code='cataract-phaco-iol' THEN app.cataract_procedure_definition() ELSE definition END,
    published_at=CASE WHEN active THEN created_at ELSE NULL END;

ALTER TABLE app.procedure_catalogue DROP CONSTRAINT procedure_catalogue_tenant_id_code_key;
ALTER TABLE app.procedure_catalogue
  ADD CONSTRAINT procedure_catalogue_tenant_code_version_key UNIQUE(tenant_id,code,version),
  ADD CONSTRAINT procedure_catalogue_status_active_check CHECK (active=(status='published'));
CREATE UNIQUE INDEX procedure_catalogue_one_live_version
  ON app.procedure_catalogue(tenant_id,code) WHERE status='published';

CREATE FUNCTION app.guard_procedure_catalogue() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,app AS $fn$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Procedure catalogue versions cannot be deleted';
  END IF;
  IF OLD.tenant_id<>NEW.tenant_id OR OLD.code<>NEW.code OR OLD.version<>NEW.version THEN
    RAISE EXCEPTION 'Procedure catalogue identity is immutable';
  END IF;
  IF OLD.status='draft'
     AND NEW.revision=OLD.revision+1
     AND ((NEW.status='draft' AND NOT NEW.active AND NEW.published_at IS NULL)
       OR (NEW.status='published' AND NEW.active AND NEW.published_at IS NOT NULL)) THEN
    RETURN NEW;
  END IF;
  IF OLD.status='published'
     AND NEW.status='retired' AND NOT NEW.active
     AND NEW.revision=OLD.revision+1
     AND NEW.name=OLD.name AND NEW.specialty=OLD.specialty
     AND NEW.definition=OLD.definition
     AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Published and retired procedure versions are immutable';
END
$fn$;
REVOKE ALL ON FUNCTION app.guard_procedure_catalogue() FROM PUBLIC;
CREATE TRIGGER procedure_catalogue_immutable
  BEFORE UPDATE OR DELETE ON app.procedure_catalogue
  FOR EACH ROW EXECUTE FUNCTION app.guard_procedure_catalogue();

CREATE OR REPLACE FUNCTION app.provision_cataract_template() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $fn$
BEGIN
 INSERT INTO app.procedure_catalogue(tenant_id,code,version,name,specialty,status,active,definition,published_at)
 VALUES(NEW.id,'cataract-phaco-iol',1,'Cataract extraction with phacoemulsification and IOL','Cataract','published',true,app.cataract_procedure_definition(),now())
 ON CONFLICT DO NOTHING;
 INSERT INTO app.examination_template
  (tenant_id,code,version,name,specialty,status,is_default,definition,published_at)
 VALUES(NEW.id,'cataract',1,'Cataract assessment','Cataract','published',false,app.cataract_template_definition(),now())
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION app.provision_cataract_template() FROM PUBLIC;

GRANT INSERT ON app.procedure_catalogue TO openeyes_app;
GRANT UPDATE(name,specialty,active,revision,status,definition,updated_at,published_at) ON app.procedure_catalogue TO openeyes_app;
