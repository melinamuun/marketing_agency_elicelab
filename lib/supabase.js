'use strict';

// Supabase 데이터 계층 — PostgREST REST API 직접 호출 (SDK 의존성 없음).
// service_role 키는 RLS를 우회하므로 반드시 서버에서만 사용. 클라이언트 노출 금지.

// SUPABASE_URL 정규화: 앞뒤 공백·줄바꿈 제거 후 끝의 슬래시·'/rest/v1'을 떼어 베이스만 사용
function url() {
  return (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
}
// 키도 앞뒤 공백·줄바꿈 제거(붙여넣기 시 흔한 오류 방지)
function serviceKey() { return (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(); }

function isConfigured() {
  return !!(url() && serviceKey());
}

function baseHeaders() {
  const k = serviceKey();
  return {
    apikey: k,
    Authorization: `Bearer ${k}`,
    'Content-Type': 'application/json',
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rest(pathAndQuery, opts = {}, retries = 3) {
  if (!isConfigured()) throw new Error('Supabase가 설정되지 않았습니다.');
  const endpoint = `${url()}/rest/v1/${pathAndQuery}`;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(endpoint, {
        ...opts,
        headers: { ...baseHeaders(), ...(opts.headers || {}) },
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        const e = new Error(`supabase ${res.status} ${t.slice(0, 300)}`);
        e.status = res.status;
        // 4xx는 재시도 무의미 → 즉시 throw
        if (res.status < 500) throw e;
        lastErr = e;
      } else {
        const text = await res.text();
        return text ? JSON.parse(text) : null;
      }
    } catch (e) {
      // 네트워크 오류(fetch failed 등)는 재시도
      if (e.status && e.status < 500) throw e;
      lastErr = e;
    }
    if (attempt < retries) await sleep(400 * (attempt + 1));
  }
  throw lastErr;
}

async function insertRows(table, rows, { returning = false } = {}) {
  return rest(table, {
    method: 'POST',
    headers: { Prefer: returning ? 'return=representation' : 'return=minimal' },
    body: JSON.stringify(rows),
  });
}

// id >= 0 필터로 전체 삭제(PostgREST는 DELETE에 필터 필수)
async function deleteAll(table) {
  return rest(`${table}?id=gte.0`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

async function rpc(fn, args) {
  return rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
}

// pgvector 유사도 검색 (코사인) — schema.sql의 match_documents 함수
async function matchDocuments(queryEmbedding, matchCount = 5) {
  return rpc('match_documents', { query_embedding: queryEmbedding, match_count: matchCount });
}

async function insertLead(lead) { return insertRows('leads', lead); }
async function insertChatLog(log) { return insertRows('chat_logs', log); }

module.exports = {
  isConfigured,
  rest,
  insertRows,
  deleteAll,
  rpc,
  matchDocuments,
  insertLead,
  insertChatLog,
};
