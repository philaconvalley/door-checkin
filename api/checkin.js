const DISCORD_INVITE_URL = 'https://discord.gg/rjYcUgfTV';

const LANDING_PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>You're checked in</title>
<style>
  body { font-family: sans-serif; text-align: center; padding: 60px 20px; background: #111; color: #fff; }
  a { display: inline-block; margin-top: 24px; padding: 14px 28px; background: #5865F2; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; }
</style>
</head>
<body>
<h1>You're checked in.</h1>
<p>Welcome to PhilaCon Valley.</p>
<a href="${DISCORD_INVITE_URL}">Join our Discord</a>
</body>
</html>`;

module.exports = async (req, res) => {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Someone just tapped in at the door!' }),
      });
    } catch (err) {
      console.error('Discord webhook post failed:', err);
    }
  }

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(LANDING_PAGE);
};
