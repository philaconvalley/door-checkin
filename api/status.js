const { CLAIM_EMOJIS } = require('./checkin.js');

const SNOWFLAKE = /^\d{5,25}$/;
const DISCORD = 'https://discord.com/api/v10';

// The message and channel ids travel through the guest's browser, so they are
// attacker-controlled by the time they get here. Without the channel allowlist
// this endpoint would happily read reactions from any channel the bot can see.
function allowedChannel(requested) {
  const configured = process.env.DISCORD_CHANNEL_ID;
  if (configured) return configured;
  return SNOWFLAKE.test(requested) ? requested : null;
}

function authHeaders() {
  return { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` };
}

// Two calls, but only when somebody has actually reacted. Reading the message
// shows which emoji are present without naming anyone; the per-emoji call that
// names the claimer only runs once a claim exists. Polling an unclaimed door
// therefore costs exactly one request, the same as before.
async function findClaim(channelId, messageId) {
  const res = await fetch(`${DISCORD}/channels/${channelId}/messages/${messageId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    console.error('Discord message read failed:', res.status, await res.text());
    return { error: 'discord-error' };
  }

  const message = await res.json();
  const reactions = Array.isArray(message.reactions) ? message.reactions : [];
  const hit = reactions.find(
    (r) => r.count > 0 && r.emoji && CLAIM_EMOJIS.includes(r.emoji.name),
  );
  if (!hit) return { claimed: false };

  const who = await fetch(
    `${DISCORD}/channels/${channelId}/messages/${messageId}` +
      `/reactions/${encodeURIComponent(hit.emoji.name)}?limit=10`,
    { headers: authHeaders() },
  );
  if (!who.ok) {
    console.error('Discord reactions read failed:', who.status, await who.text());
    return { error: 'discord-error' };
  }

  const reactors = await who.json();
  const human = Array.isArray(reactors) ? reactors.find((u) => !u.bot) : null;
  if (!human) return { claimed: false };

  return { claimed: true, by: human.global_name || human.username };
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (!process.env.DISCORD_BOT_TOKEN) {
    console.error('DISCORD_BOT_TOKEN is not set — the acknowledgment loop is inert.');
    return res.status(200).json({ claimed: false, reason: 'not-configured' });
  }

  const url = new URL(req.url, 'http://localhost');
  const messageId = url.searchParams.get('m') || '';
  const channelId = allowedChannel(url.searchParams.get('c') || '');

  if (!SNOWFLAKE.test(messageId) || !channelId) {
    return res.status(400).json({ claimed: false, reason: 'bad-id' });
  }

  try {
    const result = await findClaim(channelId, messageId);
    if (result.error) return res.status(200).json({ claimed: false, reason: result.error });
    return res.status(200).json(result);
  } catch (err) {
    console.error('Discord read threw:', err);
    return res.status(200).json({ claimed: false, reason: 'unreachable' });
  }
};
