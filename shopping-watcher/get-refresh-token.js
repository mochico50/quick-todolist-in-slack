/**
 * Gmail OAuthリフレッシュトークン取得スクリプト
 * 使い方:
 *   node get-refresh-token.js <CLIENT_ID> <CLIENT_SECRET>
 */
const { google } = require('googleapis');
const http = require('http');
const url = require('url');

const [, , clientId, clientSecret] = process.argv;
if (!clientId || !clientSecret) {
  console.error('Usage: node get-refresh-token.js <CLIENT_ID> <CLIENT_SECRET>');
  process.exit(1);
}

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/gmail.readonly'],
  prompt: 'consent', // 必ずrefresh_tokenを返させる
});

console.log('\n以下のURLをブラウザで開いてください:\n');
console.log(authUrl);
console.log('\nブラウザで認証が完了すると自動的にトークンが取得されます...\n');

const server = http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);
  if (pathname !== '/callback') {
    res.end('Not found');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h2>認証完了！このタブは閉じてください。</h2>');
  server.close();

  if (query.error) {
    console.error('エラー:', query.error);
    process.exit(1);
  }

  try {
    const { tokens } = await oauth2Client.getToken(query.code);
    console.log('✅ リフレッシュトークン取得成功!\n');
    console.log('GMAIL_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('\nこの値を .env または Secret Manager に登録してください。');
  } catch (err) {
    console.error('エラー:', err.message);
  }
});

server.listen(PORT);
