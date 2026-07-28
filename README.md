# door-checkin

NFC door check-in webhook for PhilaCon Valley events.

An NFC tag at the door opens this endpoint's URL, which:

1. Posts a notification to a Discord channel via a Discord webhook (so the team knows someone's here)
2. Returns an HTML landing page confirming check-in, with a "Join our Discord" link

Not a gate — check-in is frictionless, the Discord link is an optional next step.

## Live URL

```
https://door-checkin-eight.vercel.app
```

Both `/` and `/api/checkin` serve the check-in — `vercel.json` rewrites the root to the
function so the NFC tag can hold the shorter, bare-domain URL.

## Setup

Set the `DISCORD_WEBHOOK_URL` environment variable in Vercel to the target Discord channel's
webhook URL. Never commit this value to source. Vercel bakes env vars in at build time, so
redeploy after adding or changing it.

## Deploy

```
vercel deploy --prod
```

## Verifying

The landing page renders whether or not the Discord post succeeded — `api/checkin.js` skips the
post when `DISCORD_WEBHOOK_URL` is unset and swallows any error when it fails. **Confirm a check-in
by looking for the message in the Discord channel, not by loading the page.**

## Writing the NFC tag

Use NFC Tools (iOS/Android): Write → Add a record → **URL/URI** (not "Text" — a text record won't
auto-open a browser) → enter the live URL above → hold the tag to the phone's NFC antenna.

Test the tap before locking. Locking is permanent, but a public unlocked tag can be silently
rewritten by anyone with a phone, so lock it once the tap is confirmed working.
