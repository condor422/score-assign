# Admin guide (owners and administrators)

The **Admin** tab is the configuration side of a workspace. It appears only for
users holding `settings.manage` (owner, admin), `form.write` or `team.manage`, and
each tab inside it is filtered by the same capabilities — a director who follows
a bookmarked link sees the form builder and nothing else.

## Instruments

Instrument lists are per workspace, not global. A piccolo trio and a full flute
choir do not have to share a picker.

- **Add** — type the name; the key is derived from it and must be unique in the
  workspace.
- **Rename** — safe at any time. Parts and assignments reference the instrument by
  id, so nothing breaks and history reads correctly.
- **Reorder** — drag. This order is what musicians see on the intake form and what
  directors see in every picker, so put your core instruments first.
- **Retire** — instruments are never deleted, because past seasons point at them.
  Retiring hides an instrument from the intake form and from the pickers used to
  create new parts, while every existing part, assignment and musician preference
  stays intact and readable. The confirmation tells you how many parts reference
  it. **Restore** brings it back.

There is no delete button anywhere on this page. That is deliberate: deleting an
instrument would mean deleting the seasons that used it.

## Musicians

The place to fix records after the fact. You can edit name, email, phone, the
ranked instrument list, doubling willingness, experience level, difficulty
preference and maximum parts, and you can deactivate a musician who has left —
deactivating keeps their history but takes them out of future assignment runs.

Note the split: **directors can add** a musician (someone registered by phone)
but only **owners and administrators can edit** an existing record. Adding is an
operational act; rewriting someone's contact details is an administrative one.

## Intake form

The same form builder directors use, reached from here so all configuration sits
in one place. Add, remove, reorder and re-label questions; set the status to
Draft, Open or Closed. The instrument-ranking question always renders the active
instrument list, so retiring an instrument closes it off to new registrations
immediately.

## Team

Invite staff by email and assign a role. Invitations are single-use links that
expire.

| Role | Intended for |
| --- | --- |
| `viewer` | board members and librarians who need the roster, not addresses |
| `section_leader` | a principal player who needs their own section's roster |
| `director` | whoever runs rehearsals: program, assignment runs, manual moves, part emails, contact details |
| `admin` | configuration, team management, raw form responses |
| `owner` | everything, including billing |

Nobody can grant a role above their own, and an administrator cannot mint
another owner.

## Organization

Workspace name, contact email and timezone, plus a read-only view of the current
plan, its limits and your usage against them. The slug — the subdomain your
musicians visit — is fixed at creation, because changing it would break every
link you have handed out.

## What is not here

**Billing** stays on its own page under the owner's control, and the platform
console (`/platform`) belongs to ScoreAssign staff, not to tenants. If your
workspace has been suspended, a banner explains it and every save is refused
until ScoreAssign restores it; your data remains readable throughout.
