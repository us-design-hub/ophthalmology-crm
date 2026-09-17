// One-time copy of the local synthetic demo into an EMPTY Supabase project.
// Ignored configuration/snapshot files contain secrets and must stay out of Git.
import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import pg from 'pg';
for(const f of ['.env.local','.env.db.local','.env.supabase.local'])process.loadEnvFile(f);
const e=process.env,q=n=>'"'+n.replaceAll('"','""')+'"',hash=v=>createHash('sha256').update(v).digest('hex');
const local=new URL(e.DATABASE_ADMIN_URL);
if(local.hostname!=='127.0.0.1'||local.pathname!=='/openeyes_demo'||e.APP_MODE!=='demo')throw Error('Source must be the local demo');
if(!/^postgres\.[a-z]{20}$/.test(e.SUPABASE_DB_USER||'')||!e.SUPABASE_DB_HOST?.endsWith('.pooler.supabase.com')||e.SUPABASE_DB_NAME!=='postgres'||e.SUPABASE_DB_PORT!=='5432')throw Error('Expected Supabase session pooler');
if(!e.SUPABASE_DB_PASSWORD||e.SUPABASE_DB_PASSWORD==='REPLACE')throw Error('Password is not configured');
const ca=readFileSync('.runtime/supabase/ca.crt','utf8');
const config={host:e.SUPABASE_DB_HOST,port:5432,database:'postgres',user:e.SUPABASE_DB_USER,password:e.SUPABASE_DB_PASSWORD,ssl:{ca,rejectUnauthorized:true},connectionTimeoutMillis:15000};
const source=new pg.Client({connectionString:local.toString()}),target=new pg.Client(config);let committed=false;
async function contents(db,t){return(await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text AS data FROM app.${q(t)} t`)).rows[0].data;}
async function main(){
 await source.connect();await target.connect();
 const occupied=(await target.query("SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='app') OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('openeyes_app','openeyes_owner')) OR to_regclass('public.openeyes_migrations') IS NOT NULL AS occupied")).rows[0].occupied;
 if(occupied)throw Error('Target already has OpenEyes objects; refusing to overwrite');
 await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await source.query("SET LOCAL TIME ZONE 'UTC'");
 const tenants=(await source.query('SELECT id,code,is_demo FROM app.tenant')).rows;
 if(tenants.length!==1||tenants[0].code!=='DEMO'||!tenants[0].is_demo)throw Error('Source must contain only the synthetic DEMO tenant');
 const migrations=(await source.query('SELECT name,checksum,applied_at FROM public.openeyes_migrations ORDER BY name')).rows;
 if(readdirSync('db/migrations').filter(n=>n.endsWith('.sql')).length!==migrations.length)throw Error('Source migration count mismatch');
 for(const m of migrations)if(hash(readFileSync('db/migrations/'+m.name))!==m.checksum)throw Error('Migration checksum mismatch: '+m.name);
 if(Number((await source.query("SELECT count(*) FROM pg_sequences WHERE schemaname='app'")).rows[0].count))throw Error('Sequence migration needs explicit support');
 const tables=(await source.query("SELECT tablename FROM pg_tables WHERE schemaname='app' ORDER BY tablename")).rows.map(r=>r.tablename);
 const deps=(await source.query("SELECT c.relname child,p.relname parent FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class p ON p.oid=k.confrelid WHERE k.contype='f' AND n.nspname='app' AND k.conrelid<>k.confrelid")).rows;
 const ordered=[];while(ordered.length<tables.length){const ready=tables.filter(t=>!ordered.includes(t)&&deps.filter(d=>d.child===t).every(d=>ordered.includes(d.parent)));if(!ready.length)throw Error('Cyclic dependencies need explicit support');ordered.push(...ready);}
 const data={};for(const t of ordered)data[t]=['session','rate_limit'].includes(t)?'[]':await contents(source,t);
 await source.query('COMMIT');mkdirSync('.runtime/supabase',{recursive:true});writeFileSync('.runtime/supabase/source-snapshot.json',JSON.stringify({at:new Date().toISOString(),migrations,data}),{mode:0o600});
 console.log('Consistent snapshot saved:',tables.length,'tables; login sessions/rate limits excluded.');
 if(!process.argv.includes('--apply')){console.log('Preflight passed. Use --apply to copy into the empty target.');return;}
 const password=randomBytes(32).toString('hex');await target.query('BEGIN');await target.query('SELECT pg_advisory_xact_lock(724912020)');await target.query("SET LOCAL TIME ZONE 'UTC'");
 await target.query('CREATE ROLE openeyes_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
 await target.query(`CREATE ROLE openeyes_app LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
 await target.query('GRANT openeyes_owner TO postgres');await target.query('GRANT CREATE,CONNECT ON DATABASE postgres TO openeyes_owner');await target.query('GRANT CONNECT ON DATABASE postgres TO openeyes_app');await target.query('GRANT USAGE,CREATE ON SCHEMA public TO openeyes_owner');await target.query('SET LOCAL ROLE openeyes_owner');
 for(const m of migrations){await target.query(readFileSync('db/migrations/'+m.name,'utf8'));console.log('Applied',m.name);}
 await target.query('CREATE TABLE public.openeyes_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 for(const m of migrations)await target.query('INSERT INTO public.openeyes_migrations VALUES($1,$2,$3)',[m.name,m.checksum,m.applied_at]);
 const security=(await target.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind='r'")).rows;
 for(const t of security){await target.query(`ALTER TABLE app.${q(t.relname)} DISABLE ROW LEVEL SECURITY`);await target.query(`ALTER TABLE app.${q(t.relname)} DISABLE TRIGGER USER`);}
 // Only our freshly created tables and migration seed rows exist in this transaction.
 await target.query('TRUNCATE '+tables.map(t=>'app.'+q(t)).join(','));const counts={};
 for(const t of ordered){counts[t]=(await target.query(`INSERT INTO app.${q(t)} SELECT * FROM json_populate_recordset(NULL::app.${q(t)},$1::json)`,[data[t]])).rowCount;if(hash(await contents(target,t))!==hash(data[t]))throw Error('Content mismatch: '+t);}
 for(const t of security){await target.query(`ALTER TABLE app.${q(t.relname)} ENABLE TRIGGER USER`);if(t.relrowsecurity)await target.query(`ALTER TABLE app.${q(t.relname)} ENABLE ROW LEVEL SECURITY`);if(t.relforcerowsecurity)await target.query(`ALTER TABLE app.${q(t.relname)} FORCE ROW LEVEL SECURITY`);}
 await target.query('RESET ROLE');await target.query('REVOKE CREATE ON DATABASE postgres FROM openeyes_owner');await target.query('REVOKE CREATE ON SCHEMA public FROM openeyes_owner');
 const project=e.SUPABASE_DB_USER.slice(9),url=new URL(`postgresql://${e.SUPABASE_DB_HOST}:5432/postgres`);url.username='openeyes_app.'+project;url.password=password;
 const settings={APP_MODE:'demo',APP_ORIGIN:'https://lightskyblue-alligator-374589.hostingersite.com',HOSPITAL_CODE:'DEMO',DATABASE_URL:url.toString(),DATABASE_SSL_CA_BASE64:Buffer.from(ca).toString('base64'),IDENTIFIER_ENCRYPTION_KEY:e.IDENTIFIER_ENCRYPTION_KEY,IDENTIFIER_INDEX_KEY:e.IDENTIFIER_INDEX_KEY,SESSION_PEPPER:randomBytes(32).toString('base64'),SHOW_DEMO_CREDENTIALS:'true',DEMO_ACCOUNT_PASSWORD:e.DEMO_ACCOUNT_PASSWORD,TRUST_PROXY:'false'};
 if(Object.values(settings).some(v=>!v||/[\r\n]/.test(v)))throw Error('Invalid export configuration');
 writeFileSync('.env.hostinger.local',Object.entries(settings).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600});
 await target.query('COMMIT');committed=true;
 const runtime=new pg.Client({...config,user:'openeyes_app.'+project,password});try{
  await runtime.connect();const r=(await runtime.query("SELECT current_user,rolsuper,rolbypassrls,EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='app'::regnamespace AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS owns_tables FROM pg_roles WHERE rolname=current_user")).rows[0];
  if(r.current_user!=='openeyes_app'||r.rolsuper||r.rolbypassrls||r.owns_tables)throw Error('Unsafe runtime role');
  if(Number((await runtime.query('SELECT count(*) FROM app.patient')).rows[0].count)!==0)throw Error('Tenant isolation failure');
  await runtime.query('BEGIN');await runtime.query("SELECT set_config('app.tenant_id',$1,true)",[tenants[0].id]);if(Number((await runtime.query('SELECT count(*) FROM app.patient')).rows[0].count)!==counts.patient)throw Error('Runtime patient count mismatch');await runtime.query('ROLLBACK');
  console.log('Restricted runtime login and tenant isolation verified.');
 }finally{await runtime.end();}
 writeFileSync('.runtime/supabase/migration-result.json',JSON.stringify({at:new Date().toISOString(),project,counts,verified:true},null,2));console.log('Migration complete:',JSON.stringify(counts));console.log('Private Hostinger environment saved to .env.hostinger.local; no administrator credentials included.');
}
try{await main();}catch(error){if(!committed){try{await target.query('ROLLBACK');}catch{}}console.error(committed?'Migration committed; verification failed:':'Migration aborted:',error.code||error.message);process.exitCode=1;}finally{await source.end();await target.end();}
