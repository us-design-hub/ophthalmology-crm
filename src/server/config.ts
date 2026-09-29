export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value === "REPLACE") throw new Error(`Missing required configuration: ${name}`);
  return value;
}
export function appOrigin(): string { return new URL(requiredEnv("APP_ORIGIN")).origin; }
export type AppMode = "demo" | "production";
export function appMode(): AppMode {
  const mode = requiredEnv("APP_MODE");
  if (mode !== "demo" && mode !== "production") throw new Error("APP_MODE must be demo or production");
  return mode;
}
export function isDemo(): boolean { return appMode() === "demo"; }
export function isProduction(): boolean { return appMode() === "production"; }
export function showDemoCredentials(): boolean { return isDemo() && process.env.SHOW_DEMO_CREDENTIALS === "true"; }
export function secureCookies(): boolean {
  const secure = new URL(appOrigin()).protocol === "https:";
  if (!isDemo() && !secure) throw new Error("A non-demo deployment requires HTTPS");
  return secure;
}
