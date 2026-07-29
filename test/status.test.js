const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const status = require('../api/status.js');
const { CLAIM_EMOJI } = require('../api/checkin.js');
const {
  clearEnv,
  setEnv,
  makeRes,
  stubFetch,
  discordReply,
  captureConsole,
} = require('./helpers.js');

const TOKEN = 'bot-token';
const PINNED_CHANNEL = '111222333444555666';
const GUEST_CHANNEL = '999888777666555444';
const MESSAGE_ID = '987654321098765432';

// The poller sends both ids as query parameters, so both arrive attacker-controlled.
function request({ c = '', m = '' } = {}) {
  return { method: 'GET', url: `/api/status?c=${encodeURIComponent(c)}&m=${encodeURIComponent(m)}` };
}

async function call(req, reactors = []) {
  const net = stubFetch(() => discordReply({ body: reactors }));
  const res = makeRes();
  try {
    await status(req, res);
    return { res, net };
  } finally {
    net.restore();
  }
}

let logs = null;

beforeEach(() => {
  logs = captureConsole();
});

afterEach(() => {
  logs.restore();
  logs = null;
  clearEnv();
});

test('reports not-configured, without a 500, when the bot token is missing', async () => {
  setEnv({ DISCORD_CHANNEL_ID: PINNED_CHANNEL });
  const { res, net } = await call(request({ c: PINNED_CHANNEL, m: MESSAGE_ID }));

  // A 200 keeps the waiting page polling harmlessly instead of erroring out.
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { claimed: false, reason: 'not-configured' });
  assert.equal(net.count, 0);
  assert.match(logs.lines.error.join('\n'), /DISCORD_BOT_TOKEN is not set/);
});

test('sets no-store JSON headers', async () => {
  setEnv({ DISCORD_BOT_TOKEN: TOKEN, DISCORD_CHANNEL_ID: PINNED_CHANNEL });
  const { res } = await call(request({ m: MESSAGE_ID }));

  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'no-store');
});

// The message id is interpolated straight into the Discord REST path, so the
// snowflake shape is the only thing standing between a guest's query string
// and an arbitrary API route.
const MALFORMED_IDS = [
  ['empty', ''],
  ['non-numeric', 'abcdefgh'],
  ['too short', '1234'],
  ['too long', '1'.repeat(26)],
  ['path traversal', '../../users/@me'],
  ['query injection', '123456789?limit=100'],
  ['leading sign', '+123456789'],
  ['exponent notation', '1e10000'],
  ['non-ASCII digits', '١٢٣٤٥٦'],
  ['trailing newline', '123456789\n'],
  ['inner whitespace', '12345 67890'],
];

for (const [label, messageId] of MALFORMED_IDS) {
  test(`rejects a malformed message id (${label}) with 400 before calling Discord`, async () => {
    setEnv({ DISCORD_BOT_TOKEN: TOKEN, DISCORD_CHANNEL_ID: PINNED_CHANNEL });
    const { res, net } = await call(request({ c: PINNED_CHANNEL, m: messageId }));

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { claimed: false, reason: 'bad-id' });
    assert.equal(net.count, 0);
  });
}

test('accepts the shortest and longest snowflakes the guard allows', async () => {
  setEnv({ DISCORD_BOT_TOKEN: TOKEN, DISCORD_CHANNEL_ID: PINNED_CHANNEL });

  for (const messageId of ['12345', '1'.repeat(25)]) {
    const { res, net } = await call(request({ m: messageId }));
    assert.equal(res.statusCode, 200, `expected ${messageId} to pass the guard`);
    assert.equal(net.count, 1);
  }
});

test('pins the channel to DISCORD_CHANNEL_ID and ignores the one the guest sent', async () => {
  setEnv({ DISCORD_BOT_TOKEN: TOKEN, DISCORD_CHANNEL_ID: PINNED_CHANNEL });
  const { net } = await call(request({ c: GUEST_CHANNEL, m: MESSAGE_ID }));

  assert.equal(net.count, 1);
  assert.ok(net.calls[0].url.includes(`/channels/${PINNED_CHANNEL}/`));
  assert.ok(!net.calls[0].url.includes(GUEST_CHANNEL));
});

test('still pins when the guest sends a malformed channel id', async () => {
  setEnv({ DISCORD_BOT_TOKEN: TOKEN, DISCORD_CHANNEL_ID: PINNED_CHANNEL });
  const { res, net } = await call(request({ c: '../../guilds', m: MESSAGE_ID }));

  assert.equal(res.statusCode, 200);
  assert.ok(net.calls[0].url.includes(`/channels/${PINNED_CHANNEL}/`));
});

