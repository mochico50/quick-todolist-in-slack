# 機能仕様書 - 買い物Bot Gmail連携

## 1. 概要

Cloud Schedulerで定期実行されるバッチが Gmail を監視し、Amazon/楽天の注文・発送・要対応メールを検知してSlackへ自動通知する。

---

## 2. 前提条件

- 買い物チャンネルでは「1買い物1メッセージ」で投稿している
- 完了は ✅（`:white_check_mark:`）、キャンセルは ❌（`:x:`）でリアクション
- ✅も❌もない投稿が「未完了の買い物」
- 重複通知防止のため、処理済みメールはFirestoreに記録する

---

## 3. 機能仕様

### 3.1 注文検知 → ✅付与 + スレッド通知

#### Given（前提）
- Amazon または 楽天 からの注文確認メールが受信箱にある
- そのメールのGmailスレッドIDがFirestoreに存在しない（未処理）
- 買い物チャンネルに対応する未完了投稿がある

#### When（操作）
- バッチが実行される（Cloud Schedulerによる定期実行）

#### Then（結果）
- Claudeがメールを解析し `email_type: "ordered"` と判定する
- Claudeが注文商品名と最も近いSlack未完了投稿を特定する
- 該当Slack投稿に ✅（`:white_check_mark:`）リアクションが付く
- 該当Slack投稿のスレッドに以下のメッセージが投稿される：
  ```
  注文確認したよ📦 ○月○日届く予定
  ```
- Firestoreに注文レコードが作成される（status: `ordered`）

#### 例外ケース
- 対応するSlack投稿が見つからない場合：✅・スレッド投稿ともにスキップ、Firestoreには未紐づけで記録
- すでにFirestoreに記録済みのGmailスレッドIDの場合：全処理をスキップ

---

### 3.2 発送検知 → スレッド通知

#### Given（前提）
- Amazon または 楽天 からの発送メールが受信箱にある
- 対応する注文レコードがFirestoreに存在する（`status: "ordered"` または未登録）

#### When（操作）
- バッチが実行される

#### Then（結果）
- Claudeがメールを解析し `email_type: "shipped"` と判定する
- 対応するSlack投稿のスレッドに以下のメッセージが投稿される：
  ```
  発送されたよ🚚 ○月○日届く予定
  ```
- Firestoreのレコードが更新される（status: `shipped`、`notified_at` を現在日時に更新）

#### 例外ケース
- 対応するFirestoreレコードが見つからない場合：スレッド投稿はスキップ、新規レコードとして記録
- すでに `notified_at` が本日の日付の場合：スキップ（当日重複通知防止）

---

### 3.3 要対応メール検知 → スレッド通知

#### Given（前提）
- Amazon または 楽天 から支払い方法変更・在庫切れ・注文キャンセル等の要対応メールが受信箱にある

#### When（操作）
- バッチが実行される

#### Then（結果）
- Claudeがメールを解析し `email_type: "action_required"` と判定する
- 対応するSlack投稿のスレッドに以下のメッセージが投稿される：
  ```
  ⚠️ 対応が必要だよ！（理由）
  ```
- Firestoreのレコードが更新される（status: `action_required`、`notified_at` を現在日時に更新）

#### 例外ケース
- Claudeが `email_type: "other"` と判定したメール：全処理をスキップ
- 対応するFirestoreレコードが見つからない場合：スレッド投稿はスキップ

---

## 4. Firestoreデータ仕様

### コレクション: `orders`

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `slack_ts` | string | ○ | 買い物チャンネルの元投稿タイムスタンプ |
| `slack_channel` | string | ○ | チャンネルID |
| `item_name` | string | ○ | Slackの投稿テキスト |
| `status` | string | ○ | `ordered` / `shipped` / `action_required` |
| `ordered_at` | string | △ | 注文日 YYYY-MM-DD |
| `expected_at` | string | △ | お届け予定日 YYYY-MM-DD |
| `gmail_thread_id` | string | ○ | 対応するGmailスレッドID（重複防止キー） |
| `notified_at` | string | △ | 最終通知日 YYYY-MM-DD（重複通知防止） |

### 重複防止ルール
- `gmail_thread_id` が一致するレコードが存在する場合、処理をスキップする
- `notified_at` が当日の日付の場合、スレッド投稿をスキップする

---

## 5. Gmailフィルタ仕様

### 検索クエリ
```
subject:(注文 OR 発送 OR お届け OR ご購入 OR 出荷 OR キャンセル) newer_than:1d
```

ストアを限定しない。どのECサイトでも動作する。  
買い物メールかどうかの判定はClaudeが行う（`email_type: "other"` でスキップ）。

### 対象メール種別（Claudeが判定）

| `email_type` | 説明 | 例 |
|-------------|------|-----|
| `ordered` | 注文確認メール | 「ご注文の確認」「注文が確定しました」 |
| `shipped` | 発送メール | 「発送しました」「出荷のお知らせ」 |
| `action_required` | 要対応メール | 「支払い方法の変更が必要」「在庫切れ」「注文キャンセル」 |
| `other` | 上記以外 | セール案内・ポイント通知・無関係なメール → スキップ |

---

## 6. スレッドメッセージ仕様

| 種別 | メッセージフォーマット |
|------|----------------------|
| 注文確認 | `注文確認したよ📦 {expected_at}届く予定` |
| 発送 | `発送されたよ🚚 {expected_at}届く予定` |
| 要対応 | `⚠️ 対応が必要だよ！{action_reason}` |

- `expected_at` が不明の場合：`注文確認したよ📦 お届け日は追ってご確認を`
- 日付フォーマット：`M月D日`（例: `5月2日`）
