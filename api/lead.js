'use strict';

// Vercel 서버리스 함수: POST /api/lead
// 랜딩 상담폼 → leads 테이블 저장. 로컬에서는 server.js가 동일 핸들러를 재사용.

const { readJsonBody } = require('../lib/chat');
const supabase = require('../lib/supabase');

function clean(v, max = 500) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'POST 요청만 허용됩니다.' }));
  }

  try {
    const body = (await readJsonBody(req)) || {};
    const lead = {
      store: clean(body.store),
      phone: clean(body.phone),
      channel: clean(body.channel),
      message: clean(body.message, 2000),
    };

    // 최소 검증: 연락처 또는 상호 중 하나는 있어야 함
    if (!lead.phone && !lead.store) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: '연락처를 입력해 주세요.' }));
    }

    // Supabase 미설정 시: 저장은 생략하되 폼 UX는 정상 동작
    if (!supabase.isConfigured()) {
      console.warn('[lead] Supabase 미설정 — 저장 생략(폼은 정상 처리)');
      return res.end(JSON.stringify({ ok: true, stored: false }));
    }

    await supabase.insertLead(lead);
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, stored: true }));
  } catch (err) {
    console.error('[api/lead]', err.message);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: '접수 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.' }));
  }
};
