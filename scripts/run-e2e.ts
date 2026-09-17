import "./test-env";
import { spawn } from "node:child_process";

async function main() {
  try {
    await fetch("http://127.0.0.1:3100/login", { signal: AbortSignal.timeout(1500) });
    throw new Error("Port 3100 is already in use; stop that test server before starting a fresh run");
  } catch (error) { if (error instanceof Error && error.message.startsWith("Port 3100")) throw error; }
  const env: NodeJS.ProcessEnv = { ...process.env, E2E_SERVER_MANAGED: "true" };
  const { DATABASE_ADMIN_URL: _adminUrl, ...serverEnv } = env;
  // Spawn Node directly, not through a shell, so Windows cleanup targets only our own server.
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3100"], { env: serverEnv, stdio: "inherit", windowsHide: true });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      if (server.exitCode !== null) throw new Error("Test server exited before becoming ready");
      try { const response = await fetch("http://127.0.0.1:3100/login", { signal: AbortSignal.timeout(1500) }); if (response.ok) { ready = true; break; } } catch { /* Startup is still in progress. */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error("Test server did not become ready");
    const tests = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], { env, stdio: "inherit", windowsHide: true });
    const code = await new Promise<number>((resolve, reject) => { tests.on("error", reject); tests.on("exit", code => resolve(code ?? 1)); });
    process.exitCode = code;
  } finally { server.kill(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
