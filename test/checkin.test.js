const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const checkin = require('../api/checkin.js');
const { alertDiscord, doorMessage, CLAIM_EMOJI } = checkin;
const {
  clearEnv,
  setEnv,
  makeRes,
  stubFetch,
  discordReply,
  captureConsole,
  DOOR_KEY,
  TAP,
} = require('./helpers.js');

const WEBHOOK = 'https://discord.com/api/webhooks/123456789012345678/token-abc';
const SENT_MESSAGE = { id: '987654321098765432', channel_id: '111222333444555666' };

let net = null;
let logs = null;

beforeEach(() => {
  logs = captureConsole();
});

afterEach(() => {
  if (net) net.restore();
  net = null;
  logs.restore();
  logs = null;
  clearEnv();
});

test('alertDiscord returns null without posting when the webhook URL is unset', async () => {
  setEnv({ DOOR_KEY });
  net = stubFetch(() => {
    throw new Error('should not reach the network');
  });

  const result = await alertDiscord('anything');

  assert.equal(result, null);
  assert.equal(net.count, 0);
  assert.match(logs.lines.error.join('\n'), /DISCORD_WEBHOOK_URL is not set/);
});

test('alertDiscord appends wait=true so Discord returns the message instead of 204', async () => {
  // Without ?wait=true Discord answers 204 with an empty body, there is no
  // message id, and the waiting page has nothing to poll.
  setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  const result = await alertDiscord('door');

  assert.deepEqual(result, SENT_MESSAGE);
  assert.equal(new URL(net.calls[0].url).searchParams.get('wait'), 'true');
});

test('alertDiscord keeps query parameters already present on the webhook URL', async () => {
  setEnv({ DISCORD_WEBHOOK_URL: `${WEBHOOK}?thread_id=555000555000555000` });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  await alertDiscord('door');

  const sent = new URL(net.calls[0].url);
  assert.equal(sent.searchParams.get('thread_id'), '555000555000555000');
  assert.equal(sent.searchParams.get('wait'), 'true');
});

test('alertDiscord posts JSON', async () => {
  setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  await alertDiscord('door');

  assert.equal(net.calls[0].method, 'POST');
  assert.equal(net.calls[0].headers['Content-Type'], 'application/json');
});

test('alertDiscord suppresses mentions when DISCORD_ALERT_MENTION is unset', async () => {
  setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  await alertDiscord('Someone is at the door');

  const sent = net.calls[0].json;
  assert.equal(sent.content, 'Someone is at the door');
  assert.deepEqual(sent.allowed_mentions, { parse: [] });
});

test('alertDiscord only allows role and everyone pings when a mention is configured', async () => {
  setEnv({ DISCORD_WEBHOOK_URL: WEBHOOK, DISCORD_ALERT_MENTION: '<@&42>' });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  await alertDiscord('Someone is at the door');

  const sent = net.calls[0].json;
  assert.equal(sent.content, '<@&42> Someone is at the door');
  assert.deepEqual(sent.allowed_mentions, { parse: ['roles', 'everyone'] });
});

test('alertDiscord returns null when Discord rejects the post', async () => {
  setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK });
  net = stubFetch(() => discordReply({ status: 401, text: 'Unauthorized' }));

  assert.equal(await alertDiscord('door'), null);
  assert.match(logs.lines.error.join('\n'), /401/);
});

test('alertDiscord returns null instead of throwing when the network fails', async () => {
  setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK });
  net = stubFetch(() => {
    throw new TypeError('fetch failed');
  });

  assert.equal(await alertDiscord('door'), null);
  assert.match(logs.lines.error.join('\n'), /fetch failed/);
});

test('doorMessage names the claim emoji and stamps a local time', async () => {
  const lines = doorMessage().split('\n');

  assert.equal(lines.length, 3);
  assert.equal(lines[0], '**Someone is at the front door.**');
  // Eastern wall-clock time, so no assertion on the value itself.
  assert.match(lines[1], /^Tapped at \d{1,2}:\d{2}\s?(AM|PM)\.$/);
  assert.ok(lines[2].includes(CLAIM_EMOJI));
});

