const { alertDiscord, CLAIM_EMOJI } = require('./checkin.js');

// Fired from the waiting page after two minutes with no claim. Deliberately
// louder than the first alert: the first one was missed, so repeating it in the
// same voice would most likely be missed the same way.
//
// Key-gated like the tap itself. Without it this is an unauthenticated endpoint
// that posts into a Discord channel, which is a spam button for anyone who
// finds it.
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'method-not-allowed' });
  }

  const doorKey = process.env.DOOR_KEY;
  const url = new URL(req.url || '/', 'http://localhost');
  if (!doorKey || url.searchParams.get('k') !== doorKey) {
    return res.status(403).json({ ok: false, reason: 'forbidden' });
  }

  const message = await alertDiscord(
    [
      '**Still at the door.**',
      'Someone tapped a couple of minutes ago and nobody has come down yet.',
      `React with ${CLAIM_EMOJI} if you are going.`,
    ].join('\n'),
  );

  return res.status(message ? 200 : 502).json({ ok: Boolean(message) });
};
