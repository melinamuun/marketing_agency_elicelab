'use strict';

// OpenAI 임베딩 헬퍼 (text-embedding-3-small, 1536차원)
// 외부 의존성 없음(Node 18+ 내장 fetch).

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_URL = 'https://api.openai.com/v1/embeddings';

// input: 문자열 → 벡터 1개, 문자열 배열 → 벡터 배열
async function embed(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');

  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`embeddings ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const vectors = (data.data || []).map((d) => d.embedding);
  return Array.isArray(input) ? vectors : vectors[0];
}

module.exports = { embed, EMBED_MODEL };
