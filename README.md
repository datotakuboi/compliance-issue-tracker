# Compliwise Issue Tracker

A single-workspace compliance tracker with simulated role-based login, PostgreSQL persistence, evidence references, an audit trail, and a human-approved remediation playbook exposed through MCP.

## Quick Start

Requires Node.js 24 LTS (minimum 22.18), npm 11 recommended, and PostgreSQL 17+. Docker is optional.

```sh
npx --yes npm@11 ci
```

Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell). Never commit credentials.

Choose **one** database option:

- **Existing PostgreSQL / pgAdmin:** create a login role `tracker`, with login enabled and no elevated privileges. Create a database `tracker` owned by that role. Set `DATABASE_URL` to `postgresql://tracker:YOUR_URL_ENCODED_PASSWORD@localhost:5432/tracker?schema=public`.
- **Docker:** run `docker compose up -d --wait`. The example connection URL uses the container's local port `54329`.
- **Bundled local PostgreSQL:** run `npm run db:local` in a separate terminal. This starts PostgreSQL on `127.0.0.1:54329`, creates the database, and stores its files in ignored `.postgres/`. Leave it running. Do not run this alongside Docker on the same port. Windows/Linux/macOS platform binaries are installed by the development dependency; Docker/existing PostgreSQL are alternatives if these binaries cannot run on your platform. Never enable privileged host-user creation for this convenience runner.

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://127.0.0.1:3000**. Use that exact origin, not `localhost`, unless you also change `APP_ORIGIN`.

The seed adds five issues and four identities without overwriting existing records. Initially, the dashboard shows four open (all unresolved), two overdue, one pending review, and one completed issue. Dates are relative to the first seed; rerunning does not reset them. In pgAdmin, refresh `tracker > Schemas > public > Tables` and view the `Issue`, `User`, and `AuditEvent` rows.

## Demo Accounts

| Account           | Role     | Permissions                                                           |
| ----------------- | -------- | --------------------------------------------------------------------- |
| Alex Morgan       | Analyst  | Read, create/edit, attach references, analyze, execute approved plans |
| Jordan Lee        | Approver | Analyst permissions plus independent approval/rejection               |
| Sam Rivera        | Viewer   | Read issues, evidence, and audit history                              |
| Remediation agent | Service  | Bearer-token scopes only; cannot sign in or approve                   |

The sign-in screen is deliberately simulated, local development authentication, not password authentication. It is disabled unless `DEMO_AUTH_ENABLED=true`, and always disabled when `NODE_ENV=production`. The app binds to loopback by default. Do not expose demo login through a public tunnel or deploy it as real authentication.

Unauthenticated visitors go to `/login`, select a user account, and explicitly choose **Sign in**. Successful login returns to the requested workspace page; external return URLs are rejected. **Sign out** opens a confirmation modal. Cancel or Escape keeps the session, while confirmation revokes it on the server. Pending requests disable duplicate actions, and failed login/logout requests leave a recoverable error without pretending the session changed.

## Architecture

```text
Browser -- HttpOnly session ---------+                         +-- PostgreSQL
                v                         ^
MCP client -- stdio --> MCP server -- scoped bearer --> HTTP API
                |                         ^
                +--> shared services ------+
                  authorization
                  validation
                  audit + transactions
```

- `src/app`: App Router pages, security headers, and authenticated `/api/*` routes.
- `src/components/tracker.tsx`: responsive operational interface, forms, proposals, and audit view. Only type imports reference server services; database code is not bundled for the browser.
- `src/server/auth.ts`: hashed sessions, service-token authentication, role/scope checks, origin enforcement.
- `src/server/services.ts`: authorization at each service boundary, optimistic issue versions, serializable mutation transactions, and audit events.
- `src/server/validation.ts`: strict shared Zod schemas, including safe reference URLs and calendar dates.
- `src/mcp`: official TypeScript MCP SDK server. It calls HTTP APIs, never the database. Its process does not need `DATABASE_URL`.
- `prisma`: relational schema, committed SQL migration, and idempotent demo fixtures.
- `tests`: unit, real PostgreSQL service/API, desktop/mobile browser, and real stdio MCP tests.

One organization is intentional: all authenticated roles can read the workspace, not just their owned issues. Owners are responsible analysts/approvers, not access-control boundaries.

### Data And Workflow

`User`, `Session`, `ServiceToken`, `Issue`, `Evidence`, `PlaybookRun`, `Approval`, and `AuditEvent` are separate relational entities. Foreign keys preserve associations; one approval per proposal is enforced by a unique constraint. State and severity use database enums. Read paths use bounded pagination and indexes.

```text
OPEN -> IN_PROGRESS -> PENDING_REVIEW -> COMPLETED
```

Pre-completion fields can be edited; any edit or added evidence increments the issue version and invalidates earlier proposals. Ready analysis moves an issue to pending review and increments its version. Completion is available only through the approved-plan execution service, not a generic status edit. Completed issues are read-only. Overdue means a non-completed issue with a due date before today's **UTC calendar date**; an issue due today is not overdue.

