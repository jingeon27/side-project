## 2026-10-26 공통 EC2의 PostgreSQL 컨테이너 전환

사용자 결정으로 외부 RDS를 만들지 않고 공통 EC2 안의 PostgreSQL 18 컨테이너 하나를 두 서비스가 함께 쓴다. RDS는 만든 적이 없어 옮길 데이터는 없다. [공통 배포 가이드](../../../deploy/shared-instance/README.md)가 현재 기준이며 아래 2026-10-19 기록의 RDS·PITR 내용을 대신한다.

- 서비스별 DB와 DML/DDL role 분리는 유지한다. DB는 `shared-postgres` 별칭으로 서비스별 내부 Docker 네트워크에서만 보이고 Web은 연결하지 않는다. 같은 호스트 안의 연결이므로 `sslmode=disable`을 요구하고 RDS 호스트·CA 검사를 제거했다. `verify-services.ts`의 `rds_superuser` 검사도 뺐다.
- 데이터는 별도 EBS 볼륨(`/srv/side-postgres`)에 두고 DLM 일일 스냅샷을 7개 보존한다. 배포마다 migration 직전에 `pg_dump`를 backup 버킷에 올리고, 실패하면 배포를 멈춘다(이전 PITR 검사 대체).
- 기본 EC2를 `t3.small`로 낮췄다. 메모리가 모자라면 `t3.medium`으로 올린다.
- 호스트가 멈추면 Sentry도 신호를 보내지 못하므로 CloudWatch 알람을 추가했다. 인스턴스 상태 검사가 3분 연속 실패하면 재부팅하고, CPU 크레딧 부족을 알린다(`alarm_email`이 있을 때 메일).

| 실제 로컬 실행      | 결과                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------ |
| GF API unit 레인    | 186개 통과(공용 DB URL 검사 포함)                                                          |
| PC API unit 레인    | 127개 통과(공용 DB URL 검사 포함)                                                          |
| PC 배포 도구 Vitest | 50개 통과: 배포 전 덤프·업로드 실패 시 migration 차단, 볼륨 미마운트·backup 버킷 설정 거부 |
| 타입 검사           | GF API, PC API, PC Web 통과                                                                |
| Terraform 1.16.6    | fmt, backend 비활성 init, validate, mock provider plan 13개 통과                           |
| shellcheck 0.11.0   | 공용 배포 스크립트와 렌더링한 user-data 통과                                               |

실제 Docker로 두 서비스와 공용 DB를 띄우는 shared-instance smoke(`apps/api/scripts/shared-instance-smoke.ts`)는 로컬에 Docker가 없어 실행하지 않았으며 CI에서 확인해야 한다. 실제 AWS apply, 첫 부팅의 볼륨 포맷·마운트, 스냅샷·덤프 복원은 미검증이다.

## 2026-10-25 환경 설정 통일과 Sentry release·MCP 검증

## 2026-10-25 루트 .env만 사용하는 설정 계약

설정 파일은 도구가 지원하면 TypeScript를 우선한다. Game Feedback의 Next 설정과 Vite Admin의 PostCSS, 블로그의 ESLint 설정을 `.ts`로 바꿨다. 블로그는 독립 설치에서도 TypeScript ESLint 설정을 읽도록 기존 저장소에서 사용 중인 jiti를 개발 의존성에 선언했다. 설치된 Next의 PostCSS 설정 탐색은 `.ts`를 지원하지 않으므로 Next 웹들의 PostCSS 설정은 각 앱의 `package.json` `postcss` 필드에 둔다. 설정 값은 바꾸지 않았다.

설정 변환 검증: Web·Admin·Blog 타입/린트, Web 205개·Admin 19개 기존 테스트, Admin production 빌드와 Next production 설정 로더를 통과했다.

사용자 지정에 따라 프로젝트 루트 `.env`에 정의된 키만 앱 설정으로 유지했다. Web·API·Admin·Mobile·테스트 실행기의 별도 환경변수와 모바일 env 템플릿을 제거했다. OS·Node·Next·CI가 제공하는 실행 변수와 저장소 공용 배포 도구의 이미지·네트워크·DDL 계정 입력은 앱 설정과 구분한다. 마이그레이션 컨테이너는 전용 계정 URL을 DATABASE_URL로 받으며 런타임 앱에는 DDL 계정을 주지 않는다. RDS 호스트는 DATABASE_URL에서 확인하고 기존 TLS·역할 검증을 유지한다.

데모·테스트 인증은 명시적 실행 인수·createApp 옵션으로만 활성화하고 운영에서는 거부한다. 테스트 DB는 전용 55444 포트와 실행별 gf_test_ 스키마를 쓰며 브라우저 실행기는 다른 레인의 스키마를 재사용하지 않는다. 캐시 콜백 URL은 WEB_ORIGIN에서 정하고 운영에서는 내부 gf-web 주소를 사용한다. API가 권한 600의 .data/cache-revalidation.key를 원자적으로 생성하고 Web은 읽기 전용 볼륨으로 공유한다. SSR 방문자 주소 서명에도 같은 비공개 자격 증명을 사용한다. Sentry 환경·release는 ENVIRONMENT·SENTRY_RELEASE로 통일한다.

별도 App Link·인증서 설정과 시스템 브라우저 인증 연결을 제거했다. 웹 소셜 로그인은 유지하고 모바일 로그인 화면은 웹 브라우저 이용을 안내한다. 별도 운영 관리자 토큰 프록시 설정도 제거하여 관리자 앱은 로컬 격리 테스트 로그인만 제공한다.

검증: API unit 167개·통합 192개, Web 205개, Mobile 57개, Admin 19개를 통과했다. 실제 AWS에서 게시물 PNG·MP4, 프로필 JPEG, 채팅 PNG·MP4의 presigned 업로드·완료·권한·HEAD·GET·Range·CORS를 재검증했다. 생성한 10개 객체는 DELETE 204로 정리했다.

production build/start에서 PPR 프리패치 브라우저 검사를 통과했고 Android·iOS 개발 번들을 생성했다.

두 앱의 확인용 PNG는 upload-verification 경로에 따로 남겼다. 개발 서버를 직접 종료·재시작하거나 개발 DB·Terraform·운영 배포를 변경하지 않았다. Docker 실행기가 없어 컨테이너 재시작·배포 smoke는 실행하지 않았다. 아래의 이전 날짜별 기록은 당시 설정을 설명하며 현재 환경변수 계약은 루트 .env.example을 따른다.

사용자 설정을 ENVIRONMENT(development/test/production) 하나로 통일했다. 실행기가 프레임워크용 NODE_ENV를 파생하고 Sentry도 같은 환경 값을 사용한다. SENTRY_ENVIRONMENT와 GAME_FEEDBACK_INDEXING/GF_INDEXING 설정을 제거했으며 검색 공개는 운영 환경·HTTPS·비로컬 origin·데모 비활성 조건으로 판단한다. 개인 화면과 테스트 계정은 계속 검색에서 제외한다. 기본 저장소와 실행 worktree의 로컬 환경 파일도 필요한 항목만 이행했다.

Next 서버와 브라우저 초기화에 release를 연결했다. SENTRY_RELEASE 하나를 브라우저 빌드에도 주입하므로 공개 release 환경변수를 따로 설정하지 않는다. 공유 workflow/Dockerfile은 GitHub commit SHA를 웹 빌드에 전달하고 Compose는 같은 SHA를 API와 Next 런타임에 전달한다. 이 연결과 기존 색인 플래그 제거를 위해 공통 workflow와 배포 문서를 함께 수정했다.

실제 서버 전송 검사에서 Next SDK 11.7이 Node SDK 10을 참조해 초기화와 오류 수집이 다른 core를 쓰는 의존성 배치를 확인했다. 재설치만으로 해결되지 않아 이 프로젝트 API의 Node SDK도 11.7.0으로 맞추고 개인정보 수집 설정을 해당 버전의 dataCollection으로 이행했다. 루트 lockfile의 API 의존성 한 항목만 변경했다. 실제 Next 요청 오류가 가짜 transport까지 도달하고 환경·release를 포함하며 비공개 요청/메시지는 제거하는 회귀 테스트를 추가했다.

최종 검증: 전체 프로젝트 check, API unit 174개, Web unit/UI 224개, 독립 3353/4353의 production build/start 관측 E2E 3개가 통과했다. 테스트는 독립 gf_test_ 스키마와 가짜 인증·게임 제공자 및 관측 키를 사용했고 실행 뒤 스키마를 정리했다. Actionlint와 변경 파일 형식 검사도 통과했다.

사용자 요청에 따라 공식 Sentry MCP를 등록하고 사용자가 OAuth 승인을 완료했다. MCP로 조직·프로젝트를 조회한 뒤 실제 브라우저·API·Next 서버 테스트 이벤트의 수신과 development 환경 및 동일 release를 확인했다. 이 외부 수신 검증은 위 가짜 키 E2E와 별도다. 인증 토큰·DSN·쿠키는 저장소에 포함하지 않았다. 소스맵 업로드나 운영 배포는 수행하지 않았다.

## 2026-10-25 develop 기준 갱신과 로컬 Discord 설정 반영

기본 저장소의 develop과 S3 작업 브랜치를 origin/develop의 b417b10c까지 fast-forward했다. 미커밋 변경 82개 파일은 별도 보관 후 다시 적용했으며, 테스트 주소 환경변수 충돌은 최신 GF_E2E_WEB_ORIGIN으로 정리했다. S3 업로드 변경은 유지하고 기본 저장소 .env의 Discord 설정 세 항목만 실행 worktree에 복사해 3300/4300을 재시작했다. 키와 OAuth state·쿠키는 출력하지 않았다.

전체 프로젝트 check와 API 인증·설정 테스트 33개, 로그인 UI 2개, SDK 72개가 통과했다. 실행 중인 웹의 세션 응답에서 Discord configured=true, 로그인 시작의 Discord authorize 302, 설정한 client ID·localhost 콜백 주소·identify scope·HttpOnly state 쿠키 일치를 확인했다. 실제 제공자의 동의·토큰 교환·로그인 완료는 수행하지 않았다. Blog 3100·Photo Contest 3200·Admin 3303의 응답도 확인했으며 기존 DB 프로세스와 데이터를 유지했다.

## 2026-10-25 실제 AWS S3 연결 확인

사용자가 기본 저장소 .env에 입력한 GF_S3 설정만 실행 중인 별도 worktree에 반영하고 Game Feedback 웹/API를 재시작했다. 키·쿠키·서명 URL은 출력하지 않았다. 실행 DB는 그대로 유지하고 loopback 55444의 독립 gf_test_aws_s3_ 스키마에 migration·가짜 인증/게임 제공자를 준비해 실제 AWS 경계만 검증했다.

jingeon-side-project/game-feedback/local에서 게시글 사진·채팅 사진·프로필 사진·직접 녹화한 WebM 업로드 모두 브라우저 presigned POST 204, API의 HEAD/서명 검사/조건부 CopyObject 완료 200을 확인했다. 서버에서 presigned GET으로 받은 네 파일의 바이트가 원본과 같고, 이미지 표시(1×1)·영상 메타데이터 표시(160×90), API HEAD, 서버 Range 206도 통과했다. 서명 없는 객체 조회는 모두 403이었다. 각 실행에서 만든 S3 객체(최종 실행 8개)와 격리 DB 스키마는 정리했다.

최초 요청에서는 브라우저 JavaScript fetch GET과 Range가 CORS에서 차단됐고, 서버 GET에도 Access-Control-Allow-Origin이 없었다. 이후 사용자가 제시한 POST·GET·HEAD 및 ETag·Content-Length·Content-Range 노출 설정을 기준으로 새 객체·서명 URL과 새 브라우저에서 재검증했다. 네 업로드 흐름 모두 브라우저 GET 200, Range 206과 Content-Range 읽기·원본 바이트 비교가 통과했고, 최종 테스트 객체 8개와 격리 스키마를 정리했다. 현재 기능 검증은 전체 성공이다. 최초 응답과 달라진 이유는 단정하지 않는다.

localhost:3300의 POST·GET·HEAD OPTIONS는 모두 200과 해당 Origin 허용 헤더를 반환했다. 127.0.0.1:3300은 제공된 AllowedOrigins에 없으며 OPTIONS 403을 확인했다. localhost로 접속하거나 IP 주소로 사용할 경우 해당 Origin을 별도로 추가한다. 테스트 키의 GetBucketCors는 계속 AccessDenied 403이지만 앱 업로드·조회 동작에는 필요하지 않다. Terraform·IAM·버킷 CORS·다른 앱 설정은 변경하지 않았다.

## 2026-10-25 모든 파일 S3 직접 업로드와 제목 상한 정리

게시글·채팅·프로필 사진의 저장 경로를 S3 presigned POST로 통일했다. DATABASE·FILESYSTEM 런타임 드라이버, multipart API와 PROXY/DIRECT 계약 분기를 제거했다. 프로필은 사용자별 AvatarUpload 예약·완료·취소를 추가하고 웹에서 방향·중앙 자르기·512px JPEG 변환 후 전송한다. API는 메타데이터·파일 앞 4KB 서명만 확인하고 동일 ETag 조건의 복사로 최종 파일을 고정한다. 조회 권한·차단·기록 경계, HEAD·Range와 기존 파일 URL은 유지한다. 제목 작성·수정 상한은 120자에서 60자로 줄이고 이전 긴 제목 조회는 유지했다.

로컬 개발은 loopback 4310의 영속 S3 대역을 사용하며 실제 AWS 테스트는 AWS_PROFILE과 서비스별 key prefix를 설정한다. IAM 키 발급·CORS·Terraform 관리 범위와 별도 버킷 구성은 media-upload.md에 기록했다. 기존 bytes/FILESYSTEM 자료는 별도 오프라인 도구가 한 파일씩 전송·HEAD·SHA-256 검증 후 조건부로 참조를 교체한다. 기본은 dry-run이며 실패한 파일의 원래 참조와 파일 원본은 유지한다. 새 AvatarUpload migration은 확장만 수행한다. 공유 Compose에서 더 이상 읽지 않는 GF_MEDIA_STORAGE만 제거했고 Terraform 리소스·state는 바꾸지 않았다.

검증(Node 24, feat/game-feedback-s3-only): 프로젝트 전체 check(모든 앱/패키지 타입·lint), API build, API unit 174개·격리 DB integration 191개, Web unit/UI 221개, SDK 72개와 새 SQL의 migration 호환성 검사를 통과했다. 사용 중인 3301/4301을 유지하고 별도 3353/4353 및 새 gf_test_ 스키마에서 production build/start 브라우저 8개로 프로필 사진·채팅 사진/동영상·게시글 미디어·실패 초안·수정·문의 흐름을 검증했다. 예전 multipart 경로를 가로채던 테스트와 시트 본문 밖 하단 버튼을 찾던 선택자를 현재 흐름으로 맞춰 해당 3개를 재검증했다. 테스트 서버와 생성 스키마는 teardown했다.

요청된 로컬 환경에서는 기존 DB 스냅샷을 보관하고 가드된 db:sync로 추가 테이블을 준비했다. 기존 파일 2개를 로컬 S3에 검증해 이행한 뒤 3300/4300을 이 브랜치의 앱으로 전환했다. Admin 3303은 테스트 인증으로 일반·프로필 인증 문의와 관리자 답변을 확인했으며, 게시글·채팅 S3 전송/조회와 61자 제목 거부를 다시 확인했다. Blog 3100과 Photo Contest 3200 및 기존 DB 소유 프로세스는 유지했다. 실제 AWS 키·버킷 업로드, Terraform apply와 운영 배포는 이 검증에 포함하지 않았다.

## 2026-10-25 구형 단독 배포 잔여 정리

최신 develop에서 주요 단독 배포 파일이 제거된 뒤 남아 있던 백업 업로드·설정 검증 CLI와 백업 전용 SDK 의존성을 제거했다. S3를 사용하는 공유 배포 이미지에서 이전 로컬 미디어 디렉터리를 만드는 단계도 제거했다. Admin 세션·Prisma 스킬의 운영 안내는 공통 service.sh와 현재 Compose의 migrate 서비스로 맞췄고, 폐기한 smoke 경로와 단독 배포 기록을 가리키던 문구를 정리했다. 루트 yarn.lock 변경은 사용처가 없어진 백업 의존성과 그 전이 의존성을 정리하기 위한 것이다.

검증: Node 24에서 API unit 167개·typecheck·build와 공유 배포 Vitest 20개가 통과했다. 프로젝트 lint, 관련 workflow의 Actionlint, 변경 문서·manifest·lockfile Prettier와 diff 검사를 통과했다. 추적 파일 전체에서 구형 배포 이름·경로·백업 환경변수 참조가 남지 않았고, 현재 운영 스크립트와 스킬의 문서 경로가 존재함을 확인했다. Docker 엔진이 없어 실제 이미지 재빌드·컨테이너 smoke는 실행하지 않았다. 운영 인프라·DB를 변경하거나 배포하지 않았다.

## 2026-10-25 PR #69 가입 프로필·멘션과 최신 시트 통합

병합된 #13·#67·#70을 반영하고 #68의 탈퇴 변경을 함께 통합해 인증 모듈과 구현 기록의 후속 병합 충돌을 해소했다. 설정의 게임 계정 등록은 반응형 시트와 하단 버튼을 유지하고, 가입 중 선택적인 게임 프로필 조회는 독립 GameProfileLookup으로 분리했다. 조회 대기 중 입력을 잠가 이전 태그 응답으로 새 입력의 선택값이 바뀌지 않게 했다. 프리패치 검사는 페이지 종료 뒤 response.finished promise를 기다리지 않고 requestfinished를 관찰한다.

검증(Node 24): 공통 디자인 시스템과 두 서비스 API/Web 타입 검사·lint, 단위/UI 1,183개와 가입·탈퇴·제재·계정·알림·익명 세션·생성 GraphQL 계약 통합 140개(Game Feedback 109, Photo Contest API 11·Web 20) 통과. Game Feedback production 브라우저 24개(시트·가입·태그·멘션 12, prefetch 12), Photo Contest Chrome·WebKit·데스크톱 브라우저 29개(알림·익명 참여·댓글·홈·테마·접근/레이아웃)가 통과했다. 새 격리 DB 스키마와 별도 테스트 서버만 사용하고 teardown했다. 현재 계약 재생성 diff는 없으며 migration 호환성 검사를 통과했다. 실제 외부 OAuth·AWS·실기기와 컨테이너 smoke는 이번 실행에 포함하지 않는다.

## 2026-10-25 PR #68 탈퇴와 현재 제재 정책 통합

탈퇴 시 User 행을 익명으로 남기고 본인 글·답변·댓글의 내용을 비운다. 다른 작성자의 답변·댓글은 보존하고 본인의 원댓글에 달린 타인 답글은 독립 댓글로 분리한다. 개인정보·계정 연결·세션·로그인 티켓·대화·첨부와 관계를 정리하며 공개 프로필·팔로우·차단·채팅에서 탈퇴 사용자를 제외한다. 글·탐색 캐시 무효화를 같은 트랜잭션에 기록한다.

현재 BannedIdentity를 재사용하고 제재 후 탈퇴한 식별자의 새 가입은 거부한다. 기존 제재 계정은 탈퇴 전 문의할 수 있으며, 운영자는 익명 행의 기존 ID로 제재를 해제할 수 있다. 탈퇴·제재·세션 발급의 User 잠금으로 경합을 직렬화한다. 겹치던 RetainedIdentityRestriction과 정적 proxy secret·Lightsail 코드는 제거하고 develop의 HMAC 방문자 서명 체계를 유지했다. migration은 새 nullable withdrawnAt 컬럼 하나만 추가한다.

검증(Node 24): 계약 생성, API 타입 검사, 프로젝트 lint와 API unit 167개, 새 격리 스키마에 migration을 적용한 탈퇴·제재·OAuth·댓글·프로필·문의·SSR 제한 통합 107개(탈퇴 회귀 7개 포함)가 통과했다. 사용 중인 전용 테스트 DB 서버를 유지하고 테스트가 만든 스키마만 teardown했다. 실제 OAuth·AWS·운영 DB 변경은 수행하지 않았다.

## 2026-10-25 PR #67 최신 develop 통합

현재 mutation options·가이드·로그인 안내를 유지하면서 반응형 시트와 하단 작업 버튼을 통합했다. 모바일 브라우저·WebView는 전용 로그인 페이지로 이동하고 데스크톱은 모달을 사용한다. 화면 크기 판정은 로그인 시점에 읽어 목적지 쿼리를 보존한다.

검증(Node 24): Web 타입·lint·단위/UI 220개, 공통 디자인 시스템 타입·lint·137개 테스트 통과. 사용 중인 3301/4301을 유지하고 별도 3353/4353 및 새 gf_test_ 스키마에서 production build/start 브라우저 11개가 통과했다. 드래그·터치·리사이즈·폼 제출·취소·hover·로그인 안내·목적지 복귀를 확인하고 테스트 스키마와 서버는 teardown했다. 실제 외부 OAuth와 기기 검증은 포함하지 않는다.

# 2026-10-22 반응형 팝업과 하단 작업 버튼·로그인 hover

Game Feedback의 입력·신고·삭제·차단·채팅 기록 삭제·계정 등록·탈퇴 창과 로그인창을 공통 반응형 팝업에 연결했다. CSS 미디어쿼리로 768px 미만은 BottomSheet, 그 이상은 중앙 모달로 표시한다. 하나의 Drawer 인스턴스와 본문을 유지해 화면 크기를 바꿔도 입력·포커스를 보존한다. 모바일 브라우저·앱 WebView의 전용 로그인 페이지와 OAuth 복귀 경로는 유지하고 데스크톱 로그인은 중앙 모달로 표시한다.

작업 버튼은 스크롤 본문 밖 하단 `footer`에 가로로 배치하고 상단 X를 숨겼다. 본문 폼의 `id`와 하단 제출 버튼의 `form` 속성을 연결해 HTML 검증·Enter 제출을 유지한다. 진행 중 닫기 방지도 기존 mutation 상태로 제어한다. 게임 계정 등록은 조회·등록 버튼을 같은 하단 영역에서 전환하며 이미지 보기와 로그인창은 하단 닫기 버튼을 제공한다.

공통 디자인 시스템에 `footer`·`responsive`·`showCloseButton`을 더한 이유는 시트 높이·본문 스크롤·포커스와 하단 영역을 같은 primitive에서 관리하기 위해서다. 새 반응형 동작과 X 숨김은 소비 앱이 선택하며 Game Feedback에서 켰다. 로그인 hover는 제공자 배경을 상태별로 유지하고, 공용 `text-button` 타이포 유틸리티와 겹치던 앱의 링크 스타일 이름을 `text-action`으로 분리해 브랜드 배경이 지워지거나 밑줄이 생기는 문제를 고쳤다.

검증(Node 24, `side-project-local`): Web 타입·lint, 디자인 시스템 타입·lint, Web unit/UI 192개·디자인 시스템 137개가 통과했다. 실제 Next production build/start와 격리 테스트 DB의 Playwright 8개로 네 제공자 hover 색·밑줄, 모바일 시트·데스크톱 모달, 드래그·터치·키보드, 화면 크기 변경 시 입력·단일 창 유지, 하단 가로 배치·스크롤 고정·폼 제출·취소·포커스 복귀와 기존 OAuth 복귀 경로를 확인했다. 테스트 스키마는 teardown으로 정리하고 테스트 DB도 종료했다. 외부 OAuth와 실제 기기 키보드는 이번 검증에 포함하지 않았다.

## 2026-10-24 인터랙션 분석과 develop 반영

Amplitude에 클릭·포커스·선택 변경·입력 여부·폼 제출과 25/50/75/100% 스크롤·화면별 활성 체류 이벤트를 추가했다. 화면 종류·locale·브라우저/WebView·화면 크기의 기존 공통 속성과 영역·컨트롤·액션·위치·이동 대상 화면·체크 상태·선택 인덱스를 함께 기록한다. 입력 문장·비밀번호·검색어·사용자 콘텐츠·URL 쿼리를 속성으로 보내지 않고, 입력은 600ms로 모으며 설정 키가 비어 있으면 추적기를 설치하지 않는다. 실제 Amplitude 수신 검증은 포함하지 않는다.

최신 develop `6d858497`의 https 앱 로그인 콜백·Prisma 7.10.1·mutation options를 유지해 병합했다. 이동한 Dockerfile에도 Node 24 고정과 prisma.config.ts 복사를 반영했다. Node 24의 프로젝트 check·Web 220개·API unit 164개·모바일 83개·Bridge 14개, OAuth/관리자 권한 통합 7개와 production Web 로그인 안내·가이드·헤더 E2E 13개가 통과했다. SDK 재생성 diff는 없었다. 테스트는 격리 DB 스키마와 가짜 외부 제공자를 사용했고 3301 프리뷰는 200 응답을 확인했다. RN push와 블로그 분석은 이 변경의 구현 범위에 포함하지 않는다.

## 2026-10-23 모바일 피드 브랜드 헤더

홈·게시판 모바일 상단을 Game Mate 워드마크와 검색·알림 아이콘으로 구성했다. 높이는 60px, 터치 영역은 44px 이상이며 좌우 공통 여백을 유지한다. 모바일 피드의 언어 설정은 프로필의 설정에서 열고 데스크톱 언어 선택은 상단에 남긴다. 페이지별 Topbar 선언은 유지하며 공통 Root는 표현용 className을 받는다. Web 타입·lint와 관련 E2E 22개, Android/iOS WebView 홈·게시판 탐색 4개가 통과했다. 320px 한국어·390px 영어·760px 일본어와 다크 모드를 캡처했으며 3301 프리뷰를 유지했다.

## 2026-10-23 로그인 필요 액션 안내

비회원이 글쓰기·채팅·팔로우·신고·차단·댓글/답글·피드백·관리자 문의를 누르면 공통 로그인 안내 모달을 먼저 연다. 취소·닫기·Escape·앱 뒤로 가기는 현재 화면과 필터를 유지하며, 로그인하기를 확인한 경우에만 기존 로그인 절차를 연다. 모바일/앱은 로그인 페이지, 데스크톱은 로그인 방법 모달을 사용하며 로그인 후 돌아갈 화면의 경로와 쿼리를 보존한다. 명시적인 로그인/시작하기 버튼은 바로 로그인 절차를 연다. 안내 문구는 한국어·영어·일본어를 제공한다.

Node 24에서 Web·Mobile 타입 검사와 lint, Web unit 192개가 통과했다. 3353/4353의 격리 서버에서 로그인 안내·기존 로그인·화면 모드 Web E2E 10개, Android/iOS WebView에서 앱 로그인·뒤로 가기·세션 복귀·인증 취소 E2E 8개가 통과했다. 320px·1440px 안내 모달 캡처를 확인했다. 외부 OAuth는 가짜 제공자와 시스템 인증 대역으로 검증했으며 실제 제공자·실기기 검증은 실행하지 않았다. 3301 로컬 프리뷰와 사용자 개발 서버는 유지했다.

## 2026-10-23 가이드 문서 구성과 모바일 가로 여백

가이드를 모바일 하단 탭과 데스크톱 주 메뉴에서 빼고 프로필의 서비스 안내와 공통 하단 링크에서 열도록 옮겼다. 목차 버튼·제목 링크·화살표·홈 이동 버튼을 제거하고, 아홉 개 항목과 다섯 게시판 설명을 한 열의 제목·문단으로 정리했다. 모바일 본문 h1은 접근성을 유지하면서 시각적으로 숨기며 상단바에는 가이드 제목만 표시한다. 가이드의 기본 상위 화면은 프로필이며, 링크를 통해 열면 브라우저와 앱의 뒤로 가기가 진입 화면으로 돌아간다.

모바일 본문·상단바·하단 안내의 가로 여백을 좌우 16px과 기기 안전 영역 기준으로 통일했다. 320·393·430·760px에서 홈·가이드·프로필의 좌우 정렬과 가로 넘침을 검사했다. 한국어 320px·영어/일본어 393px·데스크톱 1440px의 라이트·다크 캡처를 확인했다. Web E2E 25개, Android/iOS WebView 탐색 E2E 4개, Bridge 12개와 Web 탐색·언어 unit 24개가 통과했다. Web·Mobile·Bridge 타입 검사와 Web lint를 통과했으며, 실행 중인 3301 프리뷰와 사용자의 개발 서버는 유지했다.

## 2026-10-23 공유 배포 경로와 관리자 권한 부여 정리

구형 단독 배포의 CloudFormation·Compose·Caddy·운영 스크립트와 전용 컨테이너 smoke를 제거했다. 현재 공유 EC2/RDS/S3 빌드에 쓰는 Dockerfile·dockerignore는 `deploy/shared-instance`로 옮기고 Actions·Dependabot·Admin 운영 안내를 연결했다. 공개 도메인·문의 이메일 검증은 공유 이미지 빌드 job으로 옮겨 보존했다. 운영 인프라를 삭제하거나 배포하지 않았다.

Google subject 환경변수에 의한 가입·로그인 자동 관리자 승격을 제거했다. 가입자는 USER이며 관리자 권한은 SSH operator CLI의 grant와 감사 기록으로 부여하고 별도 Admin 앱이 API의 ADMIN 권한 검사를 거쳐 기능을 사용한다. 기존 ADMIN의 권한은 로그인 시 그대로 유지한다. 관련 환경변수 예제·Compose·테스트 실행 설정·스킬 안내도 정리했다.

검증: API 타입 검사와 OAuth/운영자 역할 통합 사양 7개, 공유 배포 Vitest 20개, Actionlint가 통과했다. 역할 검사는 이 세션의 프리뷰가 소유한 55444 테스트 DB에 새 격리 스키마를 만들고 종료 시 정리했으며 프리뷰·개발 서버를 중지하지 않았다. Docker 엔진이 없어 이동한 이미지의 실제 컨테이너 재빌드는 로컬에서 실행하지 않았다. 공통 workflow와 배포 문서 변경은 구형 경로 제거 후 현재 이미지 빌드·운영 명령을 유지하는 데 필요하다.

# 2026-10-22 API·패키지 ESLint와 엄격한 tsconfig 연결

PR #49 병합 후 후속 충돌 해소: develop `899349f7`을 병합했다. 공용 ESLint README에 React DOM 접근성 preset·모바일 FSD 경계와 #50의 API·패키지·migration-check 적용 범위를 모두 남겼다. 자동 병합된 오류 경계와 글쓰기 테스트는 `override`·`on*` 콜백을 함께 유지했다. Node 24에서 immutable 설치, Game Feedback 집계 `check`, photo-contest 전체 타입·루트/Web/Mobile lint, design-system 타입·lint, eslint-config `check`(89개), migration-check `check`(70개), Admin 21개와 photo-contest 글쓰기·오류 경계 테스트가 통과했다. SDK 재생성 추가 diff가 없었다. 이번 후속 병합은 API 구현·계약을 바꾸지 않았으며 DB 통합·브라우저 E2E·운영 빌드는 다시 실행하지 않았다.

PR #50 충돌 해소: 작업 도중 반영된 원격 rebase(`c0401942`)를 보존하고 develop `87b48331`을 병합했다. 최신 채팅의 상대 목록 숨김·일괄 조회·SQL 미읽음 집계와 `conversationPair`·`nextPageAnchor`를 함께 유지했다. 신고 목록도 공통 커서 도우미로 바꾸고, 새 통합 테스트의 Location 헤더·문의 이력 관계·댓글 DTO를 엄격한 타입에 맞췄다. 새 코드의 미사용 변수·else를 고쳐 프로젝트 lint와 migration-check lint를 유지했다. 공통 ESLint 안내는 최신 preset·플러그인 설명과 API·패키지 적용 현황을 합쳤다.

검증(Node 24, 이 worktree): 집계 `check`(7개 워크스페이스 타입·API/패키지·Web/Mobile/Admin lint), API unit 155개·격리 PostgreSQL 통합 170개, SDK 69개·Bridge 11개·Web 192개·Mobile 54개·Admin 21개, migration-check `check` 70개, eslint-config `check` 80개가 통과했다. photo-contest 전체 타입, design-system·blog 타입 검사와 API 운영 빌드도 통과했다. SDK 재생성의 추가 diff가 없고, 운영 모듈 로드 및 `dist/testing` 제외를 확인했다. 통합 테스트가 만든 스키마는 테스트가 정리했으며, 이 worktree가 소유한 테스트 DB는 종료했다. 브라우저 E2E·컨테이너 smoke는 이번 충돌 해소에서 실행하지 않았다. 아래 검증 수치는 원래 구현 시점의 기록이다.

프로젝트 루트 `eslint.config.ts`가 Web·Admin·Mobile을 제외한 `apps/api`, `packages/{contracts,sdk,bridge}`, 프로젝트·API 스크립트를 공용 `baseConfig`로 검사하고 집계 `check`가 실행한다. 생성 코드(`src/generated`, SDK `generated`)와 `dist`는 산출물 제외로 빠진다. 위반 44건(`side/no-else` 19, `no-unused-vars` 16, `no-explicit-any` 6, `no-require-imports` 3)을 고쳤다. 루트 `migration-check`에도 `baseConfig`와 `check`를 연결해 `side/no-else` 1건을 고쳤고, game-feedback·photo-contest CI가 `test` 대신 `check`를 실행한다.

API·contracts·bridge·sdk tsconfig는 `@side/config/typescript`를 상속한다. 서버 API와 React Native 공용 bridge는 `lib`를 ES2022로 명시해 DOM을 뺐고, Web·API 공용 contracts는 `URL` 때문에 DOM만, 브라우저 SDK는 기존 DOM·DOM.Iterable을 유지한다. `noUncheckedIndexedAccess` 오류는 목록 커서(`nextPageAnchor`·`nextCursor`)·대화 쌍(`conversationPair`) 도우미와 명시적 검사로 any·non-null 없이 고쳤다.

API는 빌드 전용 `tsconfig.build.json`(Node16 CJS, 테스트·`src/testing/**` 제외)과 테스트를 포함한 `tsconfig.json`(Vitest와 같은 `module: Preserve`·Bundler)으로 나눴고 `typecheck`가 둘 다 검사한다. 운영 seed가 쓰는 데모 커뮤니티 글은 `src/seed-community-posts.ts`로 옮겨 dist에는 S3 fixture·E2E 서버가 들어가지 않는다. Dockerfile·운영 스크립트의 `dist/main.js`·`dist/seed.js` 경로는 그대로다. 테스트 타입 오류 40건(실제 오류 2곳, `Location`·`Set-Cookie`·배열 색인)을 고쳤다.

공용 base에 `isolatedModules`·`noImplicitOverride`·`noFallthroughCasesInSwitch`를 켰다. CommonJS 출력과 충돌하는 `verbatimModuleSyntax` 대신 `isolatedModules`를 골랐고, `override` 누락 16건(game-feedback 8, photo-contest 8)을 고쳤다. `tsc7`은 SIGINT·SIGTERM·SIGHUP을 tsc에 넘기고 신호로 끝난 tsc의 신호를 그대로 전달한다.

검증(develop 95188270 기준 rebase 후): 집계 `check`(타입·새 lint·앱 lint), API unit 143개, SDK 68개, Bridge 11개, Web 188개, Mobile 54개, Admin 21개, migration-check `check`(70개), photo-contest `lint`·`typecheck`와 변경 파일 테스트, design-system·eslint-config `check`, blog 타입 검사, 전체 format 검사가 통과했다. API 빌드 산출물에 `testing/`이 없고 `dist/seed.js` 등 운영 스크립트 모듈이 로드되는 것과 OpenAPI·SDK 재생성 diff 0을 확인했다. `tsc7 -w`의 재컴파일·Ctrl+C·단독 SIGTERM 종료와 고아 프로세스 없음, SIGKILL 전달을 확인했다. DB를 띄우지 않아 PostgreSQL 통합 테스트와 E2E, 컨테이너 빌드는 실행하지 않았다.

# 2026-10-22 헬스·내부 라우트 폴더 이름 정리

URL 인코딩 폴더(`%5Fhealth`, `%5Finternal`)를 kebab-case 정적 세그먼트로 바꿨다. 웹 생존 확인은 `/health-check/live`, 캐시 재검증 콜백은 `POST /internal/cache/revalidate`, API의 제외 작성자 조회는 `/internal/visibility/excluded-authors`다. 운영 배포 전이라 이전 URL을 남기지 않는다. API는 `GF_CACHE_REVALIDATION_URL`이 새 경로가 아니면 시작을 거부하므로 기존 로컬 `.env`의 값을 고쳐야 한다. 정적 세그먼트는 `[locale]`보다 먼저 매칭되고 proxy matcher(`/`, `/ko|en|ja/:path*`)에 포함되지 않는다. 공용 Caddy는 `/internal`과 그 하위 경로만 대소문자 구분 없이 막는다. 아래 날짜별 기록의 `/_internal`·`/_health`는 당시 경로다.

검증: `check:game-feedback`, Web unit/UI 169개, API unit 106개, 세 Caddyfile의 `caddy validate`(2.7.6)와 차단 정규식 경계 확인이 통과했다. DB가 필요한 API 통합 사양(캐시 무효화·제외 작성자 조회), Playwright e2e, 컨테이너 smoke는 로컬에서 실행하지 않았다.

PR #47 충돌 해소: develop `697d5243`을 병합한 뒤 작업 중 추가된 `42370ab5`도 반영했다. 공통 차단 목록 함수·관련 테스트와 모바일 E2E 콜백 URL을 새 `/internal` 경로로 맞췄다. 최신 캐시 정책, Terraform 안내와 #51 이미지·#52 액션 업데이트를 함께 보존했다. 별도 worktree의 Node 24에서 집계 `check`, Web 192개·API unit 150개·배포 스크립트 50개 테스트, ShellCheck와 Caddyfile의 adapt·validate·경로 경계 검사가 통과했다(Caddy 로그·저장 경로는 임시 디렉터리로 격리). SDK 재생성 diff는 없었다. DB 통합·브라우저 E2E·컨테이너 smoke는 이번 충돌 해소에서 실행하지 않았다.

# 2026-10-22 Admin 빌드 경고와 번들 중복 제거

contracts에 브라우저용 소스 진입점을 더해 Admin이 SDK와 같은 Zod ESM을 사용하게 했다. Node·API의 CommonJS 진입점은 유지한다. 문의·신고·사용자 관리 화면은 named export를 유지하면서 탭별로 지연 로딩한다. 기존 `AsyncBoundary`가 대기와 실패를 처리한다.

Zod 4.6.7의 ESM·CommonJS 설명 주석 네 곳에서 Rollup이 실제 최적화 표시로 읽던 문구만 Yarn patch로 고쳤다. 실행 코드와 실제 pure 지시문은 바꾸지 않았다. 루트 package.json·yarn.lock 변경은 기존 Zod 4.6.7 범위 두 개에 이 patch를 연결하기 위한 것이며 다른 Zod 버전은 유지한다. 경고 임계값이나 로거 필터는 바꾸지 않았다.

별도 worktree에서 처음 재현한 Admin JS는 1,063.29 kB였다(develop 346b3ee8). develop 42370ab5까지 반영한 수정 뒤 최대 JS 청크는 485.94 kB(gzip 140.44 kB)이며 기본 build에서 Zod 주석·500 kB 경고가 모두 사라졌다. 번들 분석에서도 모든 JS 청크가 500 kB 이하이고 Zod CommonJS 모듈이 포함되지 않는 것을 확인했다. `yarn install --immutable`, 집계 `check`(codegen·전 워크스페이스 타입·Web/Mobile/Admin lint), SDK 69개·Admin 21개 단위 테스트, Android·iOS Metro export와 실제 로컬 테스트 API를 사용하는 Admin Playwright 5개가 통과했다. 테스트는 새 `gf_test_admin_*` 스키마에서 실행했고 스키마를 삭제한 뒤 직접 시작한 테스트 DB를 종료했다. SDK 재생성 diff는 없었다. 운영 API·데이터와 실제 배포는 사용하지 않았다.

