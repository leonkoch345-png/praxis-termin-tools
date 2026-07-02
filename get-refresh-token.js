// One-time helper: run locally to obtain a Google OAuth refresh token
// for the Google account whose Calendar the assistant should manage.
//
// Usage:
//   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node get-refresh-token.js
//
// Prerequisites (Google Cloud Console):
//   1. Create/select a project, enable the "Google Calendar API".
//   2. Create an OAuth client ID of type "Desktop app".
//   3. Under "OAuth consent screen", add the Google account you'll
//      authorize with as a "Test user" (unless the app is published).

const http = require('http');
const { URL } = require('url');
const { google } = require('googleapis');

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
const REDIRECT_URI = 'http://localhost:3456/oauth2callback';

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars first.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/calendar'],
});

console.log('\nOeffne diese URL im Browser und melde dich mit dem Google-Konto an,\ndessen Kalender der Assistant verwalten soll:\n');
console.log(authUrl);
console.log('\nWarte auf Autorisierung...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== '/oauth2callback') {
    res.end('OK');
    return;
  }
  const code = url.searchParams.get('code');
  res.end('Autorisierung erhalten, du kannst dieses Fenster schliessen.');
  server.close();

  const { tokens } = await oauth2Client.getToken(code);
  console.log('\nRefresh Token (sicher aufbewahren, wird im Server als GOOGLE_REFRESH_TOKEN gebraucht):\n');
  console.log(tokens.refresh_token);
  console.log('');
  process.exit(0);
});

server.listen(3456);
