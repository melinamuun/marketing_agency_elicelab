'use strict';

// Vercel 서버리스 함수: POST /api/chat
// 로컬에서는 server.js 가 동일 로직(lib/chat.js)을 재사용합니다.

const { getChatReply, readJsonBody, ChatError } = require('../lib/chat');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'POST 요청만 허용됩니다.' }));
  }

  try {
    const body = await readJsonBody(req);
    const reply = await getChatReply(body && body.messages);
    res.statusCode = 200;
    res.end(JSON.stringify({ reply }));
  } catch (err) {
    const status = err instanceof ChatError ? err.status : 500;
    const message = status >= 500
      ? '일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'
      : (err.message || '요청을 처리하지 못했습니다.');
    if (status >= 500) console.error('[api/chat]', err.code || '', err.message);
    res.statusCode = status;
    res.end(JSON.stringify({ error: message }));
  }
};
