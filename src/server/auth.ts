import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import type { PoolClient } from "pg";
import { transaction, setTenant, withTenant } from "./db";
import { privateHash } from "./crypto";
import { isDemo, requiredEnv, secureCookies, showDemoCredentials } from "./config";
import { audit, type AuditContext } from "./audit";
import { ApiError } from "./http";
import type { AuthUser, Permission, Role, Session } from "../lib/access";

export const SESSION_COOKIE = "openeyes_session";
const HASH_OPTIONS = { algorithm: 2 as const, memoryCost: 65536, timeCost: 3, parallelism: 1 }; // Argon2id
let dummyHash: Promise<string> | undefined;

export async function configuredTenant() {
  return transaction(async db => {
    const result = await db.query("SELECT id,name,code,is_demo FROM app.tenant WHERE code=$1", [requiredEnv("HOSPITAL_CODE")]);
    if (!result.rowCount) throw new ApiError(503, "serviceUnavailable");
    const tenant = result.rows[0] as { id: string; name: string; code: string; is_demo: boolean };
    if (!isDemo() && tenant.is_demo) throw new ApiError(503, "serviceUnavailable");
    return tenant;
  });
}

async function loadUser(db: PoolClient, id: string): Promise<AuthUser | null> {
  const result = await db.query(`SELECT u.id,u.tenant_id AS "tenantId",t.name AS "tenantName",t.is_demo AS "demoTenant",u.full_name AS name,u.email,u.must_change_password AS "mustChangePassword",
    ARRAY(SELECT ur.role_code FROM app.user_role ur WHERE ur.user_id=u.id ORDER BY ur.role_code) AS roles,
    ARRAY(SELECT DISTINCT rp.permission_code FROM app.user_role ur JOIN app.role_permission rp ON rp.tenant_id=ur.tenant_id AND rp.role_code=ur.role_code WHERE ur.user_id=u.id) AS permissions,
    ARRAY(SELECT uf.facility_id FROM app.user_facility uf JOIN app.facility f ON f.id=uf.facility_id AND f.active WHERE uf.user_id=u.id ORDER BY uf.facility_id) AS "facilityIds"
    FROM app.user_account u JOIN app.tenant t ON t.id=u.tenant_id WHERE u.id=$1 AND u.status='active'`, [id]);
  const row = result.rows[0] as (AuthUser & { demoTenant: boolean }) | undefined;
  if (!row || (!isDemo() && row.demoTenant)) return null;
  const { demoTenant: _demoTenant, ...user } = row;
  return user;
}

export async function consumeLimit(key: string, maximum: number, seconds: number) {
  const allowed = await transaction(async db => {
    const result = await db.query(`INSERT INTO app.rate_limit(key,attempts,window_end) VALUES($1,1,now()+make_interval(secs=>$2))
      ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN app.rate_limit.window_end<now() THEN 1 ELSE app.rate_limit.attempts+1 END,
      window_end=CASE WHEN app.rate_limit.window_end<now() THEN now()+make_interval(secs=>$2) ELSE app.rate_limit.window_end END RETURNING attempts`, [privateHash(key), seconds]);
    return result.rows[0].attempts <= maximum;
  });
  if (!allowed) throw new ApiError(429, "tooManyAttempts");
}

export async function login(email: string, password: string, context: AuditContext): Promise<{ user: AuthUser; token: string }> {
  const tenant = await configuredTenant();
  const normalizedEmail = email.trim().toLowerCase();
  const limitKey = `login:${tenant.id}:${normalizedEmail}`;
  await consumeLimit(`login-source:${context.ip ?? "local"}`, 100, 60);
  await consumeLimit(limitKey, 5, 900);
  const account = await withTenant(tenant.id, undefined, async db => {
    const result = await db.query("SELECT id,password_hash,status FROM app.user_account WHERE email=$1", [normalizedEmail]);
    return result.rows[0] as { id: string; password_hash: string; status: string } | undefined;
  });
  dummyHash ??= hash(randomBytes(24), HASH_OPTIONS);
  const valid = await verify(account?.password_hash ?? await dummyHash, password).catch(() => false);
  if (!account || !valid || account.status !== "active") {
    await withTenant(tenant.id, undefined, db => audit(db, { tenantId: tenant.id, action: "auth.login_failed", entityType: "session", context }));
    throw new ApiError(401, "invalidCredentials");
  }
  const token = randomBytes(32).toString("base64url");
  const user = await withTenant(tenant.id, account.id, async db => {
    const current = await loadUser(db, account.id);
    if (!current) throw new ApiError(401, "invalidCredentials");
    const currentHash = await db.query("SELECT password_hash FROM app.user_account WHERE id=$1", [account.id]);
    if (currentHash.rows[0].password_hash !== account.password_hash) throw new ApiError(401, "invalidCredentials");
    const settings = (await db.query("SELECT settings FROM app.tenant WHERE id=$1", [tenant.id])).rows[0].settings;
    const idleMinutes = current.roles.some(role => ["hospital_admin", "security_admin", "auditor"].includes(role)) ? (settings.adminIdleMinutes ?? 30) : (settings.clinicalIdleMinutes ?? 15);
    await db.query("INSERT INTO app.session(token_hash,tenant_id,user_id,expires_at,idle_minutes) VALUES($1,$2,$3,now()+interval '8 hours',$4)", [privateHash(token), tenant.id, account.id, idleMinutes]);
    await db.query("DELETE FROM app.rate_limit WHERE key=$1", [privateHash(limitKey)]);
    await audit(db, { tenantId: tenant.id, actorId: current.id, action: "auth.login", entityType: "session", context });
    return current;
  });
  return { user, token };
}

