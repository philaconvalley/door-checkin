const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { page, COPY, GROUND } = require('../api/checkin.js');

const FIRST = { c: '111222333444555666', m: '987654321098765432' };
const REPEAT = { c: '111222333444555666', m: '987654321098765999' };
const KEY = 'test-door-key';

// --- The page as HTML -------------------------------------------------------

test('every page state has a ground color, so theme-color is never "undefined"', () => {
  for (const state of Object.keys(COPY)) {
    assert.match(GROUND[state] || '', /^#[0-9a-f]{6}$/, `GROUND has no color for "${state}"`);
    const html = page({ state, channelId: '', messageId: '', doorKey: '' });
    assert.ok(html.includes(`<meta name="theme-color" content="${GROUND[state]}"`), state);
  }
});

test('the page loads no fonts or stylesheets from another host', () => {
  const html = page({ state: 'waiting', channelId: FIRST.c, messageId: FIRST.m, doorKey: KEY });
  assert.ok(!html.includes('fonts.googleapis'), 'Google Fonts would send the guest IP to Google');
  assert.ok(!html.includes('fonts.gstatic'));
  assert.ok(!/<link[^>]+stylesheet/.test(html));
  assert.equal((html.match(/@font-face/g) || []).length, 3);
  assert.equal((html.match(/src: url\(data:font\/woff2;base64,/g) || []).length, 3);
});

test('the headline and the line under it share one live region', () => {
  const html = page({ state: 'waiting', channelId: FIRST.c, messageId: FIRST.m, doorKey: KEY });
  // The name goes in the headline. If only the second line were live, a screen
  // reader would never say who is coming.
  assert.match(
    html,
    /<div id="news" role="status" aria-live="polite" aria-atomic="true">\s*<h1 id="head">[^<]*<\/h1>\s*<p class="sub" id="sub">/,
  );
});

// --- The page's own script, run against a stand-in DOM ---------------------

// Only what the script touches. There is no innerHTML here on purpose: a
// claim that wrote markup instead of text nodes would leave the headline empty
// and fail the test.
function element(text = '') {
  return {
    textContent: text,
    dataset: {},
    content: '',
    disabled: false,
    className: '',
    children: [],
    classList: {
      names: new Set(),
      add(name) { this.names.add(name); },
      remove(name) { this.names.delete(name); },
      contains(name) { return this.names.has(name); },
    },
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    replaceChildren(...nodes) {
      this.children = nodes;
      this.textContent = nodes.map((n) => n.textContent).join('');
    },
  };
}

// Discord replies by message id: `claims` maps a message id to who claimed it.
// `hold` keeps every status request pending until release(), like a stalled
// request on venue wifi. `againReplies` answers successive Ring again presses.
function boot(state, { messageId = '', claims = {}, againReply = null, againReplies = null, hold = false } = {}) {
  const html = page({ state, channelId: messageId ? FIRST.c : '', messageId, doorKey: KEY });
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

  const copy = COPY[state];
  const nodes = {
    head: element(copy.head),
    sub: element(copy.sub),
    meta: element(copy.meta),
    again: element('Ring again'),
    theme: element(),
  };
  nodes.theme.content = GROUND[state];
  const body = element();
  body.dataset = { state, elapsed: 'fresh' };

  const requests = [];
  const signals = [];
  const held = [];
  const intervals = [];
  const replies = againReplies ? againReplies.slice() : null;
  const ctx = {
    document: {
      body,
      hidden: false,
      title: copy.title,
      getElementById: (id) => nodes[id],
      createElement: () => element(),
      createTextNode: (text) => ({ textContent: text }),
      addEventListener() {},
    },
    navigator: {},
    setInterval: (fn) => { intervals.push(fn); return intervals.length; },
    clearInterval: () => { intervals.length = 0; },
    setTimeout: () => 0,
    encodeURIComponent,
    URLSearchParams,
    Date,
    JSON,
    Promise,
    AbortSignal,
    fetch: async (url, init = {}) => {
      requests.push(url);
      if (url.startsWith('/api/again')) {
        const reply = replies ? replies.shift() : againReply;
        return { ok: Boolean(reply), json: async () => reply };
      }
      signals.push(init.signal);
      const m = new URLSearchParams(url.split('?')[1]).get('m');
      const by = claims[m];
      const reply = { ok: true, json: async () => (by ? { claimed: true, by } : { claimed: false }) };
      if (hold) return new Promise((resolve) => held.push(() => resolve(reply)));
      return reply;
    },
  };
  vm.runInNewContext(script, ctx);

  return {
    body,
    nodes,
    document: ctx.document,
    requests,
    signals,
    intervals,
    polled() {
      return requests.filter((u) => u.startsWith('/api/status')).map((u) => new URLSearchParams(u.split('?')[1]).get('m'));
    },
    async release() {
      held.splice(0).forEach((resolve) => resolve());
      await settle();
    },
    async tick() {
      for (const fn of intervals.slice()) fn();
      await settle();
    },
    async ringAgain() {
      await nodes.again.listeners.click[0]();
      await settle();
    },
  };
}

// Lets the page's fetch promises finish.
async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
}

test('a claim names the leader in the sticker, as text and never as markup', async () => {
  const name = '<img src=x onerror=alert(1)>';
  const door = boot('waiting', { messageId: FIRST.m, claims: { [FIRST.m]: name } });

  await door.tick();

  const head = door.nodes.head;
  assert.equal(door.body.dataset.state, 'claimed');
  assert.equal(head.children.length, 2);
  assert.equal(head.children[0].className, 'sticker');
  assert.equal(head.children[0].textContent, name, 'the name must arrive as plain text');
  assert.equal(head.textContent, `${name} is coming down.`);
  assert.ok(head.classList.contains('arrive'));
  assert.equal(door.nodes.theme.content, GROUND.claimed);
  assert.equal(door.intervals.length, 0, 'polling stops once someone is coming');
});

test('no claim leaves the guest waiting', async () => {
  const door = boot('waiting', { messageId: FIRST.m });

  await door.tick();

  assert.equal(door.body.dataset.state, 'waiting');
  assert.equal(door.nodes.head.textContent, COPY.waiting.head);
});

test('a claim on the "Still at the door" repeat reaches the guest', async () => {
  const door = boot('waiting', {
    messageId: FIRST.m,
    claims: { [REPEAT.m]: 'Saige' },
    againReply: { ok: true, id: REPEAT.m, channel_id: REPEAT.c },
  });

  await door.ringAgain();
  await door.tick();

  const polled = door.requests.filter((u) => u.startsWith('/api/status'));
  assert.ok(polled.some((u) => u.includes(`m=${FIRST.m}`)), 'still watches the first alert');
  assert.ok(polled.some((u) => u.includes(`m=${REPEAT.m}`)), 'also watches the repeat');
  assert.equal(door.body.dataset.state, 'claimed');
  assert.equal(door.nodes.head.children[0].textContent, 'Saige');
});

test('a successful ring from the failed page becomes a waiting page that polls', async () => {
  const door = boot('failed', {
    claims: { [REPEAT.m]: 'Diego' },
    againReply: { ok: true, id: REPEAT.m, channel_id: REPEAT.c },
  });
  assert.equal(door.intervals.length, 0, 'nothing to poll before a ring goes through');

  await door.ringAgain();

  assert.equal(door.body.dataset.state, 'waiting');
  assert.equal(door.nodes.head.textContent, COPY.waiting.head);
  assert.equal(door.document.title, COPY.waiting.title);
  assert.equal(door.nodes.theme.content, GROUND.waiting);
  assert.equal(door.intervals.length, 1);

  await door.tick();

  assert.equal(door.body.dataset.state, 'claimed');
  assert.equal(door.nodes.head.children[0].textContent, 'Diego');
});

test('a failed repeat changes nothing but the button', async () => {
  const door = boot('failed', { againReply: null });

  await door.ringAgain();

  assert.equal(door.body.dataset.state, 'failed');
  assert.equal(door.nodes.again.textContent, 'Try once more');
  assert.equal(door.intervals.length, 0);
});

test('a slow poll is not stacked on: the next tick waits for it', async () => {
  const door = boot('waiting', { messageId: FIRST.m, hold: true });

  await door.tick();
  await door.tick();
  await door.tick();
  assert.equal(door.polled().length, 1, 'one request in flight, however many ticks pass');

  await door.release();
  await door.tick();
  assert.equal(door.polled().length, 2, 'polling resumes once the slow request returns');
});

test('every status request has a time limit, so a hung one cannot stop polling', async () => {
  const door = boot('waiting', { messageId: FIRST.m });

  await door.tick();

  assert.equal(door.signals.length, 1);
  assert.ok(door.signals[0] instanceof AbortSignal);
});

test('the page watches the first alert and only the latest repeat', async () => {
  const third = '987654321098765111';
  const door = boot('waiting', {
    messageId: FIRST.m,
    againReplies: [
      { ok: true, id: REPEAT.m, channel_id: REPEAT.c },
      { ok: true, id: third, channel_id: REPEAT.c },
    ],
  });

  await door.ringAgain();
  await door.ringAgain();
  const before = door.polled().length;
  await door.tick();

  assert.deepEqual(door.polled().slice(before), [FIRST.m, third]);
});

test('the button shows its press the moment a finger lands, and lets go on release', async () => {
  const door = boot('waiting', { messageId: FIRST.m });
  const btn = door.nodes.again;
  const fire = (type) => btn.listeners[type].forEach((fn) => fn());

  fire('pointerdown');
  assert.ok(btn.classList.contains('is-pressed'), 'pressed on finger-down, not on release');
  fire('pointerup');
  assert.ok(!btn.classList.contains('is-pressed'));

  fire('pointerdown');
  fire('pointercancel');   // iOS cancels when the touch turns into a scroll
  assert.ok(!btn.classList.contains('is-pressed'), 'a scroll must not leave it stuck down');

  btn.disabled = true;     // "Sent again" for 20 seconds
  fire('pointerdown');
  assert.ok(!btn.classList.contains('is-pressed'), 'a disabled button does not press');
});
