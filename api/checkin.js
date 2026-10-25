const { PIGEON_MARK, FONTS } = require('./_brand');

// What the message asks for.
const CLAIM_EMOJI = '✅';

// What actually counts. At a glance ✅ ☑️ and ✔️ are the same tick, and a leader
// who picks the wrong one walks downstairs believing they answered while the
// guest keeps waiting. 👍 is included because it unambiguously means "on it"
// in reply to a door alert.
const CLAIM_EMOJIS = ['✅', '☑️', '✔️', '👍'];

// What the guest is told, per state. The page must never claim somebody was
// notified when they weren't — the original bug here was a page that
// misreported the situation of a person standing outside a locked door.
const COPY = {
  waiting: {
    title: "We've told them you're here",
    head: "We've told them.",
    sub: 'A message just went to the PhilaCon Valley crew inside. Someone will come down and let you in.',
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

// One saturated ground per state, from Brand Edition 1.2. Each pair keeps ink
// text at 5.6:1 or better, and the grounds differ in lightness, not hue alone,
// so a guest can tell "waiting" from "coming" without reading a word.
const GROUND = {
  waiting: '#fcd66a',       // brand-yellow
  claimed: '#ea71ac',       // brand-pink
  failed: '#ee657e',        // brand-coral
  unconfigured: '#ee657e',
  idle: '#ffffff',          // white
};

function page({ state, channelId, messageId, doorKey }) {
  const copy = COPY[state];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="${GROUND[state]}" id="theme">
<title>${copy.title}</title>
<style>
  /* The brand faces, inlined and subset (scripts/build-brand.py). They arrive
     with the page, so the text never changes shape after it first paints,
     and no guest's IP address goes to a font host. */
  @font-face { font-family: "Baloo 2"; font-weight: 800; font-display: block;
    unicode-range: ${FONTS.display.range}; src: url(${FONTS.display.src}) format("woff2"); }
  @font-face { font-family: "Nunito"; font-weight: 400; font-display: block;
    unicode-range: ${FONTS.sans.range}; src: url(${FONTS.sans.src}) format("woff2"); }
  @font-face { font-family: "JetBrains Mono"; font-weight: 500; font-display: block;
    unicode-range: ${FONTS.mono.range}; src: url(${FONTS.mono.src}) format("woff2"); }
  /* Tokens from the PhilaCon Valley design system (Brand Edition 1.2). */
  :root {
    --brand-yellow: #fcd66a;
    --brand-pink:   #ea71ac;
    --brand-coral:  #ee657e;
    --brand-dark:   #1a1a1a;
    --white:        #ffffff;
    --stroke-outline: 2px;
    --stroke-sticker: 3px;
    --radius-card:    24px;
    --radius-sticker: 18px;
    --radius-pill:    9999px;
    --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
    --duration-press: 100ms;
    --duration-hover: 150ms;
    --duration-enter: 900ms;
    /* A reply to something the guest is watching: the claim, a late card.
       UI responses stay at 300ms or less; --duration-enter is for the
       once-per-load hero entrance only. */
    --duration-reveal: 300ms;
    /* The display stack falls back to system-ui, never cursive: on a phone
       with no signal at the door, a failed font load must still look right. */
    --font-display: "Baloo 2", system-ui, sans-serif;
    --font-sans:    "Nunito", system-ui, sans-serif;
    --font-mono:    "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100dvh;
    background: var(--ground);
    color: var(--brand-dark);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: max(1.25rem, env(safe-area-inset-top)) 16px max(2rem, env(safe-area-inset-bottom));
    overflow-x: hidden;
    /* A color change, not movement: plain ease. */
    transition: background-color var(--duration-reveal) ease;
  }
  body[data-state="waiting"] { --ground: var(--brand-yellow); }
  body[data-state="claimed"] { --ground: var(--brand-pink); }
  body[data-state="failed"],
  body[data-state="unconfigured"] { --ground: var(--brand-coral); }
  body[data-state="idle"] { --ground: var(--white); }

  .mark {
    width: 56px; height: 56px;
    border-radius: 50%;
    border: var(--stroke-outline) solid var(--brand-dark);
    background: var(--white);
    box-shadow: 3px 3px 0 var(--brand-dark);
    overflow: hidden;
  }
  .mark img { display: block; width: 100%; height: 100%; }

  .stack { width: 100%; max-width: 34rem; }

  .status {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 1.1rem;
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  /* The dot breathes twice while the alert goes out, then rests. The brand
     allows no endless loops; the ticking time beside it shows the page is
     still live. */
  .dot {
    flex: none;
    width: 12px; height: 12px;
    border-radius: 50%;
    border: var(--stroke-outline) solid var(--brand-dark);
    background: var(--white);
  }
  [data-state="waiting"] .dot { animation: breathe 2.4s ease-in-out 2; }
  [data-state="claimed"] .dot { background: var(--brand-dark); }
  @keyframes breathe {
    0%, 100% { transform: scale(1); }
    50%      { transform: scale(0.6); }
  }

  .rule {
    height: var(--stroke-outline);
    background: var(--brand-dark);
    margin-bottom: 1.4rem;
    transform-origin: left center;
    animation: draw var(--duration-enter) var(--ease-out) both;
  }
  @keyframes draw { from { transform: scaleX(0); } to { transform: scaleX(1); } }

  /* Typed in sentence case; the brand renders display type uppercase. */
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 800;
    /* The rem term lets the phone's text-size setting scale the headline;
       a vw-only middle value would ignore it. */
    font-size: clamp(2.75rem, 1.25rem + 8vw, 4.5rem);
    line-height: 0.92;
    letter-spacing: -0.02em;
    text-transform: uppercase;
    text-wrap: balance;
  }
  /* The leader's name, as a hand-placed sticker. */
  .sticker {
    display: inline-block;
    border-radius: var(--radius-sticker);
    border: var(--stroke-sticker) solid var(--brand-dark);
    background: var(--white);
    padding: 0.06em 0.22em 0;
    margin: 0.08em 0.06em 0.12em 0;
    box-shadow: 6px 6px 0 var(--brand-dark);
    transform: rotate(-2deg);
    animation: stick var(--duration-reveal) var(--ease-out) both;
  }
  /* Pressed onto the page: it lands from slightly above, so it starts a
     little larger and more tilted, never from nothing. */
  @keyframes stick {
    from { transform: rotate(-6deg) scale(1.1); opacity: 0; }
    to   { transform: rotate(-2deg) scale(1);   opacity: 1; }
  }
  /* The claim swaps the whole headline. It slides in from below, the same
     way the page arrived, so the guest sees one story move forward, not a
     cut. The words stay at full opacity the whole way. The line under it
     follows 60ms later, so the name lands first. */
  #head.arrive { animation: arrive var(--duration-reveal) var(--ease-out) both; }
  #sub.arrive  { animation: arrive var(--duration-reveal) var(--ease-out) 60ms both; }

  /* Full ink. The brand has no greys: secondary text is never faded. */
  .sub {
    margin: 1.1rem 0 0;
    font-size: 1.125rem;
    line-height: 1.5;
    max-width: 32ch;
  }

  /* The page moves, but it never hides. Fading the headline in from zero
     left a guest at a locked door looking at a blank screen for most of a
     second. Now the words are readable on the first frame and only slide,
     top to bottom in 40ms steps, in the order the guest reads them. */
  .status { animation: rise var(--duration-enter) var(--ease-out) both; }
  h1      { animation: rise var(--duration-enter) var(--ease-out) 40ms both; }
  .sub    { animation: rise var(--duration-enter) var(--ease-out) 80ms both; }
  @keyframes rise {
    from { transform: translateY(0.75rem); }
    to   { transform: translateY(0); }
  }
  /* The same slide under a second name. A browser replays an animation only
     when its name changes, and h1 and .sub already ran "rise" on load. */
  @keyframes arrive {
    from { transform: translateY(0.75rem); }
    to   { transform: translateY(0); }
  }
  /* Content that arrives later may fade in: the guest is not waiting on it. */
  @keyframes appear {
    from { opacity: 0; transform: translateY(0.75rem); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Hidden until the wait earns them. */
  .later { display: none; margin-top: 1.6rem; }
  [data-elapsed="stalled"] .later { display: block; animation: appear var(--duration-reveal) var(--ease-out) both; }
  [data-state="claimed"] .later { display: none; }

  /* The brand button: ink outline, hard shadow, sticker lift on press. Only
     transform and the shadow offset move, so the shadow's outer edge stays put. */
  @property --lift { syntax: '<length>'; inherits: false; initial-value: 4px; }
  .btn {
    --lift: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 55px;
    padding: 10px 28px;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 17px;
    line-height: 24px;
    color: var(--brand-dark);
    background: var(--brand-pink);
    border: var(--stroke-outline) solid var(--brand-dark);
    border-radius: var(--radius-pill);
    box-shadow: var(--ring, 0 0 #0000), var(--lift) var(--lift) 0 var(--brand-dark);
    cursor: pointer;
    /* No double-tap zoom on the button, so the tap answers at once. */
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition:
      transform var(--duration-hover) var(--ease-out),
      --lift var(--duration-hover) var(--ease-out);
  }
  /* Pink would vanish into the coral ground; use the white sticker there. */
  [data-state="failed"] .btn { background: var(--white); }
  .btn:active { --lift: 2px; transform: translate(2px, 2px); transition-duration: var(--duration-press); }
  .btn:disabled { cursor: default; }
  .btn:disabled:active { --lift: 4px; transform: none; }
  @media (hover: hover) and (pointer: fine) {
    .btn:not(:disabled):hover { --lift: 6px; transform: translate(-2px, -2px); }
  }
  /* One focus ring everywhere: pink outline inside a 6px ink edge. */
  :focus-visible {
    outline: 2px solid var(--brand-pink);
    outline-offset: 2px;
  }
  .btn:focus-visible { --ring: 0 0 0 6px var(--brand-dark); }
  a:focus-visible { box-shadow: 0 0 0 6px var(--brand-dark); border-radius: 4px; }

  .explore {
    display: none;
    margin-top: 1.8rem;
    padding: 1rem 1.15rem;
    background: var(--white);
    border: var(--stroke-outline) solid var(--brand-dark);
    border-radius: var(--radius-card);
    box-shadow: 6px 6px 0 var(--brand-dark);
    font-size: 1rem;
    line-height: 1.5;
  }
  [data-elapsed="settled"] .explore,
  [data-elapsed="stalled"] .explore { display: block; animation: appear var(--duration-reveal) var(--ease-out) both; }
  [data-state="claimed"] .explore { display: none; }
  .explore a {
    display: inline-block;
    margin-top: 0.35rem;
    font-family: var(--font-display);
    font-weight: 800;
    color: var(--brand-dark);
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
  }

  /* Reduced motion keeps the meaning and the feedback, without movement:
     what slid now cross-fades, and what was already on screen stays still. */
  @media (prefers-reduced-motion: reduce) {
    .dot, .rule, .status, h1, .sub { animation: none !important; }
    .rule { transform: none; }
    .later, .explore, .sticker, #head.arrive, #sub.arrive { animation: fade 200ms ease both !important; }
    .btn, .btn:active { transform: none; }
  }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
</style>
</head>
<body data-state="${state}" data-elapsed="fresh">

  <div class="mark"><img src="${PIGEON_MARK}" alt="PhilaCon Valley" width="56" height="56"></div>

  <div class="stack">
    <p class="status"><span class="dot" aria-hidden="true"></span><span id="meta">${copy.meta}</span></p>
    <div class="rule" aria-hidden="true"></div>

    <!-- One live region around the headline and the line under it. On a claim
         a screen reader hears both together: "Diego is coming down. Hang
         tight by the door." The name lives in the headline, so a live region
         on the second line alone never announced who was coming. -->
    <div id="news" role="status" aria-live="polite" aria-atomic="true">
      <h1 id="head">${copy.head}</h1>
      <p class="sub" id="sub">${copy.sub}</p>
    </div>

    <div class="later">
      <button class="btn" id="again" type="button">Ring again</button>
    </div>

    <div class="explore">
      While you wait: PhilaCon Valley is a free Philadelphia tech community for people who build.<br>
      <a href="https://discord.gg/rjYcUgfTV">See what's going on inside →</a>
    </div>
  </div>

<script>
  const CHANNEL = ${JSON.stringify(channelId || '')};
  const MESSAGE = ${JSON.stringify(messageId || '')};
  const WAITING = ${JSON.stringify(COPY.waiting)};
  const STATE   = ${JSON.stringify(state)};
  // Already in this page's own URL, so putting it here exposes nothing new.
  const KEY     = ${JSON.stringify(doorKey || '')};
  const body = document.body;
  const head = document.getElementById('head');
  const sub  = document.getElementById('sub');
  const meta = document.getElementById('meta');
  const again = document.getElementById('again');
  const theme = document.getElementById('theme');

  // iOS Safari skips :active on a tap unless the page listens for touches.
  // Without this, the button gives no press feedback on an iPhone.
  document.addEventListener('touchstart', function () {}, { passive: true });

  let started = Date.now();
  let lastRing = started;
  const SETTLED = 45000;    // gentle reassurance
  const STALLED = 120000;   // surface the escape hatch
  const GIVE_UP = 600000;   // stop polling ten minutes after the last ring
  // A leader claims the alert that pinged them first or the one they just
  // saw, so the page watches two messages: the first that went out and the
  // latest repeat. Each watched message costs Discord reads on every poll,
  // and too many reads get the bot rate-limited, which looks to the guest
  // like nobody answering. Two keeps the load at twice a single alert.
  const watching = MESSAGE ? [{ c: CHANNEL, m: MESSAGE }] : [];

  // Venue wifi can stall a request for longer than the 3s tick. Without these,
  // slow polls pile up; with the flag but no time limit, one hung request
  // would stop polling for good.
  const REQUEST_TIMEOUT = 8000;
  let polling = false;

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
    theme.content = ${JSON.stringify(GROUND.claimed)};
    // The name comes from Discord, so it goes in as text, never as markup.
    const name = document.createElement('span');
    name.className = 'sticker';
    name.textContent = by;
    head.replaceChildren(name, document.createTextNode(' is coming down.'));
    head.classList.add('arrive');
    sub.classList.add('arrive');
    sub.textContent = 'Hang tight by the door. They should be there in about a minute.';
    meta.textContent = 'On the way';
    if (navigator.vibrate) navigator.vibrate([12, 60, 12]);
  }

  async function check(msg) {
    try {
      const r = await fetch('/api/status?c=' + encodeURIComponent(msg.c) + '&m=' + encodeURIComponent(msg.m), {
        cache: 'no-store',
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(REQUEST_TIMEOUT) : undefined,
      });
      if (!r.ok) return;
      const data = await r.json();
      if (data.claimed && data.by && !claimed) claim(data.by);
    } catch (_) { /* venue wifi — try again next tick */ }
  }

  async function poll() {
    if (claimed || polling || !watching.length || Date.now() - lastRing > GIVE_UP) return;
    if (document.hidden) return;   // don't burn invocations behind a locked screen
    polling = true;
    try {
      await Promise.all(watching.map(check));
    } finally {
      polling = false;
    }
  }

  function startWatching() {
    if (timer) return;
    timer = setInterval(function () { tick(); poll(); }, 3000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
  }

  // A repeat alert went out. Watch it too, and if the first ring never went
  // through, this is the guest's first real ring: show the waiting page.
  function rang(msg) {
    lastRing = Date.now();
    // Keep the first message; the newest repeat replaces the one before it.
    watching[watching.length ? 1 : 0] = msg;
    if (body.dataset.state !== 'waiting') {
      started = lastRing;
      body.dataset.state = 'waiting';
      body.dataset.elapsed = 'fresh';
      theme.content = ${JSON.stringify(GROUND.waiting)};
      document.title = WAITING.title;
      head.textContent = WAITING.head;
      sub.textContent = WAITING.sub;
      meta.textContent = WAITING.meta;
    }
    startWatching();
  }

  if (STATE === 'waiting' && MESSAGE) {
    startWatching();
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
      const data = r.ok ? await r.json() : null;
      again.textContent = data && data.ok ? 'Sent again' : 'Try once more';
      if (data && data.ok && data.id) rang({ c: data.channel_id, m: data.id });
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
module.exports.page = page;
module.exports.COPY = COPY;
module.exports.GROUND = GROUND;

module.exports.alertDiscord = alertDiscord;
module.exports.doorMessage = doorMessage;
module.exports.CLAIM_EMOJI = CLAIM_EMOJI;
module.exports.CLAIM_EMOJIS = CLAIM_EMOJIS;
