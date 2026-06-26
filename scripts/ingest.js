#!/usr/bin/env node
'use strict';

// uploads/*.md 를 청크 → 임베딩(text-embedding-3-small) → documents 테이블 적재.
// 실행: npm run ingest   (사전: .env 에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY)

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../lib/loadenv');
const { embed, EMBED_MODEL } = require('../lib/embeddings');
const supabase = require('../lib/supabase');

const ROOT = path.join(__dirname, '..');
loadEnv(ROOT);

const UPLOADS = path.join(ROOT, 'uploads');
const TARGET = 800;   // 청크 목표 길이(문자)
const OVERLAP = 120;  // 청크 간 겹침(문자)
const EMBED_BATCH = 64;

// 문단 경계로 ~TARGET 길이 청크 생성(약간의 overlap 포함)
function chunkText(text) {
  const paras = text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const chunks = [];
  let cur = '';
  for (const p of paras) {
    if (cur && (cur.length + p.length + 2) > TARGET) {
      chunks.push(cur);
      cur = cur.slice(-OVERLAP) + '\n\n' + p;
    } else {
      cur = cur ? cur + '\n\n' + p : p;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

async function embedAll(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const vecs = await embed(batch);
    out.push(...vecs);
    console.log(`  임베딩 ${Math.min(i + batch.length, texts.length)}/${texts.length}`);
  }
  return out;
}

async function main() {
  if (!supabase.isConfigured()) {
    console.error('✗ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env 확인).');
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('✗ OPENAI_API_KEY 가 필요합니다 (.env 확인).');
    process.exit(1);
  }

  const files = fs.readdirSync(UPLOADS).filter((f) => f.toLowerCase().endsWith('.md')).sort();
  if (files.length === 0) {
    console.error('✗ uploads/ 에 .md 문서가 없습니다.');
    process.exit(1);
  }
  console.log(`문서 ${files.length}개: ${files.join(', ')}`);
  console.log(`임베딩 모델: ${EMBED_MODEL}\n`);

  // 청크 만들기
  const rows = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(UPLOADS, f), 'utf-8');
    const chunks = chunkText(content);
    chunks.forEach((c, idx) => rows.push({ source: f, chunk_index: idx, content: c }));
    console.log(`  ${f}: ${chunks.length}개 청크`);
  }
  console.log(`\n총 ${rows.length}개 청크 임베딩 중…`);

  const vectors = await embedAll(rows.map((r) => r.content));
  rows.forEach((r, i) => { r.embedding = vectors[i]; });

  // 기존 documents 비우고 새로 적재
  console.log('\n기존 documents 삭제 중…');
  await supabase.deleteAll('documents');

  console.log('적재 중…');
  for (let i = 0; i < rows.length; i += 100) {
    await supabase.insertRows('documents', rows.slice(i, i + 100));
  }

  console.log(`\n✓ 완료: ${rows.length}개 청크를 documents 테이블에 적재했습니다.`);
}

main().catch((e) => {
  console.error('\n✗ ingest 실패:', e.message);
  process.exit(1);
});
