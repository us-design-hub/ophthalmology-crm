import { productionClient, requiredProductionEnv } from "./production-env";

async function main() {
  const runtimeUrl = new URL(requiredProductionEnv("DATABASE_URL"));
  if (decodeURIComponent(runtimeUrl.username) !== "openeyes_app") throw new Error("DATABASE_URL must use the openeyes_app role");
  const password = decodeURIComponent(runtimeUrl.password);
  if (password.length < 24) throw new Error("The openeyes_app database password must contain at least 24 characters");

  const db = productionClient("openeyes-production-provision");
  await db.connect();
  try {
    await db.query("SELECT set_config('openeyes.bootstrap_password',$1,false)", [password]);
    await db.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='openeyes_app') THEN
          EXECUTE format('ALTER ROLE openeyes_app WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', current_setting('openeyes.bootstrap_password'));
        ELSE
          EXECUTE format('CREATE ROLE openeyes_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', current_setting('openeyes.bootstrap_password'));
        END IF;
      END $$`);
    await db.query("RESET openeyes.bootstrap_password");
    console.log("Provisioned the restricted openeyes_app database role.");
  } finally {
    await db.end();
  }
}

main().catch(error => {
  console.error(`Production database provisioning failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
