# door-checkin

A doorbell for PhilaCon Valley events, not a check-in.

The venue's doors close partway through an event and nobody mans them. A guest
outside taps an NFC tag on the door; a notification goes to Discord; a member of
the leadership team reacts to say they are heading down; **the guest's page
updates to name the person who is coming.** The point is that the guest, standing
outside a locked door, stops wondering whether anything happened.

## Live URL

The tag must carry the door key, or nothing rings:

```
https://door-checkin-eight.vercel.app/?k=<DOOR_KEY>
```

`vercel.json` rewrites `/` to the function, so the tag can hold the short
bare-domain form rather than `/api/checkin`.

### Why the key exists

A URL that anything on the internet can fetch was ringing a bell in a real
building. On 2026-07-28 a single deploy produced three door alerts, and the
Vercel logs showed none of them came from a phone:

| User agent | Origin | What it is |
|---|---|---|
| `undici` | sfo1 | Node's HTTP client — Vercel's post-deploy check |
| `Mozilla/5.0 (X11; Linux x86_64)` | sfo1 | headless Chrome — Vercel's deployment-thumbnail renderer |

Two of them landed 210ms apart, which no human produces tapping a sticker.

The underlying fault was a **`GET` with a side effect**. Ringing a doorbell
changes the world, so it cannot sit behind a URL that deploy bots, crawlers,
link unfurlers and security scanners all pull unprompted. The key means only a
real tap rings; a bare `GET /` renders a page and sends nothing.

The key is not a secret in any strong sense — it is printed on a sticker at a
door. It is a spam filter, not authentication. Rotate it by changing `DOOR_KEY`
and rewriting the tag.

## How the loop works

```
  GUEST                     THIS APP                  DISCORD           LEADER
     |                          |                        |                 |
 1   |--- tap NFC, GET / ------>|                        |                 |
     |                          |-- POST webhook --------->                |
     |                          |    ?wait=true          |                 |
     |                          |<- message id ----------|--- notify ----->|
     |<-- waiting page ---------|                        |                 |
     |    (message id inside)   |                        |                 |
     |                          |                        |                 |
 2   |                          |                        |<--- react ------|
     |                          |                        |                 |
 3   |-- GET /api/status ------>|                        |                 |
     |   (every 3s)             |-- read reactions ----->|                 |
     |                          |<- [{ Diego }] ---------|                 |
     |<-- { claimed, by } ------|                        |                 |
     |                          |                        |                 |
     |  "Diego is coming down." |                        |                 |
```

Step 2 is a reaction. The alert asks for `CLAIM_EMOJI` (`✅`) so leaders know what
to use, but every emoji in `CLAIM_EMOJIS` counts — **`☑️`, `✔️` and `👍` all claim
the door.** At a glance those ticks are indistinguishable, and a leader who picked
the wrong one would walk downstairs believing they had answered while the guest
kept waiting.

`/api/status` reads the message once to see which emoji are present, then reads
the reactor list only for the one that matched, and returns the first non-bot name
it finds. Polling an unclaimed door therefore still costs a single Discord call.

**There is no database.** The Discord message and its reactions *are* the state —
who was alerted, whether anyone claimed it, and which person. The app only ever
asks Discord what it already knows, which is why this repo still has no
dependencies.

Two mechanics the design rests on, both easy to lose:

- A Discord webhook POST returns `204 No Content`. Appending **`?wait=true`**
  makes it return the created message object instead. Without the message id
  there is nothing to poll, and the whole loop collapses.
- Incoming webhooks are **write-only**. Reading reactions needs a real bot token,
  which is a separate setup from the webhook (below).

## Endpoints

| Route | Method | What it does |
|---|---|---|
| `/` | GET | Rewritten to `/api/checkin` by `vercel.json` |
| `/api/checkin` | GET | Posts the alert, returns the waiting page with the message id embedded |
| `/api/status?c={channel}&m={message}` | GET | Reports whether anyone reacted, and who |
| `/api/again` | POST | Posts a second, louder alert and returns its message id |

Vercel serverless functions, CommonJS (`module.exports`), no build step and no
dependencies.

## How the page looks

The page follows the PhilaCon Valley design system (Brand Identity Guidebook
Edition 1.2): one ground color per state (yellow waiting, pink claimed, coral
failed, white idle), Baloo 2 headings, Nunito body, JetBrains Mono for the time
row, ink outlines and hard shadows. The claimer's name sits in a sticker.

The pigeon mark and the three fonts are **inlined into the page** from
`api/_brand.js`. Every guest at the door is a first-time visitor, so a browser
cache never helps; separate files would cost the same bytes plus round trips
over venue wifi, and a font host such as Google Fonts would receive each
guest's IP address. The fonts are subset to the characters the page can show,
about 29KB together. `api/_brand.js` is generated: rebuild it with
`scripts/build-brand.py` (usage is in the script) from the design system's
files. Vercel does not deploy a file whose name starts with `_` as a function.
The fonts are under the SIL Open Font License, not this repository's MIT
license; their notices are in `FONT-LICENSES.txt`.

