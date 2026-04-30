# インターフェース定義 - 買い物Bot Gmail連携

## 1. データ型定義

### Email
```typescript
type Email = {
  id: string;           // GmailメッセージID
  threadId: string;     // GmailスレッドID
  subject: string;      // 件名
  body: string;         // 本文（プレーンテキスト）
  receivedAt: Date;     // 受信日時
}
```

### ParsedEmail
```typescript
type EmailType = "ordered" | "shipped" | "action_required" | "other";

type ParsedEmail = {
  email_type: EmailType;
  item_name: string;            // 商品名
  ordered_at: string | null;    // 注文日 YYYY-MM-DD
  expected_at: string | null;   // お届け予定日 YYYY-MM-DD
  action_reason: string | null; // 要対応の理由（action_required のみ）
}
```

### SlackPost
```typescript
type SlackPost = {
  ts: string;     // メッセージタイムスタンプ（Slack投稿ID）
  text: string;   // 投稿テキスト
  channel: string; // チャンネルID
}
```

### Order（Firestoreドキュメント）
```typescript
type OrderStatus = "ordered" | "shipped" | "action_required";

type Order = {
  slack_ts: string;           // Slack投稿タイムスタンプ
  slack_channel: string;      // SlackチャンネルID
  item_name: string;          // Slackの投稿テキスト
  status: OrderStatus;
  ordered_at: string | null;  // YYYY-MM-DD
  expected_at: string | null; // YYYY-MM-DD
  gmail_thread_id: string;    // GmailスレッドID（重複防止キー）
  notified_at: string | null; // YYYY-MM-DD（最終通知日）
}
```

---

## 2. モジュールインターフェース

### gmail.js

```typescript
// Gmail APIクライアントを初期化する
function createAuthClient(): OAuth2Client

// 件名キーワードで買い物関連メールを取得する
// since: この日時以降に受信したメールのみ返す
// ストアは問わない。買い物メールかどうかの判定はClaudeが行う
async function fetchShoppingEmails(auth: OAuth2Client, since: Date): Promise<Email[]>
```

---

### claude.js

```typescript
// メールを解析して構造化データを返す
// subject, body をClaudeに渡し parse_order_email tool を呼び出す
async function parseEmail(subject: string, body: string): Promise<ParsedEmail>

// 注文商品名と最も近いSlack投稿テキストを返す
// 該当なしの場合は null を返す
// match_slack_post tool を呼び出す
async function matchSlackPost(
  orderItem: string,
  slackPosts: string[]
): Promise<string | null>
```

**tool定義:**

```javascript
// parse_order_email
{
  name: "parse_order_email",
  description: "Amazon/楽天のメールを解析して種別と商品情報を返す",
  input_schema: {
    type: "object",
    properties: {
      email_type:    { type: "string", enum: ["ordered", "shipped", "action_required", "other"] },
      item_name:     { type: "string", description: "商品名" },
      ordered_at:    { type: "string", description: "注文日 YYYY-MM-DD" },
      expected_at:   { type: "string", description: "お届け予定日 YYYY-MM-DD" },
      action_reason: { type: "string", description: "要対応の理由（action_requiredの場合）" }
    },
    required: ["email_type", "item_name"]
  }
}

// match_slack_post
{
  name: "match_slack_post",
  description: "注文商品名とSlack投稿リストを照合して最も近いものを返す",
  input_schema: {
    type: "object",
    properties: {
      best_match: { type: "string", description: "最も近いSlack投稿テキスト。該当なしはnull" }
    },
    required: ["best_match"]
  }
}
```

---

### slack.js

```typescript
// 直近14日の未完了投稿を返す（✅・❌なし、Bot投稿・コマンド除外）
async function getPendingPosts(channelId: string): Promise<SlackPost[]>

// リアクションを追加する
async function addReaction(
  channelId: string,
  ts: string,
  reactionName: string  // 例: "white_check_mark"
): Promise<void>

// スレッドにメッセージを投稿する
async function postThreadMessage(
  channelId: string,
  threadTs: string,
  text: string
): Promise<void>
```

---

### firestore.js

```typescript
// GmailスレッドIDで注文レコードを検索する
// 存在しない場合は null を返す
async function findOrderByGmailThreadId(gmailThreadId: string): Promise<Order | null>

// 注文レコードを新規作成する
async function createOrder(order: Order): Promise<string>  // ドキュメントIDを返す

// 注文レコードを更新する
async function updateOrder(
  docId: string,
  fields: Partial<Order>
): Promise<void>

// GmailスレッドIDが処理済みかチェックする
async function isAlreadyProcessed(gmailThreadId: string): Promise<boolean>
```

---

### processor.js

```typescript
// バッチのメイン処理
// Cloud Schedulerから呼び出されるエントリポイント
async function checkGmailAndNotify(): Promise<void>

// 注文メールの処理
async function handleOrderedEmail(email: Email, parsed: ParsedEmail): Promise<void>

// 発送メールの処理
async function handleShippedEmail(email: Email, parsed: ParsedEmail): Promise<void>

// 要対応メールの処理
async function handleActionRequiredEmail(email: Email, parsed: ParsedEmail): Promise<void>
```

---

## 3. 環境変数

```
SLACK_BOT_TOKEN        Slack Bot Token（xoxb-...）
ANTHROPIC_API_KEY      Claude APIキー
GMAIL_CLIENT_ID        GCP OAuth クライアントID
GMAIL_CLIENT_SECRET    GCP OAuth クライアントシークレット
GMAIL_REFRESH_TOKEN    Gmail APIのリフレッシュトークン
SHOPPING_CHANNEL_ID    買い物チャンネルのSlackチャンネルID
GOOGLE_CLOUD_PROJECT   GCPプロジェクトID（Firestore用）
```

---

## 4. エラーハンドリング方針

- 各メールの処理は独立して実行する（1件の失敗が他に影響しない）
- Gmail API / Slack API / Firestore の呼び出しエラーはコンソールにログ出力してスキップ
- Claude APIのエラーは該当メールの処理をスキップ
- 未処理のエラーは Cloud Functions のログに残す（GCPのCloud Loggingで確認）
