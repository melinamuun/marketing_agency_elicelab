-- MS마켓 챗봇 Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.

-- 1) pgvector 확장
create extension if not exists vector;

-- 2) 문서 청크 + 임베딩 (RAG)
create table if not exists documents (
  id          bigserial primary key,
  source      text not null,
  chunk_index int  not null,
  content     text not null,
  embedding   vector(1536),            -- text-embedding-3-small 차원
  created_at  timestamptz default now()
);

-- 코사인 유사도 인덱스 (HNSW — 빈 테이블에도 안전하게 생성됨)
create index if not exists documents_embedding_idx
  on documents using hnsw (embedding vector_cosine_ops);

-- 3) 유사도 검색 함수 (top-K 코사인)
create or replace function match_documents(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (id bigint, source text, content text, similarity float)
language sql stable
as $$
  select d.id, d.source, d.content,
         1 - (d.embedding <=> query_embedding) as similarity
  from documents d
  where d.embedding is not null
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

-- 4) 상담 리드
create table if not exists leads (
  id         bigserial primary key,
  store      text,          -- 상호 / 업종
  phone      text,          -- 연락처
  channel    text,          -- 현재 운영 중인 채널
  message    text,          -- 하고 싶은 말
  created_at timestamptz default now()
);

-- 5) 대화 로그
create table if not exists chat_logs (
  id         bigserial primary key,
  session_id text,
  question   text,
  answer     text,
  created_at timestamptz default now()
);

-- 6) RLS 활성화 (정책 미추가 → anon/public 접근 차단).
--    서버는 service_role 키로 호출하므로 RLS를 우회해 정상 동작합니다.
alter table documents  enable row level security;
alter table leads      enable row level security;
alter table chat_logs  enable row level security;
