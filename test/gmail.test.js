const { fetchShoppingEmails } = require('../shopping-watcher/src/gmail');

// Gmail APIをモック
jest.mock('googleapis', () => {
  const mockList = jest.fn();
  const mockGet = jest.fn();
  return {
    google: {
      gmail: jest.fn().mockReturnValue({
        users: {
          messages: {
            list: mockList,
            get: mockGet,
          },
        },
      }),
    },
  };
});

const { google } = require('googleapis');

function getGmailMocks() {
  const gmailInstance = google.gmail();
  return {
    list: gmailInstance.users.messages.list,
    get: gmailInstance.users.messages.get,
  };
}

// Gmail APIのメッセージレスポンスを組み立てるヘルパー
function makeMessageResponse({ id, threadId, subject, body, receivedAt }) {
  const internalDate = receivedAt.getTime().toString();
  return {
    data: {
      id,
      threadId,
      internalDate,
      payload: {
        headers: [
          { name: 'Subject', value: subject },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: { data: Buffer.from(body).toString('base64') },
          },
        ],
      },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchShoppingEmails', () => {
  const mockAuth = {};

  test('件名に注文キーワードを含むメールを返す', async () => {
    // Given: Gmail APIが1件のメッセージIDを返す
    const { list, get } = getGmailMocks();
    list.mockResolvedValue({ data: { messages: [{ id: 'msg1', threadId: 'thread1' }] } });
    get.mockResolvedValue(
      makeMessageResponse({
        id: 'msg1',
        threadId: 'thread1',
        subject: 'Amazonご注文の確認 #123-456',
        body: 'アタック詰め替え用 900g をご注文いただきました。',
        receivedAt: new Date('2026-05-01T10:00:00Z'),
      })
    );

    // When
    const since = new Date('2026-04-30T00:00:00Z');
    const emails = await fetchShoppingEmails(mockAuth, since);

    // Then
    expect(emails).toHaveLength(1);
    expect(emails[0].threadId).toBe('thread1');
    expect(emails[0].subject).toBe('Amazonご注文の確認 #123-456');
    expect(emails[0].body).toContain('アタック詰め替え用');
  });

  test('メールが0件のとき空配列を返す', async () => {
    // Given: Gmail APIがメッセージなしを返す
    const { list } = getGmailMocks();
    list.mockResolvedValue({ data: { messages: [] } });

    // When
    const emails = await fetchShoppingEmails(mockAuth, new Date());

    // Then
    expect(emails).toEqual([]);
  });

  test('messagesがundefinedのとき空配列を返す', async () => {
    // Given: Gmail APIがmessagesフィールドなしを返す（ヒットなし）
    const { list } = getGmailMocks();
    list.mockResolvedValue({ data: {} });

    // When
    const emails = await fetchShoppingEmails(mockAuth, new Date());

    // Then
    expect(emails).toEqual([]);
  });

  test('since より古いメールを除外するクエリを発行する', async () => {
    // Given
    const { list } = getGmailMocks();
    list.mockResolvedValue({ data: {} });

    // When
    const since = new Date('2026-04-30T00:00:00Z');
    await fetchShoppingEmails(mockAuth, since);

    // Then: Gmail APIに渡されたクエリにnewer_afterが含まれる
    const calledQuery = list.mock.calls[0][0].q;
    expect(calledQuery).toContain('after:');
  });

  test('複数のメールをすべて返す', async () => {
    // Given: 2件のメッセージ
    const { list, get } = getGmailMocks();
    list.mockResolvedValue({
      data: {
        messages: [
          { id: 'msg1', threadId: 'thread1' },
          { id: 'msg2', threadId: 'thread2' },
        ],
      },
    });
    get
      .mockResolvedValueOnce(
        makeMessageResponse({
          id: 'msg1', threadId: 'thread1',
          subject: '発送のお知らせ', body: '商品を発送しました。',
          receivedAt: new Date('2026-05-01T10:00:00Z'),
        })
      )
      .mockResolvedValueOnce(
        makeMessageResponse({
          id: 'msg2', threadId: 'thread2',
          subject: 'ご注文の確認', body: 'ご注文ありがとうございます。',
          receivedAt: new Date('2026-05-01T11:00:00Z'),
        })
      );

    // When
    const emails = await fetchShoppingEmails(mockAuth, new Date('2026-04-30T00:00:00Z'));

    // Then
    expect(emails).toHaveLength(2);
    expect(emails[0].id).toBe('msg1');
    expect(emails[1].id).toBe('msg2');
  });
});
