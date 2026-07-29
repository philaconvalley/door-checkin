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
  setEnv({});
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
  setEnv({ DISCORD_WEBHOOK_URL: WEBHOOK });
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
  setEnv({ DISCORD_WEBHOOK_URL: WEBHOOK });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  await alertDiscord('door');

  assert.equal(net.calls[0].method, 'POST');
  assert.equal(net.calls[0].headers['Content-Type'], 'application/json');
});

test('alertDiscord suppresses mentions when DISCORD_ALERT_MENTION is unset', async () => {
  setEnv({ DISCORD_WEBHOOK_URL: WEBHOOK });
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
  setEnv({ DISCORD_WEBHOOK_URL: WEBHOOK });
  net = stubFetch(() => discordReply({ status: 401, text: 'Unauthorized' }));

  assert.equal(await alertDiscord('door'), null);
  assert.match(logs.lines.error.join('\n'), /401/);
});

test('alertDiscord returns null instead of throwing when the network fails', async () => {
  setEnv({ DISCORD_WEBHOOK_URL: WEBHOOK });
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
  setEnv({ DISCORD_WEBHOOK_URL: WEBHOOK, DISCORD_CHANNEL_ID: SENT_MESSAGE.channel_id });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  const res = makeRes();
  await checkin({ method: 'GET', url: '/' }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.ok(res.body.includes("We've told them."));
  assert.ok(res.body.includes(`const MESSAGE = "${SENT_MESSAGE.id}"`));
  assert.ok(res.body.includes(`const CHANNEL = "${SENT_MESSAGE.channel_id}"`));
});

test('the handler does not claim anyone was told when Discord could not be reached', async () => {
  setEnv({});
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  const res = makeRes();
  await checkin({ method: 'GET', url: '/' }, res);

  // Still a 200 page: the guest is standing at a locked door either way.
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes("We couldn't reach anyone."));
  // An empty message id is what stops the page from starting the poll loop.
  assert.ok(res.body.includes('const MESSAGE = ""'));
});

test('the handler tells the operator which channel to pin when one is not configured', async () => {
  setEnv({ DISCORD_WEBHOOK_URL: WEBHOOK });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  await checkin({ method: 'GET', url: '/' }, makeRes());

  assert.match(
    logs.lines.log.join('\n'),
    new RegExp(`Set DISCORD_CHANNEL_ID to ${SENT_MESSAGE.channel_id}`),
  );
});

test('the handler stays quiet about the channel once it is configured', async () => {
  setEnv({ DISCORD_WEBHOOK_URL: WEBHOOK, DISCORD_CHANNEL_ID: SENT_MESSAGE.channel_id });
  net = stubFetch(() => discordReply({ body: SENT_MESSAGE }));

  await checkin({ method: 'GET', url: '/' }, makeRes());

  assert.equal(logs.lines.log.length, 0);
});
