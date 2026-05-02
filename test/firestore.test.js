const {
  findOrderByGmailThreadId,
  createOrder,
  updateOrder,
  isAlreadyProcessed,
} = require('../shopping-watcher/src/firestore');

jest.mock('@google-cloud/firestore', () => ({
  Firestore: jest.fn(),
}));

const { Firestore } = require('@google-cloud/firestore');

let mockGet, mockAdd, mockUpdate, mockWhere, mockDoc;

beforeEach(() => {
  jest.clearAllMocks();
  mockGet = jest.fn();
  mockAdd = jest.fn();
  mockUpdate = jest.fn();
  mockDoc = jest.fn();
  mockWhere = jest.fn();

  const queryMock = { where: mockWhere, get: mockGet };
  mockWhere.mockReturnValue(queryMock);
  mockDoc.mockReturnValue({ update: mockUpdate });

  Firestore.mockImplementation(() => ({
    collection: jest.fn().mockReturnValue({ where: mockWhere, add: mockAdd, doc: mockDoc }),
  }));
});

// ─────────────────────────────────────────────
// findOrderByGmailThreadId
// ─────────────────────────────────────────────

describe('findOrderByGmailThreadId', () => {
  test('レコードが存在する場合、Orderオブジェクトを返す', async () => {
    // Given
    const orderData = {
      slack_ts: '111.222',
      slack_channel: 'C123',
      item_name: '洗剤',
      status: 'ordered',
      gmail_thread_id: 'thread1',
      ordered_at: '2026-05-01',
      expected_at: '2026-05-03',
      notified_at: null,
    };
    mockGet.mockResolvedValue({
      empty: false,
      docs: [{ id: 'doc1', data: () => orderData }],
    });

    // When
    const result = await findOrderByGmailThreadId('thread1');

    // Then
    expect(result).toEqual({ _id: 'doc1', ...orderData });
  });

  test('レコードが存在しない場合、null を返す', async () => {
    // Given
    mockGet.mockResolvedValue({ empty: true, docs: [] });

    // When
    const result = await findOrderByGmailThreadId('nonexistent');

    // Then
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────
// createOrder
// ─────────────────────────────────────────────

describe('createOrder', () => {
  test('Firestoreにドキュメントを追加してIDを返す', async () => {
    // Given
    mockAdd.mockResolvedValue({ id: 'newDoc1' });
    const order = {
      slack_ts: '111.222',
      slack_channel: 'C123',
      item_name: '洗剤',
      status: 'ordered',
      gmail_thread_id: 'thread1',
      ordered_at: '2026-05-01',
      expected_at: '2026-05-03',
      notified_at: null,
    };

    // When
    const docId = await createOrder(order);

    // Then
    expect(docId).toBe('newDoc1');
    expect(mockAdd).toHaveBeenCalledWith(order);
  });
});

// ─────────────────────────────────────────────
// updateOrder
// ─────────────────────────────────────────────

describe('updateOrder', () => {
  test('指定フィールドだけ更新する', async () => {
    // Given
    mockUpdate.mockResolvedValue({});

    // When
    await updateOrder('doc1', { status: 'shipped', notified_at: '2026-05-02' });

    // Then
    expect(mockDoc).toHaveBeenCalledWith('doc1');
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'shipped', notified_at: '2026-05-02' });
  });
});

// ─────────────────────────────────────────────
// isAlreadyProcessed
// ─────────────────────────────────────────────

describe('isAlreadyProcessed', () => {
  test('Firestoreにレコードがある場合 true を返す', async () => {
    // Given
    mockGet.mockResolvedValue({ empty: false });

    // When
    const result = await isAlreadyProcessed('thread1');

    // Then
    expect(result).toBe(true);
  });

  test('Firestoreにレコードがない場合 false を返す', async () => {
    // Given
    mockGet.mockResolvedValue({ empty: true });

    // When
    const result = await isAlreadyProcessed('thread2');

    // Then
    expect(result).toBe(false);
  });
});
