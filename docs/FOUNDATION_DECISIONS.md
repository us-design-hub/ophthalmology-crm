# Milestone 2 implementation decisions

## Persistence and authorization

Next.js route handlers provide the backend; PostgreSQL is the source of truth for identities, sessions, role grants, patient demographics, flags, MRN counters, and audit events. Explicit SQL migrations and `pg` make row-security policies and transaction context inspectable. No ORM or separate API service is mixed into this milestone.

Application and administrative connections use different roles and separate local configuration files. Application transactions reject a runtime role that owns tables, is a superuser, or can bypass row security. Patient-related tables and relevant identity tables have enabled/forced RLS. Tenant context is transaction-local and comes from a verified bearer session, never a submitted tenant header.

Tenant directory metadata/global permission definitions contain no patient records. Rate-limit keys are keyed digests. A session token-hash lookup policy resolves the session tenant before normal tenant context is set.

Reception and hospital administrators can create patients. Doctors, nurses, optometrists, pharmacists, and cashiers can read the hospital master patient index. Auditors/security administrators can read audit events without patient-registry access. Inventory-only accounts can access neither dataset. A creating user needs an assigned facility; the master index remains hospital-wide to avoid duplicate identities across clinics.

Encounter-level facility, ownership, and signed-state controls will be added with the corresponding workflows.

## Authentication and demo access

The interim implementation uses Argon2id password authentication with 64 MiB memory, three passes, and one lane. Seeded accounts have separate salted hashes. Session tokens contain 32 random bytes; only keyed hashes are stored in PostgreSQL.

Cookies are HttpOnly, SameSite=Lax, scoped to `/`, and Secure for HTTPS. Non-demo cookie issuance requires HTTPS. Absolute session lifetime is eight hours. Idle timeout is fifteen minutes for clinical/reception roles and thirty minutes for administrative/auditor roles. Background session checks do not renew idle lifetime. Active-account status and current permissions are re-read on protected requests.

Explicitly enabled demo account choices fill the login form but still use normal password verification. Production mode rejects demo tenants and never displays demo credentials. `NODE_ENV` is not an authorization flag. OIDC, MFA, recovery, and staff administration are not implemented yet. Future role/account administration must revoke or rotate affected sessions; existing disabled-account checks already deny access immediately.

## Patient identifiers and validation

Identifiers use AES-256-GCM with randomized nonces and tenant/type-associated data. A separate HMAC key provides tenant-bound exact-match blind indexes. Read DTOs expose identifier type and last four characters, never full identifiers or ciphertext.

CNIC/guardian identifiers normalize spaces/hyphens and require thirteen digits. Passports permit six to twenty alphanumeric characters. This validates format, not identity. Guardian identifiers are available only for minors and can be shared by siblings. Emergency registration exceptions remain a hospital-policy discovery question.

Search terms travel in POST bodies, not URLs. Audit events record result counts rather than search terms. Application errors log sanitized codes only. The local PostgreSQL runtime suppresses statement/parameter logging on errors; future proxy/database logging must preserve these restrictions.

Birth dates are date-only values; estimated ages carry a separate estimated flag. Event timestamps are timestamptz and display in Asia/Karachi as DD-MMM-YYYY with time where relevant.

## Duplicate handling and consistency

The server checks phone, name plus birth date, and exact personal identifiers. A five-minute review token binds normalized input, candidate IDs, user, and tenant. Changed details or newly appearing matches invalidate that review. Exact personal-identifier duplicates cannot be overridden; other matches require an attributed reason.

Registration review/create is serialized within a tenant for this demo. MRN allocation, patient creation, flags, and audit append commit atomically. A database unique index additionally protects personal identifiers. Guardian identifiers are intentionally excluded from that personal-identity constraint.

## Audit and requests

The application has INSERT/SELECT only on audit records, with no UPDATE/DELETE/TRUNCATE grants. Patient editing/deletion is not exposed. Events cover login/logout/failure, denied access, patient list/search/read/create/duplicate-check, and audit viewing. Override reasons are intentionally recorded as justification.

Write/search requests require the configured Origin and JSON content with a 16 KiB body limit. Login and authenticated data operations use database-backed rate limits. IP is left unknown without a configured trusted proxy; an untrusted forwarding header is not accepted as the source address. User agent is length-limited.

## Runtime, tests, and next work

The workspace-local PostgreSQL runtime is a development convenience, bound to loopback with persistent files. Production hosting, infrastructure encryption, backups, restoration, and operational assurance remain acceptance work.

Tests use `openeyes_demo_test`. Isolation fixtures are rolled back or removed by exact IDs in that dedicated database. The preview retains its sixty seeded patients until the user registers another. The seed is idempotent and does not erase records. Meeting reset, remote CI execution, and migration/restore rehearsals remain pending; database test commands are ready for CI integration.

Patient details show demographics and flags. Milestone 3 now adds appointment/check-in, encounters, queue transitions, and persistent bilateral workup; see INTAKE_DECISIONS.md. Anatomy remains practice-only. Doctor Event integration, signing, and prescribing follow next.
