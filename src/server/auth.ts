import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { escapeLiteral } from "pg";
import { hash, verify } from "@node-rs/argon2";
import { setTenant, transaction, withTenant } from "./db";
import { privateHash } from "./crypto";
import { isDemo, requiredEnv, secureCookies, showDemoCredentials } from "./config";
import { audit, type AuditContext } from "./audit";
import { ApiError } from "./http";
import type { AuthUser, Permission, Role, Session } from "../lib/access";

export const SESSION_COOKIE = "openeyes_session";
const HASH_OPTIONS = { algorithm: 2 as const, memoryCost: 65536, timeCost: 3, parallelism: 1 }; // Argon2id
let dummyHash: Promise<string> | undefined;

export type ConfiguredTenant = { id: string; name: string; code: string; is_demo: boolean };
export async function configuredTenant(): Promise<ConfiguredTenant> {
  return transaction(async db => {
    const result = await db.query("SELECT id,name,code,is_demo FROM app.tenant WHERE code=$1", [requiredEnv("HOSPITAL_CODE")]);
    if (!result.rowCount) throw new ApiError(503, "serviceUnavailable");
    const tenant = result.rows[0] as ConfiguredTenant;
    if (!isDemo() && tenant.is_demo) throw new ApiError(503, "serviceUnavailable");
    return tenant;
  });
}

type RateLimit = { key: string; maximum: number; seconds: number };
async function consumeLimits(limits: RateLimit[]) {
  if (!limits.length) return;
  const keys = limits.map(limit => privateHash(limit.key));
  const attempts = await transaction(async db => {
    const result = await db.query(`INSERT INTO app.rate_limit(key,attempts,window_end)
      SELECT input.key,1,now()+make_interval(secs=>input.seconds)
      FROM unnest($1::text[],$2::int[]) AS input(key,seconds)
      ON CONFLICT(key) DO UPDATE SET
        attempts=CASE WHEN app.rate_limit.window_end<now() THEN 1 ELSE app.rate_limit.attempts+1 END,
        window_end=CASE WHEN app.rate_limit.window_end<now() THEN EXCLUDED.window_end ELSE app.rate_limit.window_end END
      RETURNING key,attempts`, [keys, limits.map(limit => limit.seconds)]);
    return new Map(result.rows.map(row => [row.key as string, Number(row.attempts)]));
  });
  if (limits.some((limit, index) => (attempts.get(keys[index]) ?? limit.maximum + 1) > limit.maximum)) throw new ApiError(429, "tooManyAttempts");
}
export async function consumeLimit(key: string, maximum: number, seconds: number) {
  await consumeLimits([{ key, maximum, seconds }]);
}

export async function login(email: string, password: string, context: AuditContext): Promise<{ user: AuthUser; token: string }> {
  const tenant = await configuredTenant();
  const normalizedEmail = email.trim().toLowerCase();
  const limitKey = `login:${tenant.id}:${normalizedEmail}`;
  await consumeLimits([
    { key: `login-source:${context.ip ?? "local"}`, maximum: 100, seconds: 60 },
    { key: limitKey, maximum: 5, seconds: 900 },
  ]);
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
    const result = await db.query(`SELECT u.id,u.tenant_id AS "tenantId",t.name AS "tenantName",t.is_demo AS "demoTenant",u.full_name AS name,u.email,u.must_change_password AS "mustChangePassword",
      u.password_hash AS "passwordHash",t.settings,
      ARRAY(SELECT ur.role_code FROM app.user_role ur WHERE ur.user_id=u.id ORDER BY ur.role_code) AS roles,
      ARRAY(SELECT DISTINCT rp.permission_code FROM app.user_role ur JOIN app.role_permission rp ON rp.tenant_id=ur.tenant_id AND rp.role_code=ur.role_code WHERE ur.user_id=u.id) AS permissions,
      ARRAY(SELECT uf.facility_id FROM app.user_facility uf JOIN app.facility f ON f.id=uf.facility_id AND f.active WHERE uf.user_id=u.id ORDER BY uf.facility_id) AS "facilityIds"
      FROM app.user_account u JOIN app.tenant t ON t.id=u.tenant_id WHERE u.id=$1 AND u.status='active'`, [account.id]);
    const current = result.rows[0] as (AuthUser & { demoTenant: boolean; passwordHash: string; settings: { adminIdleMinutes?: number; clinicalIdleMinutes?: number } }) | undefined;
    if (!current || (!isDemo() && current.demoTenant) || current.passwordHash !== account.password_hash) throw new ApiError(401, "invalidCredentials");
    const idleMinutes = current.roles.some(role => ["hospital_admin", "security_admin", "auditor"].includes(role)) ? (current.settings.adminIdleMinutes ?? 30) : (current.settings.clinicalIdleMinutes ?? 15);
    await db.query(`WITH inserted AS (
        INSERT INTO app.session(token_hash,tenant_id,user_id,expires_at,idle_minutes)
        VALUES($1,$2,$3,now()+interval '8 hours',$4) RETURNING 1
      ), cleared AS (
        DELETE FROM app.rate_limit WHERE key=$5 RETURNING 1
      ), logged AS (
        INSERT INTO app.audit_log(tenant_id,actor_id,action,entity_type,entity_id,ip,user_agent,metadata)
        SELECT $2,$3,'auth.login','session',NULL,$6,$7,'{}'::jsonb FROM inserted RETURNING 1
      )
      SELECT (SELECT count(*) FROM inserted) AS inserted,
             (SELECT count(*) FROM cleared) AS cleared,
             (SELECT count(*) FROM logged) AS logged`,
      [privateHash(token), tenant.id, account.id, idleMinutes, privateHash(limitKey), context.ip ?? null, context.userAgent ?? null]);
    const { demoTenant: _demoTenant, passwordHash: _passwordHash, settings: _settings, ...safeUser } = current;
    return safeUser;
  });
  return { user, token };
}