Mutations and their audit records commit together. Serializable transactions retry serialization conflicts up to three attempts; conditional version updates prevent stale edits. A repeated execution returns the prior result without another state change or audit event. Audit events record the actor, action, changes, timestamp, and server-generated correlation ID. The audit API is read-only, but database owners can still modify records: this is **not tamper-proof storage**.

## MCP Setup

Start the application, then provision a scoped 24-hour credential:

```sh
npm run token:create
npm run test:mcp
```

The secret is saved to ignored `.mcp-token`, not printed. Only its SHA-256 hash is stored in PostgreSQL. Restrict the file's ACL on Windows/shared machines; POSIX creation uses mode `0600`. Run `npm run token:create -- --read-only` for an inspection-only credential. Provisioning requires database-owner access and is not exposed as an MCP tool. Creating another token does not revoke the previous one; use the printed credential ID to revoke it:

```sh
npm run token:create -- --revoke TOKEN_ID
```

Example VS Code MCP configuration (run with this repository as the working directory):

```json
{
  "servers": {
    "compliwise": {
      "type": "stdio",
      "command": "node",
      "args": ["--env-file=.env", "src/mcp/index.ts"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

For other clients, use an absolute path for the entry point/env file and set the working directory to the repository. You can instead supply `MCP_API_URL` and `MCP_SERVICE_TOKEN` through the client's secret/environment configuration, without an env file. Stdout is reserved for MCP JSON-RPC; startup errors go to stderr. This is a local **stdio** server, not a public HTTP MCP endpoint or an OAuth implementation.

| Tool                     | Required scope     | Behavior                                                         |
| ------------------------ | ------------------ | ---------------------------------------------------------------- |
| `list_issues`            | `issues:read`      | Filters; page/pageSize, maximum 100                              |
| `get_issue`              | `issues:read`      | Current version, up to 100 references and 20 recent proposals    |
| `add_evidence_reference` | `issues:write`     | Validates reference; requires current version; never fetches it  |
| `analyze_issue`          | `playbook:analyze` | Persists blockers/recommendations or a ready completion proposal |
| `execute_approved_plan`  | `playbook:execute` | Executes only an approved, unchanged, allowlisted plan           |
| `get_issue_audit`        | `issues:read`      | Up to 50 events and a next-page cursor                           |

There is **no approve tool**, generic HTTP tool, SQL tool, shell tool, or arbitrary action argument. Tool schemas reject extra arguments. Annotations describe read/write/idempotency behavior, but the API's authorization remains authoritative.

## Playbook Walkthrough

Use the fresh seed issue `CW-101`, requested by the service agent and reviewed by Jordan. No paid model or external integration is required: analysis is deterministic and reviewable.

1. Run analysis through the real MCP client:

   ```sh
   npm run test:mcp -- --analyze CW-101
   ```

   The persisted run is `BLOCKED` because evidence is missing. Execution is denied. The app shows recommendations and the audit records the analysis.

2. Perform the actual access review externally: confirm account justification, revoke unnecessary access, and record the result. Attach a reference to the resulting evidence. For an **illustrative demo only**, use:

   ```sh
   npm run test:mcp -- --analyze CW-101 --evidence https://example.com/signed-access-review
   ```

   The reference is not fetched or verified. Analysis creates a `PROPOSED` run, moves the issue to `PENDING_REVIEW`, and binds the plan to the resulting issue version. Copy the printed run `id`. A missing owner would also block readiness; assign one in the UI first.

3. In the application, sign in as **Jordan Lee**, open `CW-101`, inspect the reference and proposal, enter a decision note, and choose **Approve closure**. Approval alone does not close the issue. Alex cannot approve; requesters cannot review their own proposals.

4. Execute the exact approved proposal:

   ```sh
   npm run test:mcp -- --execute YOUR_RUN_ID
   ```

   The issue becomes `COMPLETED`. The audit includes the separate requester, reviewer, and executor. Repeating the command returns `alreadyExecuted: true`. Editing the issue or adding evidence between analysis and execution yields `STALE_VERSION` and requires new analysis and approval. Rejection never permits execution.

The only automated closure action is `COMPLETE_ISSUE`. The playbook **does not claim to revoke access, inspect documents, or prove that external remediation happened**. A human assesses the evidence; the automation changes the tracking record.

## HTTP API

All data routes require an unexpired session or scoped bearer credential. Cookie-authenticated mutations require an exact `Origin` match; no permissive CORS is enabled.

| Method              | Route                      | Purpose                                         |
| ------------------- | -------------------------- | ----------------------------------------------- |
| GET                 | `/api/auth/demo-users`     | Development-only simulated accounts             |
| POST / GET / DELETE | `/api/auth/session`        | Demo login / identity / logout                  |
| GET                 | `/api/users`               | Public human user fields for owners             |
| GET                 | `/api/dashboard`           | Open, overdue, pending-review, completed, total |
| GET / POST          | `/api/issues`              | Filter/paginate or create                       |
| GET / PATCH         | `/api/issues/:id`          | Details or versioned editable fields            |
| POST                | `/api/issues/:id/evidence` | `{ version, url, description }`                 |
| POST                | `/api/issues/:id/analyze`  | `{ version }`                                   |
| GET                 | `/api/issues/:id/audit`    | Optional `cursor`                               |
| POST                | `/api/plans/:id/review`    | Human approver only: `{ approved, note }`       |
| POST                | `/api/plans/:id/execute`   | Approved, version-bound, idempotent execution   |

Create requires `title`, `description`, `severity`, nullable `ownerId`, and `dueDate` (`YYYY-MM-DD`). PATCH requires all editable fields plus `status` and current `version`. Direct `COMPLETED` status is rejected. List filters: `status`, `severity`, `ownerId`, `query`, `overdue=true`, `page`, `pageSize`.

Errors use `{ error: { code, message, correlationId, fields? } }`. Status codes include 400 validation, 401 authentication, 403 permission/origin, 404 missing record, 409 stale/conflict/not-ready, 413 oversized JSON, 415 wrong content type, 429 demo-login rate limit, and 500 sanitized unexpected failures. API responses are not cached.

## Verification

```sh
npm test
npm run test:integration
npx playwright install chromium
npm run test:e2e
npm run typecheck
npm run build
npm run format:check
npm audit
```

`npm test` runs unit and linked-SDK MCP tests; database suites are explicitly skipped there. `test:integration` enables them using a separate `tracker_test` schema in the configured database. `test:e2e` migrates/seeds that schema and starts a separate server on port `3100` with isolated `.next-e2e` output. It tests desktop/mobile UI approval and viewer restrictions, plus the full real stdio MCP -> API -> human approval -> execution path. Test-created issues remain in the test schema for inspection, not your normal `public` schema. Do not point test commands at a production database. Browser screenshots/traces are under ignored `test-results/`.

`npm run test:mcp` is a read-only smoke test against the already-running normal app; `--analyze`, `--evidence`, and `--execute` deliberately mutate the selected normal issue. `npm run db:seed` is safe to repeat and preserves edits. CI runs on Node 24 with a temporary PostgreSQL 17 service. Format with `npm run format`.

The lockfile pins dependencies for reproducibility. Patched `deepmerge-ts`/`effect` overrides address advisories in Prisma 6's configuration tooling; compatibility is covered by migration/build/tests. npm 10 can fail resolving optional Vitest peers; use `npx --yes npm@11 ci`. Do not apply a forced major ORM upgrade just to resolve an install error. On Windows, stop the running dev server before `npm run build` or `prisma generate` if Prisma reports an `EPERM` engine DLL rename error, then restart it afterward.

## Configuration And Limitations

| Variable            | Purpose                                                                      |
| ------------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL`      | PostgreSQL connection; URL-encode credentials                                |
| `APP_ORIGIN`        | Exact browser origin for mutation checks                                     |
| `DEMO_AUTH_ENABLED` | Explicit opt-in; production still rejects demo login                         |
| `MCP_API_URL`       | Fixed API origin; HTTPS required except loopback                             |
| `MCP_SERVICE_TOKEN` | Optional secret supplied by the MCP host; otherwise ignored local token file |

