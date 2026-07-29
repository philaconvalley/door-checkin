const { CLAIM_EMOJI } = require('./checkin.js');

const SNOWFLAKE = /^\d{5,25}$/;

// The message and channel ids travel through the guest's browser, so they are
// attacker-controlled by the time they get here. Without the channel allowlist
// this endpoint would happily read reactions from any channel the bot can see.
function allowedChannel(requested) {
  const configured = process.env.DISCORD_CHANNEL_ID;
  if (configured) return configured;
  return SNOWFLAKE.test(requested) ? requested : null;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.error('DISCORD_BOT_TOKEN is not set — the acknowledgment loop is inert.');
    return res.status(200).json({ claimed: false, reason: 'not-configured' });
  }

  const url = new URL(req.url, 'http://localhost');
  const messageId = url.searchParams.get('m') || '';
  const channelId = allowedChannel(url.searchParams.get('c') || '');

  if (!SNOWFLAKE.test(messageId) || !channelId) {
    return res.status(400).json({ claimed: false, reason: 'bad-id' });
  }

  const endpoint =
    `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}` +
    `/reactions/${encodeURIComponent(CLAIM_EMOJI)}?limit=10`;

  try {
    const discord = await fetch(endpoint, {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!discord.ok) {
      // 401/403 means the token or the bot's channel permissions are wrong —
      // worth shouting about, since the page fails silently otherwise.
      console.error('Discord reactions read failed:', discord.status, await discord.text());
      return res.status(200).json({ claimed: false, reason: 'discord-error' });
    }

    const reactors = await discord.json();
    const human = Array.isArray(reactors) ? reactors.find((u) => !u.bot) : null;

    if (!human) return res.status(200).json({ claimed: false });

    return res.status(200).json({
      claimed: true,
      by: human.global_name || human.username,
    });
  } catch (err) {
    console.error('Discord reactions read threw:', err);
    return res.status(200).json({ claimed: false, reason: 'unreachable' });
  }
};