The headline and the line under it share one `aria-live` region, so a screen
reader announces "Diego is coming down. Hang tight by the door." as one
sentence.

## What the waiting page does while the guest waits

The page is the whole product — it is what a person is looking at while standing
outside a locked door. It polls `/api/status` every three seconds and moves
through timed states, all defined at the top of the inline script:

| Constant | At | What changes |
|---|---|---|
| `SETTLED` | 45s | Copy softens to "Still waiting. Someone usually comes down within a couple of minutes." |
| `STALLED` | 120s | Copy admits nobody has picked it up, and a **Ring again** button appears |
| `GIVE_UP` | 600s after the last ring | Polling stops; the elapsed-time label keeps counting |

**Ring again** posts to `/api/again`, which sends a deliberately different, louder
message rather than repeating the first one — the first alert was missed, so
repeating it in the same voice would most likely be missed the same way. The
button disables itself for twenty seconds after each press.

`/api/again` returns the new message's id, and **the page watches the first
message and the latest repeat**. A leader who reacts to "Still at the door"
reaches the guest's screen the same way a reaction to the first alert does.
Only two, because every watched message costs Discord reads on every poll, and
a rate-limited bot looks to the guest like nobody answering.

A poll is skipped while the previous one is still in flight, and each status
request gives up after eight seconds. On slow venue wifi the requests cannot
pile up, and a hung request cannot stop polling for good.

When a claim lands, polling stops, the headline becomes "{name} is coming down",
and the phone gives a short vibration if it supports it.

**Polling is skipped whenever `document.hidden` is true.** A guest puts the phone
back in a pocket while waiting; without this, a locked screen would keep spending
serverless invocations for a page nobody is reading. A `visibilitychange`
listener polls once immediately when the page comes back to the foreground, so
nothing is lost by pocketing it.

### When the webhook fails

If the Discord post does not go through, there is no message id, so there is
nothing to poll and nobody has been told. The page says exactly that — "We
couldn't reach anyone", "The notification did not go through. Knock, or tap the
tag once more" — and shows the Ring again button straight away instead of hiding
it behind the two-minute wait. It does not claim a delivery that did not happen.
If that Ring again goes through, the page becomes the normal waiting page and
starts polling.
Reporting the guest's situation back to them incorrectly is the original fault
this rework was meant to fix.

### Accessibility and legibility decisions

The reading conditions are specific: outdoors, at night, often cold, on a phone
held one-handed. The choices follow from that.

- **The pulse is a slow breath, not a spinner.** A spinner reads as "stuck". This
  reads as someone being with you. It stops and turns green the moment the claim
  lands; on the failure page it is red and still from the start.
- **`prefers-reduced-motion: reduce` disables every animation**, including the
  pulse, the rule that draws itself, and the entry transitions.
- **Contrast is not spent on mood.** The small uppercase metadata text sits at 52%
  ivory over the near-black background, which clears 4.5:1. The comment in the
  source says why: this is not a place to trade legibility for atmosphere.
- The status line carries `role="status"` and `aria-live="polite"`, so a screen
  reader announces the change from waiting to claimed without the guest hunting
  for it.
- Buttons are at least 48px tall and have a visible `:focus-visible` ring; the
  layout respects `env(safe-area-inset-bottom)` and `viewport-fit=cover`.

## Setup

### 1. Discord webhook (posts the alert)

Channel Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.
Set it as `DISCORD_WEBHOOK_URL`.

### 2. Discord bot (reads the reaction)

The webhook alone cannot read anything back, so the claim loop needs a bot as
well.

1. https://discord.com/developers/applications → **New Application**
2. **Bot** tab → **Reset Token** → copy it. Set as `DISCORD_BOT_TOKEN`.
3. **OAuth2 → URL Generator** → scope `bot`, permissions **View Channel** and
   **Read Message History**. Open the generated URL and invite the bot to the
   server.
4. Make sure the bot can actually see the door channel — a private channel needs
   the bot added to it explicitly.

### 3. Channel id (closes an open door on the status endpoint)

Discord → User Settings → Advanced → **Developer Mode** on. Right-click the door
channel → **Copy Channel ID**. Set as `DISCORD_CHANNEL_ID`.

