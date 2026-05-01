const { createAuthClient, fetchShoppingEmails } = require('./gmail');
const { parseEmail, matchSlackPost } = require('./claude');
const { getPendingPosts, addReaction, postThreadMessage } = require('./slack');
const { findOrderByGmailThreadId, createOrder, updateOrder, isAlreadyProcessed } = require('./firestore');

/**
 * @param {string|null} expectedAt YYYY-MM-DD
 * @returns {string}
 */
function formatExpectedAt(expectedAt) {
  if (!expectedAt) return 'お届け日は追ってご確認を';
  const d = new Date(expectedAt);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日届く予定`;
}

/**
 * @param {import('../../docs/interfaces').Email} email
 * @param {import('../../docs/interfaces').ParsedEmail} parsed
 * @returns {Promise<void>}
 */
async function handleOrderedEmail(email, parsed) {
  const channelId = process.env.SHOPPING_CHANNEL_ID;
  const pendingPosts = await getPendingPosts(channelId);
  const postTexts = pendingPosts.map((p) => p.text);
  const matchedText = await matchSlackPost(parsed.item_name, postTexts);

  const matchedPost = matchedText ? pendingPosts.find((p) => p.text === matchedText) : null;

  if (matchedPost) {
    await addReaction(channelId, matchedPost.ts, 'white_check_mark');
    await postThreadMessage(channelId, matchedPost.ts, `注文確認したよ📦 ${formatExpectedAt(parsed.expected_at)}`);
  }

  await createOrder({
    slack_ts: matchedPost?.ts ?? null,
    slack_channel: channelId,
    item_name: parsed.item_name,
    status: 'ordered',
    ordered_at: parsed.ordered_at ?? null,
    expected_at: parsed.expected_at ?? null,
    gmail_thread_id: email.threadId,
    notified_at: null,
  });
}

/**
 * @param {import('../../docs/interfaces').Email} email
 * @param {import('../../docs/interfaces').ParsedEmail} parsed
 * @returns {Promise<void>}
 */
async function handleShippedEmail(email, parsed) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await findOrderByGmailThreadId(email.threadId);

  if (existing) {
    if (existing.notified_at === today) return;

    await postThreadMessage(existing.slack_channel, existing.slack_ts, `発送されたよ🚚 ${formatExpectedAt(parsed.expected_at)}`);
    await updateOrder(existing._id, {
      status: 'shipped',
      expected_at: parsed.expected_at ?? existing.expected_at,
      notified_at: today,
    });
  } else {
    await createOrder({
      slack_ts: null,
      slack_channel: process.env.SHOPPING_CHANNEL_ID,
      item_name: parsed.item_name,
      status: 'shipped',
      ordered_at: null,
      expected_at: parsed.expected_at ?? null,
      gmail_thread_id: email.threadId,
      notified_at: today,
    });
  }
}

/**
 * @param {import('../../docs/interfaces').Email} email
 * @param {import('../../docs/interfaces').ParsedEmail} parsed
 * @returns {Promise<void>}
 */
async function handleActionRequiredEmail(email, parsed) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await findOrderByGmailThreadId(email.threadId);
  if (!existing) return;

  await postThreadMessage(existing.slack_channel, existing.slack_ts, `⚠️ 対応が必要だよ！${parsed.action_reason}`);
  await updateOrder(existing._id, { status: 'action_required', notified_at: today });
}

/**
 * @returns {Promise<void>}
 */
async function checkGmailAndNotify() {
  const auth = createAuthClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const emails = await fetchShoppingEmails(auth, since);

  for (const email of emails) {
    try {
      if (await isAlreadyProcessed(email.threadId)) continue;

      const parsed = await parseEmail(email.subject, email.body);

      if (parsed.email_type === 'ordered') {
        await handleOrderedEmail(email, parsed);
      } else if (parsed.email_type === 'shipped') {
        await handleShippedEmail(email, parsed);
      } else if (parsed.email_type === 'action_required') {
        await handleActionRequiredEmail(email, parsed);
      }
    } catch (err) {
      console.error(`Failed to process email ${email.id}:`, err);
    }
  }
}

module.exports = { checkGmailAndNotify, handleOrderedEmail, handleShippedEmail, handleActionRequiredEmail };
