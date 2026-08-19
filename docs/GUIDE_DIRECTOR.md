# Director's guide

Everything here happens inside your own workspace at
`https://<your-slug>.scoreassign.com`. Nobody outside your ensemble can see your
roster, your program or your assignments.

## 1. Sign in

Staff sign in with an email and password at `/sign-in`. Musicians never use this
page — see [the musician guide](GUIDE_MUSICIAN.md) and
[How ScoreAssign tells staff from musicians](SIGN_IN.md).

## 2. Open the intake form

**Admin → Intake form.** The form ships with the fields a flute choir asks for:
name, email, phone, the instruments you play in preference order, whether you
are willing to play two different instruments, your experience level, the
difficulty you prefer and how many parts you are willing to carry.

Edit, reorder or remove questions, then set the status to **Open** and share the
link:

```
https://<your-slug>.scoreassign.com/register/registration
```

While the form is **Draft** or **Closed** the public link returns a polite
refusal, so you can prepare it in the open.

Every submission becomes a musician record automatically. Anyone who registered
by phone or on paper can be added by hand on the **Musicians** page — including
their doubling willingness and experience, which the assignment engine uses.

## 3. Build the program

**Program.** Create a season (your concert cycle), add songs, then add each
song's parts. "Add parts in bulk" is the fast path: choose the instrument and
the number of parts, and you get *C Flute 1st*, *C Flute 2nd*, and so on.

Each part carries a difficulty and a player count. The player count is a
guideline, not a lock: you can always drop an extra player onto a part and
accept the warning.

## 4. Assign

**Board → Run assignment.** Nothing is assigned until you ask. A run considers
every musician who registered and:

- only ever assigns an instrument the musician actually listed;
- fills scarce instruments first, so your one bass flute player is not spent on
  a C flute part;
- weighs preference rank, difficulty fit, experience and current load;
- keeps the load even — the busiest and least busy player stay within one part
  of each other where the pool allows;
- honours "not willing to double": that musician may hold two parts on one
  instrument, never two different instruments;
- leaves **locked** assignments untouched.

The run reports what it could not do — unfilled parts, parts with no capable
candidate, musicians it could not place — instead of failing. Read that summary;
it is usually telling you that you need another alto flute player.

Not happy with it? **Revert run** restores the previous state exactly.

## 5. Adjust by hand

Drag a musician from one part to another. If the move breaks a rule — over the
player count, an instrument they did not list, doubling they declined — you get
a warning and the move still happens. You are the director; the engine advises.

Click the padlock on an assignment to **lock** it. Locked seats survive the next
run, so you can pin the two solos and re-run everything else.

## 6. Tell everyone

**Board → Email parts** sends each musician their own list. Addresses never
reach your browser: the server does the sending.

Musicians then sign in with an emailed link and **confirm** or **decline** each
part, with a note. The board shows the confirmation state per seat, so you know
who has actually agreed to play what.

## Who can see contact details

| Role | Roster | Email and phone |
| --- | --- | --- |
| Viewer | yes | no |
| Section leader | their sections | no |
| Director | yes | **yes** |
| Admin | yes | yes |
| Owner | yes | yes |

Redaction happens on the server, so a viewer's browser never receives an
address in the first place.

## Limits

The free plan allows 3 parts and 10 musicians. Every new workspace gets a 7 day
trial on paid limits; when it lapses your data stays, but further additions are
refused until the owner upgrades on the **Billing** page ($12/month or $96/year,
with student, teacher and non-profit discount codes).
