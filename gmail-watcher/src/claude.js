const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * @param {string} subject
 * @param {string} body
 * @returns {Promise<import('../../docs/interfaces').ParsedEmail>}
 */
async function parseEmail(subject, body) {
  throw new Error('not implemented');
}

/**
 * @param {string} orderItem
 * @param {string[]} slackPosts
 * @returns {Promise<string|null>}
 */
async function matchSlackPost(orderItem, slackPosts) {
  throw new Error('not implemented');
}

module.exports = { parseEmail, matchSlackPost };