This one is a security control, not a convenience. `/api/status` takes the
channel and message ids from the guest's browser, so they are attacker-controlled
by the time they arrive. Both are checked against a Discord snowflake pattern,
but without this pin the endpoint would still read reactions from *any* channel
the bot can see, for anyone who guesses a message id. With it set, the
client-supplied channel is ignored entirely. If you skip it, the first tap logs
the correct id to the Vercel function logs.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DOOR_KEY` | yes | Only a tap carrying `?k=` this rings the bell. Without it nothing rings for anyone and the page says so |
| `DISCORD_WEBHOOK_URL` | yes | Posts the door alert. Without it every tap renders the "couldn't reach anyone" page |
| `DISCORD_BOT_TOKEN` | for the claim loop | Reads who reacted. Without it `/api/status` answers `not-configured` and the page waits forever |
| `DISCORD_CHANNEL_ID` | strongly recommended | Pins `/api/status` to one channel — see step 3 |
| `DISCORD_ALERT_MENTION` | optional | e.g. `<@&ROLE_ID>` to ping a role. Role and everyone mentions are only allowed when this is set |

An unset `DOOR_KEY` deliberately fails closed rather than open. The alternative —
falling back to ringing for every request — is what this repo already shipped
once, and it rang for Vercel's own deploy bots. A doorbell that fails visibly on
the screen of the person outside beats one that quietly works for crawlers.

Never commit any of these. A deployment captures the environment it was built
with, so **redeploy after adding or changing one.**

## Deploy

```
vercel deploy --prod
```

`main` is protected: changes go through a pull request, and both CI jobs must pass
before merge. Admins can bypass on purpose — if the door breaks mid-event, nobody
should be fighting their own tooling to ship a fix.

## Monitoring

`.github/workflows/ci.yml` proves the handlers are correct. **It cannot prove they
reached production, or that production is configured.** Every real failure this
project has had lived in that gap: unguarded code live on the door, and a bot that
could not read the channel it was told to watch.

`.github/workflows/smoke.yml` covers it, running after every push to `main`, daily
at 13:00 UTC, and on demand. It checks that a bare `GET /` returns the idle page and
**sends no alert** — a regression there means the door is ringing for crawlers again.

**Nothing in it ever rings the doorbell.** Every request omits the door key on
purpose. A synthetic that performed a real tap would summon somebody to a real door
on a cron schedule.

### The canary

Set the `CANARY_MESSAGE_ID` repository variable to the id of a permanent pinned
message in the door channel. The smoke check reads that message through
`/api/status`, which proves the bot token is valid *and* the bot can still see the
channel — without posting anything.

Until it is set, that check is skipped and the workflow says so. This is the failure
mode worth catching: a rotated token or a bot removed from the private channel is
completely invisible from the guest's side. The alert still posts, so the team is
still notified — but the guest's page waits forever for a claim that can never
arrive.

### Page views

Vercel Web Analytics counts page views. The page loads `/_vercel/insights/script.js`
with a plain script tag, not the `@vercel/analytics` package, so the repo keeps no
dependencies. The script is served from this domain and sets no cookies. A
`beforeSend` hook removes `k` from each URL, so the door key never appears in the
dashboard. Turn on Web Analytics in the project's Analytics tab, or the script
returns 404 and counts nothing.

## Verifying

The page renders whether or not Discord was reached, so loading it proves nothing
on its own. Check in this order:

1. **The alert** — a message appears in the door channel. If not,
   `DISCORD_WEBHOOK_URL` is missing from the production environment.
2. **The claim** — react to that message with the claim emoji; the waiting page
   should switch to "{name} is coming down" within about three seconds. If it
   does not, check the function logs for `Discord reactions read failed` — that is
   almost always the bot lacking View Channel or Read Message History on that
   channel.

Failures are deliberately loud in the logs, because every one of them is
invisible from the guest's side of the door.

## Writing the NFC tag

Use NFC Tools (iOS/Android): Write → Add a record → **URL/URI** (not "Text" — a
text record will not auto-open a browser) → enter the live URL **including
`?k=<DOOR_KEY>`** → hold the tag to the phone's NFC antenna.

Without the query string the tag opens a page that rings nothing, which looks
identical to a working tag until someone is waiting outside in the cold.

Test the tap before locking. Locking is permanent, but a public unlocked tag can
be silently rewritten by anyone with a phone, so lock it once the tap works.

## Known gaps

- **No dedupe.** Every keyed tap posts a new message. An anxious guest tapping
  three times produces three alerts. This is expected behaviour rather than
  abuse, and the page tries to make re-tapping feel unnecessary, but the fix is
  server-side. The key stops *automated* duplicates, not human ones.
- **First reactor wins.** If two leaders react, the page names whoever Discord
  returns first.
- **No un-claim.** Once someone reacts, the page says they are coming. If they
  then get pulled away, the guest is not told.
- **Wait state lives in the tab.** The elapsed timer starts at page load, so a
  reload both rings the door again and restarts the countdown to the Ring again
  button.