test('falls back to the guest-supplied channel id when DISCORD_CHANNEL_ID is unset', async () => {
  // Documented weakness: with no channel pinned, this endpoint will read
  // reactions from any channel the bot can see. Pinned deployments are the
  // supported configuration; this test exists so the gap cannot change silently.
  setEnv({ DISCORD_BOT_TOKEN: TOKEN });
  const { res, net } = await call(request({ c: GUEST_CHANNEL, m: MESSAGE_ID }));

  assert.equal(res.statusCode, 200);
  assert.ok(net.calls[0].url.includes(`/channels/${GUEST_CHANNEL}/`));
});

test('rejects a malformed channel id when there is nothing pinned to fall back to', async () => {
  setEnv({ DISCORD_BOT_TOKEN: TOKEN });
  const { res, net } = await call(request({ c: 'general', m: MESSAGE_ID }));

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { claimed: false, reason: 'bad-id' });
  assert.equal(net.count, 0);
});

test('asks Discord for the claim emoji reactions with the bot credential', async () => {
  setEnv({ DISCORD_BOT_TOKEN: TOKEN, DISCORD_CHANNEL_ID: PINNED_CHANNEL });
  const { net } = await call(request({ m: MESSAGE_ID }));

  const sent = net.calls[0];
  assert.equal(
    sent.url,
    'https://discord.com/api/v10/channels/' +
      `${PINNED_CHANNEL}/messages/${MESSAGE_ID}` +
      `/reactions/${encodeURIComponent(CLAIM_EMOJI)}?limit=10`,
  );
  assert.equal(sent.headers.Authorization, `Bot ${TOKEN}`);
});

test('claims on the first human reactor, skipping the bot that seeded the emoji', async () => {
  setEnv({ DISCORD_BOT_TOKEN: TOKEN, DISCORD_CHANNEL_ID: PINNED_CHANNEL });
  const { res } = await call(request({ m: MESSAGE_ID }), [
    { bot: true, username: 'doorbot', global_name: 'Door Bot' },
    { username: 'nina', global_name: 'Nina R' },
    { username: 'omar', global_name: 'Omar T' },
  ]);

  assert.deepEqual(res.body, { claimed: true, by: 'Nina R' });
});

test('falls back to the username when a reactor has no display name', async () => {
  setEnv({ DISCORD_BOT_TOKEN: TOKEN, DISCORD_CHANNEL_ID: PINNED_CHANNEL });
  const { res } = await call(request({ m: MESSAGE_ID }), [
    { username: 'nina', global_name: null },
  ]);

  assert.deepEqual(res.body, { claimed: true, by: 'nina' });
});

test('does not claim when nobody has reacted', async () => {
  setEnv({ DISCORD_BOT_TOKEN: TOKEN, DISCORD_CHANNEL_ID: PINNED_CHANNEL });
  const { res } = await call(request({ m: MESSAGE_ID }), []);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { claimed: false });
});

test('does not claim when only bots have reacted', async () => {
  setEnv({ DISCORD_BOT_TOKEN: TOKEN, DISCORD_CHANNEL_ID: PINNED_CHANNEL });
  const { res } = await call(request({ m: MESSAGE_ID }), [
    { bot: true, username: 'doorbot' },
  ]);

  assert.deepEqual(res.body, { claimed: false });
});

test('does not throw when Discord answers 200 with an object instead of a list', async () => {
  setEnv({ DISCORD_BOT_TOKEN: TOKEN, DISCORD_CHANNEL_ID: PINNED_CHANNEL });
  const { res } = await call(request({ m: MESSAGE_ID }), { message: 'Unknown Message', code: 10008 });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { claimed: false });
});

test('reports discord-error, and logs the status, when Discord refuses the read', async () => {
  setEnv({ DISCORD_BOT_TOKEN: TOKEN, DISCORD_CHANNEL_ID: PINNED_CHANNEL });

  const net = stubFetch(() => discordReply({ status: 403, text: 'Missing Access' }));
  const res = makeRes();
  await status(request({ m: MESSAGE_ID }), res);
  net.restore();

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { claimed: false, reason: 'discord-error' });
  assert.match(logs.lines.error.join('\n'), /403 Missing Access/);
});

test('reports unreachable instead of throwing when the network fails', async () => {
  setEnv({ DISCORD_BOT_TOKEN: TOKEN, DISCORD_CHANNEL_ID: PINNED_CHANNEL });

  const net = stubFetch(() => {
    throw new TypeError('fetch failed');
  });
  const res = makeRes();
  await status(request({ m: MESSAGE_ID }), res);
  net.restore();

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { claimed: false, reason: 'unreachable' });
});
