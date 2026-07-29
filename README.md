# door-checkin

A doorbell for PhilaCon Valley events, not a check-in.

The venue's doors close partway through an event and nobody mans them. A guest
outside taps an NFC tag on the door; a notification goes to Discord; a member of
the leadership team reacts to say they are heading down; **the guest's page
updates to name the person who is coming.** The point is that the guest, standing
outside a locked door, stops wondering whether anything happened.

## Live URL

```
https://door-checkin-eight.vercel.app
```

Both `/` and `/api/checkin` serve the doorbell — `vercel.json` rewrites the root
to the function so the NFC tag can hold the shorter, bare-domain URL.

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
 2   |                          |                        |<-- react ✅ ----|
     |                          |                        |                 |
 3   |-- GET /api/status ------>|                        |                 |
     |   (every 3s)             |-- read reactions ----->|                 |
     |                          |<- [{ Diego }] ---------|                 |
     |<-- { claimed, by } ------|                        |                 |
     |                          |                        |                 |
     |  "Diego is coming down." |                        |                 |
```

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

## Setup

### 1. Discord webhook (posts the alert)

Channel Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.
Set it as `DISCORD_WEBHOOK_URL`.

### 2. Discord bot (reads the reaction)

The webhook alone cannot read anything back, so the acknowledgment loop needs a
bot as well.

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
channel id from the guest's browser, so without this pin the endpoint would read
reactions from *any* channel the bot can see, for anyone who guesses a message
id. With it set, the client-supplied value is ignored. If you skip it, the first
tap logs the correct id to the Vercel function logs.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DISCORD_WEBHOOK_URL` | yes | Posts the door alert |
| `DISCORD_BOT_TOKEN` | for the ack loop | Reads who reacted |
| `DISCORD_CHANNEL_ID` | for the ack loop | Pins `/api/status` to one channel |
| `DISCORD_ALERT_MENTION` | optional | e.g. `<@&ROLE_ID>` to ping a role |

Never commit any of these. Vercel bakes env vars in at build time, so
**redeploy after adding or changing one.**

## Deploy

```
vercel deploy --prod
```

## Verifying

The page renders whether or not Discord was reached, so loading it proves
nothing on its own. Check in this order:

1. **The alert** — a message appears in the door channel. If not,
   `DISCORD_WEBHOOK_URL` is missing from the production environment.
2. **The ack** — react ✅ to that message; the waiting page should switch to
   "<name> is coming down" within about three seconds. If it does not, check the
   function logs for `Discord reactions read failed` — that is almost always the
   bot lacking View Channel or Read Message History on that channel.

Failures are deliberately loud in the logs, because every one of them is
invisible from the guest's side of the door.

## Writing the NFC tag

Use NFC Tools (iOS/Android): Write → Add a record → **URL/URI** (not "Text" — a
text record will not auto-open a browser) → enter the live URL above → hold the
tag to the phone's NFC antenna.

Test the tap before locking. Locking is permanent, but a public unlocked tag can
be silently rewritten by anyone with a phone, so lock it once the tap works.

## Known gaps

- **No dedupe.** Every tap posts a new message. An anxious guest tapping three
  times produces three alerts. This is expected behaviour rather than abuse, and
  the page tries to make re-tapping feel unnecessary, but the fix is server-side.
- **First reactor wins.** If two leaders react, the page names whoever Discord
  returns first.
- **No un-claim.** Once someone reacts, the page says they are coming. If they
  then get pulled away, the guest is not told.
