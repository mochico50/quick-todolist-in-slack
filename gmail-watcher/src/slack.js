const { WebClient } = require('@slack/web-api');

const HISTORY_DAYS = 14;

/**
 * @param {string} channelId
 * @returns {Promise<import('../../docs/interfaces').SlackPost[]>}
 */
async function getPendingPosts(channelId) {
  const client = new WebClient(process.env.SLACK_BOT_TOKEN);
  const oldest = (Date.now() / 1000 - HISTORY_DAYS * 86400).toString();

  const res = await client.conversations.history({ channel: channelId, oldest });
  const messages = res.messages ?? [];

  return messages
    .filter((m) => {
      if (m.subtype === 'bot_message') return false;
      if (m.text?.startsWith('/')) return false;
      const reactions = m.reactions ?? [];
      const hasCheckmark = reactions.some((r) => r.name === 'white_check_mark');
      const hasX = reactions.some((r) => r.name === 'x');
      return !hasCheckmark && !hasX;
    })
    .map((m) => ({ ts: m.ts, text: m.text, channel: channelId }));
}

/**
 * @param {string} channelId
 * @param {string} ts
 * @param {string} reactionName
 * @returns {Promise<void>}
 */
async function addReaction(channelId, ts, reactionName) {
  const client = new WebClient(process.env.SLACK_BOT_TOKEN);
  await client.reactions.add({ channel: channelId, timestamp: ts, name: reactionName });
}

/**
 * @param {string} channelId
 * @param {string} threadTs
 * @param {string} text
 * @returns {Promise<void>}
 */
async function postThreadMessage(channelId, threadTs, text) {
  const client = new WebClient(process.env.SLACK_BOT_TOKEN);
  await client.chat.postMessage({ channel: channelId, thread_ts: threadTs, text });
}

module.exports = { getPendingPosts, addReaction, postThreadMessage };
