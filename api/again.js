const { alertDiscord, CLAIM_EMOJI } = require('./checkin.js');

// Fired from the waiting page after two minutes with no claim. Deliberately
// louder than the first alert: the first one was missed, so repeating it in the
// same voice would most likely be missed the same way.
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'method-not-allowed' });
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
