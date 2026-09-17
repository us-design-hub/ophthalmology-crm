# Hostinger with Supabase

The Next.js application deploys from the existing GitHub repository. PostgreSQL runs in Supabase through its session pooler on port 5432. The application uses the restricted `openeyes_app` role, not Supabase's administrator account or Data API.

## Current migration

On 2026-09-17 the local synthetic DEMO database was copied into the newly created, empty Supabase project. All 11 immutable SQL migrations were applied. All 44 application tables were compared against a consistent source snapshot before committing. This included 61 patients, 12 staff accounts, five facilities, eight formulary items and eight opening stock batches. Local login sessions and rate-limit state were excluded.

The source database remains intact. `.runtime/supabase/source-snapshot.json` and `migration-result.json` are private local artifacts, excluded from Git. `scripts/migrate-to-supabase.mjs` refuses a destination that already contains OpenEyes objects; it is a one-time migration, not a synchronization or reset tool. Do not rerun it on the migrated project.

The destination uses separate schema-owner and runtime roles. Tenant isolation and signed-event immutability were verified through the restricted runtime account. Supabase `anon`, `authenticated`, and `service_role` roles have no access to the application schema.

## Complete the Hostinger configuration

Import the local `.env.hostinger.local` using Hostinger's Environment variables / Import .env control, then save and redeploy. This private file contains the complete application configuration, including the restricted database connection and matching identifier encryption/index keys. It does not contain the Supabase administrator password. Never commit it, paste its contents into chat, or put these settings behind a NEXT_PUBLIC prefix.

Replace duplicate keys when importing rather than leaving conflicting definitions. APP_ORIGIN must match the actual HTTPS site origin. Existing named-account passwords are preserved. A new session pepper isolates hosted sessions from local sessions. Demo credentials remain visible because the user requested the demo role picker.

DATABASE_SSL_CA_BASE64 contains the base64-encoded Supabase CA certificate. The database client uses it with certificate and hostname verification enabled. When setting this variable, leave sslmode and sslrootcert out of DATABASE_URL so URL parameters do not override the explicit TLS settings. The CA was downloaded using the URL defined by the official Supabase dashboard source (`apps/studio/hooks/custom-content/custom-content.json`) over HTTPS.

Supabase's Data API is disabled for this deployment. Our application connects directly using the PostgreSQL driver and its existing server-side authorization and RLS policies.

## Validation and remaining hosting check

The production build and TypeScript passed with the TLS configuration. Database validation confirmed missing tenant context cannot expose patient rows and signed events cannot be modified. An application smoke test against Supabase covers the login page, existing administrator credentials, patient registry, administration, billing and management endpoints.

After importing the environment and redeploying, verify the public login page and one complete workflow. Hostinger's managed environment still needs a separate verification of Chromium installation and Urdu fonts for prescription PDFs; this database migration does not establish PDF runtime compatibility. Consent documents are stored in PostgreSQL and were included in the table-copy mechanism.