# 2026-10-22 클라이언트 감사 결함 수정 (web·admin·mobile·SDK)

develop a8e2aae4 감사의 클라이언트 항목을 고쳤다. 아래 10월 22일 태그 만료 기록 중 "작성자의 Router Cache를 갱신하는 기존 액션에 유지한다"는 더 이상 맞지 않는다.

- 문서 접근 판정: Next 16.4 proxy는 `'use cache'`를 실행하지 못한다(proxy adapter의 cacheLife 프로필이 "Proxy does not support `use cache`"를 던진다). 그래서 렌더의 태그 캐시를 쓰지 않고, 게시글 상세 판정(`features/post/api/post-access.server.ts`)이 공개 조회 결과(작성자 id 또는 없는 글)만 프로세스 안에 30초·500개까지 기억한다. 로그인 요청은 세션별 전체 상세 대신 렌더와 같은 차단 목록만 받는다. API 장애는 기억하지 않고 404로 바꾸지 않는다. 캐시가 살아 있는 동안 삭제·숨김된 글은 렌더가 태그 캐시로 다시 막으므로 본문은 보이지 않고, 상태 코드만 최대 30초 늦게 404가 된다.
- 캐시 만료 Server Action `expirePostDetailCache`를 없앴다. API가 커밋 직후 무효화 콜백을 응답 전에 기다리고 실패하면 DB 큐에서 재시도한다. 모바일 e2e 웹 서버(3302)에도 콜백 URL·비밀을 넣었다.
- 가이드 제목 링크: 홈·채팅·프로필·알림과 "홈으로 이동"은 `TabLink`, 게시판·글쓰기·문의는 `ChildLink`(`registerNextLogicalParent`)로 연다. 뒤로 가기(브라우저·Android)가 게시판·문의에서 가이드로 돌아오고, 탭 이동은 기록을 쌓지 않는다.
- 글 삭제 성공 뒤 상세 쿼리를 다시 받지 않고 취소·제거하며, 이동은 피드로 replace한다.
- 웹 응답 헤더: `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'; base-uri 'self'; object-src 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. cacheComponents(PPR) 정적 셸은 nonce를 받을 수 없어 script/style/connect를 제한하는 CSP는 넣지 않았다. Admin Vite dev·preview도 frame 차단 헤더를 보낸다.
- SDK: Orval `urlEncodeParameters`로 경로 파라미터를 인코딩하고, `apiFetch`가 빈·점 세그먼트와 `/`·`\`·`?`·`#`가 든 세그먼트를 `INVALID_REQUEST_PATH`로 거부한다. 웹의 Player Tag 조회는 `#` 없이 보낸다.
- 모바일: `EXPO_PUBLIC_WEB_ORIGIN`을 `new URL().origin`으로 정규화한다. iOS 하위 frame 이동은 외부 열기·앱 화면 이동 없이 같은 origin·`about:blank`만 허용한다.
- 답글 버튼의 렌더되지 않은 폼을 가리키던 `aria-controls`와 고정 `aria-expanded`를 없앴다.
- 문서: 모바일 build 스킬의 앱 이름, webview-shell 스킬의 쿠키 prop 설명, Admin `.env.example`의 운영 토큰 안내를 실제와 맞췄다. Admin Vite 프록시의 Origin 가드·운영 토큰 주입을 단위 테스트한다.

검증(이 worktree, Node 24): `@side/game-feedback codegen` 뒤 생성 diff 없음. sdk·bridge·web·mobile·admin `typecheck`, web·mobile·admin `lint`, 단위 테스트(SDK 68, bridge 11, Web unit/UI 182, Mobile unit/UI 54, Admin 20), 루트 `format:check`가 통과했다. 운영 토큰 더미값으로 Admin을 build해 `dist/`에 토큰이 없음을 확인했다. Web·Admin·Mobile Playwright와 `next build`는 로컬에서 돌리지 않았고 CI에 맡긴다(가이드·보안 헤더·글 삭제·게임 프로필 e2e를 고치거나 더했다). Android 하드웨어 뒤로 가기와 iOS iframe 동작은 실기기로 확인하지 않았다.

PR #42 충돌 해소: 최신 develop `46e5d0cd`를 병합하면서 클라이언트·API 수정 기록을 모두 보존했다. 공개 게시글 접근 테스트는 새 내부 서명 헤더를 허용하되 세션 쿠키가 없음을 확인하도록 맞췄다. Node 24의 별도 worktree에서 codegen 후 SDK 생성 diff 없음, SDK·Web·Admin typecheck, Web·Admin lint, SDK 68·Web 188·Admin 21개 테스트, 병합 파일의 Prettier 검사가 통과했다. 이번 충돌 해소에서는 DB 통합 테스트·Playwright·프로덕션 build를 실행하지 않았다. 공통 파일과 다른 서비스의 변경은 기존 develop 커밋을 병합해 들어온 내용이며 별도로 수정하지 않았다.

# 2026-10-22 API 요청 제한과 접근 검사 보정

감사(origin/develop a8e2aae4)에서 확인한 API 결함을 고쳤다.

- SSR 요청 제한: 웹 서버가 API를 내부 주소로 부르며 모든 SSR이 웹 컨테이너 IP 하나의 버킷을 썼다. 웹은 `X-Forwarded-For` 첫 값 또는 `internal`을 `GF_CACHE_REVALIDATION_SECRET`에서 HMAC으로 파생한 키로 서명하고(60초 창), API는 유효한 서명일 때만 그 값을 버킷 키로 쓴다. 새 환경변수는 없다. 세션 쿠키가 없으면 SSR이 사용자별 `getSession` 대신 캐시된 익명 세션을 쓰고, 카테고리는 `discovery` 태그로 캐시한다.
- 대소문자 경로: Express 5가 라우트를 대소문자 무시로 찾아 `/API/posts`가 접근 미들웨어를 건너뛰었다. `case sensitive routing`을 켠 Express 인스턴스로 Nest를 만들고 미들웨어도 접두사를 대소문자 무시로 판정한다.
- 만료 행: 새 OAuth 시도·세션 발급 때 만료 행을 지우고 `OAuthAttempt.expiresAt` 인덱스를 더했다.
- 밴 회피: 밴·밴 사용자 탈퇴 때 `BannedIdentity(provider, sha256(subject))`를 남기고 계정 없는 식별자의 callback·앱 교환·onboard를 거부한다.
- 관리자 신고 목록: `status`(기본 `OPEN`)·커서 페이지(`{ items, nextCursor }`)와 `(status, createdAt, id)` 인덱스. Admin 신고함에 상태 필터와 더 보기를 더했다.
- 게임 프로필 조회는 로그인·사용자별 분당 10회·60초 공유 캐시를 쓴다. 밴 사용자의 문의 첨부 `complete`를 허용했다. 탈퇴 시 분리한 남의 답글은 `updatedAt`을 보존한다.

추가형 migration `20261022100000_oauth_attempt_expiry_index`, `20261022100100_banned_identities`, `20261022100200_report_status_index`를 운영 `migrate deploy`로 적용한다. DB 통합 테스트는 로컬 DB를 띄우지 않아 CI에서 확인한다.

# 2026-10-22 NestJS 변경에 따른 Next.js 태그 만료

공개 게시글 상세는 `'use cache'` 안에서 `cacheTag('posts', 'post:<id>')`와 `cacheLife('max')`를 사용한다. 60초 간격 재검증 대신 NestJS의 변경 커밋이 태그를 만료한다. `updateTag`는 Server Action에서만 사용할 수 있으므로 작성자의 Router Cache를 갱신하는 기존 액션에 유지한다. API가 호출하는 `POST /internal/cache/revalidate` Route Handler는 `revalidateTag(tag, { expire: 0 })`를 사용해 첫 후속 조회부터 새 데이터를 기다린다. `'max'` 재검증의 stale 응답을 첫 조회에 반환하지 않는다.

게시글·답변·댓글·도움됨·읽음·조회수, 관리자 숨김/복원과 작성자 인증/밴/게임 태그/프로필 사진·탈퇴 변경을 연결했다. 개별 변경은 `post:<id>`, 작성자 정보 변경은 `posts`를 만료한다. 글 생성/수정/삭제·숨김/복원·탈퇴·카테고리 생성은 `discovery`도 만료해 sitemap에 반영한다. 개인화된 차단 필터는 공유 캐시 밖에 유지한다.

데이터 변경과 태그 기록은 하나의 DB 트랜잭션이다. 커밋 후 최대 1.5초 안에 콜백을 시도하고, 실패해도 쓰기는 성공한다. 미전달 태그는 `CacheInvalidation` 테이블에서 5초 주기로 재시도하며 API 재시작 후에도 남는다. 태그별 revision을 비교해 오래된 콜백의 성공이 그 사이 발생한 새 쓰기를 지우지 않게 했다. 실패는 일반 경고와 설정된 Sentry로 보고하며 요청 헤더·비밀·게시글 내용은 보고하지 않는다.

콜백은 양쪽 서버에만 주입한 `GF_CACHE_REVALIDATION_SECRET`으로 인증한다. 상수 시간 해시 비교, 허용된 태그·최대 64개·본문 크기 검사와 `no-store` 응답을 적용했다. Caddy는 `/internal`과 그 하위 경로를 외부에서 차단하고 API는 단일 Web 컨테이너의 내부 주소를 호출한다. 운영 `.env`에 `openssl rand -hex 32`로 생성한 비밀을 추가해야 하며 두 Compose 구성과 smoke fixture에 전달을 연결했다. 로컬 통합 dev 명령은 메모리에서만 공유하는 임시 비밀을 생성한다. 독립 실행은 두 프로세스의 비밀을 일치시키고 API에 콜백 URL을 설정한다. 추가형 migration `20261022020000_cache_invalidations`를 운영 `migrate deploy`로 적용한다.

검증: API unit 92개와 PostgreSQL 통합 122개, Web unit/UI 144개, SDK 43개, Admin unit 5개가 통과했다. 새 통합 사양은 실제 migration 실행, 커밋 이후 콜백, 롤백 시 이벤트 미생성, 콜백 실패·재시작 후 재전송, 동시 쓰기의 revision 보존을 검증한다. production build/start의 캐시·댓글 Playwright 5개와 PPR/프리패치 12개가 통과했으며 JavaScript 없는 첫 후속 HTML에서 API 직접 수정·댓글 생성/수정/삭제·관리자 숨김/복원이 반영되는지 확인했다. API/Web/Admin/계약/SDK 타입 검사, Web/Admin lint, 변경 파일 Prettier, 추가 migration 호환 검사와 스크립트 구문 검사도 통과했다. SDK 재생성 diff는 0개다. 실제 AWS 설정·운영 배포는 하지 않았고 Docker CLI가 없어 컨테이너 smoke는 실행하지 않았다.

# 2026-10-21 게시글 상세 공개 캐시 (10월 22일 변경 전 기록)

게시글 상세의 서버 조회(본문·메타데이터·상단바)는 모든 사용자가 쿠키 없이 받은 공개 응답을 `'use cache'`로 게시글 id마다 함께 쓴다(`post:<id>` 태그, 60초 재검증, 1시간 만료). 로그인 요청만 API의 `/_internal/visibility/excluded-authors`에서 양방향 차단 관계를 받아, 작성자와 차단 관계면 404로 막고 그런 사람의 답변·댓글을 뺀다. Caddy는 `/api`만 API로 전달하고 `/_internal`을 edge에서 막으므로 이 경로는 웹 서버만 부른다. 사용자가 자신을 차단한 사람을 응답에서 알 수 없다. 화면은 계속 요청마다 렌더하므로 댓글의 상대 시각 처리는 그대로다.

게시글 수정·삭제, 답변 작성·수정·삭제·도움됨·읽음, 댓글 작성·수정·삭제가 성공하면 서버 액션 `updateTag`로 해당 태그를 만료해 쓴 사람이 새로고침해도 바로 반영된다. 만료 실패는 60초 재검증으로 따라잡으므로 쓰기 결과를 실패로 바꾸지 않는다. 관리자 앱의 숨김·삭제와 다른 사용자의 쓰기는 최대 1분 늦게 반영될 수 있다. 공개 상세의 답변 수·상태는 차단한 사람의 답변을 포함한 값이다. 비로그인 세션 조회(`getServerSession`)는 세션 쿠키가 없으면 캐시된 익명 세션(`cacheLife('minutes')`)을 쓴다.

검증: 웹 unit/UI 133개(공개 캐시·내부 차단 조회·작성자 404·답변/댓글 제외·조회 실패·404·잘못된 id·만료 액션·만료 실패 무시 사양 포함), API unit/통합 196개(웹 서버 전용 조회의 양방향 차단·세션 없음·`/api` 비노출 사양 포함), 웹·API `tsc7 --noEmit`, 변경 파일 eslint·prettier 통과. 작성자 404와 답변·댓글 제외 코드를 없애면 사양이 실패하는 것을 확인했다. 프로덕션 빌드와 Playwright는 CI에서 확인한다.

# 2026-10-21 SSR 판별 hook 정리

AsyncBoundary와 CommentItem에 따로 있던 hydration 판별을 `shared/lib/use-is-ssr`의 `useIsSSR`로 모았다. 구독 함수는 es-toolkit `noop`을 반환하는 모듈 상수다. 서버 렌더링과 첫 hydration에서는 true라 clientOnly 경계와 댓글 시각의 서버 HTML은 그대로다.

검증: 웹 unit/UI 123개(useIsSSR의 서버·hydration·클라이언트 사양 3개 포함), `tsc7 --noEmit`, 변경 파일 eslint·prettier 통과. `next typegen`은 실행 중인 개발 서버의 `.next`와 겹쳐 생략했다.

# 2026-10-21 가이드 프리패치 검증

CI trace에서 가이드의 route tree 응답이 도착하기 전에 instant navigation 잠금을 시작해 이동이 멈추는 경우를 확인했다. 응답 완료를 실제로 관찰하고 hover 후 잠금을 시작한다. 고정 지연·재시도 없이 5회 반복 검사가 통과했다. 기존 즉시 화면·헤더·문서 유지 검사는 그대로 둔다.

# 2026-10-20 서비스와 데이터 접근 구조 정리

Repository 전달 계층을 제거하고 서비스에서 Prisma를 직접 사용한다. UnitOfWork는 기존 트랜잭션·재시도와 한 연결 사용을 유지한다. 트랜잭션 통합 사양은 database 구현 옆에 둔다.

채팅은 ChatAccessService(공개 범위·차단), ChatConversationService(대화·목록), ChatMessageService(메시지·멱등 전송), ChatHistoryService(읽음·내 기록 삭제)로 분리했다. SSE는 같은 접근 검사를 사용하고 commit 뒤에만 알린다.

# 구현 및 검증 기록

## 2026-10-20 Admin 코드스타일과 화면 책임 분리

- `.agents/skills/game-feedback-code-style`에 Web·Admin의 FSD·명명·폼·query/mutation·공통 UI 규칙을 추가하고 프로젝트와 Admin `AGENTS.md`에서 연결했다. 스킬 구조 검증을 통과했으며 커밋·PR의 `type(game-feedback): ...` 형식도 기록했다.
- `_app`은 Provider·인증·라우트 조합, `_pages`는 로그인·문의·신고·사용자 관리로 분리했다. 공통 셸·문의 대화·사용자 패널은 widgets가 소유하며 검색·답변·제재 폼과 Zod 스키마를 목적별로 나눴다. 고정 메뉴는 명시적인 JSX로 구성하고 공통 디자인 시스템의 컨트롤·타이포 토큰을 사용한다.
- 조회 options, mutation options, 원본 useMutation 결과를 반환하는 mutation 훅을 도메인별로 분리했다. 문의별 mutation 상태를 독립적으로 관리하고 ts-pattern 분기·es-toolkit 메시지 중복 제거를 사용한다. 로그인·로그아웃은 이전 요청 취소 → 도메인 캐시·mutation 제거 → 세션 교체 순서를 유지하면서 활성 세션 구독을 보존한다.
- Admin ESLint에서 SDK 직접 호출, UI의 mutation 정의, inline query key, let·enum·non-null assertion과 명명 규칙을 검사한다. 메모리 안의 위반 예제로 실제 거부되는지 확인하고 도메인 API의 SDK import가 허용되는 것도 확인했다.
- Admin Vitest 5개와 Playwright 5개를 통과했다. 인증·권한·밴·신고·문의의 기존 동작과 로그인 구독 갱신·이전 계정 캐시 제거, 답변 실패 시 초안/UUID 보존, 조회 오류 시 메뉴 유지, 사용자 URL 재진입을 확인했다. 타입 검사·lint·Prettier·production build도 통과했다. 빌드에는 Zod 주석과 큰 청크에 대한 경고가 있으며 빌드 실패는 아니다.
- 초기 브라우저 검증에서 최신 스키마와 로컬 생성 Prisma Client가 달라 `db:generate` 후 재검증했다. 테스트는 Admin 3304/API 4304와 기존 전용 테스트 DB 55444의 새 격리 스키마만 사용했다. 다른 worktree의 DB 프로세스와 개발 서버는 변경하지 않았다. Admin의 기존 라이브러리 사용을 위해 manifest와 루트 `yarn.lock`만 함께 갱신했다.

## 2026-10-20 채팅 URL 링크

- 메시지 본문은 `linkify-react`와 `linkifyjs`로 HTTP·HTTPS·도메인 주소를 링크로 표시한다. 프로토콜이 없는 주소에는 HTTPS를 적용하며 원문·줄바꿈·쿼리·괄호를 유지한다. HTML은 텍스트로 렌더링하고 실행형·파일·FTP 주소는 링크로 만들지 않는다. 이메일 자동 링크는 사용하지 않는다.
- 웹 링크는 새 탭으로 열어 대화를 유지한다. WebView는 기존 탐색 정책으로 같은 서비스 주소를 앱 안에서, 외부 주소를 시스템 브라우저에서 연다. 공통 밝음·어두움 토큰으로 밑줄과 키보드 포커스를 표시하고 긴 URL의 줄바꿈을 유지한다.
- Web Vitest 105개(신규 3개), Playwright 3개(신규 링크 송수신·새 창·재조회·393px 폭과 기존 키보드 2개), Mobile WebShell UI 13개, Web 타입 검사·lint·변경 파일 format 검사를 통과했다. 실제 iOS·Android 기기의 링크 열기는 별도로 확인해야 한다. 브라우저의 외부 목적지는 테스트 응답으로 대체했다.
- 의존성 선언에 맞춰 루트 `yarn.lock`만 함께 갱신했다. DB·API 계약과 다른 서비스 코드는 변경하지 않았다. 테스트 전용 55444 DB를 사용하고 종료했으며 개발 서버는 변경하지 않았다.

## 2026-10-20 단위·통합 테스트와 명시적 분기/메뉴

- API Vitest를 unit·integration 레인으로 나누고 `test:unit`·`test:integration`을 추가했다. 테스트 DB를 끈 상태에서 unit 76개가 실행되고 55444가 열리지 않는 것을 확인했다. 실제 PostgreSQL/Supertest integration 97개를 함께 검증한다.
- 이번 API 보강은 39개다. 순수 커서·채팅 삭제 경계·숨김 알림 정책 26개와 Repository/HTTP 통합 13개를 추가했다. 단일 연결의 도메인 간 커밋·배열/콜백 롤백·차단 가시성·동일 시각 페이지네이션·채팅 기록 분리를 확인한다.
- 관리자 숨김 POST/ANSWER/COMMENT와 신고 POST/ANSWER/COMMENT/USER를 ts-pattern exhaustive로 처리한다. es-toolkit groupBy·uniq로 신고 조회 ID를 묶는다. 실제 감사 테이블 CHECK 위반을 격리 스키마에 주입해 숨김·알림 삭제까지 함께 롤백되는지 확인한다.
- 피드백 상태·코칭 역할·전투 유형과 글쓰기의 고정 옵션, 사이드바·게임 칩·가이드의 다섯 메뉴는 각각 JSX로 조립한다. 공통 링크 표현만 작은 컴포넌트로 분리하고 서버의 글·게임 목록을 렌더링하는 map은 유지한다. Web 테스트는 102개이며 새 3개가 검색어/게임 문맥 보존과 URL 활성 상태를 검증한다.
- API 타입 검사, Web 타입 검사·lint, 전체 format 검사를 수행한다. DB 스키마·외부 API 계약과 개발 서버에는 변경이 없다. 별도 worktree와 테스트 전용 DB·격리 스키마만 사용한다.

## 2026-10-19 공통 EC2·RDS·S3와 Repository

운영 대상은 두 서비스를 묶은 서울 EC2 한 대, 외부 AWS RDS PostgreSQL, 서비스별 비공개 S3다. [공통 배포 가이드](../../../deploy/shared-instance/README.md)가 현재 기준이다.

- 두 API의 도메인 Service에서 DB 직접 접근을 Repository로 옮겼다. UnitOfWork가 같은 트랜잭션 client를 전달하며 권한·미디어·이벤트도 같은 연결을 사용한다. DB 스키마와 API 계약은 유지했다.
- 런타임 DML과 일회성 DDL 자격 증명을 분리하고 RDS hostname·TLS CA·role·pool 한도를 검증한다. 두 DB와 버킷을 분리하고 Caddy만 공유한다. GF 작성 중 가시성 조회가 다른 연결을 기다리던 경로도 수정했다.
- CI가 함께 검증한 AMD64 이미지를 그대로 게시·digest 배포한다. 공통 호스트 lock, provider PITR 검사, 이전 앱 롤백, current/previous 이미지 보호를 적용했다. Web liveness와 API DB readiness를 분리했다.

| 실제 로컬 실행            | 결과                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GF API Vitest·Supertest   | 134개 통과, 연결 1개로 글 작성 3건·세션 조회 3건 동시 처리와 구독 알림 포함                                                                                              |
| PC API Vitest / Supertest | 74개 / 211개 통과, 도메인 간 단일 연결·전체 롤백 포함                                                                                                                    |
| PC 프로젝트 check         | 통과, Web 단위 테스트 287개 포함                                                                                                                                         |
| GF 프로젝트 check         | 통과                                                                                                                                                                     |
| 운영 도구 테스트          | 14개 통과: PITR 잘못된 설정·시각 거부, 양쪽 current/previous 이미지 보존·범위 밖 삭제 거부                                                                               |
| 실제 운영 이미지 통합     | 두 API/Web AMD64 build, 공통 HTTPS Caddy·PostgreSQL TLS·별도 DML/DDL·S3/Range·SSE·오래된 PITR 거부·보호된 릴리스 덮어쓰기 거부·독립 롤백·재시작 보존·생존/준비 상태 통과 |
| PC 운영 이미지 Playwright | 1개 통과: 가입·사진/동영상·댓글·공개 SEO·비공개 미디어·재시작 보존과 DB 백업의 새 DB 복원                                                                                |
| 계약·정적 검사            | 두 서비스 codegen 결과 변경 없음, format·actionlint·shellcheck 통과                                                                                                      |

실제 AWS 리소스는 생성·변경하지 않았고 운영 CD·공인 DNS/ACME·실제 RDS PITR 복원·S3 IAM 분리는 미검증이다. 통합 검사의 S3 HTTP 경계와 RDS Describe 응답·registry 매핑은 fixture이며 앱·DB·TLS·프록시는 실제로 실행했다. 제공된 계획의 전체 캐시 개편과 나머지 제품 결함은 이번 변경의 완료 범위가 아니다. 테스트는 전용 DB·격리 스키마·별도 Docker profile에서 실행했다.

