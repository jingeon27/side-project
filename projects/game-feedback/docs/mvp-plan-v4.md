# Game Feedback — MVP Plan v4.0

**기준일:** 2026-10-16\
**프로젝트:** `projects/game-feedback`\
**첫 출시:** 클래시로얄 중심 웹 서비스\
**핵심 가치:** 게임 피드백과 사용자 연결\
**개발 원칙:** 검증 → 핵심 경험 → 안전한 공개 → 확장

---

## Phase 0. 제품·기술 POC

### 제품 검증

- [ ] 피드백을 원하는 사용자 10명 인터뷰 또는 모집
- [ ] 피드백 제공자 5~10명 확보 시도
- [ ] 기존 커뮤니티에서 피드백 요청과 답변을 수동으로 연결
- [ ] 유효 답변의 정의 수립
- [ ] 첫 답변 소요 시간 측정
- [ ] 서비스의 유입 채널 실험
- [ ] MVP 포함·제외 기능 문서화

초기 가설:

- 사용자는 자신의 플레이에 대한 구체적인 피드백을 원한다.
- 다른 사용자는 보상 없이도 일정 비율의 피드백을 제공한다.
- 유용한 피드백을 받은 사람은 다시 방문한다.

**North Star Metric:** 주간 유효 피드백 성사 건수.

유효 피드백은 우선 요청자가 `도움됨`으로 표시한 답변이 하나 이상 있는 요청으로 정의한다.

### 기술 검증

- [ ] Supercell API 개발자 키 발급
- [ ] 등록 가능한 IP 및 배포 출구 IP 검증
- [ ] Player Tag → 게임 프로필 조회
- [ ] 덱·트로피 데이터 확인
- [ ] 덱·Battle Log 기반 인증 챌린지 가능성 조사
- [ ] 외부 번역 API 비용 및 호출 제한 확인
- [ ] 서비스명·도메인·팬 콘텐츠 정책 검토

**완료 조건:** 외부 서비스 연동 가능성을 실측하고, 최소한 초기 피드백 공급 가설에 대한 증거를 확보한다.

---

## Phase 1. 웹 기반 핵심 흐름과 비공개 알파

### 인프라 및 프로젝트 생성

기존 `side-project`의 Yarn 4 Workspaces 구조를 유지한다.

버전 기준:

| 기술 | 기준 |
|---|---|
| Node.js | 24 |
| Yarn | 4.17.0 |
| Next.js | 16.4.0 |
| React | 19 |
| NestJS | 기존 저장소 호환 버전 |
| PostgreSQL | 기존 운영 버전과 호환 |
| Prisma | 6.19.x |
| TypeScript | 5.9.x |
| Vitest | 4.x |

버전 업그레이드는 독립 작업으로 분리한다.

서비스 전용 설정:

| 항목 | 개발 환경 예시 |
|---|---|
| Web Port | 3300 |
| API Port | 4300 |
| PostgreSQL | 55442 |
| Test PostgreSQL | 55444 |
| Cookie Name | `gamefeedback_session` |
| Mobile Scheme | `gamefeedback` — 추후 |

위 값은 기존 photo-contest와 충돌하지 않도록 제안한 초기값이며, 실제 사용 가능 여부를 확인한다.

### DB 격리

- photo-contest와 PostgreSQL 서버만 공유 가능
- `game_feedback` 전용 database
- 전용 database user
- 전용 Prisma Client 및 Migration
- 로컬 embedded-postgres 전용 포트
- 테스트 전용 DB와 임시 스키마
- Test Kit 스키마 접두사 `gf_test_`
- 기존 photo-contest DB 접근 차단

`migrate reset`, `db push`, 자동 DB Reset 금지.

Migration은 검토된 SQL과 `migrate deploy` 기반으로 적용한다.

### 프로젝트 문서

- [ ] `AGENTS.md`
- [ ] `docs/product.md`
- [ ] `docs/architecture.md`
- [ ] `docs/implementation.md`
- [ ] `docs/decisions/`
- [ ] 테스트·커밋 스킬 및 운영 규칙
- [ ] 기존 저장소 파일 변경 허용 범위 정의

### 기본 Web Architecture

- Next.js 16 App Router
- `[locale]` 라우팅 초기 구성
- Tailwind CSS
- Radix UI
- TanStack Query v5
- React Hook Form + Zod
- NestJS + Express
- REST API
- OpenAPI + Orval

기본 URL은 `/ko`, `/ja`, `/en` 구조로 구성한다.

초기 UI 콘텐츠는 한국어 우선으로 구현하고, 외부 공개 전 다른 언어도 완성한다.