`npm run build` verifies production compilation. `npm start` serves that build but does **not** enable demo login in production; existing demo cookies are also rejected. Add real OIDC/SSO and controlled user provisioning before deployment. Build success is not a production-readiness claim.

Further production work: separate migration/runtime database roles, TLS and secure deployment settings, durable rate limiting, session cleanup, secret-manager credentials, tenant isolation if needed, stronger CSP with nonces, centralized monitoring, retention policies, and external immutable audit export. Current inline script/style allowances support Next.js hydration; no third-party scripts or remote fonts are used. Sessions are HttpOnly/SameSite=Strict, expire after eight hours, and use Secure when the configured origin is HTTPS. The in-memory demo-login limiter is only a local safeguard.

Evidence is references only, not uploads; URLs are HTTP(S) without embedded credentials and are never fetched server-side (no evidence-fetch SSRF surface). Issue text, recommendations, and evidence are untrusted content, rendered as text and marked as untrusted in MCP results. This does not make an arbitrary consuming agent immune to prompt injection; constrained API permissions and human approval are the actual security boundary.

## Development History

The first genuine development increment is published as [`d85fd88`](https://github.com/arone-titong/compliance-issue-tracker/commit/d85fd88), `feat: add database and session foundation`. It contains the schema, migration, seed, session/authentication helpers, validation, and foundation tests. The issue services, interface, MCP server, playbook, and verification are still separate working-tree changes; they have not been folded into that earlier commit. Continue with new, reviewed commits for each coherent increment rather than rewriting the history. `.env`, `.mcp-token`, database files, and generated test artifacts are ignored.
