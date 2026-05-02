const { getPendingPosts, addReaction, postThreadMessage } = require('../shopping-watcher/src/slack');

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn(),
}));

const { WebClient } = require('@slack/web-api');

let mockHistory, mockAdd, mockPostMessage;

beforeEach(() => {
  jest.clearAllMocks();
  mockHistory = jest.fn();
  mockAdd = jest.fn();
  mockPostMessage = jest.fn();
  WebClient.mockImplementation(() => ({
    conversations: { history: mockHistory },
    reactions: { add: mockAdd },
    chat: { postMessage: mockPostMessage },
  }));
});

// ─────────────────────────────────────────────
// getPendingPosts
// ─────────────────────────────────────────────

describe('getPendingPosts', () => {
  test('✅・❌なしの投稿だけ返す', async () => {
    // Given: ✅あり・❌あり・リアクションなしの3件
    mockHistory.mockResolvedValue({
      ok: true,
      messages: [
        { ts: '1', text: '洗剤', reactions: [{ name: 'white_check_mark', count: 1 }] },
        { ts: '2', text: 'トイレットペーパー', reactions: [{ name: 'x', count: 1 }] },
        { ts: '3', text: 'シャンプー' },
      ],
    });

    // When
    const posts = await getPendingPosts('C123');

    // Then
    expect(posts).toHaveLength(1);
    expect(posts[0].ts).toBe('3');
    expect(posts[0].text).toBe('シャンプー');
  });

  test('Bot投稿（subtype: bot_message）を除外する', async () => {
    // Given
    mockHistory.mockResolvedValue({
      ok: true,
      messages: [
        { ts: '1', text: '注文確認したよ📦', subtype: 'bot_message' },
        { ts: '2', text: 'シャンプー' },
      ],
    });

    // When
    const posts = await getPendingPosts('C123');

    // Then
    expect(posts).toHaveLength(1);
    expect(posts[0].ts).toBe('2');
  });

  test('スラッシュコマンド（/で始まる）を除外する', async () => {
    // Given
    mockHistory.mockResolvedValue({
      ok: true,
      messages: [
        { ts: '1', text: '/todo 牛乳' },
        { ts: '2', text: '牛乳' },
      ],
    });

    // When
    const posts = await getPendingPosts('C123');

    // Then
    expect(posts).toHaveLength(1);
    expect(posts[0].ts).toBe('2');
  });

  test('メッセージが0件のとき空配列を返す', async () => {
    // Given
    mockHistory.mockResolvedValue({ ok: true, messages: [] });

    // When
    const posts = await getPendingPosts('C123');

    // Then
    expect(posts).toEqual([]);
  });

  test('channelId をそのまま結果に含む', async () => {
    // Given
    mockHistory.mockResolvedValue({
      ok: true,
      messages: [{ ts: '1', text: '野菜' }],
    });

    // When
    const posts = await getPendingPosts('C456');

    // Then
    expect(posts[0].channel).toBe('C456');
  });
});

// ─────────────────────────────────────────────
// addReaction
// ─────────────────────────────────────────────

describe('addReaction', () => {
  test('Slack reactions.add を正しいパラメータで呼ぶ', async () => {
    // Given
    mockAdd.mockResolvedValue({ ok: true });

    // When
    await addReaction('C123', '1234567890.123456', 'white_check_mark');

    // Then
    expect(mockAdd).toHaveBeenCalledWith({
      channel: 'C123',
      timestamp: '1234567890.123456',
      name: 'white_check_mark',
    });
  });
});

// ─────────────────────────────────────────────
// postThreadMessage
// ─────────────────────────────────────────────

describe('postThreadMessage', () => {
  test('Slack chat.postMessage をスレッド指定で呼ぶ', async () => {
    // Given
    mockPostMessage.mockResolvedValue({ ok: true });

    // When
    await postThreadMessage('C123', '1234567890.123456', '注文確認したよ📦 5月3日届く予定');

    // Then
    expect(mockPostMessage).toHaveBeenCalledWith({
      channel: 'C123',
      thread_ts: '1234567890.123456',
      text: '注文確認したよ📦 5月3日届く予定',
      reply_broadcast: false,
    });
  });

  test('broadcast=true のとき reply_broadcast: true で呼ぶ', async () => {
    // Given
    mockPostMessage.mockResolvedValue({ ok: true });

    // When
    await postThreadMessage('C123', '1234567890.123456', '⚠️ 対応が必要だよ！', true);

    // Then
    expect(mockPostMessage).toHaveBeenCalledWith({
      channel: 'C123',
      thread_ts: '1234567890.123456',
      text: '⚠️ 対応が必要だよ！',
      reply_broadcast: true,
    });
  });
});
