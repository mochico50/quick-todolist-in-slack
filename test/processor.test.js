const { handleOrderedEmail, handleShippedEmail, handleActionRequiredEmail } = require('../shopping-watcher/src/processor');

jest.mock('../shopping-watcher/src/gmail', () => ({
  createAuthClient: jest.fn(),
  fetchShoppingEmails: jest.fn(),
}));
jest.mock('../shopping-watcher/src/slack', () => ({
  getPendingPosts: jest.fn(),
  addReaction: jest.fn(),
  postThreadMessage: jest.fn(),
}));
jest.mock('../shopping-watcher/src/firestore', () => ({
  findOrderByGmailThreadId: jest.fn(),
  createOrder: jest.fn(),
  updateOrder: jest.fn(),
  isAlreadyProcessed: jest.fn(),
}));
jest.mock('../shopping-watcher/src/claude', () => ({
  parseEmail: jest.fn(),
  matchSlackPost: jest.fn(),
}));

const slack = require('../shopping-watcher/src/slack');
const firestore = require('../shopping-watcher/src/firestore');
const claude = require('../shopping-watcher/src/claude');

const CHANNEL_ID = 'C123';

beforeEach(() => {
  jest.clearAllMocks();
  process.env.SHOPPING_CHANNEL_ID = CHANNEL_ID;
});

// ─────────────────────────────────────────────
// handleOrderedEmail
// ─────────────────────────────────────────────

describe('handleOrderedEmail', () => {
  const email = { id: 'msg1', threadId: 'thread1', subject: 'ご注文確認', body: '...', receivedAt: new Date() };
  const parsed = { email_type: 'ordered', item_name: 'アタック詰め替え用 900g', ordered_at: '2026-05-01', expected_at: '2026-05-03', action_reason: null };

  test('未完了のSlack投稿があれば ✅ とスレッド通知を付け、Firestoreに記録する', async () => {
    // Given: 未完了投稿あり、Claudeが「洗剤」にマッチ
    slack.getPendingPosts.mockResolvedValue([{ ts: '111.222', text: '洗剤', channel: CHANNEL_ID }]);
    claude.matchSlackPost.mockResolvedValue('洗剤');
    slack.addReaction.mockResolvedValue();
    slack.postThreadMessage.mockResolvedValue();
    firestore.createOrder.mockResolvedValue('docId1');

    // When
    await handleOrderedEmail(email, parsed);

    // Then
    expect(slack.addReaction).toHaveBeenCalledWith(CHANNEL_ID, '111.222', 'white_check_mark');
    expect(slack.postThreadMessage).toHaveBeenCalledWith(CHANNEL_ID, '111.222', '注文確認したよ📦 5月3日届く予定\n商品: アタック詰め替え用 900g');
    expect(firestore.createOrder).toHaveBeenCalledWith(expect.objectContaining({
      slack_ts: '111.222',
      gmail_thread_id: 'thread1',
      status: 'ordered',
    }));
  });

  test('対応するSlack投稿がない場合、✅・スレッド通知はスキップしてFirestoreには記録する', async () => {
    // Given: Claudeがnullを返す（マッチなし）
    slack.getPendingPosts.mockResolvedValue([{ ts: '111.222', text: '洗剤', channel: CHANNEL_ID }]);
    claude.matchSlackPost.mockResolvedValue(null);
    firestore.createOrder.mockResolvedValue('docId2');

    // When
    await handleOrderedEmail(email, parsed);

    // Then
    expect(slack.addReaction).not.toHaveBeenCalled();
    expect(slack.postThreadMessage).not.toHaveBeenCalled();
    expect(firestore.createOrder).toHaveBeenCalledWith(expect.objectContaining({
      slack_ts: null,
      gmail_thread_id: 'thread1',
      status: 'ordered',
    }));
  });

  test('expected_at が null の場合、お届け日未定メッセージを投稿する', async () => {
    // Given
    const parsedNoDate = { ...parsed, expected_at: null };
    slack.getPendingPosts.mockResolvedValue([{ ts: '111.222', text: '洗剤', channel: CHANNEL_ID }]);
    claude.matchSlackPost.mockResolvedValue('洗剤');
    slack.addReaction.mockResolvedValue();
    slack.postThreadMessage.mockResolvedValue();
    firestore.createOrder.mockResolvedValue('docId3');

    // When
    await handleOrderedEmail(email, parsedNoDate);

    // Then
    expect(slack.postThreadMessage).toHaveBeenCalledWith(
      CHANNEL_ID, '111.222', '注文確認したよ📦 お届け日は追ってご確認を\n商品: アタック詰め替え用 900g'
    );
  });
});

