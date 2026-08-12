# Deploying to Google Cloud

Two Cloud Run services (`api`, `web`) in front of one MongoDB cluster. Tenants
are addressed by subdomain, so the whole platform needs a single wildcard host
rather than per-tenant infrastructure.

## One-time setup

```bash
PROJECT_ID=your-project
REGION=us-west1

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com

gcloud artifacts repositories create score-assign \
  --repository-format=docker --location="$REGION"
```

### Secrets

Never place these in the blueprint, the image, or `cloudbuild.yaml`.

```bash
printf '%s' 'mongodb+srv://...' | gcloud secrets create mongodb-uri --data-file=-
openssl rand -base64 48 | tr -d '\n' | gcloud secrets create jwt-access-secret --data-file=-
openssl rand -base64 48 | tr -d '\n' | gcloud secrets create jwt-refresh-secret --data-file=-
```

Grant the Cloud Run runtime service account `roles/secretmanager.secretAccessor`
on each.

### MongoDB

Cloud Run has no managed MongoDB, so use MongoDB Atlas (or a self-managed
cluster). The API opens **one** connection pool and switches databases per
tenant (`sa_tenant_<tenantId>`), so a single M10-class cluster serves many
tenants. Restrict network access to the Cloud Run egress addresses by attaching
a VPC connector with a static NAT IP, then allowlisting that IP in Atlas.

## Deploy

```bash
gcloud builds submit --config deploy/cloudbuild.yaml \
  --substitutions=_REGION="$REGION",_API_ORIGIN=https://api.scoreassign.com
```

## DNS

Tenant workspaces live at `<slug>.scoreassign.com`, so a wildcard record is
required:

| Record | Name | Value |
| --- | --- | --- |
| A/AAAA or CNAME | `*.scoreassign.com` | the `web` service (via a load balancer) |
| A/AAAA or CNAME | `scoreassign.com` | the `web` service |
| A/AAAA or CNAME | `api.scoreassign.com` | the `api` service |

Cloud Run domain mappings do not support wildcards. Put an external HTTPS load
balancer in front of the `web` service with a Google-managed certificate that
includes `scoreassign.com` and `*.scoreassign.com`, and route `/api/*` to the
`api` service through the same load balancer so the refresh cookie stays
first-party for every tenant subdomain.

The API resolves the tenant from the `Host` header, so preserve the original
host at every proxy hop (`--host-rewrite` disabled on the LB backend).

## Before charging real money

Billing is behind `BillingProvider` (see `apps/api/src/services/billing.ts`) and
currently runs a stub that activates the plan without taking payment. Add a
provider implementation, set `BILLING_PROVIDER`, and handle its webhooks before
production launch.
