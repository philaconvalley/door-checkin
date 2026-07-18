# door-checkin

NFC door check-in webhook for PhilaCon Valley events.

An NFC tag at the door opens this endpoint's URL, which:

1. Posts a notification to a Discord channel via a Discord webhook (so the team knows someone's here)
2. Returns an HTML landing page confirming check-in, with a "Join our Discord" link

Not a gate — check-in is frictionless, the Discord link is an optional next step.

## Setup

Set the `DISCORD_WEBHOOK_URL` environment variable in Vercel to the target Discord channel's webhook URL. Never commit this value to source.

## Deploy

```
vercel deploy --prod
```
