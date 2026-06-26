'use strict';

// 챗봇 공유 로직 — 로컬 server.js 와 Vercel api/chat.js 가 함께 사용합니다.
// 외부 의존성 없음(Node 18+ 내장 fetch 사용).

const fs = require('fs');
const path = require('path');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-5.4-mini';
const BOT_NAME = '마케';
const MAX_HISTORY = 10;          // 최근 10개 메시지(5턴) 유지
const MAX_CONTENT_LEN = 2000;    // 메시지 1건 최대 길이(방어용)

let _kbCache = null;

class ChatError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status || 500;
  }
}

// uploads 폴더 위치 탐색 (로컬 / Vercel 양쪽 대응)
function findUploadsDir() {
  const candidates = [
    path.join(process.cwd(), 'uploads'),
    path.join(__dirname, '..', 'uploads'),
  ];
  for (const dir of candidates) {
    try {
      if (fs.statSync(dir).isDirectory()) return dir;
    } catch (_) { /* 다음 후보 */ }
  }
  return null;
}

// uploads/*.md 전체를 읽어 하나의 지식 베이스 문자열로 합침(콜드스타트 1회 캐시)
function loadKnowledgeBase() {
  if (_kbCache !== null) return _kbCache;
  const dir = findUploadsDir();
  if (!dir) { _kbCache = ''; return _kbCache; }
  const files = fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.md'))
    .sort();
  const parts = files.map((f) => {
    const content = fs.readFileSync(path.join(dir, f), 'utf-8');
    return `===== 문서: ${f} =====\n${content}`;
  });
  _kbCache = parts.join('\n\n');
  return _kbCache;
}

function buildSystemPrompt() {
  const kb = loadKnowledgeBase();
  return `당신은 디지털 마케팅 대행사 "MS마켓"의 웹사이트 상담 도우미 "${BOT_NAME}"입니다.
방문한 사장님(소상공인·중소기업 대표)을 돕는 친근하고 신뢰감 있는 안내자 역할을 합니다.

[정체성]
- 이름: ${BOT_NAME}
- 소속: MS마켓 (MS Market, "Make Sales — 매출을 만든다")
- 역할: MS마켓의 서비스·요금·진행 방식·문의를 안내하는 상담 도우미

[답변 규칙 — 질문 유형에 따라 다르게]
1) 자기소개·대화형 질문("이름이 뭐야", "넌 누구야", "안녕" 등):
   이름과 역할을 자연스럽고 친근하게 소개하며 대화를 이어갑니다.
2) 서비스·요금·정책 등 MS마켓 관련 질문:
   반드시 아래 [지식 베이스]에 담긴 내용만 근거로 답합니다.
   문서에 없는 내용이면 지어내지 말고, "정확한 내용은 무료 상담으로 안내해 드릴게요"라고 무료 상담을 권합니다.
3) MS마켓과 무관한 질문(날씨, 일반 상식, 코딩 등):
   "저는 MS마켓 서비스 관련 질문만 답해드릴 수 있어요 🙂"라고 정중히 안내합니다.

[엄격한 금지]
- 지식 베이스에 없는 정보는 절대 창작하지 않습니다.
- 문서에 '[연락처]', '[요금]', '[설립연도]' 처럼 대괄호로 비워진 항목은 아직 확정/공개되지 않은 정보입니다.
  구체 수치(가격·전화번호 등)를 묻는 경우 임의로 만들지 말고 무료 상담을 안내하세요.
- "무조건", "100% 보장" 같은 과장·단정 표현을 쓰지 않습니다.

[말투]
- 전문가의 신뢰감과 동네 사장님과 대화하는 친근함의 균형.
- 어려운 마케팅 용어는 쉽게 풀어서 설명.
- 한국어로, 2~4문장 내외로 간결하게. 필요하면 짧은 목록 사용.
- 슬로건: "광고비는 줄이고, 매출은 올리고."

아래는 답변 근거가 되는 MS마켓 공식 문서입니다. 이 범위 안에서만 사실을 인용하세요.
===== 지식 베이스 시작 =====
${kb || '(주입된 문서가 없습니다. 서비스 관련 질문에는 무료 상담을 안내하세요.)'}
===== 지식 베이스 끝 =====`;
}

// 클라이언트가 보낸 history 를 안전하게 정제 + 최근 10개로 제한
function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const cleaned = [];
  for (const m of history) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : null;
    if (!role) continue;
    let content = typeof m.content === 'string' ? m.content : '';
    content = content.trim();
    if (!content) continue;
    if (content.length > MAX_CONTENT_LEN) content = content.slice(0, MAX_CONTENT_LEN);
    cleaned.push({ role, content });
  }
  return cleaned.slice(-MAX_HISTORY);
}

async function getChatReply(history) {
  const messages = sanitizeHistory(history);
  if (messages.length === 0) {
    throw new ChatError('EMPTY', '메시지가 비어 있습니다.', 400);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ChatError('NO_API_KEY', 'OPENAI_API_KEY가 설정되지 않았습니다.', 500);
  }

  const payload = {
    model: MODEL,
    messages: [{ role: 'system', content: buildSystemPrompt() }, ...messages],
  };

  let res;
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new ChatError('NETWORK', 'OpenAI 서버에 연결하지 못했습니다.', 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[chat] OpenAI error', res.status, detail.slice(0, 500));
    throw new ChatError('UPSTREAM', `OpenAI 응답 오류 (${res.status})`, 502);
  }

  const data = await res.json();
  const reply = data && data.choices && data.choices[0] && data.choices[0].message
    ? String(data.choices[0].message.content || '').trim()
    : '';
  if (!reply) {
    throw new ChatError('NO_REPLY', '응답을 생성하지 못했습니다.', 502);
  }
  return reply;
}

// req.body(Vercel) 또는 스트림(로컬 http)에서 JSON 파싱
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'string') {
        try { return resolve(JSON.parse(req.body || '{}')); }
        catch (e) { return reject(new ChatError('BAD_JSON', '잘못된 요청 형식입니다.', 400)); }
      }
      return resolve(req.body);
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy(); // 1MB 초과 방어
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new ChatError('BAD_JSON', '잘못된 요청 형식입니다.', 400)); }
    });
    req.on('error', () => reject(new ChatError('REQ_ERROR', '요청을 읽지 못했습니다.', 400)));
  });
}

module.exports = { getChatReply, readJsonBody, ChatError, BOT_NAME };
