ALTER TABLE app.user_account ADD COLUMN licence_number text NOT NULL DEFAULT '';
CREATE TABLE app.formulary (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES app.tenant(id),name text NOT NULL,strength text NOT NULL,therapy_group text NOT NULL,active boolean NOT NULL DEFAULT true,
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,name,strength)
);
CREATE TABLE app.doctor_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,encounter_id uuid NOT NULL,author_id uuid NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','signed')),
 complaint text NOT NULL DEFAULT '',findings jsonb NOT NULL DEFAULT '{"OD":"","OS":""}',diagnoses jsonb NOT NULL DEFAULT '[]',referral text NOT NULL DEFAULT '',follow_up text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now(),signed_at timestamptz,signed_by uuid,snapshot_text text,content_hash text,synthetic boolean NOT NULL DEFAULT false,
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,encounter_id),FOREIGN KEY(tenant_id,encounter_id) REFERENCES app.encounter(tenant_id,id),FOREIGN KEY(tenant_id,author_id) REFERENCES app.user_account(tenant_id,id),FOREIGN KEY(tenant_id,signed_by) REFERENCES app.user_account(tenant_id,id),
 CHECK((status='draft' AND signed_at IS NULL AND signed_by IS NULL AND snapshot_text IS NULL AND content_hash IS NULL) OR (status='signed' AND signed_at IS NOT NULL AND signed_by IS NOT NULL AND content_hash IS NOT NULL AND signed_by=author_id AND snapshot_text IS NOT NULL AND content_hash=encode(sha256(convert_to(snapshot_text,'UTF8')),'hex')))
);
CREATE TABLE app.event_plan (
 id uuid NOT NULL,tenant_id uuid NOT NULL,event_id uuid NOT NULL,eye text NOT NULL CHECK(eye IN ('OD','OS')),anatomy_site text NOT NULL CHECK(anatomy_site IN ('cornea','iris','lens','anterior_chamber','vitreous','retina','macula','optic_nerve','sclera','extraocular_muscles','adnexa')),intent text NOT NULL CHECK(intent IN ('observation','medical','laser','surgical')),notes text NOT NULL DEFAULT '',
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,event_id,eye,anatomy_site),FOREIGN KEY(tenant_id,event_id) REFERENCES app.doctor_event(tenant_id,id)
);
CREATE TABLE app.prescription (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,event_id uuid NOT NULL,author_id uuid NOT NULL,version integer NOT NULL DEFAULT 1 CHECK(version>0),status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','signed')),
 updated_at timestamptz NOT NULL DEFAULT now(),signed_at timestamptz,signed_by uuid,snapshot_text text,content_hash text,synthetic boolean NOT NULL DEFAULT false,
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,event_id),FOREIGN KEY(tenant_id,event_id) REFERENCES app.doctor_event(tenant_id,id),FOREIGN KEY(tenant_id,author_id) REFERENCES app.user_account(tenant_id,id),FOREIGN KEY(tenant_id,signed_by) REFERENCES app.user_account(tenant_id,id),
 CHECK((status='draft' AND signed_at IS NULL AND signed_by IS NULL AND snapshot_text IS NULL AND content_hash IS NULL) OR (status='signed' AND signed_at IS NOT NULL AND signed_by IS NOT NULL AND content_hash IS NOT NULL AND signed_by=author_id AND snapshot_text IS NOT NULL AND content_hash=encode(sha256(convert_to(snapshot_text,'UTF8')),'hex')))
);
CREATE TABLE app.prescription_item (
 id uuid NOT NULL,tenant_id uuid NOT NULL,prescription_id uuid NOT NULL,position integer NOT NULL,drug_id uuid,name text NOT NULL,strength text NOT NULL,therapy_group text NOT NULL DEFAULT '',eye text NOT NULL CHECK(eye IN ('OD','OS','OU')),
 dose text NOT NULL,route text NOT NULL,frequency text NOT NULL,duration text NOT NULL,instructions text NOT NULL DEFAULT '',instructions_ur text NOT NULL DEFAULT '',
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,prescription_id,position),FOREIGN KEY(tenant_id,prescription_id) REFERENCES app.prescription(tenant_id,id),FOREIGN KEY(tenant_id,drug_id) REFERENCES app.formulary(tenant_id,id)
);
CREATE TABLE app.clinical_addendum (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,event_id uuid,prescription_id uuid,author_id uuid NOT NULL,text text NOT NULL CHECK(length(text) BETWEEN 8 AND 3000),at timestamptz NOT NULL DEFAULT now(),content_hash text NOT NULL CHECK(length(content_hash)=64),
 CHECK((event_id IS NOT NULL)::int+(prescription_id IS NOT NULL)::int=1),
 FOREIGN KEY(tenant_id,event_id) REFERENCES app.doctor_event(tenant_id,id),FOREIGN KEY(tenant_id,prescription_id) REFERENCES app.prescription(tenant_id,id),FOREIGN KEY(tenant_id,author_id) REFERENCES app.user_account(tenant_id,id)
);
DO $policies$
DECLARE item text;
BEGIN
 FOREACH item IN ARRAY ARRAY['formulary','doctor_event','event_plan','prescription','prescription_item','clinical_addendum'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',item);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',item);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',item);
 END LOOP;
