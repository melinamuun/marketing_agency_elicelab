'use strict';

// 로컬 개발 서버: 정적 파일 + /api/chat 라우트
// 실행: node server.js  (또는 npm run dev)
// 배포(Vercel)에서는 이 파일 대신 api/chat.js 서버리스 함수가 동작합니다.

const http = require('http');
const fs = require('fs');
const path = require('path');

const { getChatReply, readJsonBody, ChatError } = require('./lib/chat');
const leadHandler = require('./api/lead'); // /api/lead — Vercel 함수와 동일 핸들러 재사용

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

// --- 의존성 없는 .env 로더 ---
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnv();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function handleChat(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST 요청만 허용됩니다.' });
  try {
    const body = await readJsonBody(req);
    const reply = await getChatReply(body && body.messages, { sessionId: body && body.sessionId });
    sendJson(res, 200, { reply });
  } catch (err) {
    const status = err instanceof ChatError ? err.status : 500;
    const message = status >= 500
      ? '일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'
      : (err.message || '요청을 처리하지 못했습니다.');
    if (status >= 500) console.error('[server /api/chat]', err.code || '', err.message);
    sendJson(res, status, { error: message });
  }
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // 경로 탈출 방지
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];
  if (pathname === '/api/chat') return handleChat(req, res);
  if (pathname === '/api/lead') return leadHandler(req, res);
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  const keyStatus = process.env.OPENAI_API_KEY ? '✓ 감지됨' : '✗ 없음 (.env 확인 필요)';
  console.log(`\n  MS마켓 로컬 서버 → http://localhost:${PORT}`);
  console.log(`  OPENAI_API_KEY: ${keyStatus}\n`);
});
