---
name: testing-scoreassign
description: How to run and UI-test the ScoreAssign multi-tenant part-assignment app locally (tenant subdomains, seed credentials, magic links, dnd-kit drag testing).
---

# Testing ScoreAssign locally

## Bring the stack up
```bash
docker start score-assign-mongo || docker run -d --name score-assign-mongo -p 27017:27017 mongo:7
npm install && npm run build --workspace @score-assign/shared   # api/web resolve shared from dist
npm run seed          # demo tenant "afs" (Arizona Flute Society)
npm run dev > /tmp/dev.log 2>&1 &   # API :8080 (/api/v1), Vite :5173
```
Keep the dev output in a file (`/tmp/dev.log`) — you need it to read emails (see below).

## Tenant routing (most common trap)
Tenants are resolved from the Host subdomain. Always browse `http://afs.localhost:5173/...`;
plain `localhost:5173` will not resolve a tenant and the director app fails to load data.
When typing a URL in Chrome, type it without the `http://` scheme and press Enter, or Chrome
may send it to Google search.

## Credentials
- Director: `director@example.org` / password is the `DEMO_PASSWORD` constant in
  `apps/api/src/seed.ts` (the seed log redacts it). Grep for it rather than guessing.
- Musicians have no password: request a magic link at `/musician`.

## Emails / magic links
`EMAIL_PROVIDER=log` writes rendered emails to API stdout. The link is built from
`APP_ROOT_DOMAIN` (`apps/api/src/services/email.ts`), so it points at
`https://<slug>.scoreassign.com/musician/verify?token=...` even locally. Copy only the
path+token and open `http://<slug>.localhost:5173/musician/verify?token=...`.
```bash
grep "sign-in link" /tmp/dev.log | tail -1
```

## Drag-and-drop testing (@dnd-kit, PointerSensor distance 4)
Both the intake instrument ranker and the assignment board use @dnd-kit, so `left_click_drag`
is unreliable. Use: `mouse_move` to source → `left_mouse_down` → several small `mouse_move`
steps → screenshot while still held → `left_mouse_up`.
- Ranker handle is the `⠿` button with `aria-label="Reorder <instrument>"`; the row itself is
  not draggable.
- The assignment board is a horizontally scrolling flex row and **auto-scrolls while you drag**,
  so the drop target moves under the cursor. Re-screenshot mid-drag and correct the cursor
  position before releasing; verify the live region text says
  "was moved over droppable area <id>" before dropping.
- Lock/Remove buttons on a board chip only render on hover of the chip's wrapper.

## Behaviors worth knowing
- Nothing is assigned until "Assign parts now" is clicked; the run respects locked chips.
- Moving a musician into a part that is already at `maxPlayers` is allowed and only produces a
  soft warning banner ("Part holds at most 1 player(s)."); the badge then reads e.g. `2/1`.
  Do not treat this as a hard validation failure unless the spec changes.
- The demo tenant is seeded on the annual plan, so free-tier limit errors will not appear.
- Billing uses a stub provider: "Subscribe annually" activates the plan with no payment call.

## Devin Secrets Needed
None — all secrets (JWT) are generated locally by the blueprint's initialize step.
