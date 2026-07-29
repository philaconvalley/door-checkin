const CLAIM_EMOJI = '✅';

// What the guest is told, per state. The page must never claim somebody was
// notified when they weren't — the original bug here was a page that
// misreported the situation of a person standing outside a locked door.
const COPY = {
  waiting: {
    title: "We've told them you're here",
    head: "We've told them.",
    sub: 'A message just went to the PhilaCon Valley team. Someone will come down and let you in.',
    meta: 'Just now',
  },
  failed: {
    title: "We couldn't reach anyone",
    head: "We couldn't reach anyone.",
    sub: 'The notification did not go through. Knock, or tap the tag once more.',
    meta: 'Not delivered',
  },
  // Reached by anything that loads the bare URL without the tag's key: Vercel's
  // own deploy bots, crawlers, link unfurlers, or a person who typed the domain.
  idle: {
    title: 'PhilaCon Valley — front door',
    head: 'This is the door.',
    sub: "Tap the tag on the door with your phone and we'll let the team know you're here.",
    meta: 'Nothing sent',
  },
  unconfigured: {
    title: 'The doorbell is not set up',
    head: "The doorbell isn't set up.",
    sub: 'This tap could not be sent to anyone. Knock, or call someone inside.',
    meta: 'Not configured',
  },
};

