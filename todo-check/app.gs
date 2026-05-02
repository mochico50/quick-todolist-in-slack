const SLACK_BOT_TOKEN = PropertiesService.getScriptProperties().getProperty('SLACK_BOT_TOKEN');

function fetchAllMessages(channelId) {
  const messages = [];
  let cursor = null;
  const oldest = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000).toString();

  do {
    const params = { channel: channelId, limit: 200, oldest };
    if (cursor) params.cursor = cursor;

    const res = UrlFetchApp.fetch(
      'https://slack.com/api/conversations.history?' + objectToParams(params),
      { headers: { Authorization: 'Bearer ' + SLACK_BOT_TOKEN } }
    );
    const data = JSON.parse(res.getContentText());

    if (!data.ok) throw new Error(data.error);
    messages.push(...data.messages);
    cursor = data.response_metadata?.next_cursor;
  } while (cursor);

  return messages;
}

function getPermalink(channelId, ts) {
  const res = UrlFetchApp.fetch(
    `https://slack.com/api/chat.getPermalink?channel=${channelId}&message_ts=${ts}`,
    { headers: { Authorization: 'Bearer ' + SLACK_BOT_TOKEN } }
  );
  const data = JSON.parse(res.getContentText());
  return data.ok ? data.permalink : null;
}

function postMessage(channelId, text, threadTs = null) {
  const payload = { channel: channelId, text };
  Logger.log(JSON.stringify(payload));
  if (threadTs) payload.thread_ts = threadTs;

  const res = UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', {
    method: 'post',
    headers: {
      Authorization: 'Bearer ' + SLACK_BOT_TOKEN,
      'Content-Type': 'application/json',
    },
    payload: JSON.stringify(payload),
  });
  const data = JSON.parse(res.getContentText());
  Logger.log(JSON.stringify(data));
  return data;
}

function getPendingTodos(channelId) {
  const messages = fetchAllMessages(channelId);

  return messages.filter(msg => {
    if (!msg.text || msg.subtype) return false;
    if (msg.bot_id) return false;
    if (msg.text.startsWith('/')) return false;

    const reactions = msg.reactions || [];
    const isDone = reactions.some(r => r.name === 'white_check_mark');
    const isCancelled = reactions.some(r => r.name === 'x');
    const isChat = reactions.some(r => r.name === 'speech_balloon') || msg.text.startsWith('💬');
    return !isDone && !isCancelled && !isChat;
  });
}

function doPost(e) {
  const params = e.parameter;
  Logger.log(JSON.stringify(params));

  if (params.command !== '/todo-check') {
    return ContentService.createTextOutput('Unknown command');
  }

  const channelId = params.channel_id;
  const parentData = postMessage(channelId, '📋 start checking todo list...');
  const threadTs = parentData.message.ts;

  const pendingTodos = getPendingTodos(channelId);

  if (pendingTodos.length === 0) {
    postMessage(channelId, 'Todoなし🎉', threadTs);
    return ContentService.createTextOutput('');
  }

  const permalinkRequests = pendingTodos.map(todo => ({
    url: `https://slack.com/api/chat.getPermalink?channel=${channelId}&message_ts=${todo.ts}`,
    headers: { Authorization: 'Bearer ' + SLACK_BOT_TOKEN },
    muteHttpExceptions: true,
  }));
  const permalinks = UrlFetchApp.fetchAll(permalinkRequests)
    .map(r => JSON.parse(r.getContentText()))
    .filter(d => d.ok)
    .map(d => d.permalink);

  for (const permalink of permalinks) {
    postMessage(channelId, permalink, threadTs);
  }

  return ContentService.createTextOutput('');
}

function objectToParams(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}
