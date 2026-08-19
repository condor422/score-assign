# Deploying ScoreAssign to Google Cloud

Target shape: two Cloud Run services (API and SPA) behind one external HTTPS load
balancer, MongoDB Atlas on GCP for data, Secret Manager for credentials, Cloud
Build for images. Terraform in `deploy/terraform` describes everything except the
Atlas cluster.

The wildcard is the reason for the load balancer: tenants live at
`<slug>.scoreassign.com` and Cloud Run domain mappings cannot serve a wildcard
host.

```
              ┌──────────────── *.scoreassign.com ────────────────┐
              │        external HTTPS load balancer (one IP)       │
              │   /api/*  ──► Cloud Run: score-assign-api        │
              │   /*      ──► Cloud Run: score-assign-web        │
              └───────────────────────┬───────────────────────────┘
                                      │ mongodb+srv
                           MongoDB Atlas (GCP, same region)
                    sa_platform + sa_tenant_<tenantId> per tenant
```

## 0. Prerequisites

- `gcloud` authenticated against project **`scoreassign`**
- Terraform ≥ 1.6
- `scoreassign.com` DNS you can edit
- A MongoDB Atlas account and a SendGrid account

## 1. Atlas cluster

Atlas is not in Terraform here: the cluster is long-lived, and the credential must
never pass through a Terraform plan.

1. Create a project, then a cluster on **GCP** in the same region you will run
   Cloud Run in (`us-west1` by default). M10 is the smallest tier worth using —
   M0 has a connection cap that database-per-tenant will hit.
2. Create a database user with `readWriteAnyDatabase`. The API creates a database
   per tenant on demand, so it cannot be scoped to a fixed list.
3. Network access: Cloud Run's egress IPs are not stable, so either
   - attach a **Serverless VPC connector** with Cloud NAT and a reserved static IP,
     then allowlist that one address in Atlas (recommended), or
   - use Atlas **Private Service Connect** for GCP.
   Allowlisting `0.0.0.0/0` works and is not acceptable for production.
4. Copy the `mongodb+srv://` URI.

## 2. Secrets

Terraform creates the secret *containers*; you add the versions, so no value is
ever in state:

```bash
gcloud config set project scoreassign

printf '%s' 'mongodb+srv://USER:PASS@cluster.mongodb.net/?retryWrites=true&w=majority' \
  | gcloud secrets versions add mongodb-uri --data-file=-
openssl rand -base64 48 | tr -d '\n' | gcloud secrets versions add jwt-access-secret --data-file=-
openssl rand -base64 48 | tr -d '\n' | gcloud secrets versions add jwt-refresh-secret --data-file=-
printf '%s' 'SG.xxxxxxxx' | gcloud secrets versions add sendgrid-api-key --data-file=-
```

The two JWT secrets must differ, and rotating them invalidates every session.

## 3. Images

```bash
REGION=us-west1
gcloud builds submit --config deploy/cloudbuild.yaml \
  --substitutions=_REGION=$REGION,_API_ORIGIN=https://scoreassign.com
```

Cloud Build runs `lint`, `typecheck` and the test suite before it builds, then
pushes `api:$SHORT_SHA` and `web:$SHORT_SHA` to Artifact Registry. Note the tag.

## 4. Infrastructure

```bash
cd deploy/terraform
cp terraform.tfvars.example terraform.tfvars   # set the two image tags
terraform init
terraform apply
```

This creates the Artifact Registry repository, the four secret containers, a
runtime service account with `secretAccessor` on each, both Cloud Run services,
the serverless NEGs, the URL map, a Google-managed certificate for
`scoreassign.com` and `*.scoreassign.com`, the global IP, and an HTTP→HTTPS
redirect.

The first `apply` on an empty project can fail while the newly enabled APIs
propagate. Re-running it is safe.

## 5. DNS

Point both records at `terraform output load_balancer_ip`:

| Record | Name | Value |
| --- | --- | --- |
| A | `scoreassign.com` | the load balancer IP |
| A | `*.scoreassign.com` | the load balancer IP |

A Google-managed certificate covering a wildcard needs **DNS authorization**: add
the `_acme-challenge` CNAME that Certificate Manager asks for. Provisioning takes
15–60 minutes; until it finishes the load balancer serves a certificate error
while the Cloud Run URLs already work.

The API resolves the tenant from the `Host` header, so do not enable host rewrite
on the backend. Serverless NEGs preserve the original host by default.

## 6. First run

```bash
API=$(gcloud run services describe score-assign-api --region us-west1 --format='value(status.url)')
curl -s "$API/healthz"
```

Then create the first workspace through the sign-up page on the apex domain. The
seed script is for local development and must not be pointed at production — it
drops and recreates its demo tenants.

Promote your own account to platform staff afterwards (see
[the platform guide](GUIDE_PLATFORM.md)).

## What is still stubbed

**Billing.** `BILLING_PROVIDER=stub` activates plans without taking payment.
Deploying like this is fine for a pilot; implement `BillingProvider`
(`apps/api/src/services/billing.ts`) and handle its webhooks before charging
anyone.

**Nothing else.** Authentication is real (Argon2id + JWT), and with
`EMAIL_PROVIDER=sendgrid` plus a verified sender, magic links and part notices are
really delivered. Leaving `EMAIL_PROVIDER=log` in production means musicians can
never sign in, because their link is only written to Cloud Logging — that is the
one stub that breaks a deployment rather than merely limiting it.

## Costs, roughly

| Item | Notes |
| --- | --- |
| Cloud Run API | one warm instance so the Mongo pool survives; the largest line item |
| Cloud Run web | scales to zero |
| Load balancer | forwarding rule charged hourly whether or not traffic arrives |
| Atlas M10 | the cluster, shared across all tenants |
| Artifact Registry, Secret Manager, Cloud Build | negligible at this scale |

## Operations

- **Logs**: structured Pino JSON, so Cloud Logging parses severity and fields.
  Nothing logs a contact address or a token.
- **Rollback**: `gcloud run services update-traffic score-assign-api
  --to-revisions=<previous>=100`.
- **Backups**: Atlas continuous backups. Because tenants are separate databases, a
  single tenant can be restored without touching the others.
- **Scaling**: raise `api_max_instances`. Watch Atlas connections — each instance
  holds its own pool.