function page({ state, channelId, messageId, doorKey }) {
  const copy = COPY[state];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b0b0c">
<title>${copy.title}</title>
<style>
  :root {
    --void:  #0b0b0c;
    --ivory: #f2efe9;
    --brass: #a8894f;
    --green: #7fb069;
    --dim:   color-mix(in srgb, var(--ivory) 48%, transparent);
    --serif: ui-serif, "New York", "Iowan Old Style", Georgia, serif;
    --sans:  ui-sans-serif, -apple-system, "Helvetica Neue", sans-serif;
    --mono:  ui-monospace, "SF Mono", Menlo, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100dvh;
    background: var(--void);
    color: var(--ivory);
    font-family: var(--serif);
    -webkit-font-smoothing: antialiased;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 2rem 1.6rem max(2.2rem, env(safe-area-inset-bottom));
    overflow-x: hidden;
  }

  /* A slow breath, not a spinner. A spinner reads as "stuck"; this reads as
     "someone is with you." It stops the moment the claim lands. */
  .pulse {
    width: 9px; height: 9px;
    border-radius: 50%;
    background: var(--brass);
    margin-bottom: 0.7rem;
    animation: breathe 2.6s ease-in-out infinite;
  }
  [data-state="claimed"] .pulse { background: var(--green); animation: none; }
  [data-state="failed"] .pulse,
  [data-state="unconfigured"] .pulse { background: #c25b4a; animation: none; }
  [data-state="idle"] .pulse {
    background: color-mix(in srgb, var(--ivory) 30%, transparent);
    animation: none;
  }
  @keyframes breathe {
    0%, 100% { opacity: .28; transform: scale(.82); }
    50%      { opacity: 1;   transform: scale(1); }
  }

  .rule {
    height: 1px;
    background: color-mix(in srgb, var(--brass) 45%, transparent);
    margin-bottom: 1.4rem;
    transform-origin: left center;
    animation: draw 900ms cubic-bezier(.16,1,.3,1) both;
  }
  @keyframes draw { from { transform: scaleX(0); } to { transform: scaleX(1); } }

  h1 {
    margin: 0;
    font-size: clamp(2.9rem, 15vw, 4.6rem);
    line-height: .96;
    letter-spacing: -.042em;
    text-wrap: balance;
  }
  .sub {
    margin: 1.1rem 0 0;
    font-family: var(--sans);
    font-size: 1.02rem;
    line-height: 1.5;
    color: var(--dim);
    max-width: 30ch;
  }
  .meta {
    margin: 1.1rem 0 0;
    font-family: var(--mono);
    font-size: .72rem;
    letter-spacing: .12em;
    text-transform: uppercase;
    /* 52% clears 4.5:1 on the void. Read outdoors, at night, in the cold —
       this is not a place to spend contrast on mood. */
    color: color-mix(in srgb, var(--ivory) 52%, transparent);
  }

  .stack { animation: rise 700ms cubic-bezier(.16,1,.3,1) both 120ms; }
  @keyframes rise {
    from { opacity: 0; transform: translateY(1.4rem); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Hidden until the wait earns them. */
  .later { display: none; margin-top: 1.6rem; }
  [data-elapsed="stalled"] .later { display: block; animation: rise 600ms cubic-bezier(.16,1,.3,1) both; }
  [data-state="claimed"] .later { display: none; }

  button {
    font-family: var(--sans);
    font-size: 1rem;
    font-weight: 500;
    color: var(--void);
    background: var(--ivory);
    border: 0;
    border-radius: 100px;
    padding: 1.05rem 1.9rem;
    min-height: 48px;
    cursor: pointer;
    transition: transform 90ms ease-out, opacity 150ms;
  }
  button:active { transform: scale(.97); }
  button:disabled { opacity: .45; }
  button:focus-visible { outline: 2px solid var(--brass); outline-offset: 3px; }

  .explore {
    display: none;
    font-family: var(--sans);
    font-size: .9rem;
    line-height: 1.5;
    color: color-mix(in srgb, var(--ivory) 52%, transparent);
    border-top: 1px solid color-mix(in srgb, var(--ivory) 14%, transparent);
    padding-top: 1.1rem;
    margin-top: 1.8rem;
  }
  [data-elapsed="settled"] .explore,
  [data-elapsed="stalled"] .explore { display: block; }
  .explore a {
    color: var(--brass);
    text-decoration: none;
    border-bottom: 1px solid color-mix(in srgb, var(--brass) 40%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse, .rule, .stack, .later { animation: none !important; }
    .rule { transform: none; }
  }
</style>
</head>
<body data-state="${state}" data-elapsed="fresh">

  <div class="pulse" aria-hidden="true"></div>
  <div class="rule" aria-hidden="true"></div>

  <div class="stack">
    <h1 id="head">${copy.head}</h1>
    <p class="sub" id="sub" role="status" aria-live="polite">${copy.sub}</p>
    <p class="meta" id="meta">${copy.meta}</p>

    <div class="later">
      <button id="again" type="button">Ring again</button>
    </div>

    <div class="explore">
      While you wait — PhilaCon Valley is a Philadelphia tech community for people who build.
      <a href="https://discord.gg/rjYcUgfTV">See what's going on inside</a>.
    </div>
  </div>

<script>
  const CHANNEL = ${JSON.stringify(channelId || '')};
  const MESSAGE = ${JSON.stringify(messageId || '')};
  const STATE   = ${JSON.stringify(state)};
  // Already in this page's own URL, so putting it here exposes nothing new.
  const KEY     = ${JSON.stringify(doorKey || '')};
  const body = document.body;
  const head = document.getElementById('head');
  const sub  = document.getElementById('sub');
  const meta = document.getElementById('meta');
  const again = document.getElementById('again');

  const started = Date.now();
  const SETTLED = 45000;    // gentle reassurance
  const STALLED = 120000;   // surface the escape hatch
  const GIVE_UP = 600000;   // stop polling after ten minutes

  let timer = null;
  let claimed = false;

  function elapsedLabel() {
    const s = Math.floor((Date.now() - started) / 1000);
    if (s < 20) return 'Just now';
    if (s < 60) return s + ' seconds ago';
    const m = Math.floor(s / 60);
    return m === 1 ? '1 minute ago' : m + ' minutes ago';
  }

  function tick() {
    if (claimed) return;
    const waited = Date.now() - started;
    meta.textContent = elapsedLabel();
    if (waited >= STALLED) {
      body.dataset.elapsed = 'stalled';
      sub.textContent = 'Nobody has picked this up yet. Ring again, or knock if you can.';
    } else if (waited >= SETTLED) {
      body.dataset.elapsed = 'settled';
      sub.textContent = 'Still waiting. Someone usually comes down within a couple of minutes.';
    }
  }

  function claim(by) {
    claimed = true;
    clearInterval(timer);
    body.dataset.state = 'claimed';
    head.textContent = by + ' is coming down.';
    sub.textContent = 'Hang tight by the door — should be about a minute.';
    meta.textContent = 'On the way';
    if (navigator.vibrate) navigator.vibrate([12, 60, 12]);
  }

  async function poll() {
    if (claimed || !MESSAGE || Date.now() - started > GIVE_UP) return;
    if (document.hidden) return;   // don't burn invocations behind a locked screen
    try {
      const r = await fetch('/api/status?c=' + encodeURIComponent(CHANNEL) + '&m=' + encodeURIComponent(MESSAGE), { cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json();
      if (data.claimed && data.by) claim(data.by);
    } catch (_) { /* venue wifi — try again next tick */ }
  }

  if (STATE === 'waiting' && MESSAGE) {
    timer = setInterval(function () { tick(); poll(); }, 3000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
  } else if (STATE === 'failed') {
    // Nothing was sent, so offer the retry immediately rather than after 2min.
    body.dataset.elapsed = 'stalled';
  }
  // idle and unconfigured deliberately offer nothing: there is no ring to retry.

  again.addEventListener('click', async function () {
    again.disabled = true;
    again.textContent = 'Sending…';
    try {
      const r = await fetch('/api/again?k=' + encodeURIComponent(KEY), { method: 'POST', cache: 'no-store' });
      again.textContent = r.ok ? 'Sent again' : 'Try once more';
    } catch (_) {
      again.textContent = 'Try once more';
    }
    setTimeout(function () { again.disabled = false; again.textContent = 'Ring again'; }, 20000);
  });
</script>
</body>
</html>`;
}

// Posts the door alert and returns Discord's created message, or null.
// ?wait=true is what makes Discord return the message object instead of a bare
// 204 — without it there is no message id, so there is nothing to poll.
async function alertDiscord(content) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('DISCORD_WEBHOOK_URL is not set — nobody was notified.');
    return null;
  }

  const url = new URL(webhookUrl);
  url.searchParams.set('wait', 'true');

  const mention = process.env.DISCORD_ALERT_MENTION;
  const body = {
    content: (mention ? mention + ' ' : '') + content,
    allowed_mentions: mention ? { parse: ['roles', 'everyone'] } : { parse: [] },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error('Discord webhook rejected the post:', res.status, await res.text());
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('Discord webhook post failed:', err);
    return null;
  }
}

function doorMessage() {
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  }).format(new Date());

  // A named claim beats a broadcast: an unclaimed alert in a channel of five is
  // an alert everyone assumes somebody else already took.
  return [
    '**Someone is at the front door.**',
    `Tapped at ${time}.`,
    `React with ${CLAIM_EMOJI} when you are heading down — their screen will tell them you are coming.`,
  ].join('\n');
}

// Only the NFC tag carries the key, so only a real tap rings the bell. A bare
// GET of this URL rings nothing — which matters because plenty of things fetch
// it without being asked: Vercel's own post-deploy checks (`undici`) and its
// deployment-thumbnail renderer (headless Chrome), link unfurlers, crawlers.
// Ringing a doorbell in a real building is a side effect, and side effects do
// not belong on a URL that anything on the internet can pull.
function authorize(req) {
  const doorKey = process.env.DOOR_KEY;
  if (!doorKey) return 'unconfigured';

  const url = new URL(req.url || '/', 'http://localhost');
  return url.searchParams.get('k') === doorKey ? 'authorized' : 'idle';
}

module.exports = async (req, res) => {
  const verdict = authorize(req);

  if (verdict === 'unconfigured') {
    console.error('DOOR_KEY is not set — the doorbell cannot ring for anyone.');
  }

  let message = null;
  if (verdict === 'authorized') {
    message = await alertDiscord(doorMessage());

    if (message && !process.env.DISCORD_CHANNEL_ID) {
      console.log('Set DISCORD_CHANNEL_ID to', message.channel_id, 'to enable the acknowledgment loop.');
    }
  }

  const state = verdict === 'authorized'
    ? (message ? 'waiting' : 'failed')
    : verdict;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  // Nothing here should ever be indexed or unfurled.
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.status(200).send(page({
    state,
    channelId: message && message.channel_id,
    messageId: message && message.id,
    doorKey: verdict === 'authorized' ? process.env.DOOR_KEY : '',
  }));
};

module.exports.authorize = authorize;

module.exports.alertDiscord = alertDiscord;
module.exports.CLAIM_EMOJI = CLAIM_EMOJI;
