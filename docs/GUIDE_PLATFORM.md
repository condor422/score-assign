# Platform console (ScoreAssign staff)

`/platform` is the operator's view across every tenant. The link only renders for
a user whose platform record carries `isPlatformAdmin`, and every route behind it
checks that flag independently — a tenant owner who guesses the URL gets a 403.

## Becoming platform staff

There is no self-service path, by design. Promote an existing account directly in
the platform database:

```js
db.platformusers.updateOne(
  { email: 'you@scoreassign.com' },
  { $set: { isPlatformAdmin: true } },
)
```

Then sign out and back in — the flag is stamped into the access token. The
development seed already promotes the demo owner, so `npm run seed` gives you a
console login locally.

## What it shows

- **Metrics** — tenants by status, tenants by plan, pending discount
  verifications, active codes.
- **Tenants** — every workspace with its status, plan, seats, trial end, renewal
  date and claimed discount, filterable by status.
- **Discount verification queue** — tenants who claimed `STUDENT30`, `TEACHER40` or
  `NONPROFIT50` and need their eligibility checked. Approving applies the
  discount; rejecting also clears the code from the tenant.
- **Discount codes** — the catalogue, with an enable/disable switch. Disabling a
  code stops new redemptions and leaves existing ones alone.

## Suspend and restore

Suspension is the lever for non-payment, abuse, or a workspace that must be
frozen while something is sorted out. It is reversible and it is not a delete.

A suspended tenant:

- still lets staff **sign in** and **read** everything — roster, program, board,
  assignments;
- **refuses every write** with a 403, including writes the owner would normally
  hold;
- **closes public registration**: the intake form link returns a refusal, so no
  new musicians arrive while frozen;
- **blocks musicians from confirming or declining** parts;
- shows a banner in the workspace explaining the state.

The tenant's previous status is stored, so **Restore** returns it to exactly what
it was — a workspace suspended mid-trial comes back mid-trial rather than being
silently promoted or demoted. Both actions write an audit record
(`tenant.suspend`, `tenant.restore`) with the actor and the reason.

Suspending an already-suspended tenant, or restoring one that is not suspended,
is rejected rather than treated as a no-op.

## What the console deliberately cannot do

- Read tenant musician data. Operators see subscription state, not rosters or
  contact details; tenant data lives in per-tenant databases the console never
  opens.
- Delete a tenant. Suspension is the reversible tool; deletion would need a
  deliberate, separately audited path.
- Change a tenant's plan by hand. Plans move through the billing flow so the
  subscription record and the tenant stay consistent.
