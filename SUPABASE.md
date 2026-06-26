# Supabase 연동 가이드

uploads/ 기반 챗봇에 **RAG(pgvector) · 리드 저장 · 대화 로그**를 추가했습니다.
Supabase를 설정하지 않아도 챗봇은 **전체 문서 주입으로 폴백**되어 정상 동작합니다.

## 아키텍처
| 기능 | 동작 | 폴백 |
|------|------|------|
| **RAG** | 질문 임베딩(text-embedding-3-small) → `match_documents` 유사도 top-5 → 관련 청크만 주입 | 검색 0건·오류·미설정 시 `uploads/*.md` 전체 주입 |
| **리드** | 상담폼 → `POST /api/lead` → `leads` | 미설정 시 저장 생략(폼은 정상) |
| **대화 로그** | 매 Q&A → `chat_logs` (best-effort) | 실패해도 응답 영향 없음 |

- `service_role` 키는 **서버에서만** 사용(RLS 우회). 클라이언트·깃 노출 금지.
- 로컬: `server.js` / 배포: Vercel 서버리스(`api/chat.js`, `api/lead.js`).

## 설정 순서

### 1. Supabase 프로젝트 생성
[supabase.com](https://supabase.com) → New project.

### 2. 스키마 생성
대시보드 → **SQL Editor** → [`supabase/schema.sql`](supabase/schema.sql) 내용 붙여넣고 **Run**.
(pgvector 확장, `documents`/`leads`/`chat_logs` 테이블, `match_documents` 함수, RLS 생성)

### 3. 키 확인
대시보드 → **Project Settings → API**
- `Project URL` → `SUPABASE_URL`
- `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ 비공개

### 4. 로컬 `.env` 설정
```
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 5. 문서 임베딩 적재 (1회, 문서 변경 시 재실행)
```bash
npm run ingest
```
→ `uploads/*.md`를 청크·임베딩해 `documents`에 적재합니다.

### 6. 로컬 실행 / 확인
```bash
npm run dev      # http://localhost:3000
```
- 챗봇 질문 → 콘솔에 RAG 동작, `chat_logs`에 기록
- 상담폼 제출 → `leads`에 저장

### 7. Vercel 배포
Vercel → **Settings → Environment Variables** 에 3개 등록:
`OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
→ 재배포. (`.env`는 깃에 올리지 않습니다 — `.gitignore` 적용됨)

> ⚠️ `npm run ingest`는 로컬/CI에서 1회 실행해 DB를 채우는 작업입니다.
> Vercel 빌드 시 자동 실행되지 않습니다(문서가 바뀌면 직접 재실행).

## 데이터 확인 (Supabase 대시보드 → Table Editor)
- `documents` — 청크 수만큼 행 + 임베딩
- `leads` — 상담 신청 내역
- `chat_logs` — 대화 기록(session_id별)