export function cookieOptions() { return { httpOnly: true, secure: secureCookies(), sameSite: "lax" as const, path: "/", maxAge: 8 * 60 * 60 }; }

export async function sessionFromToken(token: string | undefined, touch = true): Promise<Session | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = privateHash(token);
  return transaction(async db => {
    // Session lookup needs its RLS context established as a completed statement.
    // A safe literal lets both statements use the simple protocol in one network
    // round trip, while tenant context remains an explicit boundary.
    const lookup = await db.query(`SELECT set_config('app.session_hash',${escapeLiteral(tokenHash)},true);
      SELECT tenant_id,user_id FROM app.session
      WHERE token_hash=${escapeLiteral(tokenHash)} AND expires_at>now()
        AND last_seen_at + make_interval(mins=>idle_minutes)>now()`) as unknown as Array<{ rows: Array<{ tenant_id: string; user_id: string }> }>;
    const record = lookup[1]?.rows[0];
    if (!record) return null;
    await setTenant(db, record.tenant_id, record.user_id);
    const result = await db.query(`WITH touched AS (
        UPDATE app.session s SET last_seen_at=now()
        WHERE $2::boolean AND s.token_hash=$1
          AND EXISTS(SELECT 1 FROM app.user_account u JOIN app.tenant t ON t.id=u.tenant_id
            WHERE u.id=$3 AND u.status='active' AND ($4::boolean OR NOT t.is_demo))
        RETURNING 1
      )
      SELECT u.id,u.tenant_id AS "tenantId",t.name AS "tenantName",u.full_name AS name,u.email,u.must_change_password AS "mustChangePassword",
        ARRAY(SELECT ur.role_code FROM app.user_role ur WHERE ur.user_id=u.id ORDER BY ur.role_code) AS roles,
        ARRAY(SELECT DISTINCT rp.permission_code FROM app.user_role ur JOIN app.role_permission rp ON rp.tenant_id=ur.tenant_id AND rp.role_code=ur.role_code WHERE ur.user_id=u.id) AS permissions,
        ARRAY(SELECT uf.facility_id FROM app.user_facility uf JOIN app.facility f ON f.id=uf.facility_id AND f.active WHERE uf.user_id=u.id ORDER BY uf.facility_id) AS "facilityIds",
        (SELECT count(*) FROM touched) AS "_touched"
      FROM app.user_account u JOIN app.tenant t ON t.id=u.tenant_id
      WHERE u.id=$3 AND u.status='active' AND ($4::boolean OR NOT t.is_demo)`,
      [tokenHash, touch, record.user_id, isDemo()]);
    const row = result.rows[0] as (AuthUser & { _touched: string }) | undefined;
    if (!row) return null;
    const { _touched, ...user } = row;
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
export async function demoAccounts(configured?: ConfiguredTenant): Promise<{ accounts: DemoAccount[]; password: string } | null> {
  if (!showDemoCredentials()) return null;
  const tenant = configured ?? await configuredTenant();
  if (!tenant.is_demo) return null;
  const accounts = await withTenant(tenant.id, undefined, async db => (await db.query(`SELECT u.full_name AS name,u.email,u.must_change_password AS "mustChangePassword",ur.role_code AS role FROM app.user_account u JOIN app.user_role ur ON ur.user_id=u.id AND ur.tenant_id=u.tenant_id WHERE u.status='active' AND ur.role_code IN ('receptionist','doctor','nurse','auditor','pharmacist','cashier','inventory_officer','hospital_admin','security_admin') ORDER BY array_position(ARRAY['receptionist','doctor','nurse','auditor','pharmacist','cashier','inventory_officer','hospital_admin','security_admin'],ur.role_code),u.email LIMIT 20`)).rows as DemoAccount[]);
  return { accounts: accounts.filter((account, index, all) => all.findIndex(other => other.role === account.role) === index), password: requiredEnv("DEMO_ACCOUNT_PASSWORD") };
}
