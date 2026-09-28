const json = (response, status, body) => response.status(status).json(body);
const rest = (path) => `${process.env.SUPABASE_URL}/rest/v1/${path}`;

async function supabaseRequest(path, options = {}) {
  const response = await fetch(rest(path), {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SECRET_KEY,
      authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Supabase respondeu ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
async function reserve(event, channel, scheduledFor) {
  const rows = await supabaseRequest('notification_logs', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ event_id: event.id, user_id: event.user_id, channel, scheduled_for: new Date(scheduledFor).toISOString() }),
  });
  return rows?.length > 0;
}
async function unreserve(event, channel, scheduledFor) {
  const query = new URLSearchParams({ event_id: `eq.${event.id}`, channel: `eq.${channel}`, scheduled_for: `eq.${new Date(scheduledFor).toISOString()}` });
  await supabaseRequest(`notification_logs?${query}`, { method: 'DELETE' });
}
async function sendEmail(event, profile) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !profile.email) return false;
  const when = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.starts_at));
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [profile.email], subject: `Lembrete: ${event.title}`, html: `<p>Olá!</p><p><strong>${escapeHtml(event.title)}</strong> começa em breve.</p><p>${when}</p>${event.notes ? `<p>${escapeHtml(event.notes)}</p>` : ''}` }) });
  if (!response.ok) throw new Error(`Resend respondeu ${response.status}`); return true;
}
async function sendSms(event, profile) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM || !profile.phone) return false;
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const body = new URLSearchParams({ To: profile.phone, From: process.env.TWILIO_FROM, Body: `Moletas: ${event.title} começa em breve.` });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, { method: 'POST', headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) throw new Error(`Twilio respondeu ${response.status}`); return true;
}

module.exports = async (request, response) => {
  if (request.method !== 'GET') return json(response, 405, { error: 'Method not allowed' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return json(response, 500, { error: 'Supabase server credentials missing' });
  if (process.env.CRON_SECRET && request.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return json(response, 401, { error: 'Unauthorized' });
  try {
    const now = Date.now(); const from = new Date(now - 6 * 60 * 1000).toISOString(); const to = new Date(now + 24 * 60 * 60 * 1000 + 6 * 60 * 1000).toISOString();
    const query = new URLSearchParams({ select: 'id,user_id,title,starts_at,reminder_minutes,notes,profiles(email,email_notifications,sms_notifications,phone)', reminder_minutes: 'gt.0', starts_at: `gte.${from}` });
    query.append('starts_at', `lte.${to}`);
    const events = await supabaseRequest(`calendar_events?${query}`);
    const result = { checked: events.length, email: 0, sms: 0, skipped: 0, failures: 0 };
    for (const event of events) {
      const reminderAt = new Date(event.starts_at).getTime() - event.reminder_minutes * 60 * 1000;
      if (reminderAt > now || reminderAt < now - 6 * 60 * 1000) { result.skipped += 1; continue; }
      const profile = event.profiles; if (!profile) { result.skipped += 1; continue; }
      for (const channel of ['email', 'sms']) {
        if ((channel === 'email' && !profile.email_notifications) || (channel === 'sms' && !profile.sms_notifications)) continue;
        const claimed = await reserve(event, channel, reminderAt); if (!claimed) { result.skipped += 1; continue; }
        try { const sent = channel === 'email' ? await sendEmail(event, profile) : await sendSms(event, profile); if (sent) result[channel] += 1; else result.skipped += 1; }
        catch (error) { await unreserve(event, channel, reminderAt); result.failures += 1; console.error('Reminder delivery failed', { eventId: event.id, channel, message: error.message }); }
      }
    }
    return json(response, 200, result);
  } catch (error) { console.error('Reminder job failed', { message: error.message }); return json(response, 500, { error: 'Reminder job failed' }); }
};
