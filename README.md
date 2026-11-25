# PharmaCare

PharmaCare is a pharmacy management workspace built with Next.js App Router, TypeScript, Tailwind CSS, PostgreSQL and Prisma. The API keeps database access on the server. Stock and money use PostgreSQL `Decimal` columns, idempotency keys and database transactions.

## Requirements

- Node.js 20.9 or newer and npm 10+
- Docker Desktop with Compose, or a PostgreSQL 16 database

## Local setup

```powershell
Copy-Item .env.example .env
Copy-Item .env apps\web\.env.local
docker compose up -d postgres
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Before using phone-based sign-in, fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in both `.env` and `apps/web/.env.local`, then restart the app. Open <http://localhost:3000>. The explicit seed command is for local development; builds and production startup never seed demo records.

The seed creates five role-based accounts. They all use `PharmaCare2026!` unless `DEMO_PASSWORD` is set before running the seed:

| Role | Email |
| --- | --- |
| Super Admin | `admin@pharmacare.local` |
| Pharmacy Manager | `manager@pharmacare.local` |
| Pharmacist | `pharmacist@pharmacare.local` |
| Cashier | `cashier@pharmacare.local` |
| Inventory Manager | `inventory@pharmacare.local` |

Change the demo passwords before using seed data outside a local environment. `DATABASE_URL` and `SESSION_SECRET` are server-only values. Login sessions use random opaque tokens, store only a SHA-256 token hash in PostgreSQL, and set an HTTP-only, SameSite cookie; HTTPS deployments mark the cookie Secure.

## Development commands

```powershell
npm run dev              # Next.js development server
npm run build            # Production build
npm start                # Production server after build
npm run lint             # ESLint
npm test                 # Business logic tests
npm run test:db          # PostgreSQL concurrency tests (requires TEST_DATABASE_URL)
npm run db:migrate       # Create/apply local Prisma migration
npm run db:seed          # Repeatable fictional development seed
npm run db:studio        # Prisma Studio
```

## Data and workflows

- Medicines and batches use decimal prices, expiry dates and SKU/barcode uniqueness.
- Sale checkout checks prescription references, applies authorized discounts, computes tax, selects unexpired batches by FEFO and locks batch rows for the transaction. A required `Idempotency-Key` makes retries safe. No external payment provider is connected; payment references are stored as entered and never represented as verified.
- Returns are tied to sale lines, constrain cumulative return quantities and separate sellable restocking from damaged/expired write-off records. Refunds are recorded only; no external refund is executed.
- Purchase receiving creates batches and stock movements in one transaction, tracks partial quantities and accepts an idempotency key. Supplier payment records cannot exceed the recorded order balance.
- Significant stock, user, settings, purchase, sale and permission changes write an audit record. The application exposes audit data read-only.
- Reports keep revenue, batch-derived cost of goods sold, gross profit and expenses separate. CSV export is available from the reports API.
- Role defaults are enforced server-side. A super admin can set per-action permission overrides through the permission matrix API.

## API overview

All JSON endpoints use the same-origin HTTP-only session. Except login, endpoints require an authenticated user and a server-side role/action permission. Error responses have an `error` string. Mutations validate request bodies on the server. IDs are Prisma CUIDs.

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/auth/signup` | Create an account with cashier access and a requested role; requires a 12-character password |
| POST | `/api/auth/login` | Email/password login; sets session cookie |
| POST | `/api/auth/logout` | Revoke current session |
| GET | `/api/auth/me` | Current user summary |
| GET, POST | `/api/medicines` | Search/list or create medicines |
| GET | `/api/inventory` | Batch list and movement history |
| POST | `/api/inventory` | Reason-required batch quantity adjustment |
| GET, POST | `/api/sales` | Recent sales or atomic checkout; checkout requires `Idempotency-Key` |
| POST | `/api/returns` | Partial/full return; requires `Idempotency-Key` |
| GET, POST | `/api/suppliers` | List/create suppliers |
| GET, POST | `/api/purchases` | List/create purchase orders; create requires `Idempotency-Key` |
| POST | `/api/purchases/{id}/receive` | Receive order lines with batch and expiry details; requires `Idempotency-Key` |
| POST | `/api/purchases/{id}/payments` | Record supplier payment |
| GET, POST | `/api/expenses` | List/create expenses; optional `from` and `to` ISO date filters |
| GET, PUT | `/api/settings` | Read/update pharmacy settings |
| GET | `/api/reports?from=ISO&to=ISO` | Date-filtered sales, inventory, expiry and P&L summary |
| GET | `/api/reports?from=ISO&to=ISO&format=csv` | CSV summary export |
| GET | `/api/reports/password-security` | Super-admin password storage status report (never returns password hashes or salts) |
| GET | `/api/notifications` | Current pharmacy notifications |
| GET | `/api/audit` | Read audit history |
| GET, POST | `/api/users` | List/create users |
| PATCH | `/api/users/{id}` | Change role, disable account or set password (minimum 12 characters) |
| GET, PUT | `/api/permissions` | Read/update one permission matrix rule |

