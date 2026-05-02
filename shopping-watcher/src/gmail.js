const { google } = require('googleapis');

const GMAIL_QUERY = 'subject:(注文 OR ご注文 OR 発送 OR お届け OR ご購入 OR 出荷 OR キャンセル) -subject:マックデリバリー';

/**
 * @returns {import('googleapis').Auth.OAuth2Client}
 */
function createAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return client;
}

function decodeBase64(data) {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function extractBody(payload) {
  if (payload.parts) {
    const textPart = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) return decodeBase64(textPart.body.data);
  }
  if (payload.body?.data) return decodeBase64(payload.body.data);
  return '';
}

/**
 * @param {import('googleapis').Auth.OAuth2Client} auth
 * @param {Date} since
 * @returns {Promise<import('../../docs/interfaces').Email[]>}
 */
async function fetchShoppingEmails(auth, since) {
  const gmail = google.gmail({ version: 'v1', auth });
  const afterTimestamp = Math.floor(since.getTime() / 1000);
  const q = `${GMAIL_QUERY} after:${afterTimestamp}`;

  const listRes = await gmail.users.messages.list({ userId: 'me', q });
  const MAX_EMAILS_PER_RUN = 20;
  const messages = (listRes.data.messages ?? []).slice(0, MAX_EMAILS_PER_RUN);
  if (messages.length === 0) return [];

  const emails = await Promise.all(
    messages.map(async ({ id, threadId }) => {
      const msgRes = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
      const { payload, internalDate } = msgRes.data;
      const subject = payload.headers.find((h) => h.name === 'Subject')?.value ?? '';
      const body = extractBody(payload);
      return { id, threadId, subject, body, receivedAt: new Date(Number(internalDate)) };
    })
  );

  return emails;
}

module.exports = { createAuthClient, fetchShoppingEmails };
