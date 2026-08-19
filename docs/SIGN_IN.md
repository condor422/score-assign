# How ScoreAssign tells staff from musicians

There is no single login that guesses who you are. There are two front doors,
two credential types and two token scopes.

## Two doors

| | Staff | Musician |
| --- | --- | --- |
| Page | `/sign-in` | `/musician/sign-in` |
| Credential | email + password (Argon2id hash) | one-time link emailed to the address on the roster |
| Token scope | `staff` | `musician` |
| Token carries | tenant id, role, capabilities, platform-admin flag | tenant id and that musician's id |
| Session length | short access token + HTTP-only refresh cookie | short-lived token, no refresh cookie |
| Reached | `/roster`, `/program`, `/board`, `/admin`, `/billing` | `/musician/parts`, `/musician/profile` |

Both pages sit on the same tenant subdomain, so `afs.scoreassign.com/sign-in` and
`afs.scoreassign.com/musician/sign-in` are the same workspace seen from either
side.

## Why a musician has no password

A musician's account is created by *registering*, not by signing up: filling in
the intake form is what puts their address on the roster. Asking them to invent
and remember a password for something they open twice a season is friction with
no security benefit — the emailed link proves control of the address, which is
the same thing a password reset would prove.

Links are single-use, expire in 30 minutes, and are stored hashed, so the
database never holds a usable link.

## How the API decides

Every request carries a JWT. The middleware checks the `scope` claim before
anything else:

- a `musician` token on a staff route is rejected with 401 — it never reaches the
  capability check;
- a `staff` token on a musician route is rejected the same way;
- the tenant id always comes from the verified token, never from the request body
  or a query parameter.

Then, for staff, the route asks for a capability (`roster.readContact`,
`assignment.run`, `settings.manage`, …) and the capability table answers for that
role. A musician token has no capabilities at all; the musician routes instead
scope every query to the musician id inside the token, which is why one musician
cannot read or answer for another.

## Where roles come from

An account can belong to more than one workspace, so roles live on memberships
rather than on the account:

```
PlatformUser
  email, passwordHash, isPlatformAdmin
  memberships: [{ tenantId, role, sectionInstrumentIds }]
```

Signing in on a subdomain resolves the tenant from the host, finds the matching
membership, and stamps that membership's role and capabilities into the token. No
membership for that tenant means no access, even with valid credentials.

`isPlatformAdmin` sits on the account rather than a membership, because ScoreAssign
staff are not members of anyone's ensemble.

## In practice

- A director who is also a player has two accounts' worth of identity in one
  address: staff sign-in for the board, musician sign-in for their own parts.
  Both work; they are separate sessions with separate tokens.
- Auth is real code, not a stub. What is stubbed is billing (no money moves) and,
  until `EMAIL_PROVIDER=sendgrid` is configured, email delivery — with the `log`
  provider the sign-in link is written to the server log instead of being sent,
  which is fine locally and useless in production.
