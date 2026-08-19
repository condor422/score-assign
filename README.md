# ScoreAssign

Multi-tenant part assignment for flute choirs and other ensembles. Musicians
register through a tenant-specific intake form and rank the instruments they
play; the director enters the songs and their parts, then assigns the whole
ensemble in one click and fine-tunes the result by dragging musicians between
parts.

## What a "part" is

A part is one instrument line in one song — *C Flute 1st*, *Piccolo 2nd*,
*Bass Flute 1st*. Each part is a document with a song, an instrument, a part
number, a difficulty and a player count, so a piece scored for five flute
voices is five parts.

## How the pieces fit together

```
packages/shared   domain types, Zod schemas, and the assignment engine
apps/api          Express + Mongoose API (control plane + per-tenant data)
apps/web          Vite + React SPA (director app, intake form, musician portal)
deploy            Cloud Build + Cloud Run configuration
```

The assignment engine lives in `packages/shared/src/assignment.ts` and is a
pure function, so it is tested directly and could run in either process.

## Tenant isolation

One MongoDB cluster, one database per tenant:

| Database | Contents |
| --- | --- |
| `sa_platform` | tenants, users, plans, discount codes, subscriptions, audit log |
| `sa_tenant_<tenantId>` | that tenant's instruments, forms, responses, musicians, songs, parts, assignments |

Tenant models are bound to a per-tenant connection handle
(`mongoose.useDb`) rather than registered globally, so a query cannot
accidentally address another tenant's collection: middleware resolves the
tenant, then hands the route only that tenant's models. The tenant id always
comes from a verified JWT on authenticated routes — never from the request body.

Tenants are addressed as `<slug>.scoreassign.com` (and `<slug>.localhost` in
development).

## Assignment

Nothing is ever assigned automatically on intake. A run happens only when the
director asks for one (`POST /seasons/:id/runs`), and it:

- considers every musician in the pool, restricted to instruments they listed;
- fills the scarcest instruments first, so the only alto flute player is not
  spent on a C flute part;
- scores candidates on preference rank, difficulty match, experience fit,
  current load and whether the seat would be a second instrument;
- balances parts evenly — the spread between the busiest and least busy
  musician stays within one part where the pool allows it;
- respects `willingToDouble`: a musician who declined doubling is never given
  two different instruments, though they may hold two parts on one instrument;
- leaves locked assignments exactly as they are, so manual decisions survive a
  re-run;
- snapshots the previous state, making a run revertible;
- reports warnings (unfilled parts, parts with no capable candidates, musicians
  it could not place) instead of failing.

The same rules are reused to warn about manual drag-and-drop moves, which are
always allowed — the director gets a warning, not a veto.

## Plans

| | Free | Monthly | Annual |
| --- | --- | --- | --- |
| Price | $0 | $12/month | $96/year |
| Parts | 3 | unlimited | unlimited |
| Musicians | 10 | unlimited | unlimited |

Both paid prices are configurable per environment (`MONTHLY_PRICE_CENTS`,
`ANNUAL_PRICE_CENTS`) and are written onto the plan documents at boot.

Every workspace starts with a 7 day trial that has paid limits. When the
trial lapses the tenant falls back to free limits — existing data is never
deleted, only further additions are blocked (HTTP 402 with
`plan_limit_reached`).

Discount codes ship for the launch categories, each requiring eligibility
review before it applies:

| Code | Discount |
| --- | --- |
| `STUDENT30` | 30% |
| `TEACHER40` | 40% |
| `NONPROFIT50` | 50% |

Each code applies to both the monthly and annual plans.

**Billing is a stub.** `StubBillingProvider` prices the order and activates the
plan without contacting a payment provider. Implement `BillingProvider` to go
live.

## Roles

Authorization is a capability table (`packages/shared/src/permissions.ts`), not
a role rank, so a new role is one row rather than an audit of every route.

| Role | Can |
| --- | --- |
| `viewer` | read the roster |
| `section_leader` | read the roster, limited to the sections they lead |
| `director` | the program, assignment runs, manual moves, part emails, form editing, contact details |
| `admin` | the above plus workspace configuration, raw form responses and team management |
| `owner` | the above plus billing |

Contact details (email and phone) are released only to `roster.readContact`
holders — directors, admins and owners. The redaction happens in the API, so a
viewer's browser never receives an address. A musician always sees their own
details at `/musician/profile`.

Workspace configuration — instruments, editing existing musician records, the
organisation profile — is `settings.manage`, held by owners and admins only, and
lives under the **Admin** tab. Directors can still *add* a musician who
registered on paper.

