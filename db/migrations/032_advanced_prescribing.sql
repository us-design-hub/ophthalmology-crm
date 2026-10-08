CREATE FUNCTION app.valid_taper_schedule(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,app AS $fn$
DECLARE step jsonb; key text;
BEGIN
 IF jsonb_typeof(value)<>'array' OR jsonb_array_length(value)>12 THEN RETURN false; END IF;
 FOR step IN SELECT element FROM jsonb_array_elements(value) AS elements(element) LOOP
  IF jsonb_typeof(step)<>'object' OR NOT step ?& ARRAY['dose','frequency','duration','instructions'] THEN RETURN false; END IF;
  FOR key IN SELECT jsonb_object_keys(step) LOOP
   IF key<>ALL(ARRAY['dose','frequency','duration','instructions']) THEN RETURN false; END IF;
  END LOOP;
  IF jsonb_typeof(step->'dose')<>'string' OR length(btrim(step->>'dose')) NOT BETWEEN 1 AND 100
   OR jsonb_typeof(step->'frequency')<>'string' OR length(btrim(step->>'frequency')) NOT BETWEEN 1 AND 100
   OR jsonb_typeof(step->'duration')<>'string' OR length(btrim(step->>'duration')) NOT BETWEEN 1 AND 100
   OR jsonb_typeof(step->'instructions')<>'string' OR length(step->>'instructions')>300 THEN RETURN false;
  END IF;
 END LOOP;
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION app.valid_taper_schedule(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.valid_taper_schedule(jsonb) TO openeyes_app;

ALTER TABLE app.prescription_item
 ADD COLUMN taper_schedule jsonb NOT NULL DEFAULT '[]'::jsonb,
 ADD CONSTRAINT prescription_item_taper_valid CHECK (app.valid_taper_schedule(taper_schedule));

CREATE TABLE app.prescription_preset (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenant(id),
 owner_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('favourite','specialty_set')),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 specialty text NOT NULL DEFAULT '' CHECK(length(specialty)<=120),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,owner_id,kind,specialty,name),
 FOREIGN KEY(tenant_id,owner_id) REFERENCES app.user_account(tenant_id,id),
 CHECK(kind='favourite' OR length(trim(specialty))>0)
);

CREATE TABLE app.prescription_preset_item (
 id uuid NOT NULL,
 tenant_id uuid NOT NULL,
 preset_id uuid NOT NULL,
 position integer NOT NULL CHECK(position BETWEEN 0 AND 11),
 drug_id uuid,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 150),
 strength text NOT NULL CHECK(length(trim(strength)) BETWEEN 1 AND 80),
 therapy_group text NOT NULL DEFAULT '',
 eye text NOT NULL CHECK(eye IN ('OD','OS','OU')),
 dose text NOT NULL CHECK(length(trim(dose)) BETWEEN 1 AND 100),
 route text NOT NULL CHECK(length(trim(route)) BETWEEN 1 AND 80),
 frequency text NOT NULL CHECK(length(trim(frequency)) BETWEEN 1 AND 100),
 duration text NOT NULL CHECK(length(trim(duration)) BETWEEN 1 AND 100),
 instructions text NOT NULL DEFAULT '' CHECK(length(instructions)<=500),
 instructions_ur text NOT NULL DEFAULT '' CHECK(length(instructions_ur)<=500),
 quantity integer CHECK(quantity BETWEEN 1 AND 10000),
 taper_schedule jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(app.valid_taper_schedule(taper_schedule)),
 PRIMARY KEY(tenant_id,id),
 UNIQUE(tenant_id,preset_id,position),
 FOREIGN KEY(tenant_id,preset_id) REFERENCES app.prescription_preset(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,drug_id) REFERENCES app.formulary(tenant_id,id)
);

CREATE INDEX prescription_preset_specialty_idx ON app.prescription_preset(tenant_id,specialty,kind,created_at DESC);
CREATE INDEX prescription_preset_owner_idx ON app.prescription_preset(tenant_id,owner_id,kind,created_at DESC);

ALTER TABLE app.prescription_preset ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.prescription_preset FORCE ROW LEVEL SECURITY;
CREATE POLICY prescription_preset_read ON app.prescription_preset FOR SELECT
 USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND (kind='specialty_set' OR owner_id=nullif(current_setting('app.actor_id',true),'')::uuid));
CREATE POLICY prescription_preset_insert ON app.prescription_preset FOR INSERT
 WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.actor_id',true),'')::uuid);
CREATE POLICY prescription_preset_delete ON app.prescription_preset FOR DELETE
 USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.actor_id',true),'')::uuid);

ALTER TABLE app.prescription_preset_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.prescription_preset_item FORCE ROW LEVEL SECURITY;
CREATE POLICY prescription_preset_item_read ON app.prescription_preset_item FOR SELECT
 USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND EXISTS(
  SELECT 1 FROM app.prescription_preset p WHERE p.tenant_id=prescription_preset_item.tenant_id AND p.id=prescription_preset_item.preset_id
  AND (p.kind='specialty_set' OR p.owner_id=nullif(current_setting('app.actor_id',true),'')::uuid)
 ));
CREATE POLICY prescription_preset_item_insert ON app.prescription_preset_item FOR INSERT
 WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND EXISTS(
  SELECT 1 FROM app.prescription_preset p WHERE p.tenant_id=prescription_preset_item.tenant_id AND p.id=prescription_preset_item.preset_id
  AND p.owner_id=nullif(current_setting('app.actor_id',true),'')::uuid
 ));
CREATE POLICY prescription_preset_item_delete ON app.prescription_preset_item FOR DELETE
 USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND EXISTS(
  SELECT 1 FROM app.prescription_preset p WHERE p.tenant_id=prescription_preset_item.tenant_id AND p.id=prescription_preset_item.preset_id
  AND p.owner_id=nullif(current_setting('app.actor_id',true),'')::uuid
 ));

GRANT SELECT,INSERT,DELETE ON app.prescription_preset,app.prescription_preset_item TO openeyes_app;