export function cookieOptions() { return { httpOnly: true, secure: secureCookies(), sameSite: "lax" as const, path: "/", maxAge: 8 * 60 * 60 }; }

export async function sessionFromToken(token: string | undefined, touch = true): Promise<Session | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = privateHash(token);
  return transaction(async db => {
    await db.query("SELECT set_config('app.session_hash',$1,true)", [tokenHash]);
    const result = await db.query("SELECT tenant_id,user_id FROM app.session WHERE token_hash=$1 AND expires_at>now() AND last_seen_at + make_interval(mins=>idle_minutes)>now()", [tokenHash]);
    if (!result.rowCount) return null;
    const record = result.rows[0];
    await setTenant(db, record.tenant_id, record.user_id);
    const user = await loadUser(db, record.user_id);
    if (!user) return null;
    if (touch) await db.query("UPDATE app.session SET last_seen_at=now() WHERE token_hash=$1", [tokenHash]);
    return { user, tokenHash };
  });
}
export async function pageSession(): Promise<Session | null> { return sessionFromToken((await cookies()).get(SESSION_COOKIE)?.value); }
export async function requestSession(request: Request, permission?: Permission, touch = true, allowPasswordChange = false): Promise<Session> {
  const token = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  const session = await sessionFromToken(token, touch);
  if (!session) throw new ApiError(401, "sessionExpired");
  if (session.user.mustChangePassword && !allowPasswordChange) throw new ApiError(403, "passwordChangeRequired");
  if (permission && !session.user.permissions.includes(permission)) {
    await withTenant(session.user.tenantId, session.user.id, db => audit(db, { tenantId: session.user.tenantId, actorId: session.user.id, action: "access.denied", entityType: "permission", metadata: { permission } }));
    throw new ApiError(403, "accessDenied");
  }
  return session;
}
export async function logout(session: Session, context: AuditContext) {
  await withTenant(session.user.tenantId, session.user.id, async db => {
    await db.query("DELETE FROM app.session WHERE token_hash=$1", [session.tokenHash]);
    await audit(db, { tenantId: session.user.tenantId, actorId: session.user.id, action: "auth.logout", entityType: "session", context });
  });
}
export type DemoAccount = { name: string; email: string; role: Role };
export async function demoAccounts(): Promise<{ accounts: DemoAccount[]; password: string } | null> {
  if (!showDemoCredentials()) return null;
  const tenant = await configuredTenant();
  if (!tenant.is_demo) return null;
  const accounts = await withTenant(tenant.id, undefined, async db => (await db.query(`SELECT u.full_name AS name,u.email,u.must_change_password AS "mustChangePassword",ur.role_code AS role FROM app.user_account u JOIN app.user_role ur ON ur.user_id=u.id AND ur.tenant_id=u.tenant_id WHERE u.status='active' AND ur.role_code IN ('receptionist','doctor','nurse','auditor','pharmacist','cashier','inventory_officer','hospital_admin','security_admin') ORDER BY array_position(ARRAY['receptionist','doctor','nurse','auditor','pharmacist','cashier','inventory_officer','hospital_admin','security_admin'],ur.role_code),u.email LIMIT 20`)).rows as DemoAccount[]);
  return { accounts: accounts.filter((account, index, all) => all.findIndex(other => other.role === account.role) === index), password: requiredEnv("DEMO_ACCOUNT_PASSWORD") };
}