### 인증

- Google OAuth (`openid`, 공개 이름·사진 자동 수집 금지)
- 가입 시 서비스 닉네임 직접 설정
- 재로그인 시 닉네임 유지
- HttpOnly 세션
- 로그아웃
- 회원 탈퇴
- 이용약관 및 개인정보 처리방침
- 연령 정책에 따른 가입 제한·처리

### Game Domain

- `Category`
- `GameProfile`
- `UserGameAccount`

최초 활성 카테고리: 클래시로얄.

카테고리는 DB에서 관리하며 관리자만 추가할 수 있다. 초기에는 권한이 보호된 관리자 API와 최소한의 관리 수단을 제공한다.

게임 프로필은 Player Tag를 입력해 조회하고, 기본적으로 `UNVERIFIED` 상태를 사용한다.

피드백 요청을 작성할 때 해당 시점의 게임 정보와 덱 데이터를 스냅샷으로 보존한다.

### 핵심 피드백 흐름

1. 사용자가 로그인한다.
2. Player Tag를 등록한다.
3. 게임 프로필을 미리보기로 확인한다.
4. 피드백 요청을 작성한다.
5. 피드백 제공자가 답변한다.
6. 요청자가 답변 도착을 확인한다.
7. 요청자가 `도움됨`을 표시한다.

기능:

- 피드백 게시글 CRUD
- 피드백 답변 CRUD
- 기본 댓글 CRUD
- 최신순 목록
- Cursor Pagination
- TanStack Query 무한 스크롤
- 미답변 게시글 필터
- 알림함 및 새 답변 표시
- 답변 확인 상태
- 도움됨 표시

초기 알림은 인앱 알림과 사용자의 재방문 시 확인을 기본으로 한다. 서비스 밖으로 전달하는 이메일 알림은 별도 주소 수집·동의·인증을 거쳐 후속 도입한다.

### 웹 MVP 보안 최소 요건

- 작성자 권한 검증
- 게시글 신고
- 사용자 차단
- 관리자 콘텐츠 숨김
- 입력 검증 및 스팸 제한
- 연락처·운영자 안내
- 약관 동의 및 탈퇴

**완료 조건:** 제한된 사용자에게 배포해 피드백 요청 → 답변 → 확인 → 도움됨 흐름을 실제로 시험할 수 있다.

---

## Phase 2. 공개 베타 및 글로벌 지원

### 커뮤니티 운영

- 신고 유형 및 처리 상태
- 관리자 신고 목록
- 숨김·삭제 및 제재
- 처리 이력
- 사용자 차단 정책
- 게시물 작성 제한
- 부적절한 내용 필터링
- 사칭 신고 및 게임 계정 검증 취소

### 글로벌 지원

- 한국어·영어·일본어 완성
- UI 번역
- 게시글 제목·본문 번역
- 피드백 답변 `번역 보기`
- 원문 보기
- PostgreSQL 번역 캐시
- 원문 버전 관리
- 실패 시 원문 유지
- 국가·언어별 SEO

번역 대상과 호출 시점을 분리한다.

게시글 목록에서는 제목을 우선 번역하고, 본문과 답변은 사용자의 조회 요청에 따라 번역한다.

### Observability

**Web**
- Sentry: 오류 및 성능
- Amplitude: 사용자 행동·퍼널

**API**
- Sentry: 오류·외부 API 실패·성능
- Amplitude 미적용

**서버 내부 지표**
- DB AnalyticsEvent
- 24시간 내 첫 답변 비율
- 첫 답변까지 걸린 시간
- 도움됨 답변 비율
- 재방문·재요청 비율

Amplitude 이벤트와 서버의 실제 성공 지표를 구분한다.

### 테스트

- API Unit: Vitest
- API Integration: Vitest + Supertest
- Database: PostgreSQL 격리 테스트
- Web Component: Vitest + React Testing Library
- Web E2E: Playwright
- API Client Contract: 생성된 Orval Client를 실제 테스트 API에 실행

외부 OAuth·Supercell·번역 SDK는 인터페이스로 분리하고 테스트에서는 가짜 구현으로 강제한다.

### API 계약

서버 요청 검증 스키마를 기준으로 OpenAPI를 생성한다.

OpenAPI에서 Orval을 통해 Client와 클라이언트 검증 스키마를 생성한다.

CI에서는 생성 결과 불일치, 테스트 실패, 타입 오류를 검사한다.

서버 오류는 안정적인 `errorCode`로 반환하며, 사용자 노출 문구는 언어별로 번역한다.

