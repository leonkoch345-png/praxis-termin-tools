const express = require('express');
const { google } = require('googleapis');

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  CALENDAR_ID = 'primary',
  PORT = 3000,
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
  console.error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN env vars.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

const app = express();
app.use(express.json());

function eventSummaryLine(event) {
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;
  return `eventId=${event.id} | "${event.summary}" | ${start} - ${end}`;
}

async function findAppointments({ name, timeMin, timeMax }) {
  if (!name) throw new Error("Parameter 'name' ist erforderlich.");
  const now = new Date().toISOString();
  const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    q: name,
    timeMin: timeMin || now,
    timeMax: timeMax || in90Days,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 10,
  });

  const items = res.data.items || [];
  if (items.length === 0) {
    return 'Keine passenden Termine gefunden.';
  }
  return items.map(eventSummaryLine).join('\n');
}

async function cancelAppointment({ eventId }) {
  if (!eventId) throw new Error("Parameter 'eventId' ist erforderlich.");
  await calendar.events.delete({ calendarId: CALENDAR_ID, eventId });
  return `Termin ${eventId} wurde storniert.`;
}

async function rescheduleAppointment({ eventId, newStartDateTime, newEndDateTime, timeZone }) {
  if (!eventId || !newStartDateTime || !newEndDateTime) {
    throw new Error("Parameter 'eventId', 'newStartDateTime' und 'newEndDateTime' sind erforderlich.");
  }
  const res = await calendar.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: {
      start: { dateTime: newStartDateTime, timeZone: timeZone || 'Europe/Berlin' },
      end: { dateTime: newEndDateTime, timeZone: timeZone || 'Europe/Berlin' },
    },
  });
  return `Termin verschoben auf ${res.data.start.dateTime}.`;
}

const handlers = {
  findAppointments,
  cancelAppointment,
  rescheduleAppointment,
};

app.post('/vapi/tools', async (req, res) => {
  const toolCallList = req.body?.message?.toolCallList || [];
  console.log('Incoming toolCallList:', JSON.stringify(toolCallList));
  const results = [];

  for (const toolCall of toolCallList) {
    const name = toolCall.name || toolCall.function?.name;
    const rawArgs = toolCall.arguments ?? toolCall.function?.arguments;
    const handler = handlers[name];
    let result;
    try {
      if (!handler) throw new Error(`Unbekanntes Tool: ${name}`);
      const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
      result = await handler(args || {});
    } catch (err) {
      result = `Fehler: ${err.message}`;
    }
    results.push({ toolCallId: toolCall.id, result });
  }

  res.json({ results });
});

app.get('/health', (req, res) => res.send('ok'));

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