## Tests

`npm test` runs the unit suite for FEFO ordering, expired/insufficient stock, sale arithmetic, role permissions, partial receiving, partial returns, login validation, split payments, password peppering, and TOTP cryptography. `npm run test:db` runs PostgreSQL concurrency checks against `TEST_DATABASE_URL`; point it to a separate test database with the migrations applied. Never point it at development or production data.

## Authentication and information security

- Opening the application root (`/`) sends the user to `/login` without changing the existing sign-in; successful sign-in continues to the protected `/dashboard`.
- The dashboard menu, summary cards, sales data, and management controls are tailored to each user's effective server-side role permissions. The same permission checks are applied by the API.
- Password login is followed by a second-factor verification. Desktop browsers can enroll using the authenticator setup QR/key or switch to a one-time code sent to the account email; mobile browsers receive the email code automatically. TOTP codes rotate every 30 seconds.
- Passwords use bcrypt with a random per-password salt and an HMAC-SHA-256 pepper pre-hash. Existing bcrypt hashes remain accepted and are upgraded after the user's next successful password check.
- **Reports → Password Security Report** shows per-account password storage status to Super Admins without exposing password hashes or salts. Legacy bcrypt hashes are marked as requiring improvement until they are upgraded at sign-in. Account creator ownership is not stored in the existing schema, so the report covers all accounts in the existing user table rather than filtering by creator.
- TOTP seeds are encrypted at rest using AES-256-GCM with a separate derived encryption key. Session tokens are random, stored only as HMAC-SHA-256 hashes, and issued in HTTP-only SameSite browser-session cookies (Secure over HTTPS); database sessions expire after 12 hours.
- Desktop sign-in uses authenticator TOTP by default and offers an email-code fallback. Mobile sign-in sends a short-lived, single-use code by SMTP email; configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in `apps/web/.env.local` (and in the hosting environment in production). Codes expire after five minutes, allow at most five attempts, and email codes are rate-limited.
- Signup lets a user request one of the existing roles. Every public signup receives Cashier permissions until a Super Admin approves the request in **Users & roles**.
- Keep `PASSWORD_PEPPER`, `MFA_ENCRYPTION_KEY`, and `SESSION_SECRET` stable and private. The pepper and encryption key are separate; changing either can prevent sign-in or decryption. Use independent high-entropy values in every environment and retain them in a managed secret store. A super admin can reset another user's authenticator in **Users & roles**; the user must enroll again.
- Authorization remains server-side through the existing role defaults and permission overrides. A valid password and authenticator code do not grant permissions beyond the user's role.

## Automated encrypted database backups

`.github/workflows/database-backup.yml` runs a PostgreSQL dump daily at 03:17 UTC and can also be started manually from the repository's Actions tab. It encrypts the dump with GnuPG AES-256, verifies that it can be decrypted and read by `pg_restore`, and uploads only the encrypted file as an artifact with 30-day retention. To enable it, add these repository Actions secrets:

- `PHARMACARE_BACKUP_DATABASE_URL`: a PostgreSQL connection URI for the database. Use the Supabase direct connection if available; otherwise use a pooler URI that supports `pg_dump`.
- `PHARMACARE_BACKUP_ENCRYPTION_KEY`: a new, strong backup-only passphrase. Store it separately from the database credentials.

The workflow is source-configured but will not run successfully until those secrets are configured in the GitHub repository. Keep repository artifact access restricted. To restore, download an artifact, decrypt it with the passphrase, and use `pg_restore` against a separate recovery database first. Do not restore a backup over the live pharmacy database without a reviewed recovery plan. Keep Supabase's provider-managed backups enabled as an additional recovery layer.

For local backups, install PostgreSQL client tools and GnuPG, set `DATABASE_URL` and `BACKUP_ENCRYPTION_KEY`, then run `bash scripts/backup-postgres.sh` (or run it from WSL/Git Bash on Windows).

## Deployment

Use a managed PostgreSQL 16 service and a Node-compatible Next.js host (for example, Vercel or a container host). Set `DATABASE_URL` to the production connection string and `SESSION_SECRET` to a randomly generated value of at least 32 bytes. Set `NEXT_PUBLIC_APP_URL` to the HTTPS origin. Deploy source, run `npx prisma migrate deploy --schema packages/database/prisma/schema.prisma` as the release migration step, then run `npm run build` and the host's Next.js start command. Do not run `db:seed` in a production environment. Configure database network access, TLS and backups with the selected provider.

## Current scope

The authenticated dashboard and main medicine, stock, sales, purchase, supplier, return, expense, report, user and settings workflows are connected to PostgreSQL. Tax defaults to 0% until configured. Receipt printing is available in the web checkout; third-party payment processing and external refund execution require provider integration. The pharmacy logo is configured by URL; uploading an image needs an external storage provider.