갱신일: 2026-10-18. 대상 저장소는 [jingeon27/side-project](https://github.com/jingeon27/side-project)이며 `develop`에서 분리한 `feat/game-feedback` Worktree에 구현한다. 사용자 제공 [MVP Plan v4.0 원문](mvp-plan-v4.md)은 수정하지 않는다.

## 구현 범위

- 한국어 중심 `/ko`, `/ja`, `/en` 경로, 최신순·미답변 피드, cursor pagination과 무한 목록.
- 사용자 계정의 게임 계정 등록과 대표 Supercell 태그, 별도 관리자 인증. 글쓰기에는 게임 프로필을 첨부하지 않으며 덱 카드 UI도 표시하지 않는다.
- 요청·피드백 답변·일반 댓글 CRUD, 요청자만 가능한 도움됨, 인앱 알림과 답변 읽음.
- X·카카오·Discord·Google 소셜 로그인, 직접 입력 닉네임, 연령·약관 동의, HttpOnly 세션, 로그아웃·탈퇴.
- 신고·양방향 사용자 차단, 관리자 카테고리·콘텐츠 숨김·사용자 인증 변경과 감사 기록.
- PostgreSQL에 보존하는 1:1 대화·메시지, 참여자 권한, 명시적 메시지까지의 읽음 경계, 인증된 SSE 갱신.
- 명시적 테스트 실행의 고정 계정 accessToken API와 예시 게시글·댓글·채팅. 화면에는 테스트 계정 선택기와 배지를 노출하지 않는다.
- 서버 Zod 검증 → OpenAPI → Orval Client 및 응답 검증 스키마 생성.

피드백 답변은 읽음·도움됨의 대상이며 일반 댓글과 구분해 표시하고 저장한다. 서비스 사용자 인증과 게임 계정 소유권 `UNVERIFIED`도 별개다. 기능 구현은 실제 사용자 모집·외부 제공자 검증·공개 출시 완료를 의미하지 않는다.

## 저장소 실행 방식

Node.js 24, Yarn 4.17.0과 기존 `node-modules` linker를 사용한다. 루트 Workspace 경로와 `@side/*` 집계 방식을 유지한다. 버전별 Yarn release 파일, PnP loader 또는 다른 프로젝트의 Prisma Client를 가정하지 않는다.

`@side/game-feedback`는 `test`, `build`, `typecheck`, `check`를 앱·패키지에 위임한다. DB URL 가드·단위·PostgreSQL 통합 테스트는 API가 소유하고 캐시 경계 단위·브라우저 테스트는 Web이 소유한다. 루트·프로젝트 집계에는 테스트 파일·러너 설정·러너 의존성을 두지 않는다.

```sh
nvm use
yarn install --immutable
yarn workspace @side/game-feedback codegen
yarn workspace @side/game-feedback typecheck
yarn workspace @side/game-feedback test
yarn workspace @side/game-feedback test:e2e
yarn workspace @side/game-feedback build
yarn format:check
```

실제 Google·Supercell을 호출하지 않도록 테스트는 가짜 제공자를 강제한다. 통합 테스트는 Migration 이전에 URL을 검증하고 실행별 `gf_test_` 스키마만 생성·정리한다. 브라우저 테스트는 API 4301·Web 3301을 사용해 개발 서버와 분리한다.

## 데이터와 권한

개발 DB는 loopback 55442의 `game_feedback`, 테스트 DB는 55444의 `game_feedback_test`다. 앱은 전용 `game_feedback` 역할을 사용하며 bootstrap 관리자 자격 증명은 앱에 전달하지 않는다. 다른 프로젝트의 DB·환경변수·저장소·실행 프로세스를 사용하거나 변경하지 않는다.

검토된 SQL의 `prisma migrate deploy`만 적용한다. URL의 hostname·port·database·role·schema를 검증하고 reset·db push를 사용하지 않는다. 로컬 실행기는 소유한 DB 프로세스만 제어하고 데이터 디렉터리를 유지한다. 원격 운영 Migration은 별도 절차가 필요하다.

| Migration                         | 내용                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `202610160001_initial`            | 사용자·세션·게임 연결·피드백·알림·신고·차단·감사 기록                            |
| `202610160002_chat`               | canonical pair의 대화방, 발신자별 UUID 중복 방지 메시지, 읽음 경계               |
| `202610160003_user_test_accounts` | User의 서비스 인증 여부·시각과 대표 태그, 기존 synthetic fixture에 한정한 초기값 |

일반 Google 사용자는 `isVerified=false`, `verifiedAt=null`, 대표 태그 미등록으로 시작한다. 관리자만 인증 상태를 변경하고 감사 기록을 남긴다. `isTestAccount`는 서버의 내부 데모 계정 정보로 결정해 응답하며 클라이언트 입력을 받지 않는다.

대표 태그는 대문자와 `#`으로 정규화한다. 제공자 조회 성공 후 User와 GameAccount를 한 transaction으로 갱신하며 실패 시 기존 상태를 유지한다. 이미 작성한 요청의 스냅샷은 바꾸지 않는다.

## 테스트 계정과 채팅

고정 계정은 `sample-user-0` 새벽의호그, `sample-user-3` 덱연구소, `sample-test-admin` 운영테스터다. 최초 상태는 각각 일반 사용자·`#GG829JGY`, 테스트 인증 코치·`#9QY82JGY`, 데모 관리자·태그 미등록이다. 이후 수정한 인증·태그와 작성 콘텐츠를 seed가 덮어쓰지 않는다.

계정 목록과 전환은 명시적 데모·비운영 환경에 한정한다. 임의 ID와 권한 필드 주입을 거부하고 이전 세션을 폐기한다. 운영자도 참여하지 않은 비공개 대화는 조회할 수 없다. 서비스 인증 예시는 테스트 배지로 구분한다.

대화방은 두 참여자의 정렬된 ID와 unique 제약으로 중복을 막는다. 메시지는 발신자·`clientMessageId`로 재시도를 중복 저장하지 않는다. 읽음은 요청의 `messageId`까지만 전진하며 이후 도착한 메시지를 미리 읽음 처리하지 않는다. 차단은 양방향 조회·전송·읽음에 적용한다.

SSE는 live 세션을 확인하고 메시지 본문 없이 대화 갱신만 전달한다. 로그아웃·만료·탈퇴 시 연결을 종료한다. 탈퇴 시 참여 대화·메시지를 삭제하며 상대의 채팅함에도 남기지 않는다. 다중 API 인스턴스의 공유 pub/sub와 메시지 신고·보유 정책은 공개 운영 전 별도 검증이 필요하다.

## 요청 제한

60초 단위로 인증된 조회는 userId별 240회, 쓰기는 userId별 60회다. 같은 사용자는 세션·IP 변경으로 한도를 나누지 않는다. 비로그인 일반 요청은 IP별 한도, 로그인·가입·OAuth 시도는 IP별 30회를 적용한다. 테스트 계정 목록은 조회, 로그아웃은 쓰기다. 세션 조회 전에는 IP별 전체 1,000회 상한을 적용한다. SSR 호출은 웹 서버가 서명한 방문자 IP로, 방문자 IP가 없는 공유 조회는 `internal` 버킷(조회 3,000회)으로 센다. 게임 프로필 조회는 사용자별 10회다.

`rate-limit.test.ts`의 단위 테스트 4개는 공유 IP 사용자 분리, 세션·IP 변경 시 사용자 한도 공유, 비로그인·인증 경로, 목록·로그아웃 분류를 다룬다. 제한 상태는 단일 프로세스 메모리에 있으며 초과 응답은 `429 RATE_LIMITED`와 `Retry-After`다.

## 저장소 이식 검증

아래 결과는 올바른 저장소의 Node.js 24·Yarn 4.17.0·node-modules 환경으로 이식한 뒤 확인한 결과다. API 도메인 분리 이후 재검증은 다음 절에서 별도로 기록한다. 이식 이전 환경의 결과를 이 표에 사용하지 않는다.

| 항목                                    | 현재 결과                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------- |
| 의존성 설치와 lockfile 정합성           | Yarn 4.17.0 `install --immutable` 통과                                    |
| API 단위·DB 가드·PostgreSQL 통합 테스트 | 6개 파일, 47개 테스트 통과. DB URL 가드 2개도 API Vitest에 포함           |
| 전체 타입 검사                          | Game Feedback `check` 통과                                                |
| Web 브라우저·생성 Client 계약 테스트    | webpack 개발·E2E 서버로 8개 모두 통과                                     |
| API/Web production build                | API 및 Next.js 기본 Turbopack production build 통과                       |
| OpenAPI·SDK 재생성 동일성               | 105개 파일 재생성 전후 SHA-256 동일                                       |
| 저장소 format과 변경 범위 검사          | 전체 `format:check` 통과. 변경 범위·아티팩트 검사 통과                    |
| 개발 DB Migration·seed·Web/API 실행     | 소유 데이터 보존·Migration·seed 통과, Web/API 200 및 테스트 계정 3개 확인 |
| GitHub Actions                          | 현재 저장소의 PR에서 확인 필요                                            |

기존 photo-contest의 `db:generate`, `codegen`, `check`와 lint·타입 검사가 통과했다. 94개 파일의 테스트 473개(bridge 35, API 63, mobile 137, web 238)가 통과했으며 해당 프로젝트의 tracked 파일 변경은 없다.

E2E 8개는 요청·답변·알림·도움됨, 실제 생성 Client 계약, 두 사용자의 실시간 채팅·읽음·재전송, 고정 계정 전환·제3자 대화 차단, 태그 정규화·재로그인 유지를 검증했다. 첫 Turbopack 개발 서버에서는 채팅 POST 성공 후 최초 RSC 응답 지연과 테스트 1건 실패를 관찰했다. 내부 원인은 확정하지 않았다. 개발·E2E만 `--webpack`으로 실행하고 timeout을 유지한 재검증이 모두 통과했다. production Turbopack build도 통과했다.

이전 Worktree의 개발 프로세스·DB를 중지한 뒤 소유 데이터만 새 Worktree로 복사했다. DB 소유 메타데이터는 새 경로로 갱신하고 이전 control·lock 파일을 재사용하지 않았다. 이전 소스는 보존했다. 테스트 DB 55444는 중지했으며 데이터는 보존했다. 새 Worktree의 개발 데모에서 Web 3300과 API 4300의 200 응답, 테스트 계정 3개, 기존 샘플 게시글 6개 보존을 확인했다. 사용자가 확인할 수 있도록 개발 Web/API와 소유 개발 DB 55442는 실행 중으로 유지한다.

## API 도메인 분리

API를 `auth`, `users`, `posts`, `answers`, `comments`, `categories`, `game-profiles`, `notifications`, `blocks`, `moderation`, `chat`, `health`의 12개 도메인 모듈로 구성했다. `app.ts`는 기동과 HTTP 설정 연결만 담당하고 `AppModule`이 도메인을 조합한다. 기존 전체 업무를 담은 `service.ts`는 제거했다.

설정은 `config`, PrismaClient와 소유권 관리는 `database`, 도메인 공통 검증·페이지네이션·HTTP 처리는 `common`으로 분리했다. 공개 DTO presenter와 Google·Supercell 제공자는 해당 도메인이 소유한다. `security.ts`에는 기존 소비자를 위한 export만 남긴다. 요청 경로·상태·오류 코드·SQL·트랜잭션·스냅샷·차단·채팅 공개 범위는 유지한다.

ChatService는 PrismaClient·AppConfig·ChatEvents를 직접 주입받는다. 채팅 lifecycle 미들웨어는 세션 로드 다음에 실행하며, 변경 이전 세션과 탈퇴 상대를 보존하고 성공 응답 이후 스트림 종료·갱신을 수행한다. ChatEvents의 모듈 종료 정리 이후 DatabaseModule이 직접 소유한 Client만 종료한다. 외부에서 주입한 Client는 호출자가 계속 관리한다.

기존 PR [#4](https://github.com/jingeon27/side-project/pull/4)의 동일한 `feat/game-feedback` 브랜치에서 변경을 검토한다. 추가 테스트 3개로 실행별 AppConfig 독립성, 외부 PrismaClient 종료 권한 보존, SSE 종료 후 소유 DB 연결 정리를 확인했다.

AST로 기존·신규 라우트 44개를 대조해 누락·추가·중복이 없는 것을 확인했다. API 빌드는 이전 dist를 먼저 정리한다. clean build 후 이전 루트 `service.js`·`chat.service.js`가 남지 않고 새 도메인 출력과 전용 Prisma 런타임이 포함되는 것도 확인했다.

| API 도메인 분리 이후 검사 | 상태                                          |
| ------------------------- | --------------------------------------------- |
| Game Feedback `check`     | 통과                                          |
| API 테스트                | 7개 파일, 50개 테스트 통과                    |
| Web E2E                   | 8개 통과(28.7초)                              |
| API/Web production build  | 전체 production build 및 API clean build 통과 |
| OpenAPI·SDK 재생성 동일성 | 105개 파일 SHA-256 동일                       |

컴파일된 production API를 임시 랜덤 포트에서 기동해 health·session 200과 `demoMode=false`를 확인한 뒤 소유 프로세스를 종료했다. 테스트 DB 55444도 중지했고 데이터는 보존했다. Prisma schema, contracts, 생성 SDK·OpenAPI, 루트 package.json·yarn.lock과 다른 프로젝트는 이 리팩터링으로 변경하지 않았다.

## Web FSD와 공통 구조 적용

공개 API·query options·폼·overlay의 책임을 구분해 5레이어를 `_app`·`_pages`·`widgets`·`features`·`shared`로 적용하고 `src/app`에는 Next 라우트 어댑터만 남겼다. 옛 `components`·`lib`의 평면 구조를 제거했다.

features는 auth·user·game-profile·post·answer·comment·category·notification·moderation·chat으로 나눈다. 각 도메인의 api/model에 REST IO·query options·mutation을 모으고, 표시 UI에는 조합용 slot을 제공한다. 페이지가 폼·동작·화면 조합을 소유하고 여러 화면에 쓰는 로그인·프로필 연결·요청 작성은 widget으로 둔다. 641줄 채팅 화면을 대화 목록·본문·입력·스크롤·가시 읽음 경계로, 505줄 요청 상세를 표시·답변·댓글·개별 overlay로 나눴다.

TanStack Query options factory를 조회·무효화의 키 단일 출처로 사용한다. 사용자별 private 조회를 scope로 나누고 불완전한 인자에는 skipToken을 사용한다. RHF/Zod와 useWatch, overlay-kit을 실제 폼·모달에 적용했다. 서버 상태를 별도 store로 복제하지 않고 mutation의 pending/error를 직접 쓴다. FSD 분리 단계에서는 기존 Radix Dialog와 Orval REST SDK·HttpOnly 쿠키·SSE 계약을 유지했다. 이후 아래 공통 디자인 시스템 작업에서 Dialog를 Base UI로 통합한다.

Web에 공유 `@side/config/eslint/next`·`fsd-boundaries`, `@side/config/typescript`를 연결했다. 레이어 방향·public barrel·페이지 교차 import·직접 fetch·overlay 상태 복제·컴포넌트/핸들러 규칙과 함께, 앱 로컬 lint가 raw query-key·enum·타입 이름을 검사한다. 집계 check에 Web lint, 집계 test에 Web 소유 Vitest를 연결해 기존 CI에서도 실행한다.

세션 전환은 진행 중 query 취소 → 이전 계정 cache 제거 → 새 세션 저장 순서를 유지한다. 로그아웃·탈퇴 후 private cache를 즉시 비우며 SSE는 사용자 ID별로 종료한다. 메시지 실패 초안과 재시도 UUID, 화면에 표시된 메시지까지의 읽음 경계도 보존한다. 최종 교차 검토에서 OverlayProvider가 계정별 수명 밖에 있던 문제를 발견해 사용자 ID별 Provider로 변경했다. 다른 탭에서 계정을 바꿔도 이전 계정의 모달·초안·탈퇴 확인 입력은 남지 않는다.

| Web FSD 이후 검사                         | 결과                                                  |
| ----------------------------------------- | ----------------------------------------------------- |
| Node 24 / Yarn 4.17 `install --immutable` | 통과. 기존 패키지 해석 변경 없음                      |
| 집계 `check`                              | 전체 타입·Web FSD 및 코드 규칙 lint 통과, 오류·경고 0 |
| API Vitest                                | 7개 파일·50개 테스트 통과                             |
| Web Vitest                                | 5개 파일·10개 테스트 통과                             |
| Chromium E2E                              | 11개 통과(38.3초)                                     |
| API/Web production build                  | 통과                                                  |
| 전체 `format:check`·diff/산출물 검사      | 통과                                                  |

Web 단위 테스트는 실행 중 이전 세션 요청 취소와 private cache 제거, 사용자별 채팅·알림 cache 무효화 격리, post prefix 선택, 한국어 API 오류·AbortError 보존을 다룬다. 브라우저 검증에는 기존 8개 흐름에 게시글·댓글의 수정·삭제 취소·삭제, 피드 검색·탭의 URL 복원·새로고침·추가 query 보존, 화면 밖 세션 변경 후 이전 계정의 탈퇴 확인 입력 폐기를 추가했다. 검색은 RHF 입력 초안과 350ms 대기를 유지하고 Next가 지원하는 native history API로 URL을 갱신한다.

production Web을 소유한 임시 포트에서 기동해 검색 URL·가이드·채팅·설정의 HTTP 200을 확인한 뒤 종료했다. 테스트 DB 55444는 중지하고 데이터를 보존했다. 개발 데모는 다시 실행해 확인할 수 있도록 유지한다. 이번 Web 변경으로 API·Prisma·contracts·생성 OpenAPI/SDK와 다른 프로젝트 소스는 변경하지 않았다.

## Photo Contest와 공통 디자인 시스템

사용자 요청으로 `packages/design-system`을 새로 만들고 두 웹의 공통 스타일을 연결했다. Photo Contest의 실제 Base UI primitive·토큰·cn을 추출하고 Game Feedback의 공통 버튼·입력·프로필·모달도 이 패키지를 사용한다. Game Feedback의 기존 녹색 위주 값은 공통 의미 토큰을 참조하며 화면별 CSS를 분리한다. REST·채팅·계정·서버 계약은 유지한다.

의존성은 새 workspace와 양쪽 웹 manifest·lockfile을 먼저 별도 커밋했다. Game Feedback의 Radix Dialog, Photo Contest의 직접 CVA·clsx·tailwind-merge 의존성은 공통 구현이 소유하는 라이브러리로 정리했다. 공통 React UI와 Next 전용 ButtonLink 진입점, CSS 진입점을 분리한다. 루트 workspace 경로·Node·Yarn은 유지한다.

Photo Contest의 기존 public UI 경로와 테스트를 유지하며 구현은 공통 패키지를 re-export한다. 계정·Apollo·라우터·WebView 뒤로 가기·portal container·오버레이 수명은 각 앱이 계속 소유한다. Photo Contest API·모바일 소스와 기존 개발 서버·DB는 변경하지 않는다. 브라우저 테스트용 Photo DB는 이번 작업이 소유한 loopback 55445의 별도 데이터 디렉터리에서 실행한다.

| 공통 디자인 시스템 이후 검사     | 결과                                                   |
| -------------------------------- | ------------------------------------------------------ |
| DS 패키지 lint·typecheck·Vitest  | 통과, 4개 파일·9개 테스트                              |
| Photo Web lint·typecheck·unit/UI | 통과, 기존 55개 파일·238개 테스트                      |
| Photo Web 브라우저               | Chrome 모바일·Safari 모바일·데스크톱 9개 통과(30.0초)  |
| Photo Web production build       | 별도 `.next/design-system-build`에서 통과              |
| Game Web unit·기존 집계 check    | 10개 단위 테스트, 전체 타입·lint 통과                  |
| Game Web 브라우저                | 전체 12개 통과(48.4초), 스타일 검증 단독 재검증도 통과 |
| Game API/Web production build    | 통과                                                   |
| 의존성·format·산출물 검사        | `install --immutable`, 전체 format 및 diff 검사 통과   |

Photo 브라우저 검증은 로그인·로그아웃·재로그인, 시트의 뒤로 가기·포커스, 갤러리 피드를 세 브라우저 프로젝트에서 확인했다. Game Web에는 실제 계산된 주 버튼 색상과 44px 크기, 입력 16px, 모달 불투명도·모바일 넘침 검사를 추가했다. 최초 검사에서 기존 주 버튼을 accent로 매핑한 차이를 발견해 두 앱의 기본 주 동작을 공통 primary로 맞춘 뒤 전체 12개를 재검증했다. 모달 애니메이션이 끝난 화면 캡처도 확인했다.

생성 GraphQL·OpenAPI/SDK·Prisma schema는 변경하지 않았다. Photo 테스트 DB 55445는 잔여 테스트 스키마 0개를 확인한 뒤 소유 프로세스를 종료하고 데이터를 보존했다. 기존 Photo 개발 서버 3200·API 4200·DB 55433은 제어하지 않았다. Game 테스트 DB 55444도 중지하고 데이터를 보존했다. 개발 데모를 다시 실행해 Web/API 200, 고정 계정 3개·기존 게시글 6개 보존을 확인했다.

## WebView 모바일과 테스트 구성

사용자 요청으로 `apps/mobile`에 Expo 57·React Native 0.86 기반 WebView 서비스를 추가했다. API는 Vitest+Supertest, Web은 Vitest+Playwright를 사용하며 Mobile도 자체 Vitest unit/UI·Playwright 설정과 파일을 소유한다. 프로젝트 집계의 check/test/build/test:e2e는 새 앱 검사에 위임하고 CI는 Chromium·WebKit을 모두 설치한다.

모바일 `App.tsx`는 11줄의 Provider 조합이다. WebView UI·이벤트·OS 수명 주기는 `_pages/web-shell`, URL·딥링크 판단은 `features/navigation`, 브리지·PKCE 인증은 `features/bridge`, origin·색은 `shared/config`로 분리했다. 공통 Expo·FSD lint를 적용하고 같은 Web 화면의 디자인 시스템·테스트 계정·게시글·댓글·채팅을 사용한다. 새 제품 화면을 네이티브로 복제하지 않았다.

Web과 Mobile의 메시지 계약은 프로젝트 내부 `@game-feedback/bridge`가 소유한다. 메시지의 source origin·구조·경로를 검사하고 초기 bootstrap과 로드 후 fallback을 함께 둔다. 안전 영역·새 창 URL 정책·Android back 대기/중복 억제·딥링크·foreground 갱신·연결 오류 재시도·WebView 프로세스 복구를 연결했다. 앱 복귀는 세션 조회 후 동일 사용자 cache를 갱신하고, 계정 변경이면 실행 중 요청 취소·이전 private cache 제거·새 세션 저장 순서를 따른다. 복귀 조회 중 로그인/로그아웃이 먼저 끝나면 오래된 조회 결과를 무시한다.

Google은 시스템 브라우저에서 인증한다. 앱 PKCE challenge를 OAuthAttempt에 저장하고 완료 시 hashed AppLoginTicket을 발급한다. WebView가 `POST /api/auth/app/exchange`로 2분짜리 일회용 코드를 교환해 HttpOnly 세션을 받는다. verifier 불일치·만료·재사용·동시 교환·CSRF를 거부하며 신규 사용자 동의·가입과 이전 SSE 종료를 기존 인증 정책에 연결했다. 기존 44개 경로에 REST 교환 1개를 추가했다. 검토한 additive Migration `202610170004_mobile_login`을 전용 개발 DB에도 `migrate deploy`로 적용했다.

| 최종 검사                               | 결과                                                         |
| --------------------------------------- | ------------------------------------------------------------ |
| Node 24·Yarn 4.17 `install --immutable` | 통과, 기존 버전 해석 변경 없음                               |
| 전체 `format:check`·diff 검사           | 통과                                                         |
| 집계 `check`                            | 계약/API/SDK/Bridge/Web/Mobile 타입·Web/Mobile FSD lint 통과 |
| API Vitest+Supertest                    | 8개 파일·55개 테스트 통과                                    |
| Web Vitest                              | 5개 파일·12개 테스트 통과                                    |
| Mobile Vitest unit/UI                   | 6개 파일·22개 테스트 통과                                    |
| Web Playwright Chromium                 | 12개 통과(48.3초)                                            |
| Mobile Playwright Android/iOS host      | 6개 통과(31.8초)                                             |
| API/Web production build                | 통과                                                         |
| Mobile Metro export                     | Android·iOS 모두 통과, 검사 출력 제거                        |
| OpenAPI/Orval 재생성                    | 커밋된 생성 파일과 diff 없음                                 |

Mobile E2E는 실제 3302/4302 Web/API·전용 55444 DB의 독립 `gf_test_mobile_*` 스키마와 앱의 실제 host·URL·인증 로직을 사용한다. 테스트 계정으로 게시글·댓글·채팅을 작성하고 reload 이후 쿠키·저장을 확인했다. 웹 모달 back·따뜻한 딥링크·foreground 세션 전환과 시스템 로그인 취소도 확인했다. 첫 실행은 같은 채팅 문구가 대화 목록과 본문에 함께 나타나 선택자가 중복되어 실패했다. 실제 대화 log로 선택 범위를 한정한 뒤 전체 흐름이 통과했다. 외부 Google 사용 가능 여부와 OS 인증창만 해당 취소 테스트에서 대역으로 설정한다. API 핸드오프 검증은 가짜 Google 제공자를 사용하는 Supertest가 담당한다.

기존 Photo Contest 코드·서버·DB는 변경하지 않았다. 공통 파일 변경은 신규 Workspace의 lockfile 등록, CI 검증 범위, 루트 프로젝트 안내에 한정한다. 최종 테스트 종료 후 잔여 `gf_test_*` 스키마 0개를 확인하고 전용 테스트 DB를 중지했다. 개발 데모의 Web/API 200, 고정 계정 3개·기존 게시글 6개 보존을 확인했다.

실제 Google/Supercell 연동, 서명된 네이티브 바이너리·dev client·실기기·스토어 배포는 확인하지 않았다. 현재 선택된 Xcode 경로는 전체 Xcode가 아닌 CommandLineTools다. 로컬 실행법·origin·Android reverse·딥링크·실기기 확인 항목은 [모바일 가이드](../apps/mobile/README.md)에 기록했다.

## REST 응답 Zod 검증과 fallback

REST SDK가 HTTP 성공 본문을 단순 `as T`로 넘기던 경로를 제거했다. Orval의 Zod 모델 출력·runtimeValidation·includeZodSchemaInArguments를 사용해 42개 JSON operation이 응답 스키마를 transport에 전달한다. 생성 client의 모든 operation이 호출자 options 이후 스키마를 지정하는지도 SDK 소유 AST 테스트로 검사한다. 기존 raw API helper와 공개 apiFetch export를 제거해 앱의 도메인 API가 생성 함수를 사용하도록 유지했다.

표시용 nickname·name·description·이미지 URL·대표 태그·clan·배지 카운트에 명시적 Zod `.catch` fallback을 적용하고 서비스 인증 boolean이 잘못되면 false로 내린다. 원래 스키마에 선언된 필드에만 적용하고 전체 응답을 원래 계약으로 다시 검증한다. 이름이 같아도 fallback이 계약을 만족하지 않는 필드에는 적용하지 않는다. 원본 입력·요청 본문은 수정하지 않으며 숫자/boolean 문자열을 자동 형변환하지 않는다.

ID·권한·세션 플래그·커서·날짜·UUID·본문·목록 구조·게임 데이터의 출처/소유권 표시는 엄격하게 검증한다. 잘못된 목록 원소를 삭제하거나 목록 전체를 빈 배열로 바꾸지 않는다. 서버 응답 계약에도 비어 있지 않은 ID, ISO 시각, 안전한 비음수 정수, 메시지 UUID 제약을 명시했다. 서버 입력 검증을 느슨하게 만들지 않았다. 자세한 [필드별 정책](../packages/sdk/README.md)은 SDK 문서에 기록했다.

잘못된 성공 JSON은 `ApiResponseValidationError`/`INVALID_API_RESPONSE`로 구분하며 HTTP status와 최대 20개 필드 경로·코드만 보존한다. payload·메시지·토큰을 예외/로그에 추가하지 않는다. HTTP 오류 본문도 Zod로 검증하고 잘못된 코드/문구만 일반 fallback으로 보완한다. 네트워크·요청/본문 취소 오류는 원본을 유지한다. Web 오류 경계는 응답 검증 오류의 분류·진단을 보존해 네트워크 실패와 다른 안내를 표시한다.

| 최종 검증                   | 결과                                                                   |
| --------------------------- | ---------------------------------------------------------------------- |
| API Vitest+Supertest        | 55개 통과                                                              |
| SDK Vitest                  | 3개 파일·30개 통과                                                     |
| Web Vitest                  | 13개 통과                                                              |
| Mobile Vitest unit/UI       | 22개 통과                                                              |
| Web Playwright              | 기존 흐름과 응답 오염·재조회 복구 포함 14개 통과(51.6초)               |
| Mobile Playwright host      | Android/iOS 6개 통과(33.7초)                                           |
| 집계 check·production build | 전체 타입·Web/Mobile lint, API/Web 빌드, Android/iOS Metro export 통과 |
| OpenAPI/Orval               | 생성 파일 72개의 재생성 SHA-256 동일                                   |
| 공통 디자인 시스템          | 기존 설치·별도 새 설치 모두 lint·typecheck·9개 테스트 통과             |

브라우저에서는 객체 nickname·문자열 카운트·문자열 인증 표시를 받은 카드가 안전한 값으로 그려지는지 확인했다. 잘못된 목록은 성공한 빈 피드로 표시하지 않고 별도 오류를 보여주며, 다시 불러오기 후 정상 응답으로 복구되는 것을 검증했다. SDK 검증에는 중첩 fallback·필수 필드 거부·세션 위조·잘못된 커서·메시지/읽음 경계·게임 데이터 출처·HTTP 오류·비 JSON·204·취소·민감한 payload 미보존을 포함한다.

검증 도중 이전 head의 GitHub Actions가 공통 DS 단계에서 `command not found: vitest`로 실패한 것을 확인했다. 현재 Worktree와 별도 새 설치에서도 재현했다. 이 peer Workspace에서 Yarn의 bin 조회는 Vitest를 누락하지만 Node는 선언된 패키지를 정상 해석하는 것을 확인했다. DS test script만 모듈 해석 기반 실행기로 바꾸어 실제 설치 경로를 하드코딩하지 않고 CLI를 실행하도록 보완했다. 패키지·React 버전과 제품 코드는 바꾸지 않았다. SDK 테스트의 직접 소유를 위해 기존 Vitest를 devDependency/lockfile에 연결하고 집계 test에 위임을 추가했다.

이 변경은 DB schema·Migration·외부 제공자 연동을 변경하지 않는다. 최종 종료 때 전용 테스트 스키마 0개를 확인하고 소유 테스트 DB를 중지했다. 개발 Web/API와 고정 계정 3개·기존 샘플 게시글 6개는 보존했다.

## 서비스·화면·기능 오류 경계

최상위 `app/error.tsx`에 의존하던 렌더 오류 처리를 Web의 공통 경계와 화면별 경계로 나눴다. Next 16.4 설치 문서의 `catchError`를 사용해 redirect·notFound 동작을 보존한다. 셸의 본문·메뉴·사이드바와 피드 카드·게시글·답변·댓글·채팅 목록/대화창을 독립적으로 복구한다. 계정·경로·대화가 바뀌면 이전 오류 상태가 남지 않는다. 서버 컴포넌트가 포함된 본문과 locale 라우트는 재시도 시 route refresh, 클라이언트 기능은 해당 영역의 재생성을 사용한다.

로그인·가입·작성·수정·삭제·신고·차단·프로필 연결 모달을 공통 `openOverlay`로 열어 controller 렌더 오류를 포털 안에 격리했다. 실패한 창은 재시도 또는 닫기를 제공한다. NativeBridge·가입 안내의 오류도 각각 격리한다. Mobile의 SafeAreaProvider 안에는 네이티브 서비스 경계를 추가해 렌더 실패 시 listener·host를 정리하고 WebView를 다시 연다. 정상 형제 영역의 상태·채팅 초안, 기존 API 전송 실패 초안·재전송 UUID·읽음·쿠키 정책은 유지한다. API/폼/SSE 오류를 모두 렌더 예외로 바꾸지 않는다.

Web 소유 UI 검증을 위해 저장소의 기존 Testing Library·jsdom 버전을 manifest/lockfile에 연결했다. Vitest는 unit/UI 레인으로 나누고 공통 Base UI와 shim이 같은 React를 참조하도록 dedupe·의존성 변환/최적화를 설정했다. 제품 패키지 버전은 바꾸지 않았다. Web에서도 Yarn의 peer Workspace bin map이 Vitest를 누락하는 현상을 확인해 DS와 같은 Node 모듈 해석 실행기를 사용한다. 정적 타입·Web/Mobile lint·전체 format과 집계 test도 통과했고, API 55개·SDK 30개 검증을 다시 확인했다.

| 검증              | 결과                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web Vitest        | 8개 파일·23개 통과. 렌더 오류 격리, 형제 상태·대화 초안 유지, 비동기 복구 거부, 반복 실패 후 재시도, 계정/대화 변경, query 오류 재조회, 포털 복구/닫기 |
| Mobile Vitest     | 8개 파일·25개 통과. 기존 셸과 네이티브 렌더 실패·지속 실패·OS listener 정리·WebView 재생성                                                             |
| Web Playwright    | 기존 14개와 댓글·채팅 렌더 오류 주입/국소 복구 2개, 합계 16개 통과(53.6초)                                                                             |
| Mobile Playwright | Android Chromium/iOS WebKit host 6개 통과(31.4초)                                                                                                      |
| 빌드              | Web production build, Android·iOS Metro export 통과                                                                                                    |

브라우저의 날짜 formatter에만 테스트 오류를 주입해 실제 컴포넌트 예외를 재현했다. 앱 코드에 테스트용 crash 경로·스위치를 넣지 않았다. 댓글 실패 중 게시글·답변이 보이고, 대화창 실패 중 목록을 사용할 수 있으며 재시도 후 정상 화면으로 돌아오는 것을 확인했다. 모바일 폭에서 오류 UI의 가로 넘침과 숨겨진 프로필 영역도 확인했다(오류 경계 E2E 2개 재검증, 13.6초). 네이티브 실기기·dev client 확인은 이 검증에 포함되지 않는다.

이전 head `3136eb9`의 Game Feedback Actions는 통과했다. 같은 head의 Photo Contest verify는 Web/Mobile에서 `command not found: vitest`로 실패했고 브라우저 두 레인은 통과했다. 로컬 bin 조회에서도 기존 Photo Workspace의 실행 경로 문제를 확인했다. 이번 오류 경계 변경에는 다른 앱 코드·설정 수정을 포함하지 않는다. 최종 테스트 스키마 0개를 확인하고 소유 테스트 DB를 중지했다. 개발 Web/API 200·고정 계정 3개·기존 게시글 6개 보존도 확인했다.

## 페이지별 SEO와 공개 플레이어 프로필

피드·가이드·약관·개인정보·문의·채팅·알림·설정의 title·description·keywords·canonical·Open Graph·Twitter 메타데이터를 각각 정의했다. 게시글 상세의 기존 client-only 조회를 서버 렌더링·초기 query 데이터로 연결해 JavaScript 없이 제목·본문·답변·댓글을 볼 수 있게 했다. 실제 게시글 제목·본문 요약·작성자·게시/수정 시각으로 article 메타데이터와 `DiscussionForumPosting` JSON-LD를 생성한다. 수정 완료 시 router refresh로 현재 문서의 메타 제목도 갱신한다.

`/[locale]/users/[id]`에는 공개 프로필과 작성글 목록을 추가했다. 닉네임·서비스 인증/테스트 표시·대표 태그·가입일과 보이는 요청/답변/도움됨 수를 보여주고 `ProfilePage`/`Person` JSON-LD와 profile OG 메타데이터를 생성한다. 게시글·답변·댓글·피드의 작성자 이름이 프로필로 연결된다. 카드의 상세 이동과 작성자 링크를 서로 중첩하지 않고 기존 카드 클릭 영역을 유지한다. 작성글 cursor 페이지는 서버 HTML의 실제 링크로 이동할 수 있다. 모바일의 안전한 딥링크 목록에도 users 경로를 추가했다.

API에는 `GET /api/users/:id`와 기존 `/api/posts`의 authorId 필터를 추가했다. 사용자 내부 subject·권한·검증 시각·약관은 공개 프로필 응답에 포함하지 않는다. 기존 공개/차단/비데모 사용자 규칙을 적용하고, 숨김·삭제된 부모의 답변도 활동 집계에서 제외한다. 없는·차단된·숨긴·삭제된 대상은 metadata 조회에서도 404다. REST Zod→OpenAPI→Orval 경로를 재생성했으며 JSON operation은 43개다. 새 프로필 응답도 SDK에서 실제 검증한다. DB schema·Migration은 변경하지 않았다.

서버 요청마다 SDK baseUrl·AbortSignal을 전달하며 Game Feedback cookie 하나만 고정 API origin에 보낸다. 전역 fetch 교체 없이 Zod 검증·fallback·no-store를 유지하고 React cache는 request 안의 metadata/화면 중복 조회만 줄인다. 세션 초기화는 서비스 오류 경계 안에서 수행한다. 초기 snapshot은 같은 viewer일 때만 사용하며 자동 세션 조회도 이전 요청 취소·private cache 제거 후 새 세션을 확정한다. 이 과정에서 발견한 자동 계정 전환의 잔여 cache 경로를 고쳐 느린 profile 재조회 중 이전 계정 snapshot이 다시 보이지 않게 했다. 서버·브라우저의 가입일 표시는 Asia/Seoul로 일치시켰다.

색인은 실제 HTTPS origin·production·명시적 indexing=true·demo=false를 함께 요구한다. 알파·개발·데모는 기본 noindex이며 개인 채팅/알림/설정과 테스트 계정 상세는 항상 제외한다. 미번역 en/ja 경로는 ko canonical을 사용한다. `/og`의 PNG와 `/robots.txt`·`/sitemap.xml`을 추가했고 sitemap은 공개 목록·작성자만 중복 없이 순회한다. origin은 환경설정에서만 읽으며 사용자 Host 헤더를 반영하지 않는다. JSON-LD는 script 종료 문자와 Unicode 줄 구분자를 이스케이프한다. 500 cursor page/50,000 URL을 넘는 목록에는 분할 sitemap이 필요하며 범위 초과·API 실패·반복 cursor를 빈/불완전한 성공 응답으로 숨기지 않는다.

| 검증                       | 결과                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| API Vitest+Supertest       | 8개 파일·58개 통과. 공개 응답 필드·활동 집계·작성자 cursor·숨김/삭제·양방향 차단·비데모 접근 포함                                              |
| SDK Vitest                 | 3개 파일·32개 통과. 새 프로필 응답, 필수 ID 거부, 비공개 필드 제거, 요청별 server origin·cookie 분리 포함                                      |
| Web Vitest                 | 11개 파일·35개 통과. metadata·색인 조건·JSON-LD 탈출·공개 sitemap 순회/실패·cookie allowlist·자동 계정 전환 포함                               |
| Web Playwright             | 전체 20개 통과(약 1.1분). JS 비활성 crawler의 8개 화면 메타, 상세/프로필 HTML·JSON-LD·404, 차단된 metadata, 느린 계정 전환, 수정 후 title 포함 |
| Mobile Vitest / Playwright | 25개 / Android Chromium·iOS WebKit host 6개 통과(36.4초)                                                                                       |
| 후속 UI 검사               | 카드 링크 표현 변경 후 폼·SEO 7개 재검증 통과(30.6초)                                                                                          |
| 정적 검사·빌드             | 집계 타입/FSD lint·API/Web production build·Android/iOS Metro export 통과                                                                      |

구현은 설치된 Next 16.4 metadata·robots·sitemap 문서와 [Google DiscussionForumPosting](https://developers.google.com/search/docs/appearance/structured-data/discussion-forum), [ProfilePage](https://developers.google.com/search/docs/appearance/structured-data/profile-page), [meta 지원 문서](https://developers.google.com/search/docs/crawling-indexing/special-tags)를 참고했다. 키워드 태그를 추가한 것을 검색 순위 보장으로 표현하지 않는다. 실제 공개 도메인·Search Console 등록·Google 색인/리치 결과·외부 OAuth·네이티브 실기기 검증은 수행하지 않았다. 기본 비공개 알파 상태를 유지한다. 재생성 대상 73개 파일의 hash가 재생성 전후 일치했고, 전체 format·diff 검사도 통과했다. 최종 소유 테스트 스키마 0개와 개발 고정 계정 3개·게시글 6개 보존을 확인했다. 소유 테스트 DB를 중지했고 개발 홈·게시글·공개 프로필·robots 응답 200과 메타데이터를 확인했다.

## canonical과 JSON-LD 보완

기존 페이지별 canonical과 게시글 `DiscussionForumPosting`·프로필 `ProfilePage`/`Person` JSON-LD에 홈·공개 안내 페이지의 구조화 데이터를 보완했다. 홈·가이드·약관·개인정보·문의는 하나의 `WebSite` 노드와 페이지별 `WebPage`(문의는 `ContactPage`)를 연결한다. 공통 SEO 모듈에서 metadata와 같은 경로·제목·설명을 사용하며 미번역 en/ja도 ko canonical과 일치한다. 채팅·알림·설정에는 개인 정보를 담는 JSON-LD를 생성하지 않는다. 설치된 Next JSON-LD 가이드와 [Schema.org WebSite](https://schema.org/WebSite)·[WebPage](https://schema.org/WebPage)·[ContactPage](https://schema.org/ContactPage)를 확인했다.

프로필 JSON-LD에 명시적인 url·페이지 이름·설명·언어를 추가했다. 작성글 cursor가 있으면 `ProfilePage`의 url·ID는 현재 canonical을 따르고, 같은 사용자를 나타내는 `Person`의 ID·url은 기본 공개 프로필 주소를 유지한다. JSON-LD script 종료 문자 이스케이프와 기본 알파 noindex 정책은 유지한다.

Web Vitest 11개 파일·37개, 타입 검사·FSD lint, 별도 출력 경로의 production build가 통과했다. JavaScript를 끈 crawler E2E 4개에서 공개 페이지의 JSON-LD·canonical 일치, private 화면의 구조화 데이터 제외, 미번역 경로·추적 query 정규화, 게시글·프로필·404·차단 접근·계정 전환을 확인했다(21.4초). 빌드와 동시 실행한 첫 브라우저 검증은 기존 계정 전환 사례가 시간 초과되어 빌드 종료 후 별도 실행으로 재검증했다. 개발 서버의 홈·문의·게시글·프로필도 200과 실제 canonical·JSON-LD 출력을 확인했다.

이전 head `b137d65`의 Game Feedback CI는 format·계약 생성·DS·집계 검사·단위 테스트·빌드를 통과했으나 Web E2E에서 실패했다. 로그에는 성공한 채팅 오류 주입 사례의 `route.fetch`가 테스트 종료 후 거부되어 다음 사례에 실패가 전파된 것으로 기록되어 있다. 응답 오염·오류 경계 테스트의 afterEach에서 [Playwright unrouteAll](https://playwright.dev/docs/api/class-page#page-unroute-all)의 `behavior: 'wait'`로 실행 중인 handler를 완료한 뒤 page를 닫도록 보완했다. 실패를 무시하는 catch나 재시도를 추가하지 않았다.

정리 보완 후 Web Playwright 전체 20개가 통과했다(약 1.3분). 전체 변경 파일의 Prettier·diff 검사도 통과했다. 잔여 `gf_test_*` 스키마 0개를 확인하고 소유 테스트 DB를 중지했다. 이번 변경은 API·SDK·Mobile·의존성·공통 파일을 수정하지 않아 해당 레인의 검증을 반복하지 않았다.

## Framer Motion 인터랙션

Web에 `framer-motion` 14.3.0을 추가했다. `shared/motion`이 `LazyMotion`·`domAnimation`·`m`·전환 시간과 모션 선호 구독을 소유하며 Provider에서 앱 전체에 연결한다. 공통 디자인 시스템의 Button을 render prop으로 조합한 `MotionButton`을 홈 CTA·피드백 작성·채팅 전송에 사용한다. 색·크기·포커스·disabled·submit 동작은 공통 Button이 담당한다. 루트 lockfile에는 Web 의존성 연결과 Framer Motion·motion-dom·motion-utils 3개 항목만 추가했으며 기존 해석·다른 앱 manifest는 변경하지 않았다. `install --immutable`도 통과했다.

피드 카드가 처음 viewport에 들어올 때 짧게 나타나고 마우스로 올리면 3px 올라간다. 필터 탭의 밑줄, 버튼의 hover/press, 서버가 확인한 도움됨 아이콘, 새 채팅 메시지와 완료 알림에 짧은 전환을 적용했다. 기본 전환은 200ms, 도움됨 아이콘은 280ms다. 서버 HTML의 카드와 프로필은 처음부터 보이며 키보드 탐색은 실제 링크와 버튼을 사용한다. 채팅은 기존 기록을 다시 재생하지 않고 새로 추가된 마지막 메시지에만 진입 모션을 주며 기존 스크롤 높이·읽음 경계를 유지한다.

`MotionConfig`의 사용자 설정과 `useSyncExternalStore`의 media query 구독으로 모션 줄이기를 반영한다. 서버 snapshot은 모션을 줄이는 상태로 고정해 hydration을 맞추고 브라우저 설정이 바뀌면 구독 결과를 갱신한다. 카드의 불필요한 tap 포커스를 제거하고 도움됨 버튼의 tabindex를 명시했다. 완료 알림은 사라지는 즉시 status 역할·접근성을 내려 반복 안내와 닫기 중 조작을 막으며 중앙 정렬을 유지한다. 구현은 [Motion LazyMotion](https://motion.dev/docs/react-lazy-motion)·[MotionConfig](https://motion.dev/docs/react-motion-config)·[AnimatePresence](https://motion.dev/docs/react-animate-presence)와 설치된 Next Client Component 문서를 참고했다.

Web Vitest 37개·타입·FSD lint가 통과했다. 전체 Web Playwright 22개가 통과했으며(약 1.4분), 새 2개 사례는 일반/모션 줄이기 환경에서 카드 hover·실행 중 설정 변경·탭 URL/밑줄·키보드 Enter/Escape와 포커스 복귀·도움됨의 서버 확정·모바일 알림 중앙/닫기·가로 넘침·console/hydration 오류를 검증한다. 기존 계정 전환·모달·채팅·오류 복구와 JS 비활성 SEO 검증도 함께 통과했다. 390px 화면 캡처에서 알림 위치와 내용도 확인했다.

Android Chromium·iOS WebKit의 Mobile host 6개도 통과했다(36.2초). 별도 출력 경로의 Web production build와 마지막 모션 줄이기 전환 보완 후 브라우저 2개 재검증도 통과했다(16초). 변경 파일 Prettier·diff 검사, 잔여 테스트 스키마 0개를 확인했고 소유 테스트 DB를 중지했다. 네이티브 dev client·실기기 확인은 이 검증에 포함하지 않는다.

## 앱 경로와 인터랙션 설계

Web과 Mobile이 `packages/bridge`의 `appRoutes`·`resolveAppRoute`·`WebPathSchema`를 사용한다. 라운지는 `/:locale?tab=unanswered&q=...`, 게시글은 `/:locale/posts/:postId`, 공개 프로필은 `/:locale/users/:userId?cursor=...`, 채팅 목록은 `/:locale/messages`, 대화는 `/:locale/messages/:conversationId`다. 기존 `messages?conversation=<id>` 주소도 새 경로로 연결하며 대화 상세 canonical은 새 경로를 사용한다. 대화 metadata는 상대 닉네임·본문을 포함하지 않고 항상 noindex/nofollow다. REST API 경로·DB schema는 바꾸지 않았다.

루트 탭 간 이동과 채팅방 사이 이동은 replace, 목록에서 상세 진입은 push다. 상단 상세 뒤로 가기는 유효한 앱 이력을 사용해 필터가 있는 이전 피드·프로필로 돌아간다. 외부 링크로 바로 들어온 상세는 논리적 상위 화면으로 replace한다. 채팅방 헤더는 목록을 우선하고 Android 뒤로 가기는 실제 진입 이력을 우선한다. 라운지에서는 네이티브 종료를 요청한다. Next history state를 보존한 채 앱의 index·이전 경로·마지막 피드 필터만 추가하며 검색/탭을 되살릴 때도 새로운 탭 이력을 쌓지 않는다.

채팅 목록은 App Router의 messages layout이 소유해 대화방 경로가 바뀌어도 유지한다. 상위 화면 에러 경계의 key를 pathname에서 사용자 ID로 바꿔 정상적인 라우팅에서 layout 전체를 다시 만드는 문제를 해결했다. 설치된 Next `catchError`는 경로 이동 시 오류 상태를 자체 초기화한다. 계정 전환 때는 계속 private 화면을 다시 만든다. 화면 전환 모션은 공통 main에 180ms 진입 효과만 적용하고, 채팅 목록과 방은 같은 전환 영역으로 묶는다. 전체 화면 key나 이전 화면을 보존하는 exit animation을 추가하지 않으며 모션 줄이기를 따른다.

브리지 location은 query 변경도 전달한다. 준비된 WebView에서는 딥링크·동일 origin 새 창을 router로 보내고 동일 URL의 중복 요청을 무시한다. 피드 검색/탭과 프로필 cursor를 복구 주소에도 보존하고 중복 query·잘못된 인코딩·알 수 없는 경로는 거부한다. 웹 모달을 먼저 닫고 iOS swipe는 모달 중 비활성화한다. 필수 가입 안내는 뒤로 가기로 건너뛰지 않는다. 문서 교체 시 대기 중이던 뒤로 가기를 취소해 새 문서의 history로 잘못 전달하지 않는다. 800ms 응답 실패 시 기존 WebView history/종료 fallback은 유지한다.

집계 타입 검사·Web/Mobile FSD lint, Web Vitest 12개 파일·41개와 Mobile Vitest 8개 파일·28개가 통과했다. Web Playwright 전체 24개(약 1.5분)와 Android Chromium·iOS WebKit host 전체 10개(41.8초)도 통과했다. 새 사례는 필터가 있는 상세 복귀, 탭 이동 전후 history 길이, 채팅 목록 DOM 유지·방 replace, 기존 query URL 리다이렉트·private canonical, 직접 진입의 상위 화면/홈 종료, query location·warm 딥링크·동일 경로 중복 방지를 검증한다. 기존 실시간 채팅·읽음·재시도·계정 전환·오류 복구·모션·JS 비활성 SEO도 함께 통과했다.

별도 `.next/navigation-build` 출력 경로의 Web production build와 Android/iOS Metro export가 통과했다. 변경 파일 Prettier·diff 검사, 잔여 소유 테스트 스키마 0개·소유 테스트 DB 중지와 데이터 보존을 확인했다. 개발 홈·중첩 채팅 경로·API health는 200이며 고정 계정 3개·기존 게시글 6개를 보존했다. API·SDK·REST 계약·DB·의존성은 이번 경로 변경에서 수정하지 않아 해당 테스트를 반복하지 않았다. 네이티브 dev client·실기기·서명 빌드 검증은 포함하지 않는다. 경로별 정책은 [Mobile README](../apps/mobile/README.md#경로와-화면-전환)에도 정리한다.

## develop 병합 충돌 해결

`feat/game-feedback`의 `209e094`에 최신 `develop`의 `13ca201`을 merge해 PR #4의 충돌을 해결했다. `.prettierignore`에는 블로그 원문 MDX와 Game Feedback 계획 원문·생성 OpenAPI의 제외 규칙을 모두 보존했다. `yarn.lock`은 Yarn 4.17의 충돌 해결과 lockfile 갱신 모드로 두 프로젝트의 의존성을 함께 반영했다. 강제 push나 기본 브랜치 변경은 사용하지 않는다.

병합 전 기능 브랜치의 descriptor 2,132개와 develop의 2,297개를 병합 후 2,417개와 각각 대조해 누락·resolution 변경 0개를 확인했다. npm 항목의 체크섬·의존 관계를 포함한 전체 metadata 변경도 0개다. 블로그 파일은 develop과 동일하고, Game Feedback·공통 패키지 소스는 병합 전 기능 브랜치와 동일하다. Photo Contest의 develop 변경도 merge로 수용했다.

`install --immutable --mode=skip-build`, Game Feedback 집계 타입·Web/Mobile FSD lint, 공통 DS check(9개), Web Vitest 41개·Mobile Vitest 28개·SDK Vitest 32개가 통과했다. 전체 저장소 format과 diff 검사, 별도 `.next/merge-build` 출력의 Web production build, Android/iOS Metro export도 통과했다. 제품 코드·REST 계약·DB 변경이 없어 API DB 테스트와 브라우저 E2E는 이번 충돌 해결에서 반복하지 않았다.

## 언어 설정과 모바일 반응형

서비스 문구와 접근성 이름, SEO 제목의 가운데 점 구분을 문장과 쉼표 또는 제목의 `|`로 정리했다. 닉네임, 게시글, 답변과 메시지 원문은 변경하지 않는다. 테스트 계정의 서버 제공 설명만 화면에서 구분 문자를 정리한다.

`shared/i18n`이 지원 locale과 사전, 기기 설정 감지, 언어 쿠키와 React context를 소유한다. 새 패키지나 계정/DB 필드를 추가하지 않았다. `/` 진입 시 저장한 `gf_language`의 수동 선택을 우선하고 자동 선택이면 `Accept-Language`의 우선순위와 지역 태그에서 ko/en/ja를 선택한다. 지원 언어가 없으면 en이다. 정밀 위치 권한과 IP 조회는 사용하지 않는다. locale이 명시된 공유 경로는 그대로 존중한다. Proxy는 locale을 검증해 요청 헤더에 전달하고 서버 HTML의 lang도 실제 경로와 맞춘다.

로그인 전에도 설정과 상단 지구본에서 자동 선택, 한국어, English, 日本語를 고를 수 있다. 쿠키는 브라우저/WebView별로 저장하며 계정 간 동기화하지 않는다. 경로를 replace로 바꾸고 상세 ID, 검색과 cursor query를 유지한다. 새로고침과 다음 `/` 진입에도 수동 선택이 기기 설정보다 우선한다. 메뉴, 피드, 게시글과 댓글/답변 폼, 프로필, 채팅, 알림, 가입/설정, 오류 복구 등 주요 문구와 날짜 표시를 사전에 연결했다. 사용자 콘텐츠는 번역하지 않으며 가이드/약관 등 긴 안내는 한국어 원문 안내와 `lang="ko"`를 표시한다. 원문 콘텐츠를 기준으로 하던 기존 canonical과 JSON-LD 정책은 보존한다.

Mobile의 최초 주소를 `/ko`에서 `/`로 바꿔 저장한 설정과 기기 언어를 적용한다. 최초 redirect 전의 문서 주소를 한국어로 저장하지 않으며, 이후 복구는 실제 locale과 query를 유지한다. 모바일 채팅 상세는 전용 전체 높이 화면으로 표시하고 공통 상단 메뉴/하단 탭을 숨긴다. 목록으로 돌아가면 탭을 복원한다. visual viewport의 resize와 scroll에 맞춰 높이/상단 좌표를 갱신해 키보드가 차지하는 공간을 제외한다. Safe Area, 16px 입력 글자와 44px 하단 메뉴/언어 선택 영역, 긴 내용 줄바꿈과 유동 레이아웃을 적용했다. 소개 영역은 글과 장식을 별도 grid 열로 나누고 모바일은 장식을 숨겨 번역 문구와 겹치지 않게 한다.

공통 파일 변경은 `packages/design-system` Dialog의 선택적 `closeLabel`과 해당 테스트다. 기본 닫기 이름과 포커스/키보드 동작은 유지하며 Game Feedback만 현재 언어의 닫기 이름을 전달한다. 공통 색, 폰트, 버튼, Dialog 표현을 앱에서 복제하지 않는다. 모바일 Dialog의 visual viewport 배치만 앱에서 조정한다.

집계 타입 검사와 Web/Mobile FSD lint, Web Vitest 51개와 Mobile Vitest 29개, DS check 10개와 Photo Contest Web unit/UI 238개가 통과했다. Photo Web의 기존 `vitest` bin 누락은 선언된 패키지를 Node로 해석해 unit/ui CLI를 실행했으며 앱 설정은 수정하지 않았다. Web Playwright 전체 30개(약 2.1분)와 Android Chromium/iOS WebKit host 전체 12개(40.3초)가 통과했다. 자동 언어의 JS 비활성 최초 진입/필터 유지, 로그인 전 수동 선택/새 문서 복원/자동 재설정, WebView 언어 복원과 320/390/768/1440px의 주요 페이지, 모달 폭, 채팅 입력과 420px 높이 축소, 목록/탭 복귀를 검증했다. 새 화면 테스트는 공개 화면을 먼저 확인하고 private 동작 직전에 실제 테스트 계정으로 로그인해 같은 계정의 불필요한 반복 요청을 줄인다. 제품 요청 제한은 완화하지 않았다.

모바일 캡처에서 영문 소개와 장식의 겹침을 발견해 grid와 모바일 장식 숨김을 보완한 뒤 반응형/모션 6개를 재검증했다(46.5초). 320px 일본어 설정, 390px 영문 피드와 1440px 데스크톱 캡처를 확인했고 브라우저 pageerror도 없었다. 별도 `.next/locale-build`의 Web production build와 Android/iOS Metro export가 통과했다. 잔여 소유 테스트 스키마 0개를 확인하고 소유 테스트 DB를 중지했다. API, REST 계약, DB schema와 의존성은 변경하지 않았다. OS 키보드와 실기기, 서명 빌드는 별도 확인 대상이다.

## WebView 채널과 외부 상태 구독

`_pages/web-shell/model/web-view-channel.ts`의 `WebViewChannel` class가 WebView 참조, 마지막 복구 URL과 history, 로딩/연결 오류/모달/source/key snapshot을 소유한다. `useWebShell`은 셸마다 하나의 채널을 만들고 `useSyncExternalStore`로 구독한다. native host와 OS lifecycle 연결은 훅에 두고 중복된 화면 useState를 제거했다. 채널의 subscribe, getSnapshot과 ref callback은 인스턴스에 바인딩되어 있으며 변경이 없으면 동일한 immutable snapshot을 반환한다. 구독 해제는 React가 관리하고 ref 해제 후에는 네이티브 명령을 보내지 않는다.

준비된 문서의 location은 복구 주소에만 기록해 SPA 탐색을 문서 reload로 바꾸지 않는다. 준비 전 딥링크는 source로 반영한다. 재시도/Android renderer 복구는 마지막 URL과 새 key를 함께 반영하고 교체된 WebView의 history를 지운다. iOS content 종료는 로딩 상태를 복원한 뒤 reload한다. Android back 대기, 모달 우선 처리, hash 이동 구분과 인증 메시지의 origin/세대 검증을 유지한다.

Mobile Vitest는 9개 파일 34개가 통과했다. snapshot 참조 안정성/중복 알림 방지/구독 해제, 채널 인스턴스 분리, warm URL과 문서 source 분리, 복구 상태의 일괄 반영을 검증한다. RN Web UI에서 로딩/모달 상태의 구독 반영, OS listener 중복 설치 방지와 언마운트 후 WebView ref 해제를 확인했다. Mobile 타입 검사와 FSD lint, Android/iOS Metro export, 실제 native host를 연결한 Android Chromium/iOS WebKit E2E 12개 재검증(39.3초)과 전체 저장소 Prettier 검사도 통과했다. 잔여 소유 테스트 스키마 0개를 확인하고 테스트 DB만 중지했다. dev client/실기기 검증은 포함하지 않는다.

## Lifecycle, mutation options와 조회 경계

`ShellLifecycle`이 기기 foreground/background 전환, back 대기와 폐기 상태를 소유한다. `useShellLifecycle`은 let/ref 플래그 없이 OS 구독을 연결하고 해제한다. AbortController로 해제 뒤의 초기 링크와 back 응답을 무시하고, 후속 링크가 먼저 왔다면 늦은 초기 링크로 덮어쓰지 않는다. web back 요청이 거부되어도 history/종료 fallback으로 이어진다. `useWebShell`은 useCallback과 개별 lifecycle 의존성을 사용하며 props에 `satisfies WebViewProps`를 적용해 리터럴과 이벤트 인자 추론을 보존한다.

Web의 useRef 호출은 14곳에서 4곳으로 줄였다. 피드 무한 스크롤은 정리 함수를 반환하는 React 19 callback ref를 사용한다. 채팅은 callback ref와 `ChatScrollController`로 DOM 스크롤, 이전 기록 anchor와 자동 하단 이동을 처리하고 새 메시지 표시는 useSyncExternalStore로 구독한다. 읽음 재시도와 메시지 UUID는 mutation의 variables를 사용한다. 실패한 같은 본문의 재전송은 같은 UUID, 성공 뒤 의도적으로 다시 보낸 같은 본문은 새 UUID를 사용한다. 전송 중 중복 제출은 사용자/대화별 mutationKey로 QueryClient에서 즉시 차단한다. Toast 타이머는 UI 상태와 effect cleanup으로 관리한다. 남은 ref는 경로 전환의 이전 값, 검색 URL 반영 확인, 게시글 읽음의 중복 방지와 모달 해제 식별자이며 외부 동기화에 사용한다. useCallback은 함수 참조를 안정화하며 이 값 보존 역할을 대체하지 않는다.

9개 도메인의 mutation 26개는 `*.mutation-options.ts`의 `mutationOptions` 팩토리로 이동했다. mutationKey, REST IO, 캐시 무효화와 세션 교체 순서를 팩토리에서 관리하고 named public export로 공개한다. 기존 mutation 훅은 옵션을 연결해 원본 결과를 반환한다. query options의 scope/skipToken은 유지하며, 필수 인자가 있는 오버로드는 Suspense에 필요한 실행 함수를 타입 단언 없이 추론한다. 폼 검증, 초안과 예상 가능한 전송 실패는 폼/mutation 상태에서 처리한다.

`AsyncBoundary`는 기존 Next catchError, QueryErrorResetBoundary와 Suspense를 조합한다. 피드 목록, 알림과 대화 목록/대화창의 초기 로딩과 조회 오류를 영역 안에서 처리한다. 공개 게시글/프로필/작성글은 서버에서 받은 초기 데이터를 useQuery로 즉시 표시하고 throwOnError로 오류 경계에 연결한다. 이 서버 렌더 경로에는 불필요한 Suspense를 추가하지 않아 JavaScript 없이도 본문을 읽을 수 있다. 서버 초기 세션은 공통 오류 경계 안에 두고 RSC 슬롯 전체를 최상위 Suspense로 감싸지 않는다. 전체 서비스가 이른 streaming fallback에 숨거나 notFound의 HTTP 상태가 200으로 바뀌지 않도록 한다. 피드 검색과 탭, 채팅 목록 등 정상 형제 영역은 유지한다. 오류에는 안전한 복구 문구와 재시도만 표시하며 상세/대화 오류에는 상위 화면 링크를 제공한다. 서버 초기 데이터가 있는 게시글/프로필은 기존 SSR 원문과 SEO를 유지한다. 초기 데이터 없이 브라우저 쿠키와 상대 REST URL을 사용하는 조회만 clientOnly로 hydration 이후 시작해 서버에서 잘못된 상대 URL 조회나 인증 없는 private fetch를 하지 않는다. refetch 실패로 접근 권한이 달라진 경우에도 오래된 private 화면을 계속 표시하지 않는다.

Web에 dayjs 1.11.18과 utc/timezone plugin을 추가했다. shared/lib/date가 상대 시간, 날짜 구분 key와 읽음 시각 비교를 소유한다. 화면 문구 형식은 Intl을 유지하고 프로필/설정/채팅을 Asia/Seoul 시간대로 일치시킨다. 한국어/영어/일본어 표시는 함수 인자로 전달하며 사용자별 dayjs.locale 전역 변경은 하지 않는다. 루트 yarn.lock 변경은 이 Web Workspace의 직접 의존성과 신규 dayjs descriptor뿐이며 기존 패키지 해석을 변경하지 않았다.

채팅은 기존 REST 전송 + 인증된 SSE 변경 알림을 유지한다. `ChatRealtimeConnection`이 EventSource와 브라우저 이벤트 수명을 소유하고, 사용자별 hook effect가 해제한다. 쿠키 인증과 대상 사용자/대화별 무효화를 유지하며 SSE envelope는 Zod로 확인한다. 잘못된 이벤트는 무시하고 open/reconnect에서 REST를 다시 조회해 놓친 변경을 복구한다. error 후 세션 확인은 5초 간격으로 제한하고 완전히 닫힌 EventSource는 online/visible에서 새로 연결한다. 정상 EventSource의 자체 재연결, 서버 3초 retry와 5초 heartbeat, 연결 불가 중 10초 REST polling을 유지한다. 서버는 메시지 본문을 SSE에 싣지 않고 참여 권한과 live 세션을 다시 확인한다. 여러 API 인스턴스의 이벤트 공유 pub/sub는 여전히 별도 운영 작업이며 이번에 도입하지 않았다. SSE의 단방향 이벤트와 재연결 동작은 [MDN 문서](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events), 조회 경계는 [TanStack Suspense 문서](https://tanstack.com/query/latest/docs/framework/react/guides/suspense)를 참고한다.

## 의미 없는 상태와 장식 제거

실제 접속/서버 상태와 연결되지 않았던 피드 LIVE와 게임 ACTIVE를 제거했다. MY PLAYER와 영문 대문자 장식 라벨, 프로필/알파/게임/탭의 점, 히어로의 궤도/별/떠 있는 카드와 장식 번호를 삭제하고 사용하지 않는 CSS도 정리했다. 소개와 빈 채팅 영역은 단순한 배경, 제목, 설명과 동작으로 구성한다. 피드 카드의 자동 진입 모션도 없애고 hover와 키보드 동작만 유지하며 모션 줄이기 변경 시 위치를 원점으로 돌린다. 기존 공통 DS의 색, 컨트롤과 필요한 탐색/게임 아이콘은 유지한다.

알림과 모바일 채팅의 점은 숫자 또는 읽지 않음 문구로 바꾸고 실제 SSE 연결 상태는 텍스트로 표시한다. 한국어/영어/일본어의 서비스 문구에 가운데 점을 사용하지 않는다. 사용자 작성 콘텐츠는 수정하지 않는다. UI 규칙은 Web AGENTS.md에도 기록했다.

이번 변경의 Web Vitest는 18개 파일 65개, Mobile Vitest는 10개 파일 38개가 통과했다. 프로젝트 타입 검사와 FSD lint, immutable install, Next 프로덕션 빌드, Android/iOS Metro export와 전체 저장소 Prettier 검사도 통과했다. Web 전체 E2E 실행에서는 31개 중 28개가 통과했고, 공개 SSR 본문/모션 줄이기 전환/접근 불가 대화의 오류 문구 3개 실패를 수정한 뒤 해당 파일의 8개 시나리오를 모두 재검증했다. 합쳐서 31개 고유 시나리오를 확인했으며 한 번의 전체 실행에서 31개가 통과한 결과로 표현하지 않는다. 공개 본문의 JavaScript 없는 렌더, 404 HTTP 상태와 프로필/게시글 SEO, 조회 실패의 지역 복구와 정상 형제 영역 유지, 계정 변경과 초안, SSE와 반응형 화면을 포함한다. Android Chromium/iOS WebKit의 native host E2E 12개도 통과했다. dev client/실기기 검증은 포함하지 않는다.

1440px 데스크톱과 390px 모바일 피드, 모바일 설정 화면을 직접 캡처해 확인했다. 장식용 점과 가로 넘침이 없고 브라우저 pageerror도 0개였다. 전용 테스트 DB의 잔여 `gf_test_*` 스키마는 0개이며 해당 테스트 DB만 중지했다. 실행 중인 Web 3300과 API 4300은 HTTP 200을 반환하고 고정 테스트 계정 3개와 기존 게시글 6개를 보존했다.

## 클래시 로얄 게임 아이콘

게임 메뉴, 피드의 게임 표시와 프로필 스냅샷의 일반 왕관 아이콘을 Supercell이 배포한 실제 클래시 로얄 앱 아이콘으로 바꿨다. `features/game-profile`의 `ClashRoyaleIcon`과 로컬 JPG를 재사용하고 Next Image로 최적화한다. 외부 이미지 서버에 런타임으로 의존하지 않으며 원본 출처와 확인일은 assets/README.md에 기록했다. 게임 이름이 있는 위치의 이미지 alt는 비워 중복 낭독을 피한다.

Web 타입 검사와 FSD lint, Vitest 65개, 변경 파일 Prettier와 diff 검사, Next 프로덕션 빌드가 통과했다. 실행 중인 개발 서버에서 1440px 데스크톱 피드와 390px 모바일 피드/게시글 상세를 캡처했다. 세 위치 모두 최적화된 로컬 이미지가 로드됐으며 가로 넘침과 브라우저 pageerror는 없었다. API/DB/SDK와 모바일 host 코드는 변경하지 않았다.

## 덱 카드 UI 제거

사용자 요청으로 덱 카드와 레벨 표시를 피드, 공개 프로필의 작성글 목록, 게시글 상세, 설정/프로필 연결 미리보기와 글쓰기에서 모두 제거했다. `Deck` 컴포넌트와 public export, PostCard의 deck 슬롯, 작성 폼의 미리보기 전용 useWatch와 사용하지 않는 전용 CSS/레벨 문구도 삭제했다. 프로필에는 게임 아이콘, 이름, 태그, 트로피와 아레나를 표시한다. 덱 첨부/보관 안내는 한국어/영어/일본어의 프로필 안내로 바꿨다. 기존 사용자 작성 내용과 서버의 저장 데이터/REST 계약은 보존하며 카드 데이터를 화면에 렌더하지 않는다.

Web 타입 검사와 FSD lint, Vitest 65개, Next 프로덕션 빌드와 변경 파일 Prettier/diff 검사가 통과했다. 격리된 Web/API/DB에서 작성/수정/삭제, 검색 복귀와 320/390/768/1440px 반응형 E2E 7개가 통과했다. 개발 화면의 데스크톱/모바일 피드, 상세, 공개 프로필과 글쓰기에서 카드가 없는 것을 확인했고, 설정/프로필 연결 미리보기/글쓰기는 한국어/영어/일본어로도 확인했다. 가로 넘침과 브라우저 pageerror는 없었다. 전용 테스트 스키마는 0개이고 테스트 DB만 중지했으며 고정 계정 3개와 기존 게시글 6개를 보존했다. API/SDK/DB schema와 모바일 host 코드는 변경하지 않았다.

## 게시판, Quill 글쓰기와 채팅 미디어

사용자 요청으로 피드백과 별도로 계정 거래/친선전 모집/친구 추가/일반 판매 게시판을 추가했다. Post.board의 기본값 FEEDBACK으로 기존 글을 보존하고 선택한 게시판만 목록/검색/페이지네이션에 포함한다. 공개 프로필 작성글과 sitemap은 전체 게시판을 포함하며 기존 차단/숨김/삭제 규칙을 유지한다. 게시판 글은 댓글과 작성자 채팅으로 연결한다. 피드백의 답변/도움됨은 기존 라운지에서 사용한다. 공유 appRoutes에 네 게시판 경로와 상세 문맥을 추가하고, 메뉴/모바일 탭/딥링크/직접 열린 상세의 상위 화면 복귀를 연결했다. 게시판마다 title/keywords/canonical과 CollectionPage JSON-LD를 제공한다.

Quill 2.0.3을 작성/수정 모달에 지연 로드한다. 굵게/기울임/밑줄/취소선, 제목 2/3, 순서/글머리 목록, 인용과 HTTP(S) 링크를 지원한다. Quill 수명은 class/callback ref가 관리하며 해제 뒤 import 결과를 무시한다. 초기화 실패는 편집기 영역의 오류 경계와 외부 store로 전달하고 요청 오류를 별도 React 상태로 복제하지 않는다. 편집기를 label 안에 넣어 툴바 버튼이 잘못 실행되는 구조를 피했다. 툴바/링크 입력은 한국어/영어/일본어 문구와 공통 디자인 토큰을 사용한다.

본문은 Zod로 검증한 Delta document와 평문 body를 함께 저장하며 서버에서 두 값의 일치를 확인한다. 허용된 문자열 insert와 서식 속성만 받고 실행 가능한 URL/객체 embed/임의 속성은 거부한다. React 요소로 제목/목록/인용/링크를 렌더해 사용자 HTML을 실행하지 않는다. 검색, 발췌와 SEO 구조화 데이터는 평문을 사용하고 기존 문서는 평문으로 표시한다. 편집 중 지원하지 않는 서식이나 문서 한도를 만나면 폼 검증으로 등록을 막고 초안을 유지한다. 본문을 수정하는 구형 클라이언트가 document를 보내지 않으면 이전 서식을 지워 본문과 엇갈리지 않게 한다. 생성 중 드러난 링크 RegExp 변환 문제는 계약의 원본 패턴에서 수정한 뒤 OpenAPI/Orval을 재생성했다.

채팅은 multipart 업로드 후 첨부 ID와 기존 재전송 UUID로 메시지를 전송한다. 현재 UI는 파일 한 개, 서버는 메시지당 최대 4개와 파일당 25MB를 허용한다. 본문 없는 미디어 메시지와 전송 실패 초안/파일 보존, 같은 UUID의 중복 방지와 SSE 갱신을 지원한다. JPEG/PNG/GIF/WebP/MP4/WebM의 MIME과 파일 signature/실제 크기를 확인한다. 미전송 파일은 올린 사용자만 볼 수 있고 다른 사용자/대화의 파일을 메시지에 연결하지 못한다. 첨부 연결은 대화 lock 안의 메시지 transaction으로 처리한다. 업로드는 사용자별 lock으로 미전송 4개 제한을 지키고 오래된 미전송 파일은 해당 사용자의 다음 업로드 때 24시간 기준으로 정리한다. 화면 해제/선택 변경에서도 미전송 파일 제거를 요청한다.

파일과 메타데이터는 전용 PostgreSQL의 ChatAttachment에 저장한다. 메시지/대화 JSON에는 bytes를 조회하거나 노출하지 않는다. GET은 현재 세션, 대화 참여, 차단과 데모 접근 규칙을 확인하고 인증된 no-store 응답으로 제공한다. 동영상의 206/416 byte range와 UTF-8 파일명을 처리한다. 계정/대화 삭제 때 연결 파일도 cascade로 삭제한다. 대용량 운영의 오브젝트 스토리지는 이번 구현에 포함하지 않았다. 이미지 확대는 공통 Dialog로 열어 WebView의 보호된 API URL을 외부 창으로 보내지 않는다. 동영상은 inline 재생하며 iOS 파일 선택/촬영 용도 문구를 네이티브 설정에 추가했다. 모바일 Enter는 줄바꿈이고 데스크톱 포인터/키보드 조건에서만 Enter 전송 안내를 표시한다.

Migration 202610170005_community_media는 Post의 board/document와 첨부 테이블/인덱스만 추가하며 기존 데이터는 수정/삭제하지 않는다. 계약 → OpenAPI → Orval 경로로 JSON operation 45개를 생성한다. JSON 본문의 제한은 서식 문서를 위해 256KB로 조정하고 파일 크기는 별도로 제한한다. 원래 서비스의 요청 제한과 세션/Origin/권한 검사는 유지한다. E2E의 빠른 공용 계정 반복으로 조회 제한에 도달한 문제는 API 소유 test:server 진입점을 분리해 해결했다. 이 진입점은 NODE_ENV=test, 전용 테스트 DB/schema, 4301/4302와 대응 Web origin, 외부 자격 증명 없음 조건을 확인하고 테스트의 속도 제한만 끈다. 일반 서버의 HTTP 240회 후 429/Retry-After 동작은 별도 API 통합 테스트로 확인한다.

루트 yarn.lock 변경은 Quill의 Web 직접 의존성과 신규 전이 descriptor 7개만 추가하며 기존 resolution은 유지한다. Photo Contest와 공통 DS 제품 코드는 변경하지 않았다. Quill과 WebView 구현은 [Quill Delta](https://quilljs.com/docs/delta), [Quill React 예제](https://quilljs.com/playground/react), [WebView 파일 업로드 가이드](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Guide.md#add-support-for-file-upload)를 참고했다. 실기기 파일 선택/권한창과 실제 Google/Supercell 검증은 브라우저/번들 검사와 구분한다.

이번 변경의 최종 검증 결과는 다음과 같다.

| 범위            | 실행 명령과 결과                                                                                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 설치/정적 검사  | Node 24에서 `yarn install --immutable`, `yarn workspace @side/game-feedback check`, 루트 `format:check`, `git diff --check` 통과                                                                          |
| API             | `yarn workspace @game-feedback/api test` 10개 파일 66개 통과. 게시판 분리/문서 검증, 미디어 접근 권한/원자적 연결/삭제/Range/실제 HTTP 요청 제한 포함                                                     |
| SDK             | `yarn workspace @game-feedback/sdk test` 3개 파일 33개 통과. multipart boundary와 응답 Zod 검증 포함                                                                                                      |
| Web unit/UI     | `yarn workspace @game-feedback/web test` 20개 파일 70개 통과                                                                                                                                              |
| Mobile unit/UI  | `yarn workspace @game-feedback/mobile test` 10개 파일 38개 통과                                                                                                                                           |
| Web E2E         | `yarn workspace @game-feedback/web test:e2e` 전체 35개 통과(2.7분). 마지막 편집기 폼 검증 보완 뒤 `e2e/community.spec.ts` 2개 재검증 통과(33.2초)                                                         |
| Mobile host E2E | `yarn workspace @game-feedback/mobile test:e2e` Android Chromium/iOS WebKit 전체 12개 통과(45.8초)                                                                                                        |
| 생성/빌드       | `yarn workspace @side/game-feedback codegen` 전후 생성 파일 77개 hash 동일. `NEXT_DIST_DIR=.next/community-build yarn workspace @side/game-feedback build`의 API/Web 빌드와 Android/iOS Metro export 통과 |

Web E2E에서 네 게시판의 Quill 작성/수정/새로고침과 서식 유지, JavaScript 없는 상세 HTML, canonical/JSON-LD, 모바일 320px을 확인했다. 실제 JPEG 업로드와 상대방 이미지 로드/확대/새로고침, 서버 저장 뒤 응답 실패를 가정한 UUID 재전송의 중복 방지, 미디어 전용 메시지를 확인했다. 실제 생성한 WebM은 브라우저 decode와 상대방 쿠키의 Range 206 응답까지 검사했다. 1440/390px 게시판/편집기와 모바일 이미지 채팅 캡처에서 가로 넘침이 없고 수동 브라우저 pageerror는 0개였다.

첫 Mobile host 실행은 10/12가 통과했고, 시간 초과와 개발 소스 갱신 중 Fast Refresh가 발생한 두 사례를 확인한 뒤 소스 갱신 없이 전체 12개를 다시 검증했다. 최종 잔여 테스트 스키마는 0개이며 이번 테스트 DB만 중지했다. 개발 Web 3300/API 4300은 HTTP 200이고 고정 계정 3개와 기존 게시글 6개를 보존했다. 실기기 파일 선택/촬영/OS 권한창과 서명 빌드 검증은 포함하지 않는다.

## 전체 피드, 공통 게시판 5종과 유료 코칭

홈은 피드백 전용 라운지에서 모든 게임/게시판의 글을 모은 피드로 변경했다. 별도 랜딩 소개를 제거하고 제목/글쓰기/검색과 최신 글을 먼저 보여준다. 최신 목록은 board=ALL로 조회하며 답변 대기는 FEEDBACK만 조회한다. 라운지 문구, 메뉴, 글 카드, 프로필 작성글과 SEO를 피드/게시글 기준으로 맞췄다.

모든 게임이 피드백/친추판매/친선전 모집/게임코치/자유게시판을 공통으로 사용한다. `features/board`의 gameBoards는 게임과 독립적인 공통 설정이며 활성 카테고리에서 게임 메뉴를 만든다. 게임별 메뉴/화면을 복제하지 않는다. 기본 클래시 로얄 경로를 보존하고 다른 게임의 종류별 경로에는 game slug query를 전달한다. 서버는 활성 게임을 검증하고 목록의 category, 검색, 글쓰기, 상세/뒤로 가기, WebView 딥링크, canonical/JSON-LD/sitemap에 같은 게임 문맥을 적용한다. 다른 게임의 아이콘에는 기본 게임 아이콘을 사용하고 클래시 로얄 프로필 첨부를 강제하지 않는다.

게임코치는 돈을 받고 가르치는 코치의 수강생 모집과 수강생의 코치 구함을 지원한다. Post.coaching JSON에 COACH/STUDENT 역할과 시간당 원화 수강료/희망 수강료를 저장한다. 1~10,000,000원 정수 또는 null(협의)을 받으며 카드/상세에 실제 저장값을 표시한다. 본문에서 가격/역할을 추측하지 않는다. 코칭 외 글의 코칭 정보, 코칭 글의 필수 정보 누락/제거와 잘못된 금액을 거부한다. 수정은 메타데이터를 유지하며 삭제 때 비운다. 글쓰기에서 게시판을 바꾸면 숨겨진 코칭 입력이 등록을 막지 않게 초기화한다. 코칭 상담은 작성자와 기존 1:1 채팅을 열며 결제/정산/예약 확정 기능은 포함하지 않는다.

사용자가 유지하도록 확인한 친추판매/친선전 구조를 반영하고 계정 거래/기존 친구 추가/일반 판매 경로와 계약을 제거했다. 폐지한 기존 글은 저장소에 유지하되 공개 조회/상세/프로필 집계/알림/사이트맵에서 제외한다. 기존 글 자동 재분류나 삭제는 없다. Migration 202610170006_coaching_details는 coaching JSON 열만 추가한다. 새 의존성과 루트/다른 서비스 제품 코드 변경은 없다.

이번 변경의 검증 결과는 다음과 같다.

| 범위            | 결과                                                                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 타입/린트       | `yarn workspace @side/game-feedback check` 통과. 마지막 GameSlug를 카테고리 입력의 허용 문법과 일치시킨 뒤 전체 타입/Web/Mobile lint 재검사                                                                                                 |
| API             | Vitest+Supertest 10개 파일 69개 통과. 유료 코칭 역할/금액/수정/필수값 검증, 폐지 게시판의 비공개 유지, 두 번째 게임의 5종 생성/목록 분리 포함                                                                                               |
| SDK             | Vitest 3개 파일 33개 통과                                                                                                                                                                                                                   |
| Web unit/UI     | Vitest 20개 파일 72개 통과                                                                                                                                                                                                                  |
| Mobile unit/UI  | Vitest 10개 파일 38개 통과                                                                                                                                                                                                                  |
| Web E2E         | 전체 38개 중 33개 통과. 로딩/영문 글쓰기의 이전 문구를 찾던 5개 시나리오의 선택자를 수정한 뒤 해당 api-response/responsive 파일의 7개 전부 재검증 통과(46.9초). 38개 고유 시나리오를 검증했으며 한 번의 전체 실행 38개 통과로 표현하지 않음 |
| Mobile host E2E | Android Chromium/iOS WebKit 전체 14개 통과(52.6초). 코칭/자유게시판의 다른 게임 딥링크, 금액 표시와 native back 포함                                                                                                                        |
| 생성/빌드       | `codegen` 전후 생성 파일 78개 hash 동일. `.next/five-boards-build`의 API/Web production build와 Android/iOS Metro export 통과                                                                                                               |

브라우저에서 일반 글과 유료 코칭의 전체 피드 합류, 답변 대기의 피드백 한정, 코치의 수강생 모집/수강생의 코치 구함, 시간당 수강료와 협의, 실제 1:1 채팅 문의를 확인했다. 두 번째 게임을 관리자 API로 등록하면 동일한 5개 메뉴가 표시되고 게임별 목록/폼/상세/복귀와 canonical이 분리되는 것도 확인했다. 개발 환경의 1440/390/320px 피드와 코칭 작성 모달을 직접 캡처했고 가로 넘침과 pageerror는 0개였다. 수동 검사는 초안만 작성하며 개발 게시글은 추가하지 않았다. 잔여 테스트 스키마 0개를 확인하고 이번 테스트 DB만 중지했다. 개발 사용자 7명/고정 테스트 계정 3개/기존 게시글 6개를 보존했고 피드/코칭/자유게시판과 API health는 HTTP 200이다. 실제 OS 파일 선택/권한창, 실기기와 외부 Google/Supercell 검증은 포함하지 않는다.

특정 게임이 모든 페이지의 공통 keywords에 섞이지 않도록 기본 키워드를 게임 커뮤니티/게임 피드백/게임코치로 바꾸고 실제 게임 키워드는 페이지별로 전달한다. 이 후속 변경 뒤 SEO Vitest 7개, JavaScript 비활성 SEO E2E 4개(28.9초), Web production 재빌드와 format 검사가 통과했다.

## 친추판매 금액과 API 규격 자동 생성

친추판매 작성/수정에 판매 금액(원)을 추가했다. `friendSale: { price: number | null }` 계약과 JSONB 열에 저장하며 피드·게시판 카드와 상세에서 같은 원화 표시를 사용한다. 1~10,000,000원의 정수만 받고 문자열·소수·0·음수·범위 초과를 거부한다. 빈 입력은 명시적 가격 협의이며 메타데이터가 없는 기존 글은 판매 금액 미등록으로 구분한다. PATCH에서 생략한 금액을 보존하고 다른 게시판의 가격 입력/친추판매 메타데이터 제거를 거부한다. 게시판을 바꾸면 숨겨진 금액/코칭 필드를 초기화해 다른 종류의 등록을 막지 않는다. 금액 오류에는 SDK fallback을 적용하지 않는다. Migration 202610170007_friend_sale_price는 nullable JSONB 열만 추가하고 기존 글이나 사용자 데이터를 수정하지 않는다.

OpenAPI JSON과 SDK는 계속 생성 결과로 관리한다. 공통 prerequisites에 서버 계약 빌드 → 전용 Prisma → OpenAPI → Orval 생성을 연결해 프로젝트의 개발 실행/setup/check/typecheck/test/E2E/build 시작 시 자동 준비한다. 명시적 codegen도 같은 경로를 사용하고 생성 JSON을 수동 편집하지 않는다. 실행 중 계약을 바꾸면 codegen 재실행 또는 서버 재시작이 필요하다. Git에 포함한 생성 결과는 CI의 재생성 diff 검사로 누락을 확인한다. API 규격이 같으면 같은 파일을 다시 만들어도 diff가 없다.

기존 PR의 Game Feedback CI 실행 39009556420은 Web typecheck에서 이미지 모듈 선언이 없어 실패했다. 로컬의 Next 생성 next-env.d.ts가 문제를 가렸으므로 `shared/types/next-image.d.ts`에서 Next의 공식 이미지 선언을 가져오게 했다. next-env.d.ts와 .next 전체를 제외한 별도 TypeScript 설정으로 초기 체크아웃 조건의 typecheck 통과를 확인했다. 생성 next-env.d.ts는 편집하거나 커밋하지 않았다.

| 검증         | 결과                                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 정적 검사    | 프로젝트 전체 check/typecheck와 Web/Mobile lint 통과. 이미지 선언 추가 후 Web lint와 next-env/.next 없는 타입 검사 통과                                                             |
| API          | Vitest+Supertest 10개 파일 70개 통과. 금액 저장/목록/수정/협의, 잘못된 타입/범위/다른 게시판 거부와 기존 글 보존 포함                                                               |
| SDK          | Vitest 3개 파일 34개 통과. 금액 누락/협의/실제 금액 보존과 잘못된 응답의 fallback 없는 거부 포함                                                                                    |
| Web / Mobile | Vitest 각각 20개 파일 72개, 10개 파일 38개 통과                                                                                                                                     |
| Web E2E      | community/feed-coaching 6개 통과(53.9초). 데스크톱 실제 가격 등록/수정, 피드·카드 표시와 JS 비활성 HTML, 320px 영문 모바일의 협의 등록/가격 수정/재조회, 코칭과 다른 게임 회귀 포함 |
| 생성 / 빌드  | 프로젝트 build의 API/Web production과 Android/iOS Metro export 통과. 자동 재생성 전후 생성 파일 79개 hash 동일                                                                      |

E2E 최초 실행은 피드의 같은 제목을 먼저 찾는 새 모바일 테스트 선택자가 상세 이동 전에 통과해 실패했다. 상세 h1을 기다리도록 수정한 뒤 관련 6개 전체를 재실행해 통과했다. 개발 화면 1440/390/320px에서도 금액 입력을 확인했고 가로 넘침/pageerror는 0개다. 수동 확인은 저장하지 않은 초안만 사용했다. 개발 사용자 7명, 고정 테스트 계정 3개와 기존 게시글 6개를 보존했다. 잔여 gf_test_ 스키마 0개를 확인하고 소유 테스트 DB만 중지했다. 모바일 네이티브 셸 제품 코드는 변경하지 않았으며 이번 후속 검증에서 실기기나 native host E2E를 다시 실행하지 않았다.

## 글쓰기 분류 변경, OpenAPI 추적 제외와 API 단독 테스트

글쓰기의 게시판 필드명을 분류로 변경했다. 홈과 게임별 메뉴 어디서 열어도 다섯 종류를 선택할 수 있고 진입 메뉴는 기본값으로만 사용한다. 한국어/영어/일본어에서 분류/Category/分類로 표시한다. 작성 모달의 제목을 글쓰기로 통일해 게임코치에서 다른 분류로 바꿔도 이전 분류가 모달 제목에 남지 않도록 했다. 분류 전환 시 제목/서식 본문/게임은 보존하며 친추판매·코칭 입력은 해당 분류에서만 전송한다. 등록 후에는 진입 메뉴가 아니라 서버가 저장한 분류와 게임을 상세 경로에 전달하므로 실제 분류의 목록으로 복귀한다. 이미 등록한 글의 분류를 바꾸는 API는 이번 요청의 범위에 포함하지 않는다.

사용자 요청에 따라 중간 생성물인 apps/api/openapi.json을 Git 추적에서 제거하고 프로젝트 .gitignore에 등록했다. 기존 자동 생성 준비 경로는 유지하며 파일이 없는 초기 체크아웃에서도 Zod와 경로 정의로 다시 생성한다. 생성 SDK는 계속 추적한다. 루트 공통 파일 중 .github/workflows/game-feedback.yml 변경은 추적하지 않는 JSON diff를 제거하고 생성 SDK diff를 검사하도록 이름/범위를 맞추기 위해 필요했다. SDK의 모든 JSON operation에 응답 검증이 연결되는 검사도 유지한다. 위 친추판매 후속 기록의 생성 JSON 추적 정책은 이 요청으로 대체한다.

API에는 Vitest/Supertest 의존성과 HTTP 통합 테스트가 있었으나 API 워크스페이스 test를 직접 실행하면 TEST_DATABASE_URL이 없을 때 DB 통합 테스트를 skip할 수 있었다. API 소유 scripts/test.ts와 vitest.config.mts를 추가해 API 단독 명령도 Node 24/전용 DB URL 확인 → 계약 빌드 → 전용 Prisma → 소유 테스트 DB 시작 → Vitest/Supertest 실행을 준비한다. 외부 제공자 인증정보를 비우고 개발 DB 연결은 거부한다. Vitest 원시 호출의 테스트 URL 누락도 설정 단계에서 실패한다. 루트 test는 같은 API 명령을 호출하며 중복 DB 시작 코드를 제거했다. API 실행 방법과 격리/정리 범위는 apps/api/README.md에 정리했다. 런타임 API 계약/데이터베이스/새 라이브러리 의존성은 변경하지 않았다.

이번 변경의 검증 결과는 다음과 같다.

| 검증                | 결과                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 초기 생성/정적 검사 | 로컬 openapi.json을 지운 상태에서 프로젝트 check 통과. JSON 재생성 hash 동일, Git 미추적/ignore와 SDK 생성 diff 없음 확인. Web/Mobile lint와 전체 타입 검사 포함 |
| API 단독 실행       | 외부 TEST_DATABASE_URL/DATABASE_URL/NODE_ENV 없이 API test 실행. Vitest+Supertest 10개 파일 70개 전부 통과, skip 없음                                            |
| API 실패 경로       | raw Vitest의 테스트 URL 누락과 API test의 개발 DB URL을 의도적으로 주어 각각 설정/준비 전에 실패함을 확인                                                        |
| SDK / Web unit      | SDK 3개 파일 34개, Web 20개 파일 72개 통과                                                                                                                       |
| Web E2E             | 분류/친추판매/코칭 관련 6개 통과(57.0초). 이후 전체 39개 통과(3.2분), 모바일 분류 전환/본문 보존/목록 복귀와 다른 게임/채팅/SEO 포함                             |
| Web production      | .next/category-build에서 프로덕션 빌드와 타입 검사 통과                                                                                                          |

이전 CI 실행 39010204258은 타입/단위 테스트/API 70개/빌드는 통과했으나 Web E2E 39개 중 한 개가 Next 개발 프록시에 대한 직접 GET의 ECONNRESET으로 실패했다. 해당 Web 시나리오는 중복 직접 API 조회 대신 실제 피드백 목록으로 이동해 검색 결과가 비어 있는지 검증하도록 수정했다. 서버의 게시판 분리 검증은 기존 API Supertest 테스트에서 계속 수행한다. 위 전체 Web 실행은 변경한 사용자 흐름을 포함해 39개 전부 통과했다.

전체 실행 중 공개 프로필의 상대 시간이 SSR과 클라이언트 사이에서 분 경계를 지나며 hydration 차이가 나는 것을 확인했다. 글 카드/상세의 상대 시간 텍스트에만 suppressHydrationWarning을 적용해 화면 전체가 다시 렌더되는 것을 막았다. 전체 39개 실행 이후의 이 작은 후속 변경은 Web production/타입/lint와 브라우저 시계를 서버보다 400일 뒤로 설정한 공개 프로필/상세 검사에서 검증했다. 클라이언트 재조회까지 기다린 결과 pageerror는 0개였다. 다른 본문·사용자·권한 오류를 숨기지 않는다.

개발 사용자 7명/고정 계정 3개/기존 게시글 6개를 보존했다. 잔여 gf_test_ 스키마 0개를 확인한 뒤 소유 테스트 DB만 중지했다. 이번 후속 변경에서는 Mobile 제품 코드/네이티브 host를 바꾸지 않았고 Mobile E2E를 다시 실행하지 않았다.

## Web shadcn/ui 적용

이전 Web은 공통 Base UI 커스텀 컴포넌트와 native 폼 컨트롤을 사용했고 Game Feedback의 shadcn 설정은 없었다. 사용자 요청으로 공식 shadcn/ui Base UI/base-nova registry 소스를 공통 디자인 시스템에 설치하고 저장소의 PascalCase/named export와 공통 토큰/공개 API에 맞게 조정했다. 공통 packages/design-system/components.json과 Web components.json은 같은 base-nova/neutral/lucide를 사용하고 ui/utils alias가 공통 소스로 연결된다. 원본과 MIT 라이선스, 조정 범위는 공통 패키지의 SHADCN.md/SHADCN-LICENSE.md에 보존한다. 런타임 shadcn 패키지를 넣은 것으로 구현을 대신하지 않는다.

Button의 공식 CVA/포커스/invalid/disabled 기반에 기존 variant/size/fullWidth/loading을 연결하고 IconButton/Next ButtonLink가 이를 재사용한다. Dialog의 Root/Portal/Content/Header/Title/Description/Close 조합은 공통 API가 소유하며 기존 wrapper props, 번역된 닫기 이름, 포털 container, Viewport, 중첩/필수 모달 동작은 유지한다. Input/Textarea/NativeSelect/Checkbox/Tabs/Label을 공통 공개 API에 추가하고 Game Feedback의 실제 폼 12개 파일, 모달과 버튼, 피드 탭에서 사용한다. NativeSelect는 모바일 OS 선택창과 RHF ref를 유지하고 Checkbox는 Controller의 boolean 필드로 연결한다. Tabs의 값은 계속 URL이 소유하며 Base UI가 방향키와 ARIA를 관리한다.

FormField는 합성 컨트롤에도 레이블/도움말/오류를 연결하며 복제 시 native ref를 보존한다. 이 동작은 실제 RHF+Zod를 사용해 invalid submit의 첫 오류 포커스와 세 필드 값의 전송을 검증한다. Tabs도 방향키/선택 패널/ARIA를 실제 Base UI로 검증한다. CSS는 기존 흑백/오렌지 토큰에서 shadcn 토큰을 파생하며 muted 글자색을 배경색으로 재해석하지 않는다. 입력 16px과 버튼 44px 이상을 유지하고 Quill/파일·hidden 입력은 전용 DOM을 사용한다.

공통 패키지 수정은 사용자가 요청한 두 서비스 공통 스타일과 shadcn primitive를 한 곳에서 관리하기 위해 필요했다. lucide-react는 새 아이콘 소스를 소비하는 공통 패키지의 직접 의존성으로 선언했고 이미 잠긴 ^0.468.0을 재사용한다. yarn.lock 변경은 이 workspace 의존성 한 줄이며 기존 resolution/version 변경은 없다. Photo Contest 제품 소스·설정·DB·서버는 수정하지 않았다.

registry의 방향 선택자를 설치된 Base UI 1.9의 data-orientation에 맞추고 orientation prop도 전달했다. 가로/세로 방향키와 선택 패널을 공통 UI 테스트로 검증하며 실제 피드 선택선의 표시/크기와 reduced motion은 브라우저에서 검증한다. 수동 캡처에서 기존 text-input 크기 토큰과 새 input 색 토큰이 겹쳐 입력값 색이 흐려지는 문제를 발견했다. 색 토큰을 input-border로 분리하고 브라우저 테스트에 실제 입력값이 공통 ink 색인지 검증을 추가했다.

| 검증               | 결과                                                                                                                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 공통 UI            | lint/typecheck 및 Vitest 6개 파일 13개 통과. RHF+Zod 오류 포커스/레이블/값 전송과 가로/세로 Tabs 키보드 조작 포함                                                                                                                                                                      |
| 프로젝트 정적 검사 | 전체 check 통과. Web/Mobile lint와 모든 앱/패키지 타입 검사 포함. 최종 Web lint 재검사 통과                                                                                                                                                                                            |
| Web unit           | Vitest 20개 파일 72개 통과                                                                                                                                                                                                                                                             |
| Photo Contest 회귀 | Web Vitest 55개 파일 238개와 typecheck 통과. 기존 Yarn 실행의 vitest bin 매핑 실패로 Photo Web package.json에서 해석한 설치된 Vitest를 같은 unit/ui project 설정으로 직접 실행                                                                                                         |
| Web E2E            | 전체 39개 중 37개 통과. 이전 커스텀 선택선을 찾던 motion 2개를 실제 shadcn 선택선 검사로 변경하고 관련 design-system/motion 3개 재실행 통과(26.0초). 39개 고유 시나리오를 검증했으며 단일 전체 실행 39개 통과로 표현하지 않음. 색 토큰 수정 뒤 design-system 시나리오 추가 재검증 통과 |
| Mobile host E2E    | Android Chromium/iOS WebKit 전체 14개 통과(51.8초). WebView의 폼/딥링크/채팅 회귀 포함                                                                                                                                                                                                 |
| Web production     | .next/shadcn-build에서 프로덕션 빌드와 타입 검사 통과                                                                                                                                                                                                                                  |

개발 화면 1440/390/320px에서 분류 전환, 코칭 금액과 친추판매 금액 입력을 직접 캡처했다. 가로 넘침과 pageerror는 0개이며 초안만 입력하고 글은 등록하지 않았다. 개발 사용자 7명/고정 계정 3개/기존 게시글 6개와 원래 sample-post 6개를 보존했고 잔여 gf_test_ 스키마는 0개였다. 소유 테스트 DB만 종료하고 개발 Web/API는 유지한다. 실제 OS 파일 선택/권한창이나 실기기 검증은 포함하지 않는다.

## 수강료 기준, 본문 미디어와 계정 중심 운영

코칭 수강료를 `coaching.pricing`의 HOURLY/MONTHLY/GOAL과 원화 amount로 분리했다. 시간당, 월 단위, 목표 점수 달성까지의 총금액을 코치/수강생 모두 선택한다. GOAL은 1~100자의 targetScore가 필수이며 다른 기준에서는 목표 필드를 받지 않는다. 금액은 기존 1~10,000,000원의 정수/null 협의 정책을 유지한다. 작성/수정/기준 전환과 피드/상세/서버 HTML에 같은 조건을 표시하고 기준을 바꾸면 숨겨진 목표 데이터를 제거한다. CoachingFields를 별도 파일로 분리해 PostComposer에 수강료 분기 UI를 쌓지 않았다. Migration 202610170008은 기존 role/hourlyRate를 role/pricing(HOURLY)으로 변환하며 역할/금액/협의/본문/수정일과 새 형식 데이터를 보존한다.

Quill 툴바에 사진 삽입/동영상 삽입을 추가했다. 별도 post-media 도메인의 mutationOptions로 업로드하고 서버가 돌려준 `/api/post-media/:id`만 Delta의 image/video 삽입으로 저장한다. 사진과 동영상은 글당 10개, 파일당 25MB이며 JPEG/PNG/GIF/WebP/MP4/WebM을 지원한다. 동영상은 iframe 대신 controls/playsInline이 있는 실제 video 요소를 편집기와 서버 본문에서 사용한다. 평문은 미디어를 제외해 서버에서 Delta와의 일치를 검증한다. 업로드 실패는 기존 초안을 유지하고 폼 안에 표시한다. 미디어를 수정/재조회/JavaScript 없는 공개 본문에서도 유지한다.

PostMedia는 API 전용 DB의 파일 테이블이며 업로드 전에 세션을 확인한다. 채팅의 검증된 파일 크기/MIME/signature/실제 크기/파일명/Range 처리를 API common/media-file로 공유하고 채팅의 기존 진입점은 재수출로 보존했다. 업로드 직후에는 업로더만 조회하고, 글 등록/수정과 소유 파일 연결을 하나의 트랜잭션으로 처리한다. 다른 사용자의 파일, 다른 글에 이미 연결된 파일, 이미지/영상 종류 불일치를 거부하며 실패 시 게시글도 남기지 않는다. 게시글 공개/숨김/삭제와 사용자 차단 정책을 파일 GET에도 적용한다. 본문에서 제거/글 삭제 시 연결 파일도 정리한다. 게시하지 않은 파일은 사용자당 최대 20개이며 업로드 시 24시간 지난 대기 파일을 정리한다. 외부 URL, data URL, 임의 HTML/iframe은 허용하지 않는다.

게임 프로필은 사용자 설정에서 게임 계정을 등록하는 모델로 정리했다. 글쓰기의 프로필 선택/연결/자동 첨부와 글 카드/상세의 게임 스냅샷 표시는 제거했고 새 API 입력은 playerTag를 받지 않는다. 등록한 대표 태그는 작성자와 공개 사용자 프로필의 사용자 데이터로 읽는다. 기존 게시글의 gameProfile DB/응답 필드는 호환성과 데이터 보존을 위해 유지하되 새 글/seed에는 채우지 않는다. 대표 태그를 바꾸면 isVerified/verifiedAt을 해제하며 같은 태그의 재조회는 인증을 유지한다. 공식 게임 프로필의 UNVERIFIED와 운영자가 승인한 서비스 사용자 인증은 구분한다.

## 관리자 문의, 인증, 사용자 신고와 제재

사용자의 관리자 문의/프로필 인증 문의는 새 티켓 대화 UI 대신 담당 관리자와 기존 비공개 1:1 Conversation으로 연결한다. 문의 시작은 기존 방을 재사용하고, SupportConversation은 담당자/요청자/목적/처리 상태만 관리한다. 문의함에는 담당 관리자 자신의 문의만 표시하며 채팅의 양방향 메시지/미디어/읽음/SSE를 재사용한다. 관리자가 없으면 503을 반환하고 가짜 담당자나 답변을 만들지 않는다. 문의 상태는 관리자가 열기/완료로 바꾸고 요청자의 새 메시지/새 문의는 다시 연다. 인증은 사용자가 계정 설정에서 문의하고 관리자가 등록 태그와 채팅을 확인한 뒤 기존 관리자 인증 API로 수동 처리한다. 게임 계정 등록이 인증을 자동 승인하지 않는다.

사용자 프로필의 사용자 신고는 USER 대상을 추가한 기존 신고 계약/중복 방지에 연결했다. 자기 신고와 없는 사용자 신고를 거부한다. /:locale/admin은 문의함, 신고함과 사용자 관리 파일로 분리하며 실제 관리자 권한으로 문의/신고/사용자 상태를 조회한다. 신고 검토/반려, 콘텐츠 숨김/복구와 프로필 인증 승인/해제, 사유를 포함한 밴/해제를 제공한다. 사용자 밴은 관리자 자신/다른 관리자에게 적용할 수 없으며 제재와 해제, 신고 검토, 문의 처리에는 감사 기록을 남긴다. 세션마다 최신 bannedAt을 조회해 기존 세션의 글/댓글/업로드와 일반 채팅도 제한하고 SSE 연결을 닫는다. 관리자 문의 채팅과 로그아웃/탈퇴는 유지해 소명할 수 있다. 제재 정보는 본인 세션/관리자 조회에만 표시하고 공개 작성자 데이터에 노출하지 않는다.

관리자 화면은 비공개 metadata/canonical과 noindex를 사용하고 WebView의 알려진 admin 경로에도 포함한다. 설정에서 운영 관리로 진입하고 일반 사용자는 권한 안내와 서버 403을 받는다. 문의/신고/개별 사용자 영역은 Suspense+ServiceErrorBoundary로 나누고 서버 상태는 query options, 조치는 mutationOptions, 폼은 RHF+Zod, 사용자 신고 모달은 overlay-kit으로 관리한다. shadcn/ui Base UI 공통 컨트롤을 그대로 사용한다. Migration 202610170009는 User의 제재 필드와 PostMedia/SupportConversation만 추가하며 기존 게시글/사용자 내용을 삭제하지 않는다. 새 라이브러리/루트 파일/다른 프로젝트 코드는 변경하지 않았다.

이번 변경의 검증 결과는 다음과 같다.

| 검증            | 결과                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 정적 검사       | 최종 전체 check 통과. API/Web/Mobile/SDK/계약/브리지 타입과 Web/Mobile FSD lint 포함                                                                                      |
| API             | Vitest+Supertest 11개 파일 75개 통과. 기간/목표/금액/레거시 변환, 미디어 소유권/종류/중복 종류 참조/Range/차단/숨김/제거, 계정 등록/인증 변경/신고/밴/문의/감사 기록 포함 |
| SDK             | Vitest 3개 파일 35개 통과. 53개 JSON operation의 응답 스키마 연결과 잘못된 수강료/목표의 fallback 없는 거부 포함                                                          |
| Web/Mobile unit | Vitest 각각 20개 파일 73개, 10개 파일 38개 통과                                                                                                                           |
| Web E2E         | 전체 43개 통과(4.1분). 이후 목표 입력 전 오류 표시, 신고 표시/조회와 미디어 종류 검사 후속 변경은 관련 community-enhancements 4개 재실행 통과(50.7초)로 검증              |
| Mobile host E2E | 전체 14개(50.3초) 통과 후 관리자 cold 진입/설정 복귀를 추가한 Android Chromium/iOS WebKit 16개 전부 재실행 통과(1.0분)                                                    |
| 빌드            | API/Web production과 Android/iOS Metro export 통과. 별도 .next/community-build 사용                                                                                       |

최초 신규 브라우저 검사는 월/목표 금액 기대값에서 기존 원화 기호 ₩를 누락해 2개가 실패했고 실제 표시와 같은 기대값으로 수정했다. 이후 위 전체 43개가 통과했다. 수동 확인에서 제출 전 수강료 기준을 바꾸자 목표 오류가 먼저 표시되는 문제도 발견해, 처음 입력할 때는 오류를 만들지 않고 제출 이후에 검증하도록 수정했다. 최종 4개 재실행은 빈 목표의 제출 거부와 유효 입력, 기준 전환 시 숨겨진 목표 제거/수정/서버 HTML을 포함한다.

생성 SDK 93개 파일의 build 전후 hash가 동일하고 OpenAPI JSON은 계속 Git 미추적/ignore 상태다. 1440/390/320px의 목표형 코칭 폼과 관리자 화면을 다시 캡처했고 가로 넘침/pageerror는 0개다. 수동 검사는 초안과 조회만 사용했으며 인증/제재/게시글 등록을 수행하지 않았다. 개발 사용자 7명/고정 계정 3개/원래 게시글 6개를 보존했다. 잔여 gf_test_ 스키마 0개를 확인하고 소유 테스트 DB만 종료했다. 개발 Web 3300/API 4300은 계속 실행한다. 실제 OS 파일 선택/권한창, 실기기, 실제 외부 OAuth/Supercell 검증은 포함하지 않는다.

## 탐색 통합과 반응형 레이아웃

모바일 헤더는 언어와 알림만 표시하고 계정 관리는 하단 프로필로 통합했다. 하단은 피드, 가이드, 채팅, 프로필의 4개 탭을 유지한다. 데스크톱은 헤더에 언어, 알림, 프로필/로그인을 표시하고 왼쪽 주 메뉴에 피드, 가이드, 채팅을 모았다. 알림은 헤더에서만 접근하며 각 게임의 공통 5개 분류는 데스크톱의 왼쪽 메뉴, 모바일의 본문 상단에서 탐색한다. 데스크톱의 중복 본문 분류 메뉴와 헤더 주 메뉴/채팅 바로가기, 오른쪽 프로필/가이드 카드, 반복 안내 문구를 제거했다. 데모 환경 표시는 왼쪽 하단에 유지한다.

서비스 공통 레이아웃을 최대 1160px의 2열로 정리하고 헤더와 본문의 기준선을 맞췄다. 모바일은 기존 안전 영역과 44px 헤더 터치 영역을 유지한다. 사용하지 않는 PlayerSidebar와 전용 스타일, 채팅 화면의 별도 3열 해제 규칙도 정리했다. 기존 TabLink의 경로 교체, 필터 복귀, WebView 뒤로 가기와 게임 문맥은 그대로 재사용한다. 알림 표시는 notificationSummaryOptions, 채팅 숫자는 conversationBadgeOptions와 SSE/읽음 처리로 갱신하며 0개 숨김과 99+ 표시를 유지한다. 서버 상태를 별도로 복제하거나 API/계약/네이티브 코드를 변경하지 않았다.

이번 검증은 Web 타입 검사, Web/Mobile lint, Web Vitest 20개 파일 73개, Web production build(.next/clean-nav-build)가 통과했다. Web Playwright 19개(1.8분)는 데스크톱의 단일 메뉴와 계정 진입, 각 분류 이동/작성/수정, 언어 설정, 실제 미읽음 알림과 실시간 채팅/읽음, 320/390/768/1440px 반응형을 확인한다. Mobile host는 Android Chromium/iOS WebKit 탐색 10개가 모두 통과했다(44.4초). 기존 게시판 탐색 검사는 데스크톱의 왼쪽 메뉴와 모바일의 상단 분류를 각각 사용하도록 수정했다. 실기기 검증은 포함하지 않는다.

로그인 전/후 320/390/760/768/1080/1440/1920px 수동 캡처 14개에서 가로 넘침과 pageerror가 없었다. 개발 사용자 7명, 고정 계정 3개, 원래 게시글 6개를 유지했고 잔여 gf_test_ 스키마 0개를 확인한 뒤 소유 테스트 DB만 종료했다. 개발 Web 3300/API 4300은 계속 실행한다.

## 채팅 스크롤과 400px 화면

입력창이 여러 줄로 늘어나면 최신 메시지가 하단에서 60px 가려지는 문제를 400px Playwright 회귀 검사로 먼저 재현했다. 기존 메시지 ID 변경 시점의 스크롤 조정에 더해 ResizeObserver로 메시지 목록과 표시 영역의 크기 변화를 관찰한다. 입력창 확장/초기화, 키보드 크기 변경과 미디어 로딩 후에도 하단을 보던 사용자는 최신 메시지를 따라간다. 위로 올려 이전 내용을 읽는 경우에는 위치를 유지하고, 과거 메시지 추가 로딩의 앵커도 보존한다. 명시적인 전송/최신 이동은 과거 로딩 앵커를 해제하며 완료된 전송 의도가 이후 읽기를 방해하지 않도록 정리했다. DOM은 callback ref, 외부 상태는 기존 controller와 useSyncExternalStore로 연결하며 observer는 해제 시 정리한다.

400px의 인증 배지/태그가 있는 대화 헤더는 63.5px, 기본 입력 영역은 71px, textarea는 44px로 확인했다. 대화 상대 이름과 인증/문의 목적을 남기고 반복 설명을 제거했으며 차단은 접근성 이름이 있는 44px 아이콘 버튼으로 유지한다. 입력은 1줄에서 시작해 최대 112px까지 늘어나고, 글자 수는 한도에 가까울 때 표시한다. shadcn Base UI Textarea의 padding/border/ring은 className으로 조정해 이중 입력 테두리와 불필요한 높이를 줄였다. 데스크톱 채팅 패널은 최대 520px, 모바일 대화는 기존 안전 영역과 visual viewport를 사용한다. 새 메시지 이동 버튼은 입력 영역 위에 상대 배치해 여러 줄 작성 시에도 겹치지 않는다. 개발 도구 표시가 모바일 첨부 버튼을 가려 devIndicators를 비활성화했다. Next의 컴파일/런타임 오류 표시는 유지한다.

Web 타입 검사와 Web/Mobile lint, Vitest 20개 파일 77개, Web production build(.next/chat-layout-build)가 통과했다. 브라우저 채팅/미디어/실패 복구/반응형/오류 경계 12개가 통과했다(1.2분). 새 400/1440px 회귀 검사는 여러 줄 입력 후 하단 유지, 위로 스크롤한 상태의 전송, 화면 높이 변경, SSE 수신 중 읽기 위치 유지와 과거 페이지 앵커 복원을 확인한다. Mobile host는 기존 app-shell 6개(33.8초)와 400px Android Chromium/iOS WebKit 스크롤 회귀 2개(16.3초)가 통과했다. 실제 OS 키보드/실기기 검증은 포함하지 않는다.

320/390/400/768/1440px 수동 확인에서 기본/여러 줄 입력과 실제 기존 이미지의 하단 정렬, 가로 넘침/pageerror 없음을 확인했다. 개발 채팅에는 새 메시지를 전송하지 않았고 사용자 7명, 고정 계정 3개, 원래 게시글 6개를 유지했다. 잔여 gf_test_ 스키마 0개를 확인한 뒤 소유 테스트 DB만 종료했으며 개발 Web 3300/API 4300은 계속 실행한다. API/SDK/계약/네이티브 서비스 코드는 변경하지 않았다.

## 피드 검색 입력 정리

피드 검색에서 shadcn Base UI Input의 utility 스타일이 components 레이어보다 우선해 바깥 검색 영역 안에 48px 입력 테두리가 다시 생기는 문제를 확인했다. 검색 영역 한 곳에서 테두리와 포커스 표시를 맡고 Input의 border/padding/ring을 className으로 조정했다. 검색 영역은 46px, 입력과 지우기 버튼은 44px이며 입력 글자는 16px을 유지한다. 긴 안내 문구를 한국어/영어/일본어의 짧은 게시글 검색으로 바꾸고 검색어가 있을 때만 접근성 이름을 가진 X 버튼을 표시한다. 검색은 기존 URL 필터와 debounce를 사용하며 form의 Enter는 새 문서로 이동하지 않는다. 지우기는 검색어만 초기화하고 입력창으로 포커스를 돌린다. 공통 디자인 시스템과 다른 서비스는 변경하지 않았다.

Web 타입 검사와 lint, Vitest 20개 파일 77개가 통과했다. Playwright 5개가 통과했다(48.3초). 기존 필터 복귀/새로고침 검사를 400px에서 실행하고 Enter, 키보드로 지우기, 포커스 복귀와 다른 URL 필터 보존을 확인했다. 기존 320/390/768/1440px 반응형 검사도 통과했다. 별도 개발 화면 수동 확인은 Chromium 320/400/768/1440px와 WebKit 400px에서 한국어/영어/일본어 15개 조합을 사용했으며 입력/지우기/Enter/터치 영역, 가로 넘침과 pageerror 0개를 확인했다. E2E 개발 서버 로그에는 React use() 관련 경고가 1회 있었고 해당 사용자 흐름 검사는 통과했다. 실기기 검증과 이번 변경의 production build는 수행하지 않았다.

## 모바일 분류 선택과 피드 정리 (이전 구현)

아래는 바텀시트로 분류를 선택하던 이전 구현 기록이다. 현재 메뉴는 뒤의 분류 칩과 언어 드롭다운 절에 기록한 직접 이동 칩을 사용한다.

모바일 게임 메뉴는 게임 이름과 현재 분류 버튼 한 줄로 구성한다. 분류 선택을 누르면 공통 Base UI Dialog를 사용하는 GameBoardSheet에서 전체 피드와 공통 5개 분류를 한 번에 보고 이동한다. 현재 항목에는 aria-current와 체크를 표시한다. 기존 gameBoards/gameBoardPath와 TabLink의 replace 및 저장된 피드 복귀를 재사용해 모든 게임의 경로 문맥과 검색 필터를 유지한다. Desktop은 기존 왼쪽 메뉴를 사용하며 모바일 버튼을 숨긴다. 모달은 overlay-kit과 영역 오류 경계를 사용하고 Escape/닫기/바깥 클릭 및 native back으로 닫힌다. 닫기 완료 후 overlay를 해제하며 기존 Base UI 포커스 복귀를 유지한다.

시트는 모바일에서 화면 하단에 배치하고 visual viewport와 Safe Area를 사용한다. 360px처럼 낮은 화면에서는 내부 목록을 스크롤하고 scroll-padding으로 마지막 항목과 포커스의 여백을 확보한다. 열기/닫기 전환은 짧은 이동과 투명도를 사용하며 reduced motion을 존중한다. 피드의 최신 글/최신순 중복 표현과 탭을 제거하고 최신순을 기본 동작으로 유지한다. 검색 옆의 답변 대기 버튼은 aria-pressed와 실제 URL의 tab=unanswered로 제어하고, 해제하면 전체 글로 돌아온다. q와 다른 URL 필터를 유지한다. 반복 설명 문구를 줄여 검색과 게시글을 앞에 배치했다. 사용하지 않는 가로 스크롤 훅/스타일/번역을 정리했으며 API/SDK/계약/네이티브 서비스/공통 패키지와 의존성을 변경하지 않았다.

Web 타입 검사와 Web/Mobile lint, Web Vitest 20개 파일 77개가 통과했다. Web Playwright의 작성/코칭/검색/모션/탐색/반응형 관련 19개에서 처음 18개가 통과했고, 신규 낮은 화면 검사 1개는 마지막 항목이 0.2px 잘려 실패했다. scroll-padding 보완 후 해당 시트와 공통 컨트롤 2개를 재실행해 통과했다(17.5초). Escape/바깥 클릭/재열기 회귀 1개도 통과했다(13.3초). Mobile host는 Android Chromium/iOS WebKit 탐색 12개가 통과했다(50.7초). 새 시나리오는 native back이 시트를 먼저 닫고 경로/포커스를 유지하는 것, 분류 선택 후 저장된 필터 피드 복귀, 다른 게임의 분류 경로 보존을 확인한다. Web production build(.next/category-sheet-build)가 통과했다. 실제 OS 키보드와 실기기 검증은 포함하지 않는다.

Chromium 320/400/760/768/1440px와 WebKit 320/400px의 한국어/영어/일본어 21개 조합과 각 언어/엔진의 400×360px 낮은 화면 6개를 수동 확인했다. 모든 분류 표시, 선택 체크, Escape/바깥 클릭, 재열기, 필터 켜기/끄기, 모바일/데스크톱 전환, 가로 넘침과 pageerror 0개를 확인했다. 초기 수동 검사는 시트가 표시되기 전에 바깥 클릭을 보내 실패했으며, 표시/해제 완료를 기다리도록 검사 시점을 보정했다. 개발 게시글/메시지를 추가하지 않았고 소유 테스트 DB만 종료하며 Web 3300/API 4300 실행을 유지한다.

## 데스크톱 채팅 키보드와 공통 푸터

400px 데스크톱 브라우저에서 Enter가 메시지를 전송하지 않는 문제를 Playwright로 재현했다. useDesktopKeyboard에서 화면 너비 조건을 제거하고 hover/fine pointer 입력 환경을 기준으로 판단한다. useSyncExternalStore로 포인터 조건과 네이티브 bootstrap 변경을 구독하며 WebView는 폭/포인터 보고 값과 관계없이 Enter 줄바꿈을 유지한다. 데스크톱은 Enter 전송, Shift+Enter 줄바꿈이며 조합 중 isComposing/keyCode 229 Enter는 전송하지 않는다. Enter를 길게 눌러 발생하는 repeat 이벤트는 기본 줄바꿈과 중복 전송을 막는다. 기존 mutationOptions의 초안/첨부 보존, 재전송 UUID, 전송 중 중복 방지는 유지한다. 모바일 미디어 E2E는 좁은 데스크톱 창을 모바일로 취급하지 않고 touch/isMobile 브라우저 문맥을 사용하도록 고쳤다.

공통 CommunityFooter에 서비스 이용약관/개인정보 처리방침/문의 링크를 배치하고 현재 언어의 기존 terms/privacy/contact 경로로 연결한다. 문서 본문은 기존 한국어 알파 초안을 유지하며 canonical도 한국어 원문을 가리키는 기존 정책을 보존한다. 새 정책이나 운영자 정보를 임의로 작성하지 않았다. 사이드바의 중복 링크/저작권과 피드 전용 안내 푸터를 정리하고 공통 푸터에서 한국 시간 기준 연도와 Playmate를 표시한다. 짧은 화면에서도 푸터가 본문 아래에 오도록 shell을 구성하고, 모바일 하단 메뉴의 여백을 푸터가 맡는다. 모바일 대화 화면에서는 푸터를 숨겨 입력 영역을 가리지 않는다. 전용 footer.css와 컴포넌트를 분리하고 영역 오류 경계를 사용한다.

Web 타입 검사, Web/Mobile lint와 Web Vitest 20개 파일 77개가 통과했다. Web E2E의 데스크톱 400/1440px Enter/Shift+Enter/합성 IME 이벤트/repeat/저장 재조회, 모바일 Enter/이미지/동영상/재전송/SSE와 반응형 10개가 통과했다. 새 푸터 2개 검사는 처음에 영어 canonical을 영어 경로로 예상해 실패했고, 기존 원문 canonical 정책과 같은 기대값으로 수정했다. 수정 후 320/1440px에서 한국어/영어/일본어의 약관/개인정보 링크 이동과 하단 메뉴 가림, 한국어 원문 canonical 검사 2개가 통과했다(19.6초). Web production build(.next/keyboard-footer-build)도 통과했다. Mobile host는 Android Chromium/iOS WebKit의 400/1440px에서 desktop pointer를 보고하는 WebView의 Enter 줄바꿈/버튼 전송과 400px 스크롤 6개가 통과했다(22.7초). 실제 OS IME/키보드와 실기기 검증은 포함하지 않는다.

320/400/768/1440px의 한국어/영어/일본어 12개 수동 확인에서 링크 3개를 한 줄로 표시하고 하단 메뉴 가림/가로 넘침/pageerror가 없었다. 개발 채팅에서는 빈 초안의 Enter만 확인하고 전송 요청 0개를 확인했다. 소유 테스트 DB를 종료하고 개발 Web 3300/API 4300 실행을 유지한다. API/SDK/계약/네이티브 서비스/공통 패키지와 의존성은 변경하지 않았다.

## 분류 칩과 언어 드롭다운, 스크롤 고정 헤더

모바일 본문 상단에 전체 피드와 공통 5개 분류를 둥근 칩 링크로 표시한다. 바텀시트를 열지 않고 바로 이동하며 모든 게임이 기존 gameBoards/gameBoardPath를 공유한다. 선택 상태는 URL의 aria-current로 표시하고 공통 디자인 시스템의 버튼 색상/타이포/포커스/36px 칩과 44px 터치 영역을 재사용한다. 한 줄 가로 스크롤이며 callback ref와 ResizeObserver로 현재 분류를 노출하고 화면 크기나 번역 길이가 바뀌어도 선택 칩을 보이게 한다. 세로 스크롤 위치는 직접 바꾸지 않는다. 양끝 여백으로 소수점 좌표의 잘림과 포커스 표시를 보완했다. useRef/가변 let/선택 상태 복제 없이 observer를 정리하며 GameBoardSheet와 시트 전용 스타일/번역을 제거했다. Desktop은 기존 왼쪽 게임 메뉴를 사용한다. 분류 replace 탐색, 저장된 피드의 검색/답변 대기 복원, 상세의 논리적 상위 경로와 다른 게임 문맥을 보존한다.

헤더의 언어 설정은 기존 Globe2 지구본 아이콘과 44px 조작 영역을 유지하는 드롭다운이다. 공통 shadcn Base UI 패키지의 NativeSelect/NativeSelectOption을 사용하며 프로필 설정과 같은 LanguageSelect로 선택/자동 감지/저장을 연결한다. 자동, 한국어, English, 日本語를 고를 수 있고 현재 문서의 언어 경로만 replace한다. 검색 쿼리와 해시, 글 상세와 게임 문맥은 유지한다. 쿠키와 useSyncExternalStore의 기존 preference 구독을 재사용하며 로그인 없이 저장하고 프로필과 헤더의 선택이 일치한다. localePath는 루트 경로의 해시도 보존한다. 아이콘 아래의 실제 select를 숨겨 제거하지 않아 키보드와 스크린 리더 조작을 유지한다.

공통 topbar는 sticky로 화면 상단에 고정하고 디자인 시스템 app-bar 레이어를 사용한다. 86/77/66px의 기존 반응형 높이는 --site-header-height로 통일하며 같은 값으로 문서의 scroll-padding-top을 설정해 앵커와 키보드 포커스가 헤더에 가려지지 않게 한다. 기존 모바일 대화 화면의 전용 레이아웃을 유지한다. API/SDK/계약, 네이티브 서비스, 공통 패키지와 의존성은 변경하지 않았다.

Web 타입 검사와 Web/Mobile lint, Web Vitest 20개 파일 77개가 통과했다. Web Playwright의 분류/작성/언어/헤더/탐색/미읽음/반응형 20개 중 처음 19개가 통과했고, 작은 화면의 선택 칩 끝이 소수점 좌표로 잘려 실패한 1개는 양끝 여백을 보완했다. 보완 후 분류 이동과 키보드/직접 진입 2개가 통과했다(19.8초). 헤더 320/1440px 고정과 앵커 가림 방지, 언어의 화면/쿼리/해시/저장 유지도 확인했다. Mobile host는 Android Chromium/iOS WebKit의 탐색/언어 14개가 모두 통과했다(1.0분). Web production build(.next/chip-header-build)가 통과했다. E2E 서버에서 응답 stream 종료 오류가 1회 기록됐지만 관련 브라우저 흐름과 별도 수동 화면에서 pageerror는 없었다.

Chromium 320/400/760/768/1440px와 WebKit 320/400px에서 한국어/영어/일본어 21개 조합의 직접 분류 이동, 현재 칩 전체 표시, 한 줄 스크롤, 지구본과 44px select/읽을 수 있는 옵션, 고정 헤더, 가로 넘침과 pageerror 0개를 확인했다. 개발 글/메시지를 등록하지 않았고 실제 OS 선택창/키보드와 실기기 검증은 포함하지 않는다.

## 전용 글쓰기, 채팅 영역과 화면 전환

글 등록은 /:locale/write 전용 페이지다. 공통 헤더/사이드바/푸터와 모바일 하단 메뉴를 숨기고 뒤로 가기와 글쓰기 제목, 작성 폼만 둔다. 게임과 기본 분류를 공유 bridge URL 계약으로 전달하고 분류를 바꿔도 입력한 내용을 보존한다. PostComposerForm이 실제 폼과 mutation을 소유하며 기존 PostComposer는 수정 모달만 조합한다. 성공 시 상세로 replace해 완료한 편집기를 뒤로 가기로 다시 열지 않는다. 실패 시 본문/미디어 초안은 보존한다. Web과 네이티브의 일반 복귀는 진입 경로, 직접 진입은 논리적 상위 분류를 사용한다. 따뜻한 딥링크에서 분류가 바뀌면 폼의 계정/언어/분류/게임 key도 바꿔 이전 기본값이 남지 않게 했다.

본문의 임의 20자 제한을 서버 Zod 계약과 Web 폼에서 제거했다. 한 글자로 등록/수정할 수 있으며 공백뿐인 본문과 10,000자 초과는 계속 거부한다. OpenAPI/Orval로 SDK를 재생성했고 생성 코드를 손으로 바꾸지 않았다. API의 짧은 본문 등록/수정/거부 통합 검사를 추가했다.

최상위 메뉴로 앞으로 이동하면 스크롤을 상단으로 초기화한다. 뒤로 가기, 같은 화면의 언어 전환과 해시는 기존 복귀/앵커 동작을 보존한다. 채팅 목록의 행/선택 상태와 목록 헤더, 메시지 이력, 대화 헤더와 입력 영역을 배경/구분선으로 나눈다. 메시지 이력은 중립 배경, 헤더/입력은 surface 토큰을 쓴다. 작성 버튼과 선택 칩은 공통 주황 accent, 실제 답변 상태는 의미에 맞는 공통 색을 사용한다.

## 공통 shadcn Base UI, 다크 모드와 오류 복구

공식 shadcn base-nova Select와 Sonner 소스/라이선스를 packages/design-system에서 관리한다. Base UI Select는 키보드/포커스 복귀/포털과 44px 옵션을 제공하며 언어/화면 모드 설정에 연결한다. 기존 Globe2 아이콘을 유지하고 언어 변경 시 화면/검색/해시와 자동 언어 설정을 보존한다. WebView의 뒤로 가기는 열린 Select를 먼저 닫고 경로는 유지한다. 등록 폼의 native select는 기존 shadcn NativeSelect를 사용한다.

프로필에서 기기 설정/라이트/다크 모드를 선택하고 gf_theme 쿠키에 저장한다. useSyncExternalStore로 외부 설정을 구독하고 서버 html의 data-theme에 쿠키를 반영한다. 공통 팔레트는 data-theme이 있는 앱에만 적용해 Photo Contest의 기존 기본 모드를 보존한다. 시스템 모드는 CSS color-scheme/light-dark로 OS 변경을 따르며 명시한 모드는 기기 설정보다 우선한다. Quill/팝업/입력/채팅/토스트도 같은 의미 토큰을 사용하고 오렌지 위 글자는 on-accent를 사용한다.

오류 화면과 문의 페이지는 사용자가 지정한 jingeon27@gmail.com으로 연결한다. 환경변수의 공개 주소를 Zod로 검사하고 잘못된 설정은 실제 기본 주소로 되돌린다. 오류 payload나 사용자 데이터를 mailto에 넣지 않는다. ServiceErrorFallback의 복구는 mutationOptions/useMutation이 대기/실패/재시도를 소유한다. 서비스 QueryClientProvider 바깥에서 발생하는 초기 연결 오류도 복구할 수 있도록 폴백에 별도 QueryClient를 둔다. 실패는 영역 안에 유지하고 재시도 중 중복 클릭을 막는다.

커스텀 토스트의 상태/타이머/모션을 Sonner로 교체했다. 공통 Toaster가 색/폰트/모서리/닫기 터치 영역을 맡고 앱은 번역과 4.5초 표시, 최신 알림 하나, 위치만 설정한다. 일반 화면은 하단 메뉴 위, 대화방은 헤더 아래에 표시해 입력창을 피한다. Sonner는 공통 UI 패키지에만 의존성을 선언한다.

## 인증 흐름과 채팅 SSE의 책임 분리

LoginDialog는 로그인 수단 조합만 담당한다. GoogleLoginForm은 웹/네이티브 Google 진입, DemoLoginSection은 고정 테스트 계정과 데모 가입, OnboardingDialog는 가입 대기 세션의 닉네임/동의 완료를 담당한다. 서로 다른 mutation을 조건 분기 하나로 다루지 않는다. 공유 AccountSetupForm은 폼 검증과 필드만 소유한다. AuthOnboarding이 전용 필수 모달을 열고 Escape/바깥 클릭/네이티브 뒤로 가기로 필수 가입을 건너뛰지 못하게 한다.

채팅 연결은 @microsoft/fetch-event-source 2.0.1로 전환했다. ChatRealtimeConnection이 snapshot/subscribe와 연결 수명을 소유하고 useChatRealtime이 useSyncExternalStore로 구독한다. 메시지는 인증된 REST와 TanStack Query 캐시를 단일 출처로 유지한다. 구독 시작 시 연결하고 마지막 해제/계정 변경 때 AbortController로 스트림과 DOM 리스너를 정리한다. StrictMode 재구독과 손님 상태에서도 연결이 중복되지 않는다. 쿠키 fetch와 content-type 검증, 401/403 세션 갱신 후 재시도 중단, 1초에서 30초까지 제한된 backoff와 최대 60초 Retry-After를 처리한다. 오프라인에서 중단하고 온라인/전경 복귀에 연결하며, 재접속 시 REST를 갱신해 놓친 메시지를 복구한다. 잘못된 이벤트는 Zod 검사로 버리고 다른 계정 캐시를 갱신하지 않는다. API의 SSE/REST 프로토콜은 유지했다.

## 공통 파일 변경 이유

루트 `package.json`에는 Game Feedback 전용 진입 명령만 추가하고 기존 Workspace·photo-contest 명령은 보존한다. `yarn.lock`은 기존 의존성을 유지하며 신규 프로젝트 의존성을 고정한다. 루트 README는 신규 프로젝트 위치·시작 방법만 추가한다. Game Feedback CI는 타입·테스트·빌드·생성 계약을 검사한다.

초기 프로젝트 추가 시 기존 lockfile의 2,012개 descriptor를 유지했으며 기존 항목의 해석 변경·삭제는 0개, 신규 항목은 138개다. 기존 프로젝트 의존성 변경과 신규 프로젝트 추가를 구분해 검토했다.

Web FSD 작업의 `yarn.lock` 변경은 이미 저장소에서 사용하는 overlay-kit·es-toolkit·ts-pattern·ESLint·Vitest와 공통 lint/TypeScript 설정을 Web Workspace에 연결하는 의존성 8줄 추가다. 기존 패키지의 버전 해석은 변경하지 않았다. 집계 scripts의 check/test는 새 Web 검사를 위임하며 루트 테스트 러너나 다른 앱 설정을 추가하지 않는다.

루트 `.prettierignore`는 `projects/game-feedback/docs/mvp-plan-v4.md`를 제외해 사용자 제공 원문의 표현을 보존한다. `projects/game-feedback/apps/api/openapi.json`도 정확한 경로로 제외해 서버 생성 결과가 별도 formatter에 의해 바뀌지 않도록 한다. 다른 신규 소스·문서는 저장소 Prettier 설정으로 검사한다. 기존 photo-contest 소스·DB·개발 서버는 변경하지 않는다.

## 별도 검증이 필요한 항목

| 항목               | 필요한 증거                                                      |
| ------------------ | ---------------------------------------------------------------- |
| 실제 Google 로그인 | 발급 자격 증명과 callback 등록 후 동의·재로그인·닉네임·탈퇴 확인 |
| 실제 Supercell API | 키·등록 IP·배포 출구 IP로 프로필·덱·실패 응답 실측               |
| 게임 계정 소유권   | 현재 UNVERIFIED. 덱/Battle Log 챌린지 POC 후 별도 설계           |
| 제품 수요·공급     | 요청자 10명·제공자 5~10명 모집, 수동 매칭·첫 답변 소요 시간      |
| 공개 운영          | 실제 연락처·연령·약관·개인정보·메시지 보유·신고 정책 검토        |
| 모바일 운영        | dev client·실기기, 실제 Google 앱 복귀, 서명·스토어 검증         |
| 공개 배포          | 운영 DB·HTTPS·비밀·출구 IP·모니터링·관리자 권한 검증             |
| 글로벌·후속 단계   | 영어·일본어 완성, 번역·분석·평판·추가 게임                       |

## 이번 공통 파일 변경 이유

사용자가 두 서비스 공통 스타일과 shadcn + Base UI를 요청해 packages/design-system에 Select/Sonner와 선택형 다크 팔레트, on-accent/popover 토큰을 추가했다. 앱의 라우팅/설정 저장은 공통 패키지에 옮기지 않았다. 루트 yarn.lock은 공통 UI의 Sonner 2.0.8과 Game Feedback Web의 @microsoft/fetch-event-source 2.0.1 연결/고정만 추가하며 기존 의존성의 해석을 변경하지 않는다. 공개 주소만 .env.example에 기록하고 세션/인증정보/테스트 자료/스크린샷은 커밋하지 않는다.

## 최신 develop 충돌 해소

최신 develop(d3e014e)의 Photo Contest/블로그 변경을 기능 브랜치에 merge했다. develop/main을 덮어쓰거나 다른 작업 브랜치를 변경하지 않았다. Photo Contest의 AGENTS와 스타일 지침은 최신 배포/1440px 레이아웃 정책과 공통 패키지 사용을 함께 보존했다. cn은 공통 re-export를 유지하고 최신 wide/feed 토큰을 공통 merge 설정에 반영했다. 공통 TextField/TextArea는 labelSuffix를 받아 Photo Contest가 새 필수/선택 표시를 전달하며 required를 실제 textarea/Field.Control에 연결한다. 최신 Photo Contest의 기능 소스/GraphQL/배포 변경을 보존하고 인증·운영 DB·개발 서버에는 조치를 하지 않았다.

## 최종 검증 기록

Node 24.19.0, Yarn 4.17.0에서 immutable 설치와 전체 format:check, Web/Mobile 타입 검사와 lint, 공통 디자인 시스템 check가 통과했다. API Vitest+Supertest 11개 파일 76개, SDK 3개 파일 35개, Web Vitest 23개 파일 89개, Mobile 10개 파일 39개가 통과했다. API/SDK는 본문 최소 제한 변경 후, Web/Mobile은 전용 작성 경로와 인증/SSE 변경 후 검사했다. 최신 develop merge 후 공통 UI 7개 파일 14개와 Photo Contest Web 타입/lint 및 59개 파일 264개가 통과했다. API build와 Web production build(.next/service-ui-build)가 통과했다.

Web Playwright 전체 65개를 실행해 60개가 통과했다. 실패한 작성 2개는 실제 분류 문맥 query를 기대값에 추가했고, 기존 피드백 1개는 Sonner의 알림 선택자로 변경했다. 테마 2개는 Select.Icon 기본 문자가 SVG 자식에 들어가지 않도록 명시한 아이콘 자식을 사용했다. 보완 후 작성/피드백/헤더/언어/테마 관련 14개가 통과했다. Sonner 종료 후 호스트 제거에 대한 테스트 기대값을 실제 라이브러리 동작에 맞춰 일반/reduced motion 2개도 통과했다(18.7초). 모바일 host 전체 28개가 Android Chromium/iOS WebKit에서 통과했고, 최종 Select 수정 후 언어 변경/드롭다운 우선 뒤로 가기 4개도 통과했다(41.8초). 본문 1글자 등록/실패 초안/복귀, SSE 오프라인 복귀 누락 메시지/로그아웃 중단, 계정 전환, 미디어, 채팅 스크롤, 오류 mailto, reduced motion과 조작 영역도 포함한다.

Chromium 320/400/1440px와 WebKit 400px의 다크 작성/채팅 화면을 실제 UI 링크로 이동하며 확인했다. 4개 조합에서 헤더 숨김, 입력 글자/주황 버튼 대비, 채팅 영역 구분과 가로 넘침, pageerror 0개를 확인했고 글/메시지 전송은 0개였다.

자동 검사는 55444의 격리된 gf_test_ 스키마와 가짜 외부 제공자를 사용했다. WebKit 수동 검사의 전체 문서 전환/페이지 종료에서는 중단된 fetch 네트워크 오류가 기록되어 UI 라우팅 확인과 구분했다. 실제 Google/Supercell, 기기 OS와 실기기·스토어 배포를 검증한 것으로 표현하지 않는다.

최종 `@side/game-feedback check` 집계도 통과했고 OpenAPI/Orval 재생성 후 추적 SDK diff는 0개다. 소유 테스트 DB를 종료하고 개발 Web 3300/API 4300의 HTTP 200을 확인했다.

## Next.js 16.4.2, 인증 유도와 채팅 관리

Game Feedback Web의 Next.js를 16.4.2로 고정했다. Photo Contest와 블로그의 Next 버전은 유지한다. cacheComponents/partialPrefetching을 함께 켜고 root locale을 next/root-params로 읽는다. 첫 방문의 언어 리다이렉트는 브라우저 지역/사용자 쿠키를 유지하며 URL에 남길 피드 필터만 전달한다. 언어 설정은 해당 locale root의 값을 사용한다.

세션/언어/테마 조회는 use cache: private와 300초의 client stale 수명으로 합쳤다. production의 서버 요청 사이에는 저장하지 않는다. React Query 세션은 로그인/로그아웃/전환 시 기존 취소/제거/저장 순서와 mount 재검증을 유지하고, 게시글/프로필의 권한 있는 REST 조회를 공용 캐시에 넣지 않는다. 서버가 초기 html의 언어와 테마를 설정한다. 서비스 bootstrap에는 별도의 오류 문서 경계와 useMutation 재시도, 문의 메일을 제공한다.

URL 데이터는 로딩 경계 아래에 둔다. 언어 Provider는 URL 전체를 읽지 않고 root locale을 사용한다. Toast의 경로별 위치, 셸의 선택 메뉴와 route motion은 독립 Suspense를 사용해 전체 앱의 프리패칭을 막지 않는다. public document는 본문이 준비된 후 HTML을 만들고 RSC 이동은 본문 placeholder를 프리패칭한다. skipProxyUrlNormalize로 Flight 헤더를 보존하고 서버 전용 요청 헤더로 문서/이동 경계를 전달한다. metadata는 absolute title, canonical, JSON-LD와 비공개 noindex 정책을 유지한다. public 문서의 접근 검사를 Proxy에서 먼저 수행해 스트리밍이 404를 200으로 바꾸지 않도록 한다. 본문 렌더링 시에도 REST 권한을 재검증하며 접근 검사 결과를 공용 캐시에 저장하지 않는다.

Cache Components의 Activity가 숨긴 이전 페이지도 DOM에 남으므로 글쓰기/대화의 전역 chrome CSS는 현재 셸에만 속한 shell-route 마커의 data-screen을 사용한다. 예전 화면을 DOM에서 찾는 :has 조건으로 현재 헤더를 숨기지 않는다. 언어·화면 모드 섹션은 제목/선택창/언어 설명 사이 16px, 설명 두 줄 사이 6px로 맞췄다.

미인증 사용자에게 글쓰기 전과 본인의 글 상세에서 프로필 인증을 안내한다. 인증은 글쓰기의 필수 조건이 아니며 안내는 실제 관리자 1:1 VERIFICATION 대화로 이어진다. 검증된 계정과 관리자는 안내를 표시하지 않는다. 관리자 화면은 localhost 개발에서만 제공하며 production의 /ko, /en, /ja/admin은 404이고 메뉴를 숨긴다. 기존 API 관리자 권한과 감사 기록을 유지한다.

채팅 상단 44px 메뉴에 사용자 신고/대화내역 삭제/차단을 모았다. 신고는 기존 USER 대상과 신고 사유/관리자 검토를 재사용한다. 내역 삭제는 DELETE /api/conversations/{id}/messages와 throughMessageId를 사용한다. 각 참여자의 createdAt/id 경계를 별도로 저장해 상대방 내역, 읽음 상태와 삭제 확인 중/이후 도착한 메시지를 유지한다. 삭제한 내역의 목록 preview, unread, pagination, 읽음 요청과 첨부파일 GET도 같은 경계를 적용한다. 기존 idempotency key로 삭제한 메시지를 복원하지 않는다. SSE는 삭제한 사용자에게만 동기화하고 새 메시지를 받으면 대화 목록에 다시 나타난다. mutation 성공 후 해당 사용자의 해당 방 캐시만 취소/초기화하며 실패 시 내역과 재시도 UI를 유지한다.

Migration 202610170010_chat_history_visibility는 Game Feedback ChatConversation의 nullable 경계 네 열과 기본 false 표시 두 열만 추가한다. 기존 메시지나 다른 사용자의 데이터를 삭제하지 않는다. 공통 디자인 시스템에는 사용자가 요청한 shadcn Base UI/base-nova DropdownMenu의 필요한 네 구성과 44px 항목/포커스 동작을 추가했다. 루트 lockfile은 Game Feedback의 Next 16.4.2 및 같은 버전의 공식 Playwright 검증 도구를 연결하기 위해 변경했다. 다른 서비스의 제품 코드와 runtime 의존성은 변경하지 않는다.

프리패칭 검증은 Web이 소유하는 별도 production Playwright 설정과 @next/playwright instant()를 사용한다. 테스트 전용 빌드에서만 exposeTestingApiInProductionBuild를 활성화하고 기본 build는 비활성화한다. 포트 3353/4353과 55444의 격리 gf_test_ 스키마만 사용하며 프로젝트 test:e2e도 이 검사를 위임한다. 개발 모드 결과를 production 프리패칭 성공으로 대신하지 않는다.

최초 문서는 저장 테마/세션과 공개 본문의 인증/SEO를 기다리는 동작을 명시적으로 유지한다. locale root와 공개 게시판/글/프로필 문서의 instant=false는 이 의도된 초기 문서 대기를 개발 모드의 instant 진단 대상에서 제외한다. cacheComponents/partialPrefetching이나 실제 프리패칭을 끄지 않으며 자식 탐색 검증은 유지한다. 초기 HTML을 instant라고 주장하지 않고 별도 production instant() 테스트가 가이드의 준비된 본문과 글의 placeholder/헤더가 URL 이동 직후 사용 가능한지 검증한다.

### 이번 변경의 최종 검증

Node 24.19.0 / Yarn 4.17.0의 immutable 설치와 전체 format:check, @side/game-feedback check가 통과했다. Web typecheck는 next typegen을 먼저 실행해 깨끗한 체크아웃에서도 root-params 타입을 생성한다. 최종 프로젝트 test 집계에서 API Vitest+Supertest 79개, SDK 35개, Web Vitest 90개, Mobile 39개가 통과했다. 채팅 캐시 초기화 보완 후 Web 90개와 삭제/새 메시지/새로고침 없는 방 재진입도 다시 통과했다. 공통 디자인 시스템 check의 14개가 통과했다.

Web Playwright 전체 69개에서 60개가 통과했다. Activity가 보존한 숨겨진 DOM 선택자, 폐지 분류의 문서 404와 의도한 초기 HTML 대기 진단을 보완한 회귀 16개 중 15개가 통과했고, 나머지 계정 전환 선택자를 고친 뒤 테스트 계정 2개도 통과했다. 따라서 고유 69개 시나리오를 확인했다. 인증 유도/400·1440px 설정 간격/채팅 신고·삭제 4개도 최종 확인했다. Mobile host 전체 30개에서 28개가 통과했고 테스트의 문서 marker 초기화 보완 후 Android Chromium/iOS WebKit의 나머지 2개도 통과했다. 실제 네이티브 뒤로 가기가 대화 메뉴와 신고 창부터 닫는 흐름을 포함한다.

Production Playwright 5개가 최종 통과했다. instant()로 가이드의 prefetched 본문과 게시글의 header/placeholder를 확인했고, JavaScript 없는 본문과 저장된 다크 모드, 공개 경로 404/차단 정보 비노출, 모든 locale의 관리자 HTML/RSC 차단도 포함한다. API build와 공개 SEO를 켠 일반 Web production build(.next/release-check)가 통과했다. 일반 빌드의 cacheComponents/partialPrefetching은 true, exposeTestingApiInProductionBuild는 false이고 sitemap은 요청 시점에 생성한다. 재생성 전후 SDK 해시가 같았다.

로컬 개발 DB 55442에는 검토한 추가 Migration만 적용했고 기존 글/메시지를 삭제하지 않았다. 익명 설정 화면을 400/1440px로 직접 촬영해 섹션 간격 16px와 가로 넘침 없음도 확인했다. 테스트는 전용 55444와 격리 스키마 및 가짜 제공자를 사용한다. Google/Supercell 실연동, 실제 기기/스토어와 공개 배포를 검증한 결과로 표현하지 않는다.

## 2026-10-18 공개 피드와 소셜 로그인

홈과 게임 공통 다섯 분류는 제목·검색·글쓰기 버튼을 프리패칭 셸에 남기고 목록 영역만 카드 세 개의 스켈레톤으로 표시한다. 경로는 기존 boards/<분류>를 유지하며 각 정적 라우트 어댑터가 공통 BoardDocument를 사용한다. 첫 문서는 준비된 공개 목록을 바로 렌더링하고 RSC 이동은 목록 데이터만 스트리밍한다. 서버 초기 데이터를 가진 공개 목록은 useInfiniteQuery + throwOnError를 사용하며 첫 문서에는 목록 Suspense를 추가하지 않아 JavaScript 없는 본문이 가려지지 않게 한다. 분류 JSON-LD도 첫 문서에서는 동기 렌더링한다. 브라우저 URL은 useSyncExternalStore로 구독하고 Next history commit 이후 구독자에게 알린다. 검색 초기 동기화는 이미 입력한 초안을 덮어쓰지 않는다.

입력용 로그인·온보딩·신고·게임 계정 등록·내용 수정·탈퇴 확인은 BottomSheet를 사용한다. 별도 작성 경로와 화면 안의 검색/채팅 입력은 유지한다. 중앙 모달은 삭제/차단 같은 버튼 확인만 담당한다. 공통 디자인 시스템의 Dialog에 선택형 placement를 추가하고 기본 center를 유지한다. Photo Contest 제품 코드는 변경하지 않았다. 채팅 상단에 신고와 내역 삭제를 직접 노출하고 차단은 메뉴에 둔다. 신고 사유에 사기 / 거래 피해를 추가해 먹튀도 함께 접수한다. 채팅 개인정보 공유 금지 문구와 글 상세/답변의 홍보 문구를 제거했다.

공개 목록·글·댓글은 비로그인 열람과 서버 HTML을 제공하고 작성/수정에는 로그인을 요구한다. 목록과 상세에 조회수, 상세에 Asia/Seoul 등록일시를 표시하고 JSON-LD ViewAction을 추가한다. POST /api/posts/:id/views는 서버 해시로 방문자를 구분해 같은 사용자/브라우저는 24시간에 한 번 집계하며 글 수정일을 바꾸지 않는다. 숨김/삭제/차단 권한도 재검사한다. UserFollow 도메인은 팔로우/해제와 사용자별 새 글 알림 설정을 소유한다. 글 저장 트랜잭션에서 구독자 알림을 만들고 알림함/개수는 30초마다 갱신한다. 차단은 양방향 팔로우와 관련 알림을 정리한다. 관계 잠금과 구독 행 잠금으로 팔로우 설정 변경/차단과 알림 저장을 직렬화한다.

명시적 dev:test는 GF_TEST_AUTH_ENABLED=true, GF_DEMO_MODE=false로 서버 테스트 토큰을 켠다. POST /api/auth/test-token에 sample-user-0, sample-user-3, sample-test-admin 중 accountId를 보내면 1시간 accessToken/Bearer/만료시각과 사용자 정보를 받고 HttpOnly 쿠키도 설정한다. DB에는 토큰 해시만 저장하며 응답은 no-store다. 만료/로그아웃 토큰은 인증에 사용할 수 없다. 일반 실행에서는 엔드포인트가 404이고 production에서 테스트 인증 활성화는 거부한다. 기존 테스트 로그인 API는 호환용으로 유지하지만 UI의 데모 가입/선택기/배지를 제거했다. 다른 분류에도 판매 금액, 친선전, 시간당·월·목표형 코칭과 자유글 예시를 추가하며 기존 데이터는 덮어쓰지 않는다.

X·카카오·Discord·Google은 제공자 어댑터와 공통 소셜 로그인 경로를 사용한다. 제공자와 외부 사용자 ID 조합으로 식별하며 같은 문자열의 ID를 다른 서비스 계정과 합치지 않는다. 기존 Google 식별자는 보존하고 SocialIdentity로 옮긴다. OAuth state는 제공자에 묶어 한 번만 사용하며 만료를 검사한다. Google openid/서명 검증과 PKCE, X users.read/tweet.read와 PKCE S256, Discord identify, 카카오 사용자 ID 조회를 사용한다. 이름·이메일·사진은 계정에 자동 저장하지 않고 닉네임은 가입 폼에서 받는다. WebView는 선택한 제공자를 시스템 브라우저로 전달하며 짧은 일회용 앱 티켓과 PKCE로 WebView 쿠키 세션을 발급한다. 서버 설정 상태로 동작 가능한 로그인 버튼을 결정한다. 실제 콘솔 키와 외부 로그인은 아직 검증하지 않았다.

추가 Migration 202610170011_user_follows, 202610170012_post_views, 202610170013_social_providers는 각각 팔로우, 조회수, 소셜 식별자와 제공자 경계를 추가한다. 기존 글/메시지를 삭제하지 않으며 개발 55442와 테스트 55444의 URL/소유권 가드를 유지한다. 이번 변경에는 새 runtime 의존성이 없고 루트 manifest/lockfile을 변경하지 않았다. 공통 Dialog 변경은 사용자가 요청한 입력용 BottomSheet와 공통 스타일 공유를 위한 것이다.

### 2026-10-18 검증

Node 24.19.0 / Yarn 4.17.0에서 프로젝트 check(계약/API/SDK/Bridge/Web/Mobile 타입, Web/Mobile FSD lint), 전체 format:check와 공통 디자인 시스템 check가 통과했다. API Vitest+Supertest 13개 파일 91개, SDK 38개, Web Vitest 24개 파일 92개, Mobile Vitest 10개 파일 42개와 공통 UI 14개가 통과했다. 제공자별 OAuth 요청/응답 오류, 동일 ID의 제공자 분리와 재로그인, native 제공자 전달, 테스트 토큰 만료/폐기/일반 실행 차단, 팔로우 알림/차단과 조회수 동시 중복 방지를 포함한다.

Web Playwright 전체 72개 중 71개가 통과했다. 검사 도중 번역 파일의 정리로 Fast Refresh가 문서를 다시 열어 토스트 하나가 사라졌으며, 소스 변경 없이 일반/reduced motion 두 시나리오를 다시 실행해 모두 통과했다. 따라서 고유 72개를 확인했고 처음부터 72개가 한 번에 통과한 것으로 기록하지 않는다. 모바일 host는 Android Chromium/iOS WebKit 전체 30개가 통과했고 native 인증 취소, foreground 계정 변경, 신고/메뉴 우선 back과 입력을 확인했다.

Production Playwright 12개가 모두 통과했다. instant()로 다섯 분류와 400/1440px 피드의 제목·검색·작성 버튼 및 목록 스켈레톤을 확인했고, 가이드 본문/글 셸, no-JS 피드·다섯 분류·상세, 저장 테마/SEO/404와 관리자 HTML/RSC 차단도 검사했다. API build와 Mobile Android/iOS Metro export가 통과했다. 이 결과는 실제 외부 계정 로그인, Supercell 운영 API, 실기기/스토어 또는 공개 배포 검증이 아니다.

일반 Web production build(.next/release-check)도 통과했다. 빌드 설정에서 cacheComponents/partialPrefetching=true, exposeTestingApiInProductionBuild=false를 확인했다. dev:test 재시작의 OpenAPI/Orval 재생성 후 SDK 추적 diff는 0개다. 로컬 400/1440px에서 네 소셜 로그인 버튼과 BottomSheet 하단 정렬, 가로 넘침 없음과 pageerror 0개를 확인했다. demoMode=false 상태에서 테스트 토큰 발급과 Bearer 보호 API 호출을 확인하고 발급한 세션을 로그아웃했다. 제공자 네 개 모두 현재 키 미설정 상태이며 실제 외부 로그인을 성공했다고 표시하지 않는다. 개발 Web 3300/API 4300은 실행한 채 유지하고 소유 테스트 DB는 데이터를 보존해 종료했다.

## 테스트 토큰 모드의 채팅과 관리자 문의 수정

dev:test로 전환한 뒤 ChatService의 수신자 선택/방 조회/대화 목록/읽지 않은 수와 SupportService의 관리자 선택에 demoMode만 검사하는 조건이 남아 테스트 계정을 거부했다. 현재 로컬 서버에서 플레이어 대화 생성과 문의 열기가 모두 404로 실패하는 것을 재현했다. testAuthEnabled도 같은 허용 조건으로 처리하고, 테스트 인증이 꺼진 일반 실행에서는 테스트 사용자/관리자를 계속 제외한다. 기존 문의를 재사용할 때도 같은 관리자 필터를 적용한다.

이전 브라우저 테스트 서버는 demoMode=true를 강제해 dev:test 환경을 검사하지 못했다. 테스트 서버가 명시된 두 플래그를 읽게 하고, Web 소유 playwright.test-auth.config.ts와 test:test-auth 명령을 추가했다. 프로젝트 test:e2e/CI가 기존 데모 검사와 별도로 demoMode=false, testAuthEnabled=true의 세 시나리오를 실행한다. 프로필에서 플레이어 채팅 열기, 일반 관리자 문의, 프로필 인증 문의에서 양방향 메시지 수신과 목록/새로고침 보존을 확인한다. API 회귀는 방/메시지/읽지 않은 수, 비참여자/차단 접근과 테스트 인증 비활성 시의 비노출도 검사한다.

API Vitest+Supertest 전체 94개와 새 모드의 Web Playwright 3개가 통과했다. API/Web 타입과 Web lint도 통과했고 현재 개발 서버에서도 두 대화 시작 API가 200으로 열리는 것을 확인했다. UI나 API 계약, Migration과 외부 로그인 설정은 변경하지 않았다.

기존 데모 모드의 플레이어 실시간 채팅 회귀 1개도 통과했다. 실제 localhost:3300의 400px 화면에서 프로필 채팅/일반 문의/프로필 인증 문의 버튼을 각각 눌러 대화방과 메시지 입력창이 열리는 것을 확인했고 pageerror는 0개였다. 로컬 기존 글/메시지를 삭제하거나 검증용 메시지를 추가하지 않았다.

## 전투 모집과 1:1/팀전

기존 친선전 모집의 표시 이름을 전투 모집으로 바꾸고 모든 게임이 1:1(DUEL)과 팀전(TEAM)을 공통으로 사용한다. 기존 FRIENDLY 저장 값과 /boards/friendly 경로를 유지해 기존 링크와 글을 보존한다. Post.battle의 mode를 별도 Zod 계약/JSON 필드로 저장하며 새 전투 모집은 유형을 필수로 받는다. 다른 분류의 전투 메타데이터, 알 수 없는 유형과 잘못된 타입은 거부한다. 기존 글은 nullable로 유지하며 제목/본문에서 유형을 추측하지 않는다.

작성/수정 폼의 BattleFields와 카드/상세의 BattleSummary를 분리했다. 전투 모집의 전체/1:1/팀전 칩은 URL battleMode를 단일 출처로 사용하고 검색·게임 문맥을 유지한다. 목록의 서버 초기 데이터와 React Query 키에도 유형을 포함하며 비로그인 HTML과 cursor 조회도 같은 필터를 사용한다. 팀전 목록의 작성 버튼은 팀전을 기본 선택하고 WebView 경로 검증/작성 취소의 상위 경로에도 유형을 보존한다. 한국어/영어/일본어 메뉴와 페이지 SEO를 갱신했다.

Migration 202610180014_battle_recruitment는 Post.battle JSONB nullable 열과 유형/분류 제약만 추가한다. 기존 글/메시지를 삭제하거나 유형을 일괄 지정하지 않는다. 예시 1:1/팀전 글 두 개는 새 ID로 추가하고 기존 데이터는 덮어쓰지 않는다. Zod → OpenAPI → Orval 재생성으로 응답 검증과 목록 유형 필터를 SDK에 반영했다.

전투 모집 검증은 API Vitest+Supertest 96개, SDK 41개, Web unit 93개와 Mobile unit 42개가 통과했다. API는 생성/수정/유형 검색과 잘못된 분류/유형/누락, 기존 nullable 글의 보존을 검사한다. 브라우저 400/1440px에서 작성/수정/검색/팀전 작성 기본값과 JavaScript 없는 상세 본문을 확인했다. 최초 범위 검사 13개 중 분류 칩 selector 중복 1개를 발견해 전투 유형 칩의 class를 분리하고 해당 회귀와 새 시나리오 3개를 재검사해 통과했다. API build와 프로젝트 check도 통과했다. 개발 55442에는 검토한 Migration을 적용하고 별도 ID 예시 두 개를 추가했으며 기존 글과 메시지는 유지했다.

## 모바일 화면 이름과 언어 전환 대기 화면

메인 메뉴와 제목은 홈으로 통일했다. 모바일 헤더는 서비스 아이콘/이름 대신 경로 계약의 현재 화면 이름(홈, 가이드, 채팅, 프로필 등)을 표시하고 언어/알림을 유지한다. 데스크톱 브랜딩과 프로필 메뉴는 유지한다. 홈 전체 글은 모든 게임에 걸친 조회이고, 게임별 다섯 분류는 현재 활성 카테고리의 게임 이름/아이콘 아래 별도 영역에 묶어 범위를 구분한다. 선택 분류는 aria-current와 선택 칩으로 표시하고 가로 스크롤/키보드 탐색을 유지한다. 게임 이름은 카테고리 응답을 사용한다.

언어 드롭다운은 React useTransition으로 경로 변경 대기를 추적하고 테마 토큰을 사용하는 전체 화면 로딩 fallback을 portal로 표시한다. 대상 언어 화면이 준비되면 자동으로 사라지고 경로/게임/분류/검색/해시를 유지한다. 기존 공개 문서의 서버 렌더링, 저장한 테마의 초기 적용과 목록 영역의 partial prefetch skeleton을 유지한다. 네이티브 WebView 첫 로드와 재생성 대기는 LaunchScreen으로 분리해 서비스명과 작은 로딩 표시를 보여주며 기기 다크 모드를 따른다. 채팅은 정상 연결 표시를 생략하고 실제 오프라인/재연결 상태만 표시한다.

최종 프로젝트 check(계약 재생성, 타입, FSD lint), Web Vitest 93개와 Mobile Vitest 42개가 통과했다. 관련 Web Playwright 28개가 한 번에 통과했으며 320/390/400/760/1440px, 한국어/영어/일본어 메뉴, 화면별 헤더, 지연한 언어 경로의 다크 fallback과 필터 보존, 전투 모집/코칭/친추판매 작성·수정, 알림/채팅 개수, SSE 오프라인 복구와 로그아웃, no-JS SEO를 포함한다. 프로덕션 프리패칭 검사는 12개 중 11개 통과 후 최초 홈의 분류 메뉴가 나타나지 않은 1개를 소스 변경 없이 재검사해 통과했다. 12개가 한 번에 통과한 것으로 기록하지 않는다. Metro Android/iOS export도 통과했으며 실기기 검증은 별도다. 로컬 3300의 400px 홈/전투 모집에서 가로 넘침과 pageerror가 없음을 확인하고 개발 서버는 유지했다.

## 홈과 분류 칩의 동일한 배치

홈을 별도 상위 영역으로 분리했던 표시를 제거했다. 게임 이름 아래 한 줄에서 홈, 피드백, 친추판매, 전투 모집, 게임코치, 자유게시판을 같은 크기와 선택 스타일로 표시한다. 분류만 감싸던 테두리/배경/안쪽 여백과 모든 게임 안내를 제거했다. 기존 홈 조회와 각 분류의 URL은 유지하며 여섯 칩이 같은 스크롤 영역과 선택 칩 노출 로직을 사용한다.

로컬 400px에서 여섯 칩의 상단 위치가 모두 123px, 높이가 모두 36px이며 가로 넘침과 pageerror가 없음을 확인했다. Web 타입과 lint, 관련 Playwright 13개가 통과했다. 홈/분류 선택, 320px 일본어 직접 진입/키보드/짧은 화면/크기 변경, 헤더와 언어 전환, 상세에서 검색한 홈 복귀를 검증했다. API/계약/DB Migration 변경은 없다.

## 검색 전용 화면, 모집 필터와 가이드 갱신 (2026-10-18)

헤더는 검색 아이콘으로 검색 화면을 엽니다. 본문의 검색 폼과 모바일 중복 홈 제목을 없애고 첫 칩을 전체로 표시합니다. 검색 화면은 분류/게임/전투 유형/코치 또는 수강생 조건을 URL에 보존하며 결과 영역만 skeleton과 오류 경계로 처리합니다. 공개 게시글의 상세 SEO는 유지하고 검색 URL은 noindex로 둡니다. 코칭 역할은 서버 Zod → OpenAPI → Orval로 생성하며 API에서 다른 분류의 역할 필터를 거부합니다.

친추판매, 1:1/팀전, 코치/수강생, 자유글에 맞는 제목과 편집기 예시를 제공하고 가격 단위별 금액 예시를 구분합니다. 분류 변경 시 제목과 본문 초안은 보존합니다. 이용 가이드는 다섯 분류, 본문 미디어, 가격, 모집 유형과 수강료 기준, 채팅, 사용자 계정의 태그 등록/관리자 인증, 팔로우와 신고를 설명하도록 교체했습니다. 게시글에 게임 프로필을 첨부하라는 이전 안내는 제거했습니다.

## 공통 도구와 모니터링 감사 (2026-10-18)

사용자가 Photo Contest를 포함한 서비스 버전과 공통 적용을 요청해 이번 범위에서 다른 앱 manifest, 공통 compiler 실행기, 테스트 수집 설정도 수정했습니다. Node/Yarn/Expo 버전과 다른 서비스의 운영 데이터는 변경하지 않습니다. Next.js와 관련 패키지를 16.4.2로 맞추고 타입 검사와 API 빌드는 공통 TypeScript 7.0.2 실행기 `tsc7`을 사용합니다. Next/ESLint/코드 생성기의 JavaScript API는 TypeScript 6.0.2로 연결합니다. 공식 shim은 Yarn 내장 패치의 ENOENT 오류 때문에 직접 사용하지 않습니다. Photo Contest의 ESM Apollo 플러그인 로딩과 미디어 트랙 predicate는 네이티브 컴파일러와 현재 Node의 모듈 해석에 맞췄습니다.

Vitest가 spec/test 접미사를 모두 수집하도록 빠진 설정을 보완했습니다. 기능 사양은 spec, 확인한 버그의 회귀는 test이며 API의 통합 테스트도 Vitest+Supertest입니다. Photo Contest Web/Mobile의 `.api.spec.ts`와 `.api.test.ts`는 unit에서 제외해 실제 API 레인에서만 실행합니다. 기존 혼합 파일을 대량으로 이름만 변경하지는 않았습니다.

| 대상                         | 코드 연결 확인                                                                                                        | 실제 외부 수집 확인                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Game Feedback Web/API/Mobile | Amplitude와 Sentry 연동 없음. Web Vitals 수집기도 없음                                                                | 확인하지 못함                                                       |
| Photo Contest API            | main 첫 import 초기화, REST 5xx, GraphQL 내부 오류, OAuth/주기 작업 실패 전송 경로. 4xx 제외 및 요청/사용자 정보 제거 | DSN 없으면 초기화하지 않음. 실제 계정의 이벤트 수신은 확인하지 못함 |
| Photo Contest Web/Mobile     | Amplitude와 Sentry 연동 있음. WebView device ID와 사용자 ID 연결 코드 있음                                            | 키 없는 실행에서 전송 안 함. 실제 계정의 수신 확인은 별도           |
| Photo Contest Web 성능       | Sentry trace 비율 0이며 별도 Web Vitals 수집기 없음                                                                   | 수집 중이라고 주장할 수 없음                                        |
| 공유 디자인 시스템           | Game Feedback와 Photo Contest Web이 shadcn + Base UI 패키지와 스타일을 사용함. Blog에는 적용하지 않음                 | 브라우저 검증은 서비스별 수행                                       |

Photo Contest 서버 Sentry 옵션/정보 제거 단위 6개와 격리 PostgreSQL+Supertest 통합 6개가 통과했습니다. 통합 테스트는 REST/GraphQL/OAuth/주기 작업 오류와 4xx 제외를 실제 앱 경로로 검증하고 외부 전송 경계만 대체합니다. 이 결과를 Sentry 대시보드 수신 성공으로 기록하지 않습니다. 실제 DSN·프로젝트 접근이 없는 현재 상태에서 운영 수집, 소스맵 업로드, 알림 규칙을 완료했다고 말할 수 없습니다.

이번 검증에서 Game Feedback API 97개, SDK 41개, Web 94개, Mobile 42개 Vitest가 통과했습니다. Web Playwright 전체 78개 중 75개가 통과했고, 숨겨진 Activity의 카드까지 세던 선택자와 이전 인라인 검색 기대를 수정한 뒤 관련 세 파일 10개가 모두 통과했습니다. 78개가 한 번에 통과한 결과로 기록하지 않습니다. Production 프리패칭 12개와 demoMode=false 테스트 토큰 채팅 3개가 통과했습니다. 400px 실제 개발 화면에서 홈/가이드/코칭/검색의 가로 넘침과 pageerror가 없음을 확인했습니다.

Photo Contest API unit 64개와 Sentry Supertest 6개, Web 264개, Mobile 137개, Bridge 35개, 공통 디자인 시스템 14개, ESLint 규칙 45개, Blog 67개가 통과했습니다. Photo Contest와 Blog의 Next 16.4.2 프로덕션 빌드가 통과했습니다. Photo Contest API는 TypeScript 7로 빌드한 격리 서버의 health 200을 확인하고 테스트 스키마 0개를 확인한 뒤 이 검사에서 시작한 DB만 종료했습니다. Photo Contest Web/Mobile은 Yarn peer bin 목록에서 Vitest가 빠지는 환경에서도 앱이 선언한 러너를 실행하도록 자체 실행기를 연결했습니다.

WebView 최종 검사는 이전 메뉴 명칭과 인증 갱신 직후 UI 대기를 보완한 뒤 Android Chromium/iOS WebKit 32개가 한 번에 통과했습니다. 새 검색 경로의 코칭 역할 보존, 네이티브 뒤로 가기, 작성/댓글/채팅, 언어/화면 모드와 키보드/스크롤을 확인했습니다. 앞선 실행의 타임아웃과 실패를 성공으로 합산하지 않습니다. 최종 공통 및 앱 타입 검사와 린트가 통과했습니다. 실제 모바일 OS의 WebView·소셜 로그인·스토어 동작은 실기기에서 별도로 검증해야 합니다.

Game Feedback API의 TypeScript 7 production 빌드와 모바일 Android/iOS Metro export가 통과했으며 immutable 설치와 전체 format:check도 통과했습니다. Photo Contest의 API 기본 자동 통합은 꺼져 있고 main의 시작 실패 catch는 콘솔에만 기록합니다. 따라서 요청/작업의 명시적인 예외 보고를 프로세스 전체 크래시 수집과 동일하게 보지 않습니다. 운영 모니터링 완성 여부에는 이 시작/프로세스 오류 경로도 별도 확인이 필요합니다.

## 피드백 분류의 답변 상태와 카드 개선 (2026-10-18)

피드백 목록에 전체 / 답변 대기 / 답변 있음 칩을 추가했습니다. 선택은 `feedbackStatus=WAITING|ANSWERED`로 저장하며 게임·검색어와 함께 검색, 상세 복귀, 공유 URL, 새로고침과 WebView 뒤로 가기에도 유지합니다. 다른 분류나 전체 피드의 답변 상태 인자는 거부합니다. 기존 홈의 `unanswered=true` 계약은 보존하고 모순되는 ANSWERED 조건과의 조합은 400으로 처리합니다.

API는 실제로 보이는 답변의 존재 여부로 목록을 필터링합니다. 숨김·삭제된 답변과 차단한 사용자, 기존 사용자 비노출 정책을 반영하며 목록 카드의 answerCount와 같은 기준을 사용합니다. 검색·게임 범위와 커서 페이지네이션을 함께 적용합니다. 서버 Zod → OpenAPI → Orval로 SDK를 재생성했고 새 DB 열이나 Migration은 없습니다.

피드백 카드의 상태를 답변 대기 / 답변 있음 / 도움됨으로 간결하게 표시하고 본문은 두 줄까지 보여줍니다. 피드백 분류와 해당 검색에서는 반복되는 분류명을 생략하고 하단에 답변 개수를 표시합니다. 빈 목록은 검색 결과 없음과 상태별 요청 없음을 구분하며 전체 피드백 보기로 상태만 해제할 수 있습니다. 세 언어의 안내를 추가했고 공통 shadcn/Base UI 버튼 스타일과 가로 스크롤 칩을 사용합니다.

제목·검색 아이콘·글쓰기·답변 상태 칩은 목록의 Suspense 밖에 둡니다. 데이터 대기에는 목록만 스켈레톤으로 표시합니다. 비로그인 최초 HTML과 JavaScript 없는 문서에도 선택 상태와 공개 글이 렌더됩니다. canonical은 게임별 기본 피드백 목록을 유지하며 필터 URL을 별도 문서로 중복 지정하지 않습니다.

### 이번 범위의 검증

Node 24.19.0 / Yarn 4.17.0에서 프로젝트 check, API build와 변경 파일 Prettier 검사를 실행했습니다. 프로젝트 test는 API Vitest+Supertest 98개, SDK 41개, Web Vitest 95개, Mobile 42개가 모두 통과했습니다. API 검사는 공개 답변 필터, 숨김·삭제·차단 답변, 검색·게임 범위, 커서, 잘못된 인자와 기존 unanswered 계약을 포함합니다.

관련 Web Playwright 일곱 파일 23개가 최종 한 번에 통과했습니다. 최초 검사에서 이전 빈 목록 문구 기대와 신규 fixture의 허용되지 않은 테스트 계정 지정을 수정한 뒤 같은 범위를 다시 실행했습니다. 공개 상태별 목록, 검색·상세 왕복, 새로고침, 다른 게임, no-JS 선택 상태와 빈 필터 해제를 확인했습니다. Production build와 프리패칭 12개도 통과했으며 instant()의 목록 스켈레톤이 보일 때 답변 상태 칩을 사용할 수 있습니다. Mobile Playwright의 새 필터 검색/뒤로 가기는 Android Chromium과 iOS WebKit host 두 검사에서 통과했습니다.

기존 개발 서버 3300/4300에서 320·400·1440px 한국어 피드백 화면, 400px 영어·일본어 다크 모드를 확인했습니다. 가로 넘침과 pageerror는 없고 답변 있음 목록의 표시 개수가 모두 1 이상이었습니다. 개발 서버와 데이터는 유지하고 이번에 시작한 소유 테스트 DB만 종료합니다. 이번 변경은 Game Feedback 범위이며 외부 모니터링 연동과 운영 이벤트 수신, 실기기·스토어 및 배포를 새로 검증한 결과가 아닙니다.

## 페이지 조립, 별도 관리자와 API 요청 경계 (2026-10-18)

관리자는 `apps/admin`의 독립 React/Vite 앱으로 옮겼습니다. 로컬 127.0.0.1:3303에서만 실행하며 문의 답변/처리, 신고 검토/콘텐츠 숨김, 사용자 인증과 사유를 포함한 밴/해제를 제공합니다. 공개 Web의 관리자 페이지와 메뉴, 관리 전용 feature와 CSS를 제거하고 모든 locale의 기존 관리자 HTML/RSC는 404로 처리합니다. API의 ADMIN 권한과 감사 기록은 유지합니다. 관리자 프록시는 로컬 Origin을 먼저 검사하고 기존 API Origin으로 전달하며 외부 Origin의 쓰기는 거부합니다.

API도 테이블 단위로 한 service에 합치지 않습니다. 공개 Categories/Users/Moderation/Support와 관리자 `admin/{categories,users,reports,support}`의 controller/service를 분리하고 AdminModule에서 조합합니다. Category 테이블과 기존 REST URL/응답은 공유하지만 조회와 관리자 생성의 application context는 독립합니다. 관리자 카테고리 생성의 권한, Zod 계약과 감사 기록, 비로그인 활성 카테고리 조회를 Supertest로 확인합니다.

JSON 요청은 도메인별 class-validator DTO와 class-transformer, Nest ValidationPipe 기반의 명시적 parameter decorator가 검증합니다. tsx의 design:paramtypes 미출력에도 같은 검증이 적용되도록 DTO를 파이프에 직접 전달합니다. Service는 입력 DTO와 업무 불변식, 권한과 트랜잭션을 담당합니다. Guard가 DTO 파이프보다 먼저 실행돼 관리자/로그인 권한과 비활성 테스트 인증의 404 우선순위를 보존합니다. Zod의 중첩 JSON/refinement/정규화와 OpenAPI/SDK 계약도 HTTP 경계에서 유지합니다. 응답 검증/fallback 계약을 class-validator로 바꾸지 않습니다. DTO 단위는 잘못된 타입, 추가 필드와 prototype 키, 금액, 빈 PATCH, 태그 정규화, 사진만 있는 채팅과 중복 첨부, query 기본값을 확인합니다.

배포 전이라는 사용자 지시에 따라 누적 migration SQL과 그 SQL만 검사하던 과거 데이터 변환 테스트를 제거했습니다. schema.prisma를 단일 출처로 관리하고 `db:sync` / `db:test:sync`는 기존 전용 URL 가드 후 `prisma db push --skip-generate`를 실행합니다. 데이터 손실 강제 옵션과 reset은 없습니다. 기존 개발 DB를 삭제하거나 초기화하지 않았습니다. 이전 절의 Migration 적용 기록은 당시 이력이며 현재 실행 방식은 이 절과 README를 따릅니다. 최초 운영 배포 전 초기 migration과 운영 적용 절차는 별도로 준비해야 합니다. 사용자 원본 계획은 수정하지 않았습니다.

Topbar는 Root/Brand/Title/Back/Breadcrumb/Actions compound를 제공하고 각 페이지의 @topbar 어댑터에서 조립합니다. 상세에는 서버가 확인한 실제 게임 > 분류, 뒤로 가기, 언어와 알림만 표시합니다. 비소유자 채팅 CTA는 본문 하단 한 곳에 배치하고 등록/수정 날짜 토큰은 393px에서도 줄바꿈하지 않습니다. 차가운 상세 탐색에서도 헤더 뼈대와 본문 fallback을 각각 먼저 표시하며 초기 no-JS 문서는 실제 breadcrumb와 공개 본문을 완성합니다.

프로필 탭에 자기 글의 모든 분류와 추가 페이지를 표시합니다. 채팅 헤더의 상대와 수신 메시지 아바타는 상대 프로필에 연결하고 신고는 바로 노출하며 차단/대화내역 삭제는 메뉴로 옮겼습니다. 헤더는 393px에서 68px 이하이며 각 버튼을 잘리지 않게 배치했습니다. 가이드/약관/개인정보/문의는 한국어·영어·일본어 본문과 metadata, canonical, hreflang과 JSON-LD를 제공합니다. 사이트맵은 24시간 후 요청에서 재검증하며 게시글 lastmod는 updatedAt입니다. 크론 스케줄러는 아닙니다.

CreatePostForm과 EditPostSheet는 생성/수정 mutation, 기본값, 완료 후 흐름을 따로 소유합니다. 공통 PostContentFields는 제목·본문·가격/모집 필드만 공유합니다. ConnectProfile은 RHF 입력과 조회/저장 mutation을 분리하고 입력 변경 시 이전 preview를 분리합니다. 조회 중 태그 변경 뒤 늦게 도착한 결과를 등록하지 않는 브라우저 회귀를 추가했습니다.

NativeHost와 검증용 host harness는 클래스로 상태와 수명을 소유합니다. instrumentation-client에서 NativeBridgeChannel의 DOM 구독을 한 번 설치하고 React는 최신 router/auth/overlay 어댑터만 bind합니다. ts-pattern으로 메시지와 화면 종류를 분기하고 es-toolkit으로 query와 마지막 overlay를 조합합니다. URL 길이/인코딩/중복 query/허용 화면 검증은 유지하고 관리자 딥링크는 공개 셸에서 제외합니다.

루트 yarn.lock 변경은 새 Admin workspace, API의 class-validator/class-transformer와 bridge의 ts-pattern/es-toolkit 의존성을 선언하기 위해 필요했습니다. Node/Yarn과 다른 서비스의 제품 코드는 변경하지 않았습니다. 실제 OAuth/Supercell, Sentry/Amplitude 수신과 실기기/스토어/공개 배포를 새로 검증한 결과로 기록하지 않습니다.

이번 최종 검증 결과는 다음과 같습니다. 앞선 실패나 재시작을 최종 성공 수에 합산하지 않습니다.

| 범위                            | 결과                                                                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API Vitest + Supertest          | 14개 파일, 100개 통과                                                                                                                                     |
| SDK / Web / Mobile / Admin unit | 각각 41 / 99 / 43 / 2개 통과                                                                                                                              |
| Web Playwright                  | 전체 86개 중 85개 통과. 320px 글쓰기 진입 1건 이후 동일 반응형 파일의 320/390/768/1440px 4개 재검사 통과. 86개 전체가 한 번에 통과한 결과로 기록하지 않음 |
| Native host                     | Android Chromium/iOS WebKit 전체 34개 최종 한 번에 통과                                                                                                   |
| 별도 Admin Playwright           | 권한/외부 Origin, 인증/밴, 문의 답변/신고 처리 3개 통과                                                                                                   |
| Production build + instant()    | 12개 통과. 최초 상세 헤더의 params 대기가 셸을 막는 문제를 고친 후 목록/상세 프리패칭과 no-JS 공개 문서 검증                                              |
| demoMode=false 테스트 토큰 채팅 | 플레이어 채팅/일반 문의/인증 문의 3개 통과                                                                                                                |
| 정적 검사와 설치                | 프로젝트 check와 변경 파일 format 검사, Yarn immutable 설치 통과                                                                                          |
| 빌드                            | API, Web production, Android/iOS Metro export, 별도 Admin build 통과                                                                                      |
| 수동 화면/메타데이터            | 393px 상세/채팅 헤더, 관리자 3303 화면과 pageerror 0개. 3300 개발 문서 유지 확인. no-JS 영어/일본어 정보 페이지 8개의 제목·키워드·canonical 확인          |

정보 페이지의 공통 키워드와 브랜드 표기도 locale에 맞춥니다. 개발용 Web E2E는 WebView와 같은 Webpack 설정을 사용합니다. 여러 Next 검증 서버를 동시에 실행한 Turbopack 개발 HMR 반복 재로딩과 구분해 최종 검사를 순서대로 실행했고 production Turbopack 빌드/프리패칭 검증은 유지했습니다. 일반 3300 dev 실행 설정은 변경하지 않았습니다.

초기 빌드/서버 시작 실패에서 남긴 이번 작업 소유 테스트 스키마 6개를 명시적으로 확인해 정리했고 이전 작업의 스키마 5개는 보존했습니다. 이후 이번에 시작한 테스트 DB 55444만 종료했으며 데이터 디렉터리와 개발 DB/서버는 유지했습니다. 별도 관리자 3303은 실행 중입니다.

## 상세 댓글과 작성자 채팅 (2026-10-18)

상세 댓글은 채팅처럼 말풍선으로 표시합니다. 다른 사용자의 댓글은 왼쪽 아바타와 함께, 내 댓글은 오른쪽 강조색 말풍선으로 구분합니다. 작성자, 작성 시각과 수정 표시, 수정/삭제 또는 채팅/신고/차단을 유지합니다. 글 작성자가 쓴 댓글에는 작성자 표시를 붙이며 목록이 비어 있으면 간단한 빈 상태를 표시합니다. 댓글 작성은 독립 PostCommentForm이 RHF와 mutation 상태를 소유하고 공통 Textarea와 Button을 사용합니다. 입력창은 한 줄에서 시작해 내용에 맞춰 늘어나며 전송 아이콘으로 등록합니다. Enter로 줄바꿈하고 실패하면 초안을 보존합니다. 공개 댓글은 초기 HTML에서도 읽을 수 있습니다.

작성자 아바타와 닉네임은 상세 상단에 한 번만 표시하고 본문 하단에는 ‘작성자와 1:1 채팅’ 버튼을 둡니다. 자기 글에는 표시하지 않고 다른 사용자의 글에서는 기존 인증 흐름을 거쳐 실제 작성자 대화로 이동합니다. 모바일 버튼은 가로 폭을 채웁니다. Base UI Button의 text-button 타이포 유틸리티에 작은 채팅 링크용 스타일이 겹치지 않도록 텍스트 링크 스타일에서 공통 버튼을 제외했습니다. 새 문구는 한국어/영어/일본어를 제공합니다.

Web typecheck/lint, Vitest 99개가 통과했습니다. 관련 Playwright 6개를 최종 한 번에 통과했고 320/393/1440px 가로 넘침과 날짜 줄바꿈, 버튼 가독성, 세 언어, no-JS 댓글/SEO, 줄바꿈과 실패 초안 보존, 등록/수정/삭제, 실제 작성자 대화 이동과 댓글 오류 경계 복구를 확인했습니다. API/계약/DB 변경은 없습니다.

하단 작성자 중복 정보 제거 후 Web typecheck/lint/Prettier와 관련 Playwright를 다시 확인했습니다. 상세 레이아웃/작성자 채팅 2개가 통과했고 공개 댓글 검사의 작성자 선택 범위를 게시글 영역으로 좁힌 뒤 해당 1개도 재검사 통과했습니다. 320/393/1440px, 세 언어, no-JS 공개 댓글과 작성자 정보의 단일 표시를 확인했습니다.

## 페이지별 Topbar 조립 (2026-10-18)

제목과 search/account 옵션으로 모든 페이지 헤더를 만들던 PageTopbar를 제거했습니다. 홈, 분류 목록, 검색, 가이드, 약관, 개인정보, 문의, 알림, 설정, 사용자 프로필, 대화 목록, 대화 상세는 각 _pages slice의 전용 Topbar가 요소와 순서를 직접 조립합니다. 같은 분류 목록 화면을 쓰는 다섯 메뉴는 BoardsTopbar에 분류 데이터만 전달합니다. @topbar 라우트는 해당 페이지의 공개 진입점만 연결하며 _app에서 페이지 헤더를 재수출하지 않습니다.

공통 Topbar는 Root/Brand/Title/Back/Actions와 Search/Language/Notifications/Account 요소만 제공합니다. Actions는 children을 배치하고 검색 또는 계정 노출 여부를 결정하지 않습니다. Notifications는 읽지 않은 개수, Account는 인증 상태만 소유하며 이동 경로는 페이지가 전달합니다. 경로를 판별하던 HeaderSearch도 없애고 홈과 분류 검색 링크가 각각 자신의 URL 조건을 만듭니다. 게시글의 게임 > 분류 경로와 초기 로딩 헤더는 상세 페이지 폴더가 소유합니다. 글쓰기는 기존처럼 헤더가 없고 매칭되지 않은 헤더 slot은 null입니다. API/계약/DB/의존성 변경은 없습니다.

Web typecheck/lint/Prettier와 Vitest 99개가 통과했습니다. 관련 브라우저 검사 29개 중 28개가 통과했고 지난 댓글 작업 전의 ‘코칭 상담’ 버튼을 찾던 1개는 현재 ‘작성자와 1:1 채팅’ 문구로 수정했습니다. 같은 이전 선택자가 남은 사용자 채팅/테스트 계정 흐름도 정리한 뒤 해당 코칭/채팅/계정 전환 3개를 별도 재실행해 모두 통과했습니다. 29개 전체를 한 번에 통과한 것으로 합산하지 않습니다. 화면별 제목과 언어/알림/계정 표시, 모바일과 데스크톱 탐색, 분류/게임/검색 조건 유지, no-JS 정보 페이지와 실제 읽음/안 읽음 표시를 확인했습니다.

Production Turbopack build와 instant() 프리패칭 12개도 통과했습니다. 다섯 분류와 홈의 검색/작성 버튼 및 목록 스켈레톤, 가이드 전용 헤더의 프리패칭, 상세의 초기 헤더/본문 fallback과 no-JS 공개 문서를 확인했습니다. 테스트는 순서대로 실행하고 개발 Web/API/Admin 서버와 개발 DB를 유지했습니다.

## 댓글 말풍선과 간결한 입력창 (2026-10-18)

댓글의 좌우 배치는 현재 로그인한 사용자 ID로 판단하며 계정 전환 시 표시도 바뀝니다. 공통 색상/모서리 토큰을 사용해 밝은 모드와 다크 모드에서 말풍선을 구분합니다. 댓글 간 구분선과 입력란의 반복되는 본인 아바타/닉네임을 정리했고 입력창은 기본 높이 64px 이내로 표시합니다. 작성자 인증/태그, 본문 줄바꿈, 시간, 편집과 신고 동작은 유지합니다. API/계약/DB/의존성 변경은 없습니다.

Web typecheck/lint와 관련 Playwright 6개가 한 번에 통과했습니다. 320/393/1440px에서 좌우 배치, 긴 연속 문자열의 줄바꿈, 간결한 입력창 높이와 가로 넘침을 확인했고 세 언어와 no-JS 공개 댓글/SEO, 전송 실패 초안, 등록/수정/삭제와 실제 작성자 채팅, 댓글 오류 경계 복구를 검증했습니다. 393px 밝은 모드/다크 모드도 확인했습니다.

## 사용자 태그 예시 (2026-10-18)

플레이어 태그 입력 예시와 기본 테스트 사용자 `sample-user-0`의 초기 대표 태그를 `#GG829JGY`로 맞췄습니다. 이미 등록된 사용자 태그를 seed가 덮어쓰는 정책은 추가하지 않습니다. 현재 로컬의 이전 예시 `#2PP`를 사용하던 해당 테스트 계정만 정상 게임 계정 등록 API로 대표 태그를 변경했습니다. 다른 사용자의 데이터와 DB 스키마, API 계약은 변경하지 않았습니다.

시드의 기존 기대 태그를 수정한 뒤 API Vitest+Supertest 13개가 최종 통과했고 프로젝트 check, Web Playwright 2개와 Android Chromium/iOS WebKit host의 동일 계정 흐름 2개가 통과했습니다. 태그 조회/등록과 계정 전환, 사용자가 변경한 태그를 보존하는 동작을 확인했습니다.

## 차단 완료 후 화면 이동 (2026-10-18)

차단 API가 성공한 뒤에도 게시글·채팅의 조회 갱신을 기다리느라 확인창과 완료 후 동작이 멈추는 문제를 재현했습니다. 조회 응답을 지연시킨 회귀 검사가 수정 전에 실패하는 것을 확인한 뒤, 차단 mutation의 완료와 백그라운드 조회 갱신을 분리했습니다. 조회 실패는 해당 영역의 오류 경계가 처리하며 성공한 차단을 실패로 바꾸지 않습니다.

확인창에서 차단하기를 누르면 요청 중 중복 클릭을 막고, 성공 즉시 창을 닫아 완료 토스트를 표시합니다. 게시글 작성자 차단은 홈으로, 채팅 상대 차단은 채팅 목록으로 replace 이동합니다. 댓글 작성자만 차단하면 해당 댓글을 숨기고 현재 글은 유지합니다. 차단 요청이 실패하면 창 안에서 오류와 재시도를 제공하며 취소 시 차단을 저장하지 않습니다. 설정의 차단 해제도 유지합니다. 채팅 차단 창의 수명은 사용자·대화별 overlay ID가 소유하고 불필요한 ref를 제거했습니다. 확인 제목은 한국어·영어·일본어를 제공합니다.

Web typecheck/lint와 변경 파일 Prettier 검사가 통과했습니다. 새 Playwright 회귀 3개가 한 번에 통과했으며 393px의 게시글/채팅 차단 완료, 조회 지연 중 이동, 실패/취소/재시도와 차단 해제, 차단된 대화 접근 거부, 댓글만 숨김과 현재 글 유지까지 검증했습니다. API/계약/DB/의존성 변경은 없습니다.

## 플레이어 태그 8자리 규칙 (2026-10-18)

사용자가 지정한 `#` 뒤 영문·숫자 8자리 형식으로 조회와 계정 등록의 검증을 통일했습니다. 이전의 일부 문자만 허용하던 3~15자리 규칙을 교체하고 Zod 계약과 class-validator DTO가 같은 정규식을 사용합니다. 앞뒤 공백 제거, `#` 자동 추가와 대문자 저장은 유지하며, 길이가 다르거나 특수문자·내부 공백·한글·중복 `#`가 있으면 거부합니다. OpenAPI/Orval로 재생성한 요청 스키마에도 소문자를 명시적으로 허용하며 생성 파일을 직접 수정하지 않았습니다.

등록 폼은 `#GG829JGY` 예시와 8자리 안내를 표시하고 최대 9자(`#` 포함)로 입력을 제한합니다. 한국어·영어·일본어 안내와 검증 오류를 제공하고 모바일 자동 대문자 입력을 설정했습니다. 응답의 표시용 태그 fallback도 새 형식의 값을 보존합니다. 테스트 계정과 관련 API/SDK/Web fixture를 8자리로 맞췄으며 seed가 이미 저장된 사용자 태그나 인증 상태를 덮어쓰지는 않습니다. DB 스키마·Migration·의존성 변경은 없습니다.

프로젝트 check, OpenAPI/SDK 재생성과 변경 파일 Prettier가 통과했습니다. API Vitest+Supertest 109개와 SDK Vitest 43개가 통과했으며 정상 태그·대소문자 정규화와 두 endpoint의 잘못된 길이/문자 거부를 확인했습니다. 관련 Web Playwright 21개 중 20개가 통과했고 이전 5자리 태그가 URL 인코딩된 채 남아 있던 조회 fixture를 수정한 뒤 해당 파일 4개를 다시 실행해 모두 통과했습니다. 21개 전체가 한 번에 통과한 것으로 기록하지 않습니다. 393px의 세 언어 안내/오류/조회/등록, 조회 중 입력 변경, 사용자 태그 유지와 인증 문의 흐름을 확인했습니다. 검증은 격리 PostgreSQL과 가짜 프로바이더를 사용했으며 실제 Supercell API 호출을 성공으로 기록하지 않습니다. 실행 중인 개발 Web의 200 응답과 개발 API의 7자리 태그 거부(400)도 확인했습니다.

## 2026-10-20 웹/API 관측 연결

웹 Sentry 오류 수집과 Amplitude의 타입 이벤트 7개, 자동 페이지뷰 공통 속성, 계정 식별 초기화를 추가했다. API는 예외 필터의 500만 수집하며 실제 URL 대신 라우트 패턴을 태그한다. 빈 키는 비활성화한다. 공통 workflow 변경은 GF 웹 빌드 인자 연결에 필요하다. 실제 국가·보유기간·콘솔 알림 설정은 운영 프로젝트 확인 후 확정한다. 모바일은 이번 변경에 포함하지 않는다.

SDK 11의 Next span 계측은 현재 Next 서버 시작을 실패시켜 서버에서 OpenTelemetry 설정과 기본 integration을 끄고 오류 수집만 초기화했다. tracesSampleRate를 설정하지 않아 tracing을 켜지 않는다. 브라우저는 trace 0이다. Amplitude의 pageUrlEnrichment는 개인정보 제거 뒤 URL을 다시 추가하므로 명시적으로 끄고 자체 enrichment만 사용한다. 이 차이는 실제 SDK 전송 테스트로 확인했다.

API 테스트 177개와 웹 113개, 타입검사·lint가 통과했다. 가짜 키에서 실제 SDK 페이지뷰 이동당 1회, 오류 전송의 개인정보 제거, 글쓰기 실패 미집계와 글/채팅/메시지 성공 집계 3개 E2E가 통과했다. 빈 키 외부 요청 0건 E2E도 통과했다. 실제 운영 대시보드 수신과 소스맵 업로드는 검증하지 않았다. 자세한 콘솔 설정과 퍼널은 docs/observability.md에 기록했다.

## 2026-10-20 프로필 링크와 사진

내 공개 프로필의 편집 영역에서 이름·HTTP(S) 주소 링크를 최대 5개 저장하고 사진을 미리 본 뒤 등록·교체·삭제할 수 있다. 링크의 계정정보 URL·스크립트와 빈 이름을 거부한다. 사진은 5MB 이하 JPEG/PNG/WebP만 받고 실제 디코딩 후 방향 보정·512px 이하 정사각형 WebP로 정규화하며 메타데이터를 보존하지 않는다. 기존 DATABASE/FILESYSTEM/S3 저장소를 재사용한다. 선택한 Blob 미리보기는 해당 UI 수명이 끝나면 해제한다.

UserAvatar는 사용자별 한 개이고 User.profileLinks는 기본 빈 배열이다. 공개 사진 읽기도 기존 프로필의 데모·차단 가시성 규칙을 따르고 private no-store로 응답한다. 기존 객체는 14일 정리 유예를 적용하며 사용 중인 avatar 객체는 정리에서 제외한다. 마이그레이션은 새 필드와 테이블만 추가했다. 개발 DB에는 적용하지 않았다. 루트 lock 변경은 API의 기존 버전 sharp 의존성 선언에 필요하다.

격리 migration+실DB HTTP 통합 신규 7개를 포함해 API 180개, Web 105개, SDK 43개가 통과했다. 모바일 너비 390px와 데스크톱 1440px에서 사진 미리보기·저장·삭제, 링크 저장·삭제와 타인 편집 숨김 E2E 2개가 통과했다. 계약→OpenAPI→Orval로 SDK를 생성했다. 실제 S3 외부 수신은 이 테스트 결과에 포함하지 않는다.

최신 develop에서 두 기능을 합친 최종 검사는 API 184개, Web 113개, SDK 43개, Bridge 8개, Mobile 43개와 Admin 2개가 통과했다. 채팅·첨부·작성·프로필·빈 키 E2E 11개, 실제 SDK 관측 E2E 3개가 통과했으며 가짜 키로 production build/start를 사용한 관측 E2E 3개도 통과했다.

## 2026-10-21 전체 브라우저 회귀 검증

일반 브라우저 E2E는 격리 API와 실제 Next production build/start를 사용한다. CI의 개발 서버 지연 컴파일로 실행마다 다른 화면 이동이 5초 제한을 넘던 문제를 제거했다. 로컬 전체 98개가 한 번에 통과했으며 이전 개발 모드 실행은 CI에서 87/98개 통과했다. 테스트 인증 모드도 같은 production 서버 설정을 재사용한다. 관측 검사는 개발 모드와 공개 키를 빌드에 주입한 production 모드를 명시적으로 구분한다.

폐기한 게시판 경로는 스트리밍 응답의 상태 코드만 검사하지 않고 실제 not-found 화면과 noindex를 확인한다. 글쓰기의 모바일 메뉴 검사는 Cache Components가 보존한 숨김 Activity 대신 보이는 메뉴가 없는지 확인한다. 웹 타입·lint·포맷 검사도 통과했다.

## 게시글·채팅 S3 직접 업로드와 로컬 관측 설정 (2026-10-21)

S3 저장소에서 게시글과 채팅의 사진·동영상은 업로드 예약 → 브라우저 S3 POST → 서버 검증·확정으로 처리한다. 최대 25MB와 파일 signature·실제 크기·MIME 검사를 유지하고 5분짜리 POST 정책은 예약한 key·크기·타입을 제한한다. 검증된 바이트를 별도 최종 객체에 저장하므로 staging 주소를 재사용해도 확정 파일은 바뀌지 않는다. 파일 확인과 최종 저장을 위한 서버 전송은 남는다. DATABASE/FILESYSTEM은 기존 multipart 경로를 유지한다.

PostMedia/ChatAttachment의 uploadedAt과 추가형 migration으로 기존 첨부를 보존하며, 미완료 첨부는 API와 DB CHECK 양쪽에서 게시글·메시지 연결을 거부한다. 게시글 공개 범위, 채팅 참여자·차단·대화 삭제 경계와 소유권을 확인한 후 60초짜리 GET 주소로 이동한다. 이미 발급한 주소는 만료까지 유효하다. Range와 HEAD, no-store를 유지하고 완료 중복 요청은 같은 첨부를 반환한다. 임시 객체는 하루 후 정리하고 최종 객체의 14일 백업 유예는 보존한다. 업로드 예약과 기존 multipart는 사용자별 제한을 공유하고 완료 검증은 별도 제한을 사용한다.

전송 계약·DTO와 S3 전송을 공유하되 게시글·채팅의 권한·저장·메시지 연결은 도메인별 서비스가 소유한다. SDK는 Zod 계약 → OpenAPI → Orval로 재생성했다. 루트 yarn.lock은 API의 S3 POST·GET 서명 의존성 선언 때문에 변경했다. 공통 배포 README는 직접 업로드에 필요한 CORS 안내 때문에 수정했으며 Photo Contest 제품 코드는 변경하지 않았다.

로컬 키는 프로젝트 루트 `.env`에서 집계 dev/dev:test 실행이 Web/API에 전달한다. `.env.example`에 S3 설정을 추가하고 docs/observability.md에 Sentry DSN·Amplitude 개발 프로젝트 키, 재시작과 실제 수신 확인, Next/API 서버 DSN 공유를 기록했다. tracing·Web Vitals와 소스맵 업로드는 기존처럼 비활성이다. docs/media-upload.md와 CORS JSON은 실제 private 버킷 설정과 검증 절차를 설명한다.

검증 결과:

- API 단위 81개와 관련 통합 36개가 통과했다. 새 PostgreSQL schema에 migration을 적용하고 실제 AWS SDK·로컬 S3 HTTP fixture로 서명 POST의 크기 제한, 완료 전 접근·연결 거부, 동시 확정, staging 덮어쓰기, 공개/비공개 조회, 채팅 참여자·차단·대화 내역 삭제, Range·HEAD와 정리를 검사했다.
- Web Vitest 120개와 SDK Vitest 43개가 통과했다. 실제 생성 SDK의 응답 검증을 거쳐 직접 전송·로컬 multipart·실패 예약 정리를 검사했다. 기존 Sentry/Amplitude 단위 검사도 포함한다.
- 관련 Playwright 3개가 한 번에 통과했다. 로컬 DATABASE 경로에서 모바일 채팅의 사진 전송·실패 재시도·상대 조회, 동영상 재생·Range와 글쓰기 사진/동영상의 저장·수정·비로그인 HTML을 확인했다.
- API/Web/SDK typecheck, Web lint, API build와 immutable install이 통과했다. OpenAPI/SDK 재생성 diff가 없고 변경 파일 Prettier와 migration 호환성 검사(신규 SQL 1개)가 통과했다. shared-instance smoke의 S3 조회 검사를 307·서명 URL·Range에 맞춰 변경하고 두 runner 파일의 Node 문법을 검사했다.

이 컴퓨터의 Docker 실행 파일이 없어 컨테이너 smoke는 실행하지 못했다. 실제 AWS 버킷 IAM/CORS와 브라우저 송수신, 실제 Sentry·Amplitude 콘솔 수신은 자격 증명이 없어 확인하지 않았다. 로컬 fixture 결과를 실제 외부 수신이나 공개 배포 완료로 기록하지 않는다. 개발 서버·개발 DB는 변경하지 않았으며 테스트는 전용 55444와 격리 schema만 사용했다. 종료 후 소유한 테스트 DB만 중지하고 데이터를 보존했다.

## 모바일 로그인 페이지와 소셜 버튼 (2026-10-21)

모바일 웹(760px 이하)과 앱 WebView의 로그인 진입을 `/:locale/login`으로 분리했다. 데스크톱은 공통 디자인 시스템의 중앙 Dialog를 사용한다. 로그인 페이지·페이지별 Topbar·데스크톱 Dialog를 각각 조립하고 제공자 버튼·약관 링크만 공유한다. 버튼은 Google·카카오·Discord·X 로고와 색상을 구분하며 50px 높이·일정한 간격·진행 상태·미설정 상태를 제공한다. 기존 온보딩과 테스트 계정 API는 유지한다. 새 의존성·DB migration·루트 파일 변경은 없다.

로그인 경로는 bridge의 알려진 화면으로 등록하고 원래 화면·검색 조건을 복귀 경로로 보존한다. 외부 URL, 다른 언어의 복귀 경로와 로그인 순환은 웹 라우터에서 거부하며 언어 변경 시 복귀 화면도 같은 언어로 바꾼다. API는 안전한 서비스 언어 경로를 Zod로 검증하고 10분짜리 HttpOnly OAuth 복귀 쿠키로 전달해 성공·신규 가입·취소 후의 언어와 화면을 유지한다. 외부 주소와 잘못된 쿠키는 거부하거나 기존 홈으로 복구한다. 앱의 PKCE·일회용 코드 교환과 시스템 인증 프로토콜은 유지한다.

검증 결과:

- API Vitest 단위 85개와 로그인 관련 Supertest 통합 18개 통과. 복귀 경로·외부 주소 거부·취소·기존 앱 인증을 확인했다.
- Web Vitest 134개, Bridge 9개, Mobile 43개 통과. API/Web/Bridge/Mobile typecheck, Web lint와 API build 통과.
- Next production build/start에서 Web Playwright 7개가 최종 한 번에 통과했다. 모바일 페이지 전환·320px 가로 넘침·393px 버튼 및 라이트/다크 화면·데스크톱 Dialog와 포커스 복귀·언어 변경·세션 갱신 후 원래 게시판 복귀·OAuth form 목적지·미설정 버튼·저장된 테마의 no-JS 적용을 확인했다.
- Android Chromium/iOS WebKit의 실제 native host를 사용한 Playwright 4개가 통과했다. 앱 뒤로 가기, 딥링크, foreground 세션 갱신, 시스템 인증 진입과 취소 후 로그인 페이지 유지를 확인했다. 실기기 검증으로 기록하지 않는다.
- 393px 라이트/다크와 1440px 데스크톱의 스크린샷을 직접 확인했다. 테스트는 전용 55444의 격리 schema와 별도 Web/API 포트를 사용했다.
- 계약 → OpenAPI → SDK를 다시 생성해 SDK diff가 없음을 확인했다. 변경 코드·문서의 Prettier와 `git diff --check`를 통과했다.

실제 외부 제공자의 계정 로그인은 실행하지 않았다. API는 가짜 제공자, 웹은 OAuth 시작 요청 가로채기, 앱은 시스템 인증 취소 대역을 사용했다. 실행 중인 개발 Web/API와 개발 DB는 변경하지 않았다. 검증 후 소유한 테스트 DB만 중지하고 데이터를 보존했다.

## 2026-10-22 모바일 이용 가이드와 제목 바로가기

- 가이드를 휴대폰의 하단 홈·채팅·프로필, 화면 위 검색·알림, 분류 버튼 좌우 스크롤과 첨부·보내기 조작 기준으로 고쳤다. 데스크톱 Enter·Shift+Enter 안내를 휴대폰 줄바꿈과 보내기 버튼 안내로 바꾸고 영어·일본어도 갱신했다.
- 아홉 섹션과 다섯 분류의 제목에 화살표와 내부 링크를 붙였다. 친추판매·전투 모집은 별도 섹션에서 해당 게시판으로 이동한다. 제목과 화살표가 같은 링크이며 터치 높이는 44px 이상이다. 별도로 놓였던 중복 바로가기 버튼은 제목으로 합쳤다.
- Web 타입 검사·lint·기존 Vitest 160개·production build/start의 Playwright 5개를 통과했다. 320px에서 각 제목의 화살표 탭·기능 이동·뒤로 복귀와 키보드 Enter, 영어·일본어 393px의 언어 유지·가로 넘침, 320px·1440px의 기존 푸터를 확인했다. 모바일 크기의 화면 스크린샷도 확인했다.
- 최신 develop의 별도 worktree에서 작업했다. API·DB·모바일 앱과 별도 진행 중인 가입 페이지는 변경하지 않았다. 전용 55444의 테스트 스키마를 정리해 잔여 0개를 확인하고 이 작업에서 시작한 테스트 DB만 중지했다.

## 닉네임·필수 동의의 가입 페이지 분리 (2026-10-22)

모바일·데스크톱·앱 WebView의 가입 안내를 `/:locale/onboarding` 페이지로 분리했다. 닉네임 입력, 이용약관·개인정보 처리방침 동의와 만 14세 이상 확인을 페이지에서 받고, 두 필수 항목을 확인해야 가입을 제출한다. 약관·개인정보·문의 페이지는 가입 대기 상태에서도 열 수 있다. 기존 가입 안내 BottomSheet는 제거했으며, 데스크톱의 소셜 로그인 Dialog와 모바일 로그인 페이지는 유지한다.

브라우저 OAuth 신규 사용자는 검증한 원래 화면을 returnTo에 담아 가입 페이지로 이동하고, 기존 사용자는 원래 화면으로 바로 복귀한다. 앱 PKCE 교환 뒤의 pending 세션도 같은 페이지로 이동한다. 외부 주소·다른 언어·인증 화면을 중첩한 목적지는 거부하고 안전한 홈으로 복구한다. 언어 전환은 목적지의 게시판·검색 조건도 함께 보존하며 가입 페이지는 noindex/nofollow다.

페이지의 서버 진입은 최신 쿠키 세션을 검사한다. 클라이언트 이동도 기존 sessionOptions 캐시를 재조회하고 결과가 나올 때까지 이동 판단을 보류한다. 재조회·요청 실패 시 폼 초안과 동의를 보존하고 요청 중에는 입력과 제출을 잠근다. 가입 중 인증이 만료되면 pending 세션 캐시를 정리하고 원래 목적지를 유지해 로그인으로 이동한다. 가입 완료 후에는 원래 화면으로 복귀하며 이미 가입한 사용자의 직접 재진입도 같은 목적지로 보낸다.

검증 결과:

- API 단위 98개와 관련 Supertest 통합 24개가 통과했다. 새 OAuth 복귀 통합 사양은 migration을 적용한 격리 PostgreSQL 스키마와 가짜 제공자로 세 언어의 신규·기존·취소·잘못된 복귀 쿠키를 검증한다.
- Web Vitest 전체 150개가 통과했다. 실제 SessionProvider·React Query·RHF·디자인 시스템 컨트롤과 SDK 응답 검증을 사용해 필수 동의·닉네임 오류·진행 중 잠금·실패 후 재시도·인증 만료·오래된 클라이언트 세션·재조회 중 초안 보존을 확인했다.
- Bridge 단위 11개, Mobile 전체 단위 45개와 Next production build/start의 Web Playwright 14개가 한 번에 통과했다. 실제 pending HttpOnly 쿠키를 쓰는 테스트 OAuth로 모바일·데스크톱 가입 페이지, 약관 새 창, 320px 가로 넘침, 언어 전환, 실패 초안, 가입 후 복귀와 익명·가입 완료 계정의 직접 진입을 확인했다. 마지막 문구 정리와 다크 모드 가독성 검사를 추가한 뒤 가입·시트 5개도 재검증했다.
- Android Chromium/iOS WebKit native host Playwright 10개가 통과했다. 가입 대기 페이지·개인정보 열람·뒤로 가기, 가입 완료 후 원래 필터 복귀, 기존 로그인·딥링크·foreground 갱신, 채팅 신고 시트의 native back을 확인했다. 실제 모바일 OS나 외부 제공자 계정 검증으로 기록하지 않는다.
- API·contracts·Bridge·Mobile·Web 타입 검사와 Web lint가 통과했다. 계약 → OpenAPI → SDK를 재생성했고 SDK 추적 diff가 없다. 393px 라이트/다크와 1440px 가입 화면의 스크린샷을 생성했다.

E2E 서버의 가짜 Google 제공자는 기존 NODE_ENV=test·격리 DB·전용 포트·외부 자격 증명 금지 검사 뒤에서만 사용한다. 테스트는 55444의 gf_test_ 스키마와 별도 Web/API 포트를 사용했다. 새 의존성·DB migration·다른 서비스 코드 변경은 없다. 기존 가입 대기의 필수 완료 정책을 유지하므로 뒤로 가기로 일반 화면에 이동하면 가입 페이지로 돌아온다. 공개 배포와 실제 Google·카카오·Discord·X 로그인은 수행하지 않았다.

공통 디자인 시스템에 Base UI Drawer 기반 BottomSheet를 추가하고 GF의 기존 입력 시트를 연결했다. 핸들의 마우스·터치 드래그와 방향키·Home·End·Enter·Space로 60%와 전체 높이를 조절한다. 아래로 끌어 닫기, 포커스 복귀와 필수 처리 중 닫기 방지를 제공한다. 제목·핸들은 고정하고 본문은 보이는 높이 안에서 스크롤하며 소프트 키보드는 VirtualKeyboardProvider를 사용한다. 상속되지 않는 Drawer 위치 변수는 popup에서 계산한 별칭으로 본문에 전달한다. 공통 패키지는 재사용 가능한 시트와 스타일·문서를 소유하며 기존 Photo Contest 제품 코드는 수정하지 않았다. 기존 Dialog의 하단 배치 API는 유지한다.

디자인 시스템 lint·typecheck·Vitest 16개가 통과했다. 웹 E2E에서 실제 마우스와 Chromium 터치 이벤트로 확장·축소·아래로 닫기를 검사했고, 높이를 바꿔도 입력 초안이 보존되는지 확인했다. 게임 계정·신고 시트와 확인 Dialog의 기존 동작도 검증했다. 393px 가입 라이트/다크와 시트 핸들 화면을 직접 확인했다. 초기 캡처가 테마 전환 중간에 찍히지 않도록 입력 글자와 주 버튼의 최종 다크 색상을 기다린다.

문의 메일은 contact@bambyul.com으로 변경했다. 오류 복구·문의 페이지의 기본 주소, 로컬·공통 인스턴스의 환경변수 예제와 회귀 검사를 함께 맞췄다. 공통 deploy/shared-instance/README.md 수정은 GF_CONTACT_EMAIL 예제 한 항목을 갱신하기 위한 것이다. ACME 인증서·예산 알림 주소는 문의 주소와 별도 설정으로 유지한다. 새 의존성이나 루트 manifest·lock 변경은 없다. 변경 파일 Prettier와 diff 검사를 통과했으며 실행 중인 개발 서버·개발 DB는 변경하지 않았다. 검증 후 이번 작업이 소유한 테스트 DB만 중지하고 데이터를 보존했다.

## PR #28의 develop 병합 충돌 해결 (2026-10-22)

최신 develop 4921df3을 기능 브랜치에 merge했다. 공통 배포 안내와 환경 예제는 game.bambyul.com과 contact@bambyul.com을 유지하고, 가입 페이지 전용 레이아웃과 드래그 시트를 보존했다. 삭제한 OnboardingDialog는 되살리지 않고 새 가입 페이지에 Game Mate 이름과 28px 아이콘을 적용했다. develop의 NestJS 캐시 무효화와 다른 서비스 변경은 그대로 반영했다.

병합 결과에서 Web Vitest 160개, API 단위 105개와 로그인·OAuth·캐시 관련 Supertest 통합 30개, 실제 Next production build/start의 Playwright 12개가 통과했다. Playwright는 모바일·데스크톱 로그인, 가입과 언어·복귀 경로, 마우스·터치 시트와 캐시 갱신·관리자 숨김·인증 없는 무효화 요청 거부를 확인했다. API/Web 타입 검사와 Web lint, OpenAPI/SDK 재생성 diff, 변경 파일 Prettier와 diff 검사도 통과했다. 기존 개발 서버와 개발 DB는 변경하지 않았고 검증 후 소유한 테스트 DB만 중지해 데이터를 보존했다. 실제 외부 OAuth와 물리 기기 검증은 포함하지 않는다.

## 댓글의 1단계 답글 (2026-10-22)

댓글의 답글 버튼으로 원댓글 바로 아래에 답글을 작성한다. 답글은 한 단계만 지원하고 기존 작성자 수정·삭제·신고·차단 기능을 재사용한다. 답글 폼은 일반 댓글 폼과 분리하며 줄바꿈·작성 대상·자동 포커스·취소·전송 중 입력 잠금·실패 초안 보존을 제공한다. 비로그인 상태에서는 기존 로그인 흐름으로 연결한다. 댓글 수는 삭제 자리표시자를 제외한 원댓글과 답글의 합계다. 한국어·영어·일본어 문구와 모바일 라이트/다크 화면을 연결했다.

Comment.parentId와 Notification.commentId의 추가형 migration 및 같은 게시글의 원댓글만 참조하는 복합 FK를 추가했다. 기존 댓글은 parentId=null을 유지한다. 생성 요청만 optional parentId를 받고 수정 요청은 본문만 허용한다. 답글의 답글·다른 게시글 부모·삭제·숨김·차단 원댓글에는 새 답글을 허용하지 않는다. 작성 중 부모와 게시글을 잠그며 원댓글 작성자와 게시글 작성자에게 중복·자기 알림을 제외해 댓글 또는 COMMENT_REPLY 알림을 보낸다. 알림에는 대상 댓글 ID를 저장해 누르면 #comment-<id> 위치로 이동하고 읽음 처리한다. 댓글 저장·알림 저장·공개 캐시 태그 기록은 같은 트랜잭션을 사용한다. 알림 저장 실패 시 답글도 롤백한다. 알림 목록과 미읽음 수에는 숨김·차단된 부모 스레드와 삭제된 답글을 제외한다. 기존 댓글·알림 행은 새 참조가 null인 상태로 보존된다.

원댓글 삭제 후 공개 답글이 남아 있으면 본문과 작성자를 제거한 삭제 안내를 반환한다. 마지막 공개 답글도 없어지면 삭제 안내도 제거한다. 숨김 또는 차단된 활성 원댓글의 스레드는 전부 제외하며, 이미 익명화된 삭제 원댓글은 보이는 답글만 유지한다. 쿠키 없이 캐시한 공개 상세를 사용하는 SSR도 같은 정책으로 필터하고 JSON-LD에서는 삭제 안내를 제외해 개인정보 노출과 null 작성자 오류를 막는다. 다른 사람의 게시글에서 탈퇴자의 원댓글을 하드 삭제할 때는 남은 답글의 부모 참조를 분리해 답글과 FK를 보존한다. 기존 탈퇴 시 본인 게시글 전체가 삭제되는 정책은 이 작업에서 변경하지 않았다.

검증 결과:

- API 전체 Vitest/Supertest 247개가 통과했다. 신규 통합 사양은 실제 migration을 적용한 격리 PostgreSQL에서 관계·권한·알림 중복·다른 게시글 FK·삭제·차단·숨김·삭제 동시성·탈퇴를 확인한다. 이전 migration 상태의 기존 댓글을 새 스키마로 올려 parentId=null과 본문이 보존되는지도 검사했다.
- Web 전체 Vitest 169개와 SDK 전체 Vitest 57개가 통과했다. SDK 생성 함수의 부모 ID 전달과 부모/삭제 상태 누락, 잘못된 본문·작성자, 삭제 원문 노출을 실제 응답 검증으로 거부한다. 웹 사양은 답글 중첩·로그인·필수 본문·취소·전송 잠금·실패 초안과 SSR 차단 필터·삭제 댓글의 구조화 데이터를 다룬다.
- Next production build/start의 Playwright 8개가 통과했다. 답글 작성·줄바꿈·실패 후 재시도·수정·원댓글 삭제 후 보존·마지막 답글 삭제, no-JS 공개 문서·JSON-LD, 차단 스레드의 API/SSR 일치와 기존 댓글 동작을 확인했다. 320/393/1440px 가로 넘침을 검사하고 모바일 라이트/다크 스크린샷을 직접 확인했다. 새 답글의 알림 표시·미읽음 수·대상 답글 이동·읽음 처리와 develop의 NestJS 공개 캐시 갱신·관리자 숨김·무효화 요청 인증도 재검증했다.
- API·contracts·Web·SDK 타입 검사와 Web lint, API build, 신규 migration SQL 호환성 검사와 변경 파일 포맷 검사가 통과했다. 계약 → OpenAPI → SDK를 다시 생성해 생성 결과가 동일함을 확인했다.

테스트는 전용 55444의 격리 gf_test_ 스키마와 별도 Web/API 포트를 사용했다. 실행 중인 개발 서버·개발 DB와 다른 서비스 코드는 변경하지 않았다. 새 의존성은 없으며 운영 migration 적용·공개 배포·실기기 WebView 검증은 수행하지 않았다.
검증 후 이번 작업에서 시작한 테스트 DB만 중지하고 데이터를 보존했다.

## 앱 소셜 로그인 콜백의 https App Link·Universal Link 전환 (2026-10-22)

감사 M3: 콜백이 검증되지 않는 커스텀 스킴(`gamefeedback://auth/callback`)이라 같은 스킴을 등록한 앱이 자기 `app_challenge`로 흐름을 열면 피해자가 진짜 제공자에서 로그인한 코드를 받아 교환할 수 있었다. PKCE는 흐름을 시작한 쪽에 묶여 막지 못한다. API는 코드와 실패를 `<WEB_ORIGIN>/app-auth/callback`(`MOBILE_AUTH_CALLBACK_URL`, WEB_ORIGIN과 같은 origin의 그 경로만)으로만 보내고 운영은 값이 없거나 틀리면 시작하지 않는다. 웹은 `/.well-known/apple-app-site-association`·`assetlinks.json`(rewrites → `app-links/*`)과 코드를 다시 보여 주지 않는 `/app-auth/callback` 안내 페이지를 제공한다. 앱은 associated domains(applinks·webcredentials)·`autoVerify` intent filter·최소 iOS 17.4·`preferUniversalLinks`로 https 콜백만 엄격히 읽고, 딥링크 처리기는 콜백을 열지 않는다. Apple Team ID·bundle id·Android package·서명 SHA-256은 아직 없어 배포 환경변수·EAS 환경변수로 받고 운영 빌드·서버는 값이 없으면 멈춘다. 운영 사용자가 없어 이전 콜백과의 호환 기간은 두지 않는다.

검증 결과:

- develop(#41~#52 머지 후, 99caadd8) 위로 rebase한 뒤 다시 검증했다. `check:game-feedback`(전체 typecheck, #50의 API·패키지 ESLint, Web·Mobile·Admin lint)와 SDK 재생성 diff 없음, API 단위 Vitest 26개 파일·161개(앱 로그인 콜백 회귀·운영 설정 포함) 통과. 통합 레인(`app-auth.service.integration.test.ts`, #41의 `banned-identity.integration.test.ts` 기대값을 https 콜백으로 수정)은 수정만 하고 CI에 맡겼다.
- Web Vitest 52개 파일·216개(`next.config.spec.ts`: #42 공통 보안 헤더에서 콜백 경로 제외·`/.well-known` 다시 쓰기), Bridge 13개, Mobile 15개 파일·83개(`app.config.spec.ts`·`native-login.test.tsx` 포함) 통과. Mobile `bundle:check`(Android·iOS Metro)와 변경 파일 Prettier 통과.
- `expo config`: 운영 값을 주면 entitlements `applinks:`·`webcredentials:`, MainActivity `android:autoVerify="true"` https·host·`/app-auth/callback` intent filter, Podfile `ios.deploymentTarget` 17.4. 값 없이 실행하면 빠진 이름을 담은 오류로 멈춘다.
- Playwright(Web `e2e/app-links.spec.ts`, Mobile `app-shell` 콜백 단언)와 production·공통 인스턴스 smoke의 `/.well-known`·콜백 확인은 작성만 하고 CI에 맡겼다. 서버·시뮬레이터·Docker·`next build`·EAS 빌드는 실행하지 않았다.

실제 제공자 로그인 뒤 iOS 세션 콜백·Android App Link 복귀, Apple CDN의 AASA 반영, Play App Signing 지문 검증은 실기기·콘솔 확인이 필요하다.

## 2026-10-23 Prisma 7 업그레이드

Prisma CLI·Client·PostgreSQL 어댑터를 7.10.1로 맞췄다(2026-10-15 배포, Yarn의 24시간 게이트 유지). 루트 yarn.lock은 두 API와 Photo Contest test-kit이 함께 쓰는 의존성 해석을 기록하기 위해 변경했다. 앱 전용 prisma.config.ts가 CLI URL과 프로젝트 환경변수 로딩을 맡고, 운영 이미지에도 포함한다. 기존 CommonJS 산출물·생성 경로는 prisma-client-js로 유지하며 런타임은 pg 어댑터를 쓴다. DB 모델·migration SQL은 변경하지 않았다.

API·seed·운영 관리 스크립트·통합 하네스와 Web/Admin/Mobile teardown이 같은 어댑터를 사용한다. schema는 ORM과 raw SQL의 search_path에 함께 전달하고 connection_limit은 풀 최대 연결 수로 옮겼다. pg의 단일 connectionTimeoutMillis에는 pool_timeout을 우선하고 connect_timeout을 기본값으로 사용한다. 운영 URL의 sslcert는 서버 CA로 읽어 인증서 검증을 유지한다. Prisma 7에서 제거된 --skip-generate와 migrate diff 플래그도 현재 안내·실행 경로에서 교체했다.

Node 24.18.0에서 API typecheck·build, 단위 164개, 격리 PostgreSQL/Supertest 통합 170개가 통과했다. Admin typecheck·변경 파일 lint·단위 21개, Web/Mobile typecheck·변경 파일 lint도 통과했다. codegen 후 SDK diff는 없다. Web/Admin/Mobile teardown은 실제 전용 DB에서 각각 새 스키마를 생성하고 제거되는지 확인했다. 종료 시 남은 gf_test_ 스키마가 0개임을 확인하고 소유권 가드를 거쳐 이번 Worktree의 테스트 DB를 종료했다. 최초 테스트 DB 초기화는 실행 환경의 locale 때문에 실패했고 LC_ALL=C LANG=C로 같은 실행을 통과했다. 이번 Worktree의 전용 55444 DB와 새 gf_test_ 스키마만 사용했으며 기존 개발 서버·DB는 변경하지 않았다. 브라우저 전체 E2E·컨테이너 빌드·실제 RDS TLS 연결·배포는 실행하지 않았다.

후속 검증: mutationOptions 정리(#59)가 반영된 develop(0d27c9d9)을 병합하고, 같은 위치에 추가된 두 구현 기록을 모두 보존해 문서 충돌을 해결했다. 병합 상태에서 Web·Admin typecheck·lint, Web 단위/UI 216개와 Admin 단위 21개, 변경 문서 Prettier 검사를 다시 통과했다.

## 2026-10-23 mutationOptions 직접 조립

사용자 지시에 따라 Web 26개·Admin 8개, 총 34개의 단순 useMutation 래퍼를 제거하고 12개 *.hook.ts 파일을 삭제했다. 기존 mutationOptions 팩토리를 public export해 화면과 기능 흐름의 호출부 32곳에서 useQueryClient·useNotify와 useMutation으로 직접 조립한다. options 팩토리의 mutationKey·REST IO·캐시 무효화·계정 전환 정책은 변경하지 않았다. 폼·읽음 관찰·재전송처럼 기능 흐름을 소유하는 훅은 같은 팩토리를 직접 사용한다.

Admin ESLint는 호출부의 useMutation을 허용하면서 mutationOptions 정의와 SDK 호출 경계를 유지한다. Web·Admin AGENTS와 앱·프로젝트 스킬, 아키텍처 안내도 전용 mutation 래퍼 없이 직접 조립하는 기준으로 맞췄다. 댓글 UI 테스트는 제거한 훅 대신 API 경계만 대체해 실제 options·QueryClient의 대기/실패/재시도·캐시 처리를 검증한다. 인증 다이얼로그 테스트도 실제 native-login options를 조립하고 보이는 로그인 방식과 폼의 책임을 확인한다.

Node 24에서 Web·Admin의 typecheck·lint, Web 단위/UI 216개와 Admin 단위 21개가 통과했다. Admin production build와 Web E2E용 production build도 통과했다. Chromium 브라우저 E2E는 Web 9개 파일의 28개(로그인·가입·폼 수정/삭제·댓글/답글·알림·도움됨·채팅·차단·3개 언어 게임 계정), Admin 5개(권한·문의 재시도·신고·인증·밴)를 통과했다. 테스트는 이 Worktree의 전용 DB 55444와 각 실행의 새 gf_test_ 스키마를 사용했다. 남은 테스트 스키마가 0개임을 확인하고 소유 테스트 DB를 종료했다. codegen SDK diff는 없고 기존 개발 DB·서버는 변경하지 않았다. 모든 브라우저 레인·실기기·실제 외부 OAuth·배포 검증은 포함하지 않는다.

## 2026-10-23 신고 목록 options 통합

Admin의 reportScopeOptions를 제거하고 reportOptions 하나가 상태별 조회와 전체 상태 무효화 키를 함께 정의하도록 합쳤다. 상태를 넘기면 기존 ['admin-reports', status]로 무한 목록을 조회하고, 생략하면 ['admin-reports']와 skipToken을 반환한다. 신고 검토·공개 상태 변경의 성공 처리는 reportOptions()로 모든 상태 목록을 무효화한다. 상태를 넘긴 호출은 오버로드로 조회 함수 타입을 좁혀 useSuspenseInfiniteQuery의 타입 추론을 유지한다.

Node 24에서 immutable install, Admin typecheck·lint·단위 21개·production build, Chromium의 관리자 문의·신고 검토 E2E 1개가 통과했다. 실제 신고 검토 뒤 기본 대기 목록에서 사라지고 검토 완료 목록에 표시되는 흐름을 확인했다. codegen SDK diff는 없고, 이번 Worktree의 전용 DB 55444와 새 gf_test_admin_ 스키마만 사용했다. 남은 테스트 스키마 0개와 소유 테스트 DB 종료를 확인했다. 전체 브라우저 레인·외부 OAuth·배포 검증은 실행하지 않았다.

## 페이지 소유 Topbar·가이드와 설정 전환 개선 (2026-10-22)

`@topbar` 병렬 라우트와 헤더 전용 공개 export를 제거했다. 각 `_pages` 화면이 `CommunityPage`에 전용 Topbar와 본문을 함께 선언한다. 문의 본문·운영 문의 버튼·Topbar는 기존 안내 페이지를 소유하는 info slice로 모았다. `CommunityShell`은 채팅 연결·읽지 않은 개수·공통 하단 메뉴를 유지하고, 페이지가 바뀌어도 이전 경로를 유지하는 `RouteViewportProvider`로 스크롤 복귀와 전환 효과를 보존한다. 대화 목록과 상세는 기존 messages layout의 수명을 유지한다.

가이드의 `← 홈` 링크를 제거하고 소개·네 개의 목차 링크·기능별 카드로 구성했다. 좁은 화면은 한 열, 데스크톱은 두 열로 읽을 수 있고 목차는 고정 헤더 아래의 본문으로 이동한다. 기존 기능별 제목 링크, 가이드에서 연 자식 화면의 돌아가기, 루트 탭의 기록 교체와 한국어·영어·일본어 본문을 유지한다. 가이드·약관·개인정보·문의는 첫 문서를 Suspense fallback 없이 완성해 JavaScript가 없어도 읽힌다. 게시글도 첫 문서는 실제 게시판 경로를 완성하고 클라이언트 이동에서만 헤더 placeholder를 사용한다. 동적 id는 비동기 헤더·본문에서 읽어 아직 방문하지 않은 게시글의 프리패치를 막지 않는다.

Quill이 한글 IME 조합 중 문서 갱신을 모아서 처리해 첫 글자가 보여도 `ql-blank`가 남는 문제를 수정했다. 조합 중에는 placeholder만 숨기고, 조합 종료 후 Quill의 microtask 갱신 뒤 표시 제어를 해제한다. 편집기 모델을 조합 중 강제 갱신하지 않는다. 실제 Chromium에서 조합 중 첫 자모, 조합 완료, 전체 삭제, 조합 취소와 분류 전환 후 한 글자 초안을 검증했다.

언어 변경은 페이지를 덮던 로딩 화면 대신 작은 진행 표시를 사용한다. Provider의 진행 상태를 헤더와 설정 선택기가 공유하며 `aria-busy`와 입력 잠금으로 중복 전환을 막는다. 현재 언어와 같은 언어의 저장 방식만 바꾸면 불필요한 라우트 이동을 생략한다. 기존 경로·필터·해시·스크롤 보존을 유지한다. 화면 모드는 선택지 아이콘과 적용 알림을 제공하고 색상을 180ms로 전환한다. 동일 항목을 다시 선택하면 알림을 반복하지 않으며 동작 줄이기 설정에서는 색상 전환을 생략한다.

검증 결과:

- `yarn workspace @game-feedback/web test`: 47개 파일, 192개 단위/UI 테스트 통과.
- `yarn workspace @game-feedback/web typecheck`, `lint`: 통과. 변경 파일 Prettier와 `git diff --check` 통과.
- `test:e2e`의 guide·editor-placeholder·compose·language·theme·navigation·error-boundary·seo·motion 30개, login·onboarding 7개가 통과했다. detail-profile·localized-info와 관련 guide·language·navigation 20개도 통과했다. 중복을 제외한 기본 Playwright 검증은 43개다.
- `yarn workspace @game-feedback/web test:prefetch`: production build/start에서 12개 통과. 피드·다섯 게시판의 제목과 컨트롤, 가이드 프리패치, 미방문 상세의 헤더/본문 streaming과 no-JS 공개 문서를 확인했다. 기본 검증과 합쳐 서로 다른 브라우저 사양 55개가 통과했다.
- 320px 모바일과 1440px 데스크톱 가이드 스크린샷을 직접 확인했다. 영어·일본어 모바일 및 JavaScript 없는 안내·정책 본문, 메타데이터·canonical도 검증했다.
- 프로젝트 `codegen`을 실행해 Prisma·계약·OpenAPI·SDK 준비를 완료했고 추적된 계약·SDK 생성 코드와 의존성 변경은 없다.

검증은 55444의 전용 테스트 DB와 실행별 `gf_test_` 스키마, 별도 3301/4301·3353/4353 서버를 사용했다. 실행 중인 개발 서버와 개발 DB는 변경하지 않았다. 물리 기기의 IME/WebView, 실제 외부 OAuth와 공개 배포는 수행하지 않았다.

## 모바일 이용 가이드 레이아웃 보정 (2026-10-22)

모바일에서는 소개 카드의 테두리·장식 아이콘·중복 안쪽 여백을 없애고 안내 문장을 줄였다. 목차는 320px에서도 `게시글 찾기 / 글쓰기 / 채팅 / 프로필`의 2열 버튼으로 표시한다. 스크린 리더에는 기존의 상세한 제목을 유지한다. 본문은 카드 대신 구분선으로 나누고 화면 너비를 활용하며, 제목·문단 간격과 한국어 줄바꿈을 정리했다. 목차 이동은 전역 scroll-padding과 겹치던 scroll-margin을 줄여 고정 헤더 아래에 내용을 표시한다. 기존 본문·기능 이동·44px 제목 링크를 유지하며 소개와 이동 안내는 세 언어로 제공한다.

검증은 사용자가 보고 있는 3301/4301 미리보기와 다른 3353/4353 서버 및 별도 gf_test_ 스키마에서 실행했다. 기존 prefetch 설정을 상속한 임시 `.e2e-build/mobile-guide.config.ts`로 guide·localized-info 사양을 실행해 가이드 6개와 no-JS 현지화 2개가 통과했다. 테스트의 Origin과 새 브라우저 context는 실행 설정의 baseURL을 사용하도록 수정했다. 320/393px 첫 화면에서 첫 본문 제목이 보이고 목차를 누르면 원하는 영역으로 이동하는 것을 검증했으며, 320/393/1440px 라이트·다크 및 영어·일본어 스크린샷을 생성하고 모바일 캡처를 직접 확인했다.

Web typecheck·lint, i18n 단위 테스트 12개, 변경 파일 Prettier와 diff 검사를 통과했다. 연결 가능한 대화형 브라우저가 없어 프로젝트 Playwright가 생성한 캡처로 시각 검증했다. 기존 로컬 미리보기는 유지하고 변경 사항을 즉시 반영했다. 테스트 DB는 해당 미리보기가 사용 중이므로 중지하지 않았다.

## 안내 문서·문의와 공유 배포 검증 보정 (2026-10-25)

이용 가이드는 약관·개인정보 처리방침과 같은 info-card 본문과 제목·문단 스타일로 통일했다. 기존 9개 설명과 게시판 안내, 세 언어, 홈 화살표와 목차가 없는 구성을 유지한다. 푸터와 문의 문서에 운영 및 광고 문의 이메일을 표시하고, 관리자 채팅 문의 컴포넌트의 상하 여백을 각각 24px로 맞췄다. 하단 주 메뉴는 홈·채팅·프로필 세 개이며 가이드는 프로필 안내와 푸터에서 연다.

공유 인스턴스 smoke의 세션 격리 검사는 응답 상태 200을 확인한 뒤 user=null을 검증한다. 오류 응답을 정상 세션처럼 읽어 undefined 비교로 원인을 가리던 동작을 수정했다. 429일 때만 유효한 Retry-After를 한 번 기다리고 재확인하며, 반복 제한과 서버 오류는 응답 본문과 함께 실패한다. 기존 CI 로그는 해당 요청의 HTTP 상태를 남기지 않았으므로 당시 오류가 429였다고 단정하지 않는다. 이미 폐기된 multipart 미디어 업로드 호출은 서명 발급 → S3 직접 업로드 → 완료 API로 교체했다.

Next가 보존한 이전 화면까지 중복 선택하던 community E2E 선택자는 보이는 화면으로 제한하고 인증 요청의 Origin은 실행 중인 baseURL을 사용한다. footer 검사는 가이드 링크와 이메일을 포함하며, 안내 링크·문의 여백·화면 넘침과 하단 메뉴 간섭을 확인한다.

검증: API 단위 167개, Web 단위/UI 220개, 공유 배포 설정 사양 12개, production build/start에서 community·footer·guide 브라우저 사양 11개 통과. Web typecheck와 프로젝트 lint 통과. 한국어 320px·영어 393px 가이드 캡처를 직접 확인했다. Terraform 형식·backend 비활성 init·validate와 mock plan 11개가 통과했고, 현재 host 네트워크 스크립트에 맞게 IMDS hop limit 설명을 수정했다. AWS 계정별 준비 값과 리전의 RDS 엔진/클래스 가용성 조회 명령은 deploy/shared-instance/terraform/README.md에 기록했다.

로컬 Docker 실행 환경이 없어 전체 공유 인스턴스 smoke는 이 환경에서 재실행하지 못했다. 실제 AWS plan/apply 및 배포는 실행하지 않았다. 로컬 미리보기는 기존 사용자 개발 서버와 별도 포트·DB 스키마에서 실행한다.

## 2026-10-25 채팅 알림·RN 푸시 및 develop 통합

채팅은 새 메시지마다 상대방 ChatNotification을 본문 트랜잭션에 한 번 기록하고 게시물 알림과 같은 목록·커서·미읽음 합계로 조회한다. 실제 대화 읽기와 기록 삭제는 해당 경계까지 알림에도 반영한다. 알림함 모두 읽음은 실제 메시지의 읽음 여부를 조작하지 않는다. SSE 수신은 현재 사용자의 대화·알림 조회를 함께 갱신하며 차단·숨김·밴·관리자 문의 규칙을 공통 ChatAccessService로 유지한다.

RN에는 expo-notifications와 물리 기기/EAS project ID가 있는 경우에만 푸시 기능을 광고한다. 기기 등록은 쿠키 세션에 묶고 로그아웃·세션 교체·탈퇴·기기 계정 변경 시 이전 전송을 제거한다. 알림·기기별 큐를 같은 트랜잭션에 쓰고 발송 직전 읽음·세션·권한을 다시 확인한다. 알림함에서만 OS 권한을 요청하고 OS 배지, foreground 무효화, 준비 전 탭 보관, 안전한 알림함 이동을 연결했다. 서버 기능이 꺼져 있으면 설정 완료로 표시하지 않는다. [공통 전송 정책과 실제 기기 설정](../../../packages/toolkit/src/push-notifications/README.md)을 따른다. 공통 패키지는 두 API의 Expo 부분 성공·재시도·영수증 처리를 공유하기 위해 추가했으며 서비스별 인증·DB는 분리했다.

최신 develop cf62aaac(#67~#70 포함)을 merge했다. 가입용 GameProfileLookup과 가입 후 등록용 BottomSheet를 보존하고 게임 프로필·닉네임·약관 가입 흐름을 유지했다. 중복으로 들어온 알림·테마 변경을 기존 develop 위에 통합하고, 탈퇴의 Session 삭제가 새 기기·큐에도 cascade되는지 확인했다. 원격 develop을 덮어쓰거나 강제 push하지 않는다.

병합 후 API 실제 DB 통합 189개, Web 단위 223개, Mobile unit/UI 89개, Android Chromium/iOS WebKit 실제 native host E2E 전체 42개가 통과했다. 다른 서비스의 개발 DB·서버는 수정하지 않고 55444의 격리 스키마와 별도 E2E 포트를 사용했다. 공통 전송 패키지 8개와 migration-check 70개, SDK 71개도 통과했다. 기존 앱에서 사라진 헤더 언어 선택기는 설정 화면으로 테스트를 옮기고, 게시판 칩은 보이는 메뉴를 선택해 새 레이아웃과 일치시켰다.

실제 Expo/EAS 프로젝트·FCM/APNs 자격 증명과 실기기 수신 검증은 남아 있다. API의 PUSH_NOTIFICATIONS_ENABLED 기본값은 false이며 운영자 설정 후 켠다. 공개 Supercell 태그 조회는 소유권 인증으로 바꾸지 않는다. 사용자가 지정한 로컬 토큰의 공백은 제거했지만 서명된 본문이 손상되어 실제 #QLLLPR89G 조회는 403 accessDenied였고 실제 계정 연결을 저장하지 않았다. 유효한 원본 키가 있어야 실제 제공자 검증을 진행할 수 있다.

## 2026-10-25 게시판 메뉴 hydration 오류 수정

홈에서 GameBoardNavigation의 서버 HTML은 비어 있지만, 먼저 hydration된 LeftSidebar의 게임 목록 요청이 완료되면 다른 Suspense 경계의 첫 클라이언트 렌더에 메뉴가 추가되는 오류를 로컬에서 재현했다. 쿠키 없는 getPublicCategories 조회를 서버 부트스트랩에 포함하고 Providers의 요청별 QueryClient를 만들 때 세션과 함께 게임 목록을 초기화한다. 서버와 브라우저가 같은 공개 snapshot으로 메뉴를 시작하며 기존 query options와 재조회 정책을 유지한다.

회귀 테스트는 JavaScript 없이 받은 서버 HTML에 홈·다섯 게시판의 메뉴와 선택 링크가 포함되는지 확인하고, 390/1280px에서 한국어·영어·일본어 첫 진입·게시판 이동·새로고침의 hydration 오류를 감시한다. Next가 보내는 Suspense 스트리밍 조각도 서버 HTML 검사에 포함한다. 수정 전 메뉴 누락으로 실패하는 것을 확인했고 수정 후 production build/start의 회귀 테스트 4개와 게시판·피드·가이드 프리패치 8개, Web 단위/UI 223개, typecheck·lint가 통과했다. 브라우저 테스트는 3304/4304와 55444의 실행별 gf_test_ 스키마를 사용했다. 실제 외부 제공자와 공개 배포 검증은 수행하지 않았다.

## 2026-10-25 X OAuth 제거

로그인 제공자를 Google·카카오·Discord로 제한했다. X 제공자 어댑터와 설정·환경변수·배포 Compose 항목을 제거하고, API의 SocialProviderSchema와 앱의 LoginProviderSchema에서 X를 제외했다. `/api/auth/social/x`와 해당 콜백은 제공자 검증 단계에서 400으로 거부하며 OAuth 시도를 생성하지 않는다. 세션의 제공자 목록과 재생성한 OpenAPI/SDK에도 세 제공자만 포함한다. 웹·앱 공통 로그인 폼의 X 버튼, 로고, 색상, 번역과 약관의 로그인 방법 설명도 정리했다. 기존 계정·세션 데이터를 삭제하거나 DB 스키마를 변경하지 않았다.

검증: Node 24에서 API 단위 174개와 인증 통합 39개, Web 단위/UI 223개, Mobile 단위/UI 88개, Bridge 15개, SDK 71개, Admin 단위 21개가 통과했다. API·Web·Mobile·Bridge·Admin 타입 검사와 프로젝트/API·Web·Mobile·Admin lint가 통과했다. 계약은 codegen으로 생성했고 생성 코드를 직접 수정하지 않았다. 제거한 X 경로의 거부, 세 제공자 세션 응답, 앱의 X 인증 메시지 거부와 기존 제공자 로그인을 검증했다.

웹 E2E 스킬에 따라 별도 3353/4353과 `.next/remove-x-e2e`의 production build/start에서 로그인·hover 브라우저 사양 5개가 통과했다. 모바일·데스크톱의 세 로그인 버튼, 로고·색상, 언어 전환·원래 목적지 복귀·사용 불가능한 제공자 처리를 확인하고 393px 로그인 캡처를 직접 검토했다. 기존 3301/4301 서버는 변경하지 않았다.

DB는 같은 Game Feedback의 55444 테스트 DB와 실행별 gf_test_ 스키마만 사용했다. API 통합 테스트는 다른 worktree가 소유한 DB의 자동 기동만 생략한 임시 실행기로 가짜 제공자 환경과 URL 가드를 유지했다. 테스트가 만든 스키마만 정리했고 기존 DB 프로세스는 유지했다. 실제 외부 제공자 인증·실기기·배포는 수행하지 않았다.

# 2026-10-25 관리자 전용 ID·비밀번호와 CI 재배포 검사 수정

관리자는 일반 이용자를 승격하지 않고 AdminAccount와 문의용 내부 User를 CLI로 함께 생성한다. 비밀번호는 salt를 포함한 scrypt 해시, 세션은 AdminSession의 토큰 해시로 저장한다. Admin은 ID·비밀번호 로그인으로 통일하고 기본 연결을 운영 SSH 터널 14300으로 맞췄다. 테스트 로그인 버튼과 Vite Bearer 토큰 모드를 제거했다. 생성·비밀번호 변경은 stdin으로만 입력받는 신뢰된 CLI이며 변경 시 모든 관리자 세션을 폐기한다. 로그인 중 비밀번호 변경 경쟁도 행 잠금과 해시 재확인으로 막는다.

관리자 쿠키는 HttpOnly·SameSite=Strict·Path=/api/admin·1시간이며 공개 사용자 세션을 바꾸지 않는다. 공개 API는 관리자 쿠키/전용 계정의 일반 Session을 인증에 사용하지 않는다. 공개 Caddy와 Web 프록시는 관리자 API를 404로 막고 Admin의 loopback 프록시만 사용한다. 문의 메시지·첨부 자료는 담당 관리자 확인을 거치는 비공개 API로 처리한다. 별도 계정을 만들면 VERIFICATION 신청을 담당 관리자 문의함으로 보낸다. 일반 프로필/새 일반 대화에서는 관리자 내부 계정을 노출하지 않는다. 새 migration은 전용 테이블만 추가한다.

CI에서 제거된 mediaUpload.mode를 기대하던 shared smoke를 S3 양식 계약에 맞추고, 공개 미디어/채팅 검증은 일반 사용자 세션으로 수행한다. 공유 배포는 Web의 drain 파일 → Caddy 활성 health 제외 → SIGTERM → API/Web 교체 순서로 바꿨다. 두 서비스가 같은 호스트 프록시/배포 스크립트를 사용하므로 공용 deploy 파일과 안내를 함께 수정했다. Photo Contest의 WebKit 캡처는 viewport를 CSS 해상도로 저장하며 기존 overflow 검사를 유지한다. Playwright production build의 NODE_ENV도 명시한다.

검증: API unit 174개, 새 관리자 통합 4개(전용 migration·로그인·쿠키 분리·문의/첨부·인증·폐기), 관련 탈퇴 통합 7개, SDK 72개, Admin unit 19개와 실제 ID·비밀번호를 쓰는 브라우저 E2E 5개가 통과했다. 최신 develop 병합 후 API unit 167개와 전체 integration 197개, Admin 브라우저 5개·production build, PC 반응형 3개를 재검증해 모두 통과했다. Admin production build 최대 JS 청크는 488.45 kB이며 타입·lint를 확인했다. 실제 Caddy/GF production build 교체 중 28개 요청 오류 0건, 배포 스크립트 unit 8개, PC responsive Chromium/WebKit/desktop 3개가 통과했다. GF 모바일은 320·393·430·760px 홈/가이드/설정에서 Chromium/WebKit 8개 검사를 통과해 좌우 대칭과 가로 넘침이 없음을 확인했다. 테스트는 55444/55434의 격리 스키마를 사용했다. Docker 공유 배포 전체 검사는 GitHub CI에서 확인하며 실제 운영 배포는 실행하지 않았다.

## 2026-10-25 로컬 환경변수 정리와 실제 S3 재검증

로컬 `.env.example`에서 실행기가 정하는 포트·테스트 DB·캐시 자격 증명, 기본값과 같은 OAuth callback·대표 origin, 비어 있는 운영 앱 링크 항목을 제거했다. 실제 `.env`도 키 목록을 맞췄으며 기존 자격 증명과 설정값을 보존하고 변경 전 파일을 Git 제외 경로에 백업했다. API_ORIGIN·제공자별 REDIRECT_URI 별칭 참조를 제거해 API 주소는 GAME_FEEDBACK_API_URL, OAuth callback은 WEB_ORIGIN에서만 정한다. SEO와 운영 시작 검증도 WEB_ORIGIN을 사용하며 별도 GAME_FEEDBACK_SITE_URL을 없앴다.

Dockerfile과 Compose에서 기본 false인 데모·테스트 인증 플래그의 주입을 제거했다. 운영 검증은 누락을 false로 처리하되 true를 계속 거부한다. Dockerfile의 GF_TEST_AUTH_ENABLED ENV 선언을 없애 해당 이름의 SecretsUsedInArgOrEnv 경고 원인을 제거했다. Docker 실행기가 없는 환경이라 BuildKit 검사는 실행하지 않았다.

실제 AWS jingeon-side-project/game-feedback/local 아래 실행별 smoke 경로에서 게시물 PNG·MP4, 프로필 JPEG, 채팅 PNG·MP4의 발급 → presigned POST 204 → HEAD·Range 서명 검사·조건부 복사 완료 200 → 게시/전송 → 서명 GET 200을 확인했다. 원본 바이트 일치·Range 206·동일 완료 재시도·정확한 크기 정책·Origin·소유권 검사도 통과했다. localhost:3300의 CORS preflight와 실제 POST·GET 응답 허용 헤더를 확인했다. 새 gf_test_s3_smoke_ 스키마에 migration을 실행했고, 마지막 실행의 S3 객체 10개는 DELETE 204로, DB 스키마는 DROP으로 정리했다. 브라우저 연결이 없어 이번 확인은 HTTP/API 기준이며 화면 조작 검증으로 기록하지 않는다.

사용자가 콘솔에서 확인할 수 있도록 upload-verification/2026-10-25T11-41-50-004Z.png 한 개(525바이트)는 별도로 남겼다. presigned POST 204·HEAD 200·서명 GET 200과 원본 일치를 다시 확인했다. 키·쿠키·서명 URL은 출력하거나 커밋하지 않았다. 개발 서버·개발 DB·IAM·Terraform·버킷 설정은 변경하지 않았다.

검증: API unit 173개, Web API 주소·Next rewrite·SEO 단위 25개가 통과했다. API 타입 검사와 검증용 빌드도 통과했다. 그 밖의 미정의 변수 제거 범위는 운영·모바일 예제와 실행기 주입 변수를 포함할지 사용자에게 확인 중이다.

## 2026-10-25 문의 채팅에서 프로필 인증 처리

문의 대화 상단에 게임 태그와 인증 상태, 인증·미인증 선택을 추가했다. 사용자 관리와 같은 인증 컨트롤과 mutation 정책을 재사용하며, 담당 관리자 권한/감사 기록/공개 캐시 무효화는 기존 API가 처리한다. 성공하면 사용자 정보와 문의 목록을 갱신하고 실패하면 기존 상태를 유지한다. Admin E2E에서 실패→재시도→인증→미인증과 일반 사용자 세션/문의 목록의 즉시 반영을 확인했다. Admin unit 19개·E2E 5개·타입·lint·production build가 통과했다.

공개 Web의 관리자 API 차단에 맞춰 기존 웹 E2E의 관리자 데이터 준비·조치를 격리 API에 직접 연결했다. 네 사양이 공유하는 URL helper를 두고 공개 관리자 경로 404 검사는 유지했다. 테스트 전용 일반 관리자 role fixture는 test 실행기에서만 허용하며 실제 Admin은 전용 ID·비밀번호 세션으로 검증한다. 별도 3302/4302와 격리 DB에서 캐시 무효화·프로필 인증/신고/제재·게임 생성·게시판 필터 브라우저 사양 5개가 통과했다.
