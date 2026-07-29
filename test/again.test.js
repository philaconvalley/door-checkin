const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const again = require('../api/again.js');
const { doorMessage, CLAIM_EMOJI } = require('../api/checkin.js');
const {
  clearEnv,
  setEnv,
  makeRes,
  stubFetch,
  discordReply,
  captureConsole,
  DOOR_KEY,
} = require('./helpers.js');

const WEBHOOK = 'https://discord.com/api/webhooks/123456789012345678/token-abc';
const RING = `/api/again?k=${DOOR_KEY}`;
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

test('refuses anything but POST, so a page prefetch cannot ring the door', async () => {
  setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  for (const method of ['GET', 'HEAD', 'PUT', 'DELETE']) {
    const res = makeRes();
    await again({ method, url: RING }, res);

    assert.equal(res.statusCode, 405, `expected ${method} to be refused`);
    assert.deepEqual(res.body, { ok: false, reason: 'method-not-allowed' });
  }

  assert.equal(net.count, 0);
});

test('sets no-store JSON headers even on the refused path', async () => {
  setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  const res = makeRes();
  await again({ method: 'GET', url: RING }, res);

  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('answers 200 once the second alert is posted', async () => {
  setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  const res = makeRes();
  await again({ method: 'POST', url: RING }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(net.count, 1);
});

test('sends a louder second alert, not a repeat of the first', async () => {
  setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  await again({ method: 'POST', url: RING }, makeRes());

  const content = net.calls[0].json.content;
  assert.ok(content.startsWith('**Still at the door.**'));
  assert.ok(content.includes(CLAIM_EMOJI));
  assert.notEqual(content, doorMessage());
});

test('carries the configured mention through to the second alert', async () => {
  setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK, DISCORD_ALERT_MENTION: '<@&42>' });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  await again({ method: 'POST', url: RING }, makeRes());

  const sent = net.calls[0].json;
  assert.ok(sent.content.startsWith('<@&42> '));
  assert.deepEqual(sent.allowed_mentions, { parse: ['roles', 'everyone'] });
});

test('answers 502 when the webhook is not configured', async () => {
  setEnv({ DOOR_KEY });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  const res = makeRes();
  await again({ method: 'POST', url: RING }, res);

  // The page shows "Try once more" on a non-2xx, which is the honest state.
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { ok: false });
  assert.equal(net.count, 0);
});

test('answers 502 when Discord rejects the second alert', async () => {
  setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK });
  net = stubFetch(() => discordReply({ status: 429, text: 'Too Many Requests' }));

  const res = makeRes();
  await again({ method: 'POST', url: RING }, res);

  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { ok: false });
});

test('refuses to ring for a caller without the door key', async () => {
  for (const url of ['/api/again', '/api/again?k=', '/api/again?k=wrong']) {
    setEnv({ DOOR_KEY, DISCORD_WEBHOOK_URL: WEBHOOK });
    net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

    const res = makeRes();
    await again({ method: 'POST', url }, res);

    assert.equal(res.statusCode, 403, `expected ${url} to be refused`);
    assert.deepEqual(res.body, { ok: false, reason: 'forbidden' });
    assert.equal(net.count, 0, 'an unauthenticated caller must not reach Discord');
    net.restore();
    net = null;
  }
});
