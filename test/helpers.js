// Shared stand-ins for the two things the handlers touch that a test process
// does not have: a Vercel response object and the network.

// Every env var the three handlers read. Cleared between tests so a test can
// never inherit configuration from the one before it.
const ENV_KEYS = [
  'DOOR_KEY',
  'DISCORD_WEBHOOK_URL',
  'DISCORD_ALERT_MENTION',
  'DISCORD_CHANNEL_ID',
  'DISCORD_BOT_TOKEN',
];

// The tag's key, and the tapped URL that carries it. Anything without this is
// treated as a crawler, so almost every ringing test needs both.
const DOOR_KEY = 'test-door-key';
const TAP = `/?k=${DOOR_KEY}`;

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

function setEnv(vars) {
  clearEnv();
  for (const [key, value] of Object.entries(vars)) process.env[key] = value;
}

// Records what the handler wrote instead of writing it to a socket. Only the
// four methods the handlers actually call are implemented, so a handler that
// starts using something else fails loudly rather than silently passing.
function makeRes() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

// Swaps globalThis.fetch and records every call, so assertions can inspect the
// request the handler built (URL, method, headers, body) without a network.
function stubFetch(impl) {
  const original = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init = {}) => {
    const call = {
      url: String(input),
      method: init.method || 'GET',
      headers: init.headers || {},
      body: init.body,
      get json() {
        return JSON.parse(init.body);
      },
    };
    calls.push(call);
    return impl(call);
  };

  return {
    calls,
    get count() {
      return calls.length;
    },
    restore() {
      globalThis.fetch = original;
    },
  };
}

// A Discord-shaped reply. The handlers only ever read ok/status/json/text.
function discordReply({ status = 200, body = {}, text } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
    async text() {
      return text === undefined ? JSON.stringify(body) : text;
    },
  };
}

// The handlers log to console on every failure path. Capturing keeps the test
// output readable and lets a test assert on the operator-facing message.
function captureConsole() {
  const original = { error: console.error, log: console.log };
  const lines = { error: [], log: [] };

  console.error = (...args) => lines.error.push(args.join(' '));
  console.log = (...args) => lines.log.push(args.join(' '));

  return {
    lines,
    restore() {
      console.error = original.error;
      console.log = original.log;
    },
  };
}

module.exports = {
  clearEnv,
  setEnv,
  makeRes,
  stubFetch,
  discordReply,
  captureConsole,
  DOOR_KEY,
  TAP,
};