ScoreAssign staff hold `isPlatformAdmin` on the account rather than a role in any
workspace, and can suspend or restore a tenant from `/platform`. A suspended
workspace stays readable, refuses every write, and closes public registration
until it is restored.

How the app distinguishes a director from a musician at sign-in is written up in
[docs/SIGN_IN.md](docs/SIGN_IN.md).

## Local development

Requires Node 20+ and Docker.

```bash
# 1. MongoDB
docker run -d --name score-assign-mongo -p 27017:27017 mongo:7

# 2. Configuration
cp .env.example apps/api/.env      # then set the two JWT secrets

# 3. Install and build the shared package
npm install
npm run build --workspace @score-assign/shared

# 4. Demo workspace: a choir, an open form, 10 musicians and 16 parts
npm run seed

# 5. Run both apps
npm run dev
```

The seed prints the demo credentials. Open the director app at
<http://afs.localhost:5173> and the intake form at
<http://afs.localhost:5173/register/registration>. The subdomain matters — it
selects the tenant.

Emails (musician sign-in links, part notices) are written to the API log by the
`log` email provider, so the sign-in link can be copied straight from the
console.

## Checks

```bash
npm run lint
npm run typecheck
npm test
```

The API tests boot an in-memory MongoDB and drive real HTTP requests through
the app, covering provisioning, tenant isolation, intake, assignment runs,
manual moves, plan limits, discount pricing and the musician portal.

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/auth/signup` | create a workspace (starts the trial) |
| `POST` | `/api/v1/auth/login` · `/refresh` · `/logout` | session handling |
| `GET` | `/api/v1/public/forms/:slug` | render a tenant's intake form |
| `POST` | `/api/v1/public/forms/:slug/responses` | submit a registration |
| `GET`/`PUT` | `/api/v1/forms/:id` | edit the form definition |
| `GET`/`POST` | `/api/v1/seasons/:id/songs` · `/parts` · `/parts/bulk` | build the program |
| `GET` | `/api/v1/seasons/:id/board` | everything the board renders |
| `POST` | `/api/v1/seasons/:id/runs` | **run the assignment (on demand only)** |
| `POST` | `/api/v1/runs/:id/revert` | undo a run |
| `POST`/`PATCH`/`DELETE` | `/api/v1/assignments/:id` | drag-and-drop edits |
| `POST` | `/api/v1/seasons/:id/notify` | email musicians their parts |
| `POST` | `/api/v1/billing/quote` · `/checkout` | pricing and (stubbed) checkout |
| `POST` | `/api/v1/musician-auth/request-link` · `/verify` | musician sign-in |
| `GET`/`POST` | `/api/v1/musician/my-parts` · `/confirm` | view and confirm parts |
| `GET`/`POST` | `/api/v1/instruments` · `PATCH /:id` · `POST /reorder` | configure the instrument list |
| `POST`/`PUT` | `/api/v1/musicians` · `/musicians/:id` | add (director) and edit (admin) a musician |
| `GET`/`PATCH` | `/api/v1/organization` | workspace name, contact, timezone |
| `GET` | `/api/v1/admin/metrics` · `/admin/tenants` | platform console (staff only) |
| `POST` | `/api/v1/admin/tenants/:id/status` | suspend or restore a tenant |

## Documentation

| Document | For |
| --- | --- |
| [Director's guide](docs/GUIDE_DIRECTOR.md) | running a season: intake, program, assignment, emails |
| [Musician's guide](docs/GUIDE_MUSICIAN.md) | registering, ranking instruments, confirming parts |
| [Admin guide](docs/GUIDE_ADMIN.md) | instruments, musician records, team, organisation settings |
| [Platform console](docs/GUIDE_PLATFORM.md) | ScoreAssign staff: tenants, discounts, suspend/restore |
| [Sign-in model](docs/SIGN_IN.md) | how staff and musician identities differ |
| [Brand](docs/BRAND.md) | logo, palette hex values, downloadable swatch sheet |
| [GCP deployment](docs/DEPLOY_GCP.md) | Cloud Run, Atlas, Secret Manager, Terraform, wildcard DNS |

In-app help sits behind the **?** buttons beside field labels — the same copy,
where the decision is being made.

## Deployment

[docs/DEPLOY_GCP.md](docs/DEPLOY_GCP.md) is the full walkthrough for project
`scoreassign`; `deploy/terraform` is the infrastructure, `deploy/cloudbuild.yaml`
builds and pushes the images, and [deploy/README.md](deploy/README.md) covers the
equivalent by hand with `gcloud`.