test('the handler serves a page carrying the ids the poller needs', async () => {
  setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK, DISCORD_CHANNEL_ID: SENT_MESSAGE.channel_id });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  const res = makeRes();
  await checkin({ method: 'GET', url: TAP }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.ok(res.body.includes("We've told them."));
  assert.ok(res.body.includes(`const MESSAGE = "${SENT_MESSAGE.id}"`));
  assert.ok(res.body.includes(`const CHANNEL = "${SENT_MESSAGE.channel_id}"`));
});

test('the handler does not claim anyone was told when Discord could not be reached', async () => {
  setEnv({ DOOR_KEY });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  const res = makeRes();
  await checkin({ method: 'GET', url: TAP }, res);

  // Still a 200 page: the guest is standing at a locked door either way.
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes("We couldn't reach anyone."));
  // An empty message id is what stops the page from starting the poll loop.
  assert.ok(res.body.includes('const MESSAGE = ""'));
});

test('the handler tells the operator which channel to pin when one is not configured', async () => {
  setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  await checkin({ method: 'GET', url: TAP }, makeRes());

  assert.match(
    logs.lines.log.join('\n'),
    new RegExp(`Set DISCORD_CHANNEL_ID to ${SENT_MESSAGE.channel_id}`),
  );
});

test('the handler stays quiet about the channel once it is configured', async () => {
  setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK, DISCORD_CHANNEL_ID: SENT_MESSAGE.channel_id });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  await checkin({ method: 'GET', url: TAP }, makeRes());

  assert.equal(logs.lines.log.length, 0);
});

// The guard. On 2026-07-28 a bare GET of this URL was ringing a bell in a real
// building: Vercel's own deploy bots fetched it twice per deployment. These
// cases are that incident, frozen.
for (const [label, url] of [
  ['a bare GET, as Vercel\'s deploy bot sends', '/'],
  ['a wrong key', '/?k=not-the-key'],
  ['an empty key', '/?k='],
  ['an unrelated query string', '/?utm_source=newsletter'],
]) {
  test(`does not ring for ${label}`, async () => {
    setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK });
    net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

    const res = makeRes();
    await checkin({ method: 'GET', url }, res);

    assert.equal(net.count, 0, 'nothing may be posted to Discord');
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.includes('<body data-state="idle"'));
    assert.ok(res.body.includes('This is the door.'));
    assert.ok(res.body.includes('const MESSAGE = ""'), 'no message id means no polling');
  });
}

test('fails closed, not open, when DOOR_KEY is not configured', async () => {
  setEnv({ DISCORD_WEBHOOK_URL: WEBHOOK });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  const res = makeRes();
  await checkin({ method: 'GET', url: TAP }, res);

  // Ringing for everything is the behaviour this replaced. Silence plus a
  // visible message on the guest's screen is the safer failure.
  assert.equal(net.count, 0);
  assert.ok(res.body.includes('<body data-state="unconfigured"'));
  assert.match(logs.lines.error.join('\n'), /DOOR_KEY is not set/);
});

test('keeps the door page out of search results and link previews', async () => {
  setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  const res = makeRes();
  await checkin({ method: 'GET', url: TAP }, res);

  assert.equal(res.headers['x-robots-tag'], 'noindex, nofollow');
});

test('hands the key to the page so Ring again can authenticate itself', async () => {
  setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  const res = makeRes();
  await checkin({ method: 'GET', url: TAP }, res);

  assert.ok(res.body.includes(`const KEY     = "${DOOR_KEY}"`));
});

test('withholds the key from a page nobody tapped for', async () => {
  setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  const res = makeRes();
  await checkin({ method: 'GET', url: '/' }, res);

  assert.ok(res.body.includes('const KEY     = ""'));
});
