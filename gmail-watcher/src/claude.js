const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = 'あなたはECサイトのメール解析アシスタントです。注文・発送・要対応メールを正確に分類し、商品情報を抽出してください。';

const PARSE_EMAIL_TOOL = {
  name: 'parse_order_email',
  description: 'ECサイトのメールを解析して種別と商品情報を返す',
  input_schema: {
    type: 'object',
    properties: {
      email_type:    { type: 'string', enum: ['ordered', 'shipped', 'action_required', 'other'] },
      item_name:     { type: 'string', description: '商品名' },
      ordered_at:    { type: 'string', description: '注文日 YYYY-MM-DD' },
      expected_at:   { type: 'string', description: 'お届け予定日 YYYY-MM-DD' },
      action_reason: { type: 'string', description: '要対応の理由（action_requiredの場合）' },
    },
    required: ['email_type', 'item_name'],
  },
};

const MATCH_SLACK_POST_TOOL = {
  name: 'match_slack_post',
  description: '注文商品名とSlack投稿リストを照合して最も近いものを返す',
  input_schema: {
    type: 'object',
    properties: {
      best_match: { type: 'string', description: '最も近いSlack投稿テキスト。該当なしはnull' },
    },
    required: ['best_match'],
  },
};

/**
 * @param {string} subject
 * @param {string} body
 * @returns {Promise<import('../../docs/interfaces').ParsedEmail>}
 */
async function parseEmail(subject, body) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [PARSE_EMAIL_TOOL],
    tool_choice: { type: 'tool', name: 'parse_order_email' },
    messages: [
      {
        role: 'user',
        content: `件名: ${subject}\n\n本文:\n${body}`,
      },
    ],
  });

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  return toolUse.input;
}

/**
 * @param {string} orderItem
 * @param {string[]} slackPosts
 * @returns {Promise<string|null>}
 */
async function matchSlackPost(orderItem, slackPosts) {
  if (slackPosts.length === 0) return null;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    tools: [MATCH_SLACK_POST_TOOL],
    tool_choice: { type: 'tool', name: 'match_slack_post' },
    messages: [
      {
        role: 'user',
        content: `注文商品: ${orderItem}\n\nSlackの未完了投稿一覧:\n${slackPosts.join('\n')}\n\n最も近い投稿を1つ選んでください。該当なしの場合はnullを返してください。`,
      },
    ],
  });

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  return toolUse.input.best_match ?? null;
}

module.exports = { parseEmail, matchSlackPost };
