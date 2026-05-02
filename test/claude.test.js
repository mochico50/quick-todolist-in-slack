const { parseEmail, matchSlackPost } = require('../shopping-watcher/src/claude');

// Claude APIをモック
jest.mock('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn();
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
});

const Anthropic = require('@anthropic-ai/sdk');

function getMockCreate() {
  return Anthropic.mock.results[0].value.messages.create;
}

// tool_useレスポンスを組み立てるヘルパー
function makeToolUseResponse(toolName, input) {
  return {
    content: [{ type: 'tool_use', name: toolName, input }],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Anthropicコンストラクタが毎回新しいmockCreateを持つように再初期化
  const mockCreate = jest.fn();
  Anthropic.mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
});

// ─────────────────────────────────────────────
// parseEmail
// ─────────────────────────────────────────────

describe('parseEmail', () => {
  describe('注文確認メール（ordered）', () => {
    test('email_type, item_name, ordered_at, expected_at を返す', async () => {
      // Given: Claudeがparse_order_emailツールを呼ぶレスポンスを返す
      const mockCreate = Anthropic.mock.results[0]?.value.messages.create
        ?? (() => { const m = jest.fn(); Anthropic.mockImplementation(() => ({ messages: { create: m } })); return m; })();

      // 直接インスタンスを作り直してmockを取得
      const instance = new Anthropic();
      instance.messages.create.mockResolvedValue(
        makeToolUseResponse('parse_order_email', {
          email_type: 'ordered',
          item_name: 'アタック詰め替え用 900g',
          ordered_at: '2026-05-01',
          expected_at: '2026-05-03',
          action_reason: null,
        })
      );

      // When
      const result = await parseEmail(
        'Amazonご注文の確認 #123-456',
        'ご注文いただきありがとうございます。アタック詰め替え用 900g をご注文いただきました。'
      );

      // Then
      expect(result.email_type).toBe('ordered');
      expect(result.item_name).toBe('アタック詰め替え用 900g');
      expect(result.ordered_at).toBe('2026-05-01');
      expect(result.expected_at).toBe('2026-05-03');
    });
  });

  describe('発送メール（shipped）', () => {
    test('email_type: shipped と expected_at を返す', async () => {
      const instance = new Anthropic();
      instance.messages.create.mockResolvedValue(
        makeToolUseResponse('parse_order_email', {
          email_type: 'shipped',
          item_name: 'アタック詰め替え用 900g',
          ordered_at: null,
          expected_at: '2026-05-03',
          action_reason: null,
        })
      );

      const result = await parseEmail(
        '発送のお知らせ：アタック詰め替え用 900g',
        'ご注文の商品を発送しました。お届け予定日は5月3日です。'
      );

      expect(result.email_type).toBe('shipped');
      expect(result.expected_at).toBe('2026-05-03');
    });
  });

  describe('要対応メール（action_required）', () => {
    test('email_type: action_required と action_reason を返す', async () => {
      const instance = new Anthropic();
      instance.messages.create.mockResolvedValue(
        makeToolUseResponse('parse_order_email', {
          email_type: 'action_required',
          item_name: 'アタック詰め替え用 900g',
          ordered_at: null,
          expected_at: null,
          action_reason: 'お支払い方法の変更が必要です',
        })
      );

      const result = await parseEmail(
        '【重要】お支払い方法の変更をお願いします',
        'ご注文のお支払いが完了できませんでした。お支払い方法をご変更ください。'
      );

      expect(result.email_type).toBe('action_required');
      expect(result.action_reason).toBe('お支払い方法の変更が必要です');
    });
  });

  describe('無関係なメール（other）', () => {
    test('email_type: other を返す', async () => {
      const instance = new Anthropic();
      instance.messages.create.mockResolvedValue(
        makeToolUseResponse('parse_order_email', {
          email_type: 'other',
          item_name: '',
          ordered_at: null,
          expected_at: null,
          action_reason: null,
        })
      );

      const result = await parseEmail(
        '【楽天】ポイント獲得のお知らせ',
        '100ポイントを獲得しました。'
      );

      expect(result.email_type).toBe('other');
    });
  });
});

// ─────────────────────────────────────────────
// matchSlackPost
// ─────────────────────────────────────────────

describe('matchSlackPost', () => {
  const slackPosts = ['洗剤', 'トイレットペーパー', 'シャンプー'];

  test('曖昧一致：「アタック詰め替え用」→「洗剤」を返す', async () => {
    // Given: Claudeがmatch_slack_postツールを呼ぶレスポンスを返す
    const instance = new Anthropic();
    instance.messages.create.mockResolvedValue(
      makeToolUseResponse('match_slack_post', {
        best_match: '洗剤',
      })
    );

    // When
    const result = await matchSlackPost('アタック詰め替え用 900g', slackPosts);

    // Then
    expect(result).toBe('洗剤');
  });

  test('完全一致：「トイレットペーパー」→「トイレットペーパー」を返す', async () => {
    const instance = new Anthropic();
    instance.messages.create.mockResolvedValue(
      makeToolUseResponse('match_slack_post', {
        best_match: 'トイレットペーパー',
      })
    );

    const result = await matchSlackPost('トイレットペーパー 12ロール', slackPosts);

    expect(result).toBe('トイレットペーパー');
  });

  test('該当なし：null を返す', async () => {
    const instance = new Anthropic();
    instance.messages.create.mockResolvedValue(
      makeToolUseResponse('match_slack_post', {
        best_match: null,
      })
    );

    const result = await matchSlackPost('ゲームコントローラー', slackPosts);

    expect(result).toBeNull();
  });
});