**완료 조건:** 운영·안전·개인정보 기준을 갖춘 공개 웹 베타를 출시하고 실제 피드백 지표를 수집한다.

---

## Phase 3. 사용자 연결 및 운영 개선

사용자 연결 기능을 확대한다.

- 팔로우 / 언팔로우
- 팔로잉 사용자 활동
- 피드백 제공자 프로필
- 제공한 피드백 기록
- 도움됨 기반 평판
- 카테고리 관리 UI
- 게임 계정 검증 챌린지 — 기술 POC 성공 시
- 계정 소유권 분쟁 처리
- 답변 알림 고도화

**완료 조건:** 특정 사용자에게 피드백을 다시 요청하거나 계속 관계를 이어 가는 행동이 측정된다.

---

## Phase 4. 성능·캐시 최적화

초기 웹에서는 사용자 작성 콘텐츠의 Next.js 데이터 캐시를 사용하지 않는다.

서버 조회는 최신 데이터를 우선하고, TanStack Query에 명시적인 staleTime·갱신 정책을 둔다.

Mutation 성공 시:

1. NestJS에서 DB 커밋
2. 응답 반환
3. TanStack Query 관련 캐시 갱신
4. 작성자 화면 최신 상태 반영
5. 다른 사용자는 재방문·포커스 복귀·필요한 폴링으로 갱신

추후 실제 성능 지표가 필요성을 보여주면 Next.js Cache Tags를 도입한다.

이때 Server Action의 `updateTag`와 Route Handler의 `revalidateTag` 차이, 멀티 인스턴스 캐시 일관성, Router Cache의 갱신을 별도로 검증한다.

**완료 조건:** 캐시 도입 전후 성능과 정합성 개선이 테스트 및 측정으로 입증된다.

---

## Phase 5. 모바일 앱

웹에서 제품 수요가 확인된 후 개발한다.

- 기존 Expo WebView 셸 설계 참고
- React Native 버전 충돌 해결
- 전용 App Scheme
- Google 로그인 및 동등한 개인정보 보호 로그인 옵션
- Apple OAuth 필요 시 도입 및 검증
- Sentry + Amplitude
- 네이티브 딥링크·공유·알림
- 계정 삭제 UI
- 앱 스토어 UGC 요건
- 앱 심사 및 스토어 배포

앱의 제품 로직은 웹을 재사용하되, Native 오류·앱 실행·딥링크 이벤트는 App에서 수집한다.

---

## Phase 6. 게임 확장

- 브롤스타즈
- 리그 오브 레전드
- Riot API Production 승인
- RSO 소유권 인증
- 게임별 메타데이터 및 티어 모델
- 카테고리별 피드백 경험 개선

게임 카테고리 등록과 공식 게임 API 연동은 별개로 유지한다.

---

## Git / 병렬 개발 규칙

1. 각 기능은 독립 브랜치·PR로 개발한다.
2. 블로그 세션과 게임 서비스 세션은 별도 Worktree를 사용한다.
3. 각 프로젝트 내부 파일과 패키지 변경을 원칙으로 한다.
4. 공통 파일 변경 허용 범위는 루트 README, scripts, CI, package.json, yarn.lock로 제한하고 변경 이유를 기록한다.
5. 의존성을 변경하면 해당 package.json과 yarn.lock을 함께 커밋한다.
6. 기존 `photo-contest` 관련 테스트 및 실행 상태를 훼손하지 않는다.
7. 신규 DB 마이그레이션은 대상 database와 계정을 검증한 후 실행한다.
8. 개발·테스트·운영 데이터베이스를 각각 구분한다.
9. 테스트 성공과 실제 외부 서비스 검증을 구분해 기록한다.
10. 기능별 완료 기록에는 테스트 명령, 결과, 확인되지 않은 항목을 남긴다.

---

## MVP 첫 출시 성공 기준

기술 구현 완료만으로 MVP가 성공했다고 판단하지 않는다.

첫 공개 후 초기 검증 목표:

- 피드백 제공자 5~10명 참여
- 피드백 요청 30건 확보
- 24시간 내 첫 답변율 측정
- 도움됨 답변 비율 측정
- 피드백 이후 사용자 재방문율 측정
- 사용자 신고 처리 및 운영 정책 정상 동작

수치는 가설적 목표이며, 실제 사용자 행동을 통해 조정한다.

**가장 중요한 성공 조건은 실제로 누군가 피드백을 요청하고, 다른 사람이 도움을 주며, 요청자가 다시 돌아오는 경험이다.**
