# CLAUDE.md - 買い物Bot Gmail連携

## プロジェクト概要

家族間の買い物を透明化するSlack Botに、Gmail連携機能を追加するプロジェクト。

- `todo-check/` : 既存のGASベースBot（変更しない）
- `gmail-watcher/` : 新規のGCP Cloud Functionsバッチ（今回の実装対象）
- `docs/` : 仕様書・インターフェース定義
- `test/` : テストコード

## 実装ルール

### 変更してはいけないもの
- `todo-check/app.gs` は一切変更しない

### 実装の順序（SDD）
1. `docs/` の仕様・インターフェース定義を読む
2. `test/` にテストを書く（仕様から導出）
3. `gmail-watcher/src/` に実装する（テストを通す）

### コーディング規約
- JavaScript（Node.js 20）で書く。TypeScriptは使わない
- JSDocで型をアノテーションする（`docs/interfaces.md` の定義に従う）
- `async/await` を使う。Promiseチェーンは使わない
- エラーハンドリングは `docs/interfaces.md` の「エラーハンドリング方針」に従う
- コメントはWHYが非自明な場合のみ書く

### Claude API の使い方
- モデル: `claude-sonnet-4-6`
- tool useで `parse_order_email` と `match_slack_post` の2ツールを使う
- ツール定義は `docs/interfaces.md` の定義に従う
- プロンプトキャッシュを活用する（システムプロンプトに `cache_control` を設定）

### テストの書き方
- テストフレームワーク: Jest
- 外部API（Gmail / Slack / Firestore / Claude）はモックする
- テストファイルは `test/` に置く（`test/モジュール名.test.js`）
- Given/When/Then のコメント構造で書く

## ディレクトリ構成

```
gmail-watcher/
├── package.json
├── index.js              # Cloud Functionsエントリポイント
└── src/
    ├── gmail.js          # Gmail API
    ├── claude.js         # Claude API（tool use）
    ├── slack.js          # Slack API
    ├── firestore.js      # Firestore
    └── processor.js      # メイン処理ロジック
```

## 環境変数

`.env.example` を参照。本番値はGCP Secret Managerに保管する。

```
SLACK_BOT_TOKEN
ANTHROPIC_API_KEY
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN
SHOPPING_CHANNEL_ID
GOOGLE_CLOUD_PROJECT
```

## 参照ドキュメント

- todo-check 機能仕様 → `docs/spec-todo-check.md`
- gmail-watcher 機能仕様 → `docs/spec-gmail-watcher.md`
- 型・インターフェース定義 → `docs/interfaces.md`
- 元のSpecification → `SPECIFICATION.md`（ユーザーが提供した仕様書）