// ─────────────────────────────────────────────
// handleShippedEmail
// ─────────────────────────────────────────────

describe('handleShippedEmail', () => {
  const email = { id: 'msg2', threadId: 'thread1', subject: '発送のお知らせ', body: '...', receivedAt: new Date() };
  const parsed = { email_type: 'shipped', item_name: 'アタック詰め替え用 900g', ordered_at: null, expected_at: '2026-05-03', action_reason: null };

  test('Firestoreにorderedレコードがあれば、スレッド通知してshippedに更新する', async () => {
    // Given: 既存レコードあり、当日通知なし
    const existingOrder = { _id: 'docId1', slack_ts: '111.222', slack_channel: CHANNEL_ID, status: 'ordered', notified_at: null };
    firestore.findOrderByGmailThreadId.mockResolvedValue(existingOrder);
    slack.postThreadMessage.mockResolvedValue();
    firestore.updateOrder.mockResolvedValue();

    // When
    await handleShippedEmail(email, parsed);

    // Then
    expect(slack.postThreadMessage).toHaveBeenCalledWith(CHANNEL_ID, '111.222', '発送されたよ🚚 5月3日届く予定\n商品: アタック詰め替え用 900g');
    expect(firestore.updateOrder).toHaveBeenCalledWith('docId1', expect.objectContaining({
      status: 'shipped',
      notified_at: expect.any(String),
    }));
  });

  test('notified_at が当日の場合、スキップする', async () => {
    // Given: 当日すでに通知済み
    const today = new Date().toISOString().slice(0, 10);
    const existingOrder = { _id: 'docId1', slack_ts: '111.222', slack_channel: CHANNEL_ID, status: 'shipped', notified_at: today };
    firestore.findOrderByGmailThreadId.mockResolvedValue(existingOrder);

    // When
    await handleShippedEmail(email, parsed);

    // Then
    expect(slack.postThreadMessage).not.toHaveBeenCalled();
    expect(firestore.updateOrder).not.toHaveBeenCalled();
  });

  test('Firestoreにレコードがない場合、スレッド投稿はスキップして新規レコードを作成する', async () => {
    // Given: レコードなし
    firestore.findOrderByGmailThreadId.mockResolvedValue(null);
    firestore.createOrder.mockResolvedValue('newDocId');

    // When
    await handleShippedEmail(email, parsed);

    // Then
    expect(slack.postThreadMessage).not.toHaveBeenCalled();
    expect(firestore.createOrder).toHaveBeenCalledWith(expect.objectContaining({
      gmail_thread_id: 'thread1',
      status: 'shipped',
    }));
  });
});

// ─────────────────────────────────────────────
// handleActionRequiredEmail
// ─────────────────────────────────────────────

describe('handleActionRequiredEmail', () => {
  const email = { id: 'msg3', threadId: 'thread1', subject: '【重要】お支払い方法の変更', body: '...', receivedAt: new Date() };
  const parsed = { email_type: 'action_required', item_name: 'アタック詰め替え用 900g', ordered_at: null, expected_at: null, action_reason: 'お支払い方法の変更が必要です' };

  test('Firestoreにレコードがあれば、スレッド通知してaction_requiredに更新する', async () => {
    // Given
    const existingOrder = { _id: 'docId1', slack_ts: '111.222', slack_channel: CHANNEL_ID, status: 'ordered', notified_at: null };
    firestore.findOrderByGmailThreadId.mockResolvedValue(existingOrder);
    slack.postThreadMessage.mockResolvedValue();
    firestore.updateOrder.mockResolvedValue();

    // When
    await handleActionRequiredEmail(email, parsed);

    // Then
    expect(slack.postThreadMessage).toHaveBeenCalledWith(
      CHANNEL_ID, '111.222', '⚠️ 対応が必要だよ！お支払い方法の変更が必要です', true
    );
    expect(firestore.updateOrder).toHaveBeenCalledWith('docId1', expect.objectContaining({
      status: 'action_required',
    }));
  });

  test('Firestoreにレコードがない場合、スレッド投稿はスキップする', async () => {
    // Given
    firestore.findOrderByGmailThreadId.mockResolvedValue(null);

    // When
    await handleActionRequiredEmail(email, parsed);

    // Then
    expect(slack.postThreadMessage).not.toHaveBeenCalled();
  });
});