END $policies$;
CREATE FUNCTION app.guard_signed_parent() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $fn$
BEGIN
 IF OLD.status='signed' THEN RAISE EXCEPTION 'Signed content is immutable' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.author_id<>OLD.author_id) THEN RAISE EXCEPTION 'Record identity is immutable' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER doctor_event_immutable BEFORE UPDATE OR DELETE ON app.doctor_event FOR EACH ROW EXECUTE FUNCTION app.guard_signed_parent();
CREATE TRIGGER prescription_immutable BEFORE UPDATE OR DELETE ON app.prescription FOR EACH ROW EXECUTE FUNCTION app.guard_signed_parent();
CREATE FUNCTION app.guard_signed_child() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $fn$
DECLARE parent_id uuid; parent_tenant uuid; current_status text;
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Replace draft rows only' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='event_plan' THEN
  IF TG_OP='DELETE' THEN parent_id:=OLD.event_id;parent_tenant:=OLD.tenant_id; ELSE parent_id:=NEW.event_id;parent_tenant:=NEW.tenant_id; END IF;
  SELECT status INTO current_status FROM app.doctor_event WHERE id=parent_id AND tenant_id=parent_tenant FOR UPDATE;
 ELSE
  IF TG_OP='DELETE' THEN parent_id:=OLD.prescription_id;parent_tenant:=OLD.tenant_id; ELSE parent_id:=NEW.prescription_id;parent_tenant:=NEW.tenant_id; END IF;
  SELECT status INTO current_status FROM app.prescription WHERE id=parent_id AND tenant_id=parent_tenant FOR UPDATE;
 END IF;
 IF current_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Signed content is immutable' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $fn$;
CREATE TRIGGER event_plan_immutable BEFORE INSERT OR UPDATE OR DELETE ON app.event_plan FOR EACH ROW EXECUTE FUNCTION app.guard_signed_child();
CREATE TRIGGER prescription_item_immutable BEFORE INSERT OR UPDATE OR DELETE ON app.prescription_item FOR EACH ROW EXECUTE FUNCTION app.guard_signed_child();
CREATE FUNCTION app.guard_addendum() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $fn$
DECLARE current_status text;
BEGIN
 IF NEW.event_id IS NOT NULL THEN SELECT status INTO current_status FROM app.doctor_event WHERE id=NEW.event_id AND tenant_id=NEW.tenant_id FOR UPDATE;
 ELSE SELECT status INTO current_status FROM app.prescription WHERE id=NEW.prescription_id AND tenant_id=NEW.tenant_id FOR UPDATE; END IF;
 IF current_status IS DISTINCT FROM 'signed' THEN RAISE EXCEPTION 'Addenda require a signed original' USING ERRCODE='42501'; END IF; RETURN NEW;
END $fn$;
CREATE TRIGGER addendum_signed_parent BEFORE INSERT ON app.clinical_addendum FOR EACH ROW EXECUTE FUNCTION app.guard_addendum();
REVOKE ALL ON FUNCTION app.guard_signed_parent(),app.guard_signed_child(),app.guard_addendum() FROM PUBLIC;
GRANT SELECT ON app.formulary TO openeyes_app;
GRANT SELECT,INSERT ON app.doctor_event,app.prescription,app.clinical_addendum TO openeyes_app;
GRANT UPDATE(version,status,complaint,findings,diagnoses,referral,follow_up,updated_at,signed_at,signed_by,snapshot_text,content_hash) ON app.doctor_event TO openeyes_app;
GRANT UPDATE(version,status,updated_at,signed_at,signed_by,snapshot_text,content_hash) ON app.prescription TO openeyes_app;
GRANT SELECT,INSERT,DELETE ON app.event_plan,app.prescription_item TO openeyes_app;
GRANT UPDATE(closed_at) ON app.encounter TO openeyes_app;
INSERT INTO app.permission(code) VALUES('clinical:read'),('clinical:write'),('clinical:sign'),('prescription:read') ON CONFLICT DO NOTHING;
INSERT INTO app.role_permission(tenant_id,role_code,permission_code) SELECT r.tenant_id,r.code,p.permission FROM app.role r CROSS JOIN (VALUES ('doctor','clinical:read'),('doctor','clinical:write'),('doctor','clinical:sign'),('doctor','prescription:read'),('nurse','clinical:read'),('optometrist','clinical:read'),('pharmacist','prescription:read')) AS p(role,permission) WHERE r.code=p.role ON CONFLICT DO NOTHING;
