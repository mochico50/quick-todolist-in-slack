# quick-todolist-in-slack

Slack で簡単な Todo 管理をするための Slack App（Google Apps Script）です。

## 概要

1 todo 1 message のシンプルな運用で、スラッシュコマンドから直近 2 週間の未完了 Todo を確認できます。

## 仕様

### Todo 管理ルール

| 状態 | リアクション |
|------|------------|
| 完了 | ✅ `:white_check_mark:` |
| キャンセル | ❌ `:x:` |
| 未完了 | （リアクションなし） |

### スラッシュコマンド

```
/todo-check
```

- 直近 2 週間のメッセージから、✅ も ❌ もついていない未完了 Todo を抽出
- `📋 start checking todo list...` を投稿し、そのスレッドに未完了 Todo へのパーマリンクを列挙


## 動作イメージ
- 1taskごとにメッセージを投稿する
- taskが完了したら ✅️ を reaction する
<img width="350" height="160" alt="スクリーンショット 2026-04-28 12 37 07" src="https://github.com/user-attachments/assets/c4daa0dc-5223-4eff-9336-703daa5594b0" />


- 何のtaskが残っているかを確認するために `/todo-check` を実行する
- reaction(✅️・❌️）がついてないものをスレッドにlistupされる
<img width="450" alt="スクリーンショット 2026-04-28 12 36 29" src="https://github.com/user-attachments/assets/6d6d7542-b5b1-4ae8-b099-5a89e368f8b0" />


## セットアップ

### 1. Slack App の作成

1. [Slack API](https://api.slack.com/apps) でアプリを新規作成
2. **OAuth & Permissions** でスコープを付与:
   - `channels:history`
   - `chat:write`
   - `reactions:read`
3. **Slash Commands** で `/todo-check` を作成し、Request URL に GAS のデプロイ URL を設定
4. Bot Token (`xoxb-...`) をコピー

### 2. GAS のデプロイ

1. [Google Apps Script](https://script.google.com) でプロジェクトを作成
2. `Code.gs` の内容を貼り付け
3. **プロジェクトの設定 → スクリプトプロパティ** に以下を追加:
   - キー: `SLACK_BOT_TOKEN`
   - 値: 上記でコピーした Bot Token
4. **デプロイ → 新しいデプロイ** から「ウェブアプリ」としてデプロイ
   - 実行ユーザー: 自分
   - アクセスできるユーザー: 全員
5. 発行された URL を Slack App の Request URL に設定

## ファイル構成

```
.
└── app.gs   # メインスクリプト
```
