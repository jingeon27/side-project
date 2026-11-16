# 모노레포와 로컬 GPU 기반 배포 계획

## 기존 모노레포와 별도 레포 중 무엇을 선택할까

### Takeaway

기존 모노레포의 `projects/ai-studio`로 시작한다. 코드 저장소는 함께 쓰되 개인정보 저장소·DB·모델 프로세스·GPU 컴퓨트와 배포는 다른 서비스에서 분리한다. 이번 작업에서는 설계 문서만 작성하며 프로젝트를 생성하거나 배포하지 않는다.

### Cited Findings

- 루트 workspace glob은 `projects/*`, `projects/*/apps/*`, `projects/*/packages/*`, `packages/*`를 포함한다. 앱별 독립 관리에 이미 적합하다. Node 24/Yarn 4.17.0, 공통 설정·디자인 시스템·toolkit과 Next.js/NestJS 서비스가 존재한다. [루트 package.json](/Users/gimjingeon/Desktop/safedoc/side-project/package.json), [README](/Users/gimjingeon/Desktop/safedoc/side-project/README.md)
- 공통 코드는 실제 여러 프로젝트가 사용할 때만 루트 packages로 올리고, DB·환경변수·스토리지·Prisma client는 프로젝트별 격리한다. 테스트 설정·러너·테스트는 앱 소유다. [AGENTS.md](/Users/gimjingeon/Desktop/safedoc/side-project/AGENTS.md)
- 현재 서비스 배포는 두 서비스를 EC2+Caddy+PostgreSQL과 비공개 S3로 운영하는 구조다. 문서는 작은 2GiB EC2 시작 옵션을 설명하며, 한 EC2 장애 시 두 서비스와 DB가 함께 중단된다고 명시한다. GPU 추론 실행 기반으로 확인된 것이 아니다. [배포 README](/Users/gimjingeon/Desktop/safedoc/side-project/deploy/shared-instance/README.md)
- 현재 `Services` workflow의 paths와 선택 스크립트의 `TService`, `selectServices`, `requiredChecks`는 `game-feedback`, `photo-contest` 두 개를 열거한다. 새 프로젝트를 추가해도 전용 검증·배포가 자동 추가되지 않는다. [Services workflow](/Users/gimjingeon/Desktop/safedoc/side-project/.github/workflows/services.yml:10), [서비스 선택 스크립트](/Users/gimjingeon/Desktop/safedoc/side-project/deploy/shared-instance/scripts/service-ci.ts:6)

### Inferences

- 새 Python 런타임은 레포를 갈라야 할 이유가 아니다. 다음 구조를 권장한다. 실제 이름은 임시명이다.

```text
projects/ai-studio/
  apps/web/                 Next.js: 대화·소설·영상 작업 화면
  apps/api/                 NestJS: 인증·권한·프로젝트·작업·카카오 어댑터
  apps/inference-worker/    Python: 모델 실행·파일 처리, pyproject/lock/pytest 소유
  packages/contracts/      API와 worker 사이 JSON Schema/OpenAPI 등 계약
  prompts/                 프롬프트와 페르소나 스키마 버전
  evals/                   비식별·합성 평가 fixture만 저장, 러너는 앱 소유
  deploy/                  프로젝트 전용 컨테이너·배포 설정
  docs/                    제품 범위·데이터 흐름·운영·실험 결과
```

- TS 앱 이름은 `@ai-studio/web`, `@ai-studio/api`; 집계는 `@side/ai-studio`. Python 의존성은 Yarn에 섞지 않고 worker 소유 lockfile로 고정한다. Mac의 텍스트 추론은 네이티브 MLX/llama.cpp 등 지원을 검증한 런타임을 사용하고, Linux CUDA 컨테이너는 선택적인 별도 영상 GPU 환경에만 둔다. 계약의 `schema_version`, `job_type`, `model_revision`, `prompt_version`, `attempt_id`를 정한다. 지원하지 않는 계약은 실행 전 거부한다.
- 워커 모델 파일, 원문 카카오톡, 임베딩, DB 덤프, 생성 이미지·영상은 Git 밖의 전용 데이터 볼륨이나 암호화 저장소에 둔다. `.gitignore`뿐 아니라 pre-commit/CI fixture 검사를 둔다. 모델 파일은 내려받는 revision/checksum과 라이선스만 manifest로 추적한다.
- 별도 레포 전환 조건: 외부 협업자에게 AI 코드만 공개, 코드 접근권한 자체 분리, 독립 팀/제품으로 분리, 배포·라이선스 경계가 커짐. 모델 파일이 크거나 Python을 쓴다는 이유만으로 새 레포를 만들 필요는 없다.
- 기존 Services에 ai-studio 경로·선택·필수 검사·이미지 작업을 명시적으로 추가하고 Static analysis 정책을 유지한다. GPU 실모델 검증은 별도 격리 러너에서 필요한 변경만 수행하되 workflow는 현행 3개 안에서 관리한다. PR의 성공 SHA와 평가 모델 revision을 함께 기록한다.

### Gaps

- Git remote 접근권한, 향후 협업자, 라이선스 공개 계획은 확인하지 않았다. 별도 레포가 필요한 조직 요구가 있다면 위 결정을 재검토한다.
- 사용자 장비는 16인치 MacBook Pro M5 Pro, 통합 메모리 48GB로 확정됐다. 사용 인원·예산은 미정이며 개인 개발/소규모 비공개 파일럿으로 가정한다. 개발 서버·운영 계정·DB·환경변수 값은 읽거나 변경하지 않았다.

## cloud delivery를 어떤 구조로 만들까

### Takeaway

우선 로컬에서 기능과 품질을 확인한다. 이후 여러 기기/사용자가 필요해질 때 클라우드 웹·API와 로컬 GPU 워커를 연결하고, 승인된 생성 영상만 비공개 객체 저장소/CDN으로 전달한다. CDN, 클라우드 GPU, CI/CD는 서로 다른 역할이다.

### Cited Findings

- 기존 운영 지식은 AWS S3/EC2 및 GitHub Actions에 집중되어 있다. 운영 배포는 main에서, 검증·이미지 게시·배포·공개 URL 응답은 별도 상태로 확인한다. [루트 README](/Users/gimjingeon/Desktop/safedoc/side-project/README.md), [배포 README](/Users/gimjingeon/Desktop/safedoc/side-project/deploy/shared-instance/README.md)
- CloudFront는 signed URL 또는 signed cookie로 만료를 포함한 접근 제한을 제공하고, S3 OAC로 origin을 우회한 직접 접근을 제한할 수 있다. [AWS CloudFront 비공개 콘텐츠](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-overview.html)
- 단일 파일에는 signed URL, 여러 HLS 영상 파일에는 signed cookie가 적합한 사용 사례로 안내된다. [AWS signed URL과 cookie 선택](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-choosing-signed-urls-cookies.html)
- BullMQ 공식 문서는 재시도해도 최종 상태가 동일하게 되도록 작업을 설계하라고 설명한다. 실행 중 lock 갱신이 끊기면 작업이 재대기하거나 실패할 수 있으므로 중복 실행에 대비해야 한다. 이 원칙은 구현할 작업 큐에도 적용할 설계 근거다. [Idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs), [Stalled jobs](https://docs.bullmq.io/guide/workers/stalled-jobs)
- 현재 API 소스에는 DB 기반 push delivery 작업이 있으나 범용 GPU 작업용 BullMQ/Redis 기반을 확인하지 못했다. [푸시 서비스](/Users/gimjingeon/Desktop/safedoc/side-project/projects/game-feedback/apps/api/src/push/push.service.ts)

### Inferences

- 사용자가 영상 생성·편집과 웹 서비스 클라우드 배포·영상 CDN 전달이라는 뜻을 확인했다. 클라우드 배포와 결과 전달을 설계하고 CI/CD는 이를 반복 가능하게 만드는 별도 작업으로 설명한다.
- 1단계 개인용: 로컬 웹/API + 전용 로컬 PostgreSQL + 전용 파일 볼륨 + Mac 네이티브 Qwen 텍스트 워커. Mac에서 영상 CUDA 모델이 동작하거나 실용적 속도를 낸다고 가정하지 않는다. 우선 대본·스토리보드·기존 영상 조립/편집을 만들고 실제 영상 생성은 Mac 지원/속도를 실측한 뒤 로컬 또는 선택적 클라우드 GPU worker로 확정한다. 개인 카카오 원문·프로필·임베딩은 전부 장비 안에 둔다. 필요한 모델 설치 이후 네트워크 송신 테스트로 로컬 모드를 검증하고 분석 SDK 키를 비워 전송을 생략한다.
- 2단계 하이브리드: 웹/인증/API/작업 상태는 클라우드, 추론은 로컬 GPU. 작업 생성→DB durable job 저장→로컬 worker의 인증된 HTTPS outbound pull→실행/진행 상태 반환→결과 저장→사용자 확인 흐름을 사용한다. 모델의 Ollama/vLLM 등의 포트를 인터넷에 공개하지 않는다. 클라우드 API도 임의 shell/Python 코드를 워커에 전달하지 못하고 허용된 job schema만 보낸다.
- 최소 큐는 프로젝트 전용 PostgreSQL 작업 테이블과 API의 원자적 claim·lease·heartbeat·attempt fencing으로 시작한다. 현재 저장소에 없는 Redis/분산 플랫폼은 당장 추가하지 않는다. 동시 worker/지연 작업/관측 요구가 커져 큐 기능 관리 부담이 확인되면 검증된 큐 라이브러리로 교체한다. 이 최소안도 복구 검증을 통과해야 공개한다.
- API가 job/auth/취소/최종 상태의 소유자, worker가 실행 중 메모리·모델 프로세스·임시 파일 정리의 소유자다. `queued/running/succeeded/failed/cancel_requested/cancelled`를 구분한다. worker heartbeat 중단→lease 만료→제한 재시도; 이전 attempt의 늦은 성공은 fenced token으로 거부. `(job_id, step)` 단위 결과 저장을 멱등화해 중복 공개/과금·중복 영상 생성 낭비를 제한한다. 완전한 exactly once 추론은 약속하지 않는다.
- 개인 메시지 원문이나 프롬프트가 cloud API/queue/log를 지나면 '완전 로컬'이 아니다. 원문은 로컬 import로 처리하고 사용자가 검토·수정한 최소 페르소나 설정만 선택적으로 동기화하는 모드와, 클라우드가 대화/프로필도 처리하는 모드를 분리한다. 후자에는 명시적인 데이터 위치·보관·동의 정책이 필요하다. TLS만으로 클라우드 서버도 읽을 수 없는 E2EE라고 설명하면 안 된다.
- M5 Pro의 48GB는 GPU 전용 VRAM이 아니라 OS와 앱도 공유하는 총 메모리다. 모델 가중치뿐 아니라 KV cache·런타임·영상 버퍼 여유를 두고 메모리 압박/swap을 측정한다. 초기 무거운 작업 동시 실행 1개, 채팅과 영상 큐를 분리한다. 이미 실행 중인 영상은 보통 즉시 선점하기 어려우므로 '채팅 우선순위'만으로 응답성을 보장하지 않는다. 영상 작업 시간대 예약/모델 unload·reload/영상 중 채팅 대기 안내를 먼저 구현하고, 상시 응답성이 필요하면 GPU 분리나 동의된 별도 compute를 쓴다.
- 영상 전달: 짧은 MP4부터 시작해 private S3 + 짧은 유효기간 서명 URL. 시청량/파일 길이로 필요성이 생기면 CloudFront+OAC, 적응형 스트리밍 HLS와 signed cookie로 확장한다. 원문 카카오 로그/프로필 파일을 CDN에 배치하지 않는다. 삭제 시 객체 버전·캐시 무효화·미리보기·백업까지 추적하고 이미 다운로드된 파일은 회수 불가능함을 제품에 반영한다.
- 기존 작은 공유 EC2에 GPU 또는 대규모 미디어 변환을 추가하지 않는다. 웹/API를 같은 계정에 배포하더라도 리소스 한도와 장애 영향을 측정한 뒤 독립 배포 단위를 고른다. Mac이 절전되거나 노트북 덮개를 닫고 네트워크가 끊겨도 API가 worker offline과 작업 대기/실패·취소를 알려야 한다. 로컬 worker를 정상 종료/재개 가능한 서비스로 관리하고 절전 해제 후 stale attempt가 결과를 덮어쓰지 못하게 한다. 유료 상시 서비스라면 집 회선·전원·발열·드라이버 업데이트가 가용성 경계가 된다.
- 비용은 하드웨어 감가·전력·냉각·스토리지·백업·네트워크·운영시간·영상 재시도 비용을 합산한다. 클라우드 GPU는 가동시간×단가와 cold start/모델 다운로드/egress까지 비교한다. 실측 없이 월 비용/초당 토큰/동시 사용자 수를 확정하지 않는다.

### 판단에 필요한 기초 지식

사용자가 원하는 것은 긴 운영 체크리스트가 아니라 스스로 선택할 수 있는 설명이다. 최종 보고서에서는 위 구현 세부를 부록 수준으로 줄이고 아래 관계를 먼저 설명한다.

| 개념             | 쉽게 말하면                                  | 이번 작업에서의 판단 기준                                                                                                 |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 모노레포         | 여러 제품의 코드를 한 Git 저장소에서 관리    | 코드·설정·UI를 함께 관리할 이유가 있으므로 기존 레포 사용. 서버도 함께 써야 한다는 뜻은 아님                              |
| 로컬 추론        | 모델이 내 Mac에서 답을 만드는 것             | 개인정보가 장비 밖으로 나가지 않는 흐름을 직접 설계해야 함. 로컬 모델이어도 웹/로그 서버에 원문을 보내면 전부 로컬은 아님 |
| 클라우드 웹/API  | 브라우저에서 접속하는 화면과 요청 접수 창구  | 혼자 Mac에서 쓸 때 필수 아님. 외부 기기/사람이 접속해야 할 때 필요                                                        |
| worker           | 접수된 일을 실제로 계산하는 프로세스         | 텍스트는 Mac, 영상은 별도 GPU처럼 서로 다른 곳에서 돌릴 수 있음                                                           |
| queue            | 오래 걸리는 작업의 대기표                    | 영상처럼 즉시 끝나지 않는 요청, 재시도와 순서 관리에 필요. Mac이 잠들면 대기할 수 있음                                    |
| object storage   | 완성된 영상·이미지 같은 큰 파일 창고         | 원본/결과 파일 저장. DB에는 파일 위치와 권한·상태를 둠                                                                    |
| CDN              | 이미 만든 파일을 사용자 가까이서 전달하는 곳 | 영상 생성 속도를 높이지 않음. 시청자/트래픽 증가 때 효과를 판단하며 작은 개인용은 바로 필요하지 않음                      |
| cloud GPU        | 인터넷의 다른 GPU를 빌려 계산                | Mac 영상 생성이 느리거나 미지원일 때 대안. 데이터 업로드와 가동시간 비용이 생김                                           |
| CI/CD            | 코드를 검사하고 서버에 반영하는 절차         | 모델의 답변 품질 검증이나 영상 전달 자체를 대신하지 않음                                                                  |
| 통합 메모리 48GB | OS·CPU·GPU가 함께 쓰는 메모리 총량           | 모델 파일이 40GB 미만이라고 다 잘 돌지는 않음. 대화 길이·동시 작업·영상 버퍼가 추가 메모리를 사용                         |

추천은 개인용 로컬 텍스트부터 시작하고 실제로 외부 접속이 필요할 때 웹/API, 큰 파일 공유가 필요할 때 storage, 시청 규모가 커질 때 CDN을 더하는 순서다. 이것은 규모를 모르는 현재의 추천이며 고정된 필수 풀스택 목록이 아니다.

### Gaps

- M5 Pro 48GB는 확정됐지만 예산·실측·사용 인원 미정으로 추가 GPU 구매·클라우드 인스턴스 종류·정확한 월 운영비는 결정하지 못했다. 클라우드 API/GPU 성능·네트워크·CDN·카카오 연동은 이번에 실행 검증한 것이 아니다.
- 카카오 skill 응답 제한·callback 범위는 다른 연구자의 공식 문서 확인 결과를 적용한다. 긴 영상/소설 작업은 동기 응답 안에 완료하려 하지 말고 작업 접수와 웹 결과 페이지로 나누며, 허용된 channel 메시지 후속 동작만 사용한다.

## 무엇부터 구현하고 무엇을 검증할까

### Takeaway

텍스트 채팅과 소설에서 품질·메모리·복구를 먼저 확인하고, 동의한 대화 import→영상→cloud delivery→공식 채널 연동으로 확장한다. 모델의 성능과 개인정보 격리 검증이 공개 전 완료 조건이다.

### Cited Findings

- 사용자 흐름 추가 시 Amplitude 이벤트·속성 설계/구현/검증, 클릭과 서버 성공 구분, 키가 없을 때 전송 생략, 개인정보·검색어·초대 토큰 수집 금지가 요구된다. [AGENTS.md](/Users/gimjingeon/Desktop/safedoc/side-project/AGENTS.md)
- 기존 카탈로그에는 `ui_interaction`, `chat_started`, `message_sent`가 있으며, `message_sent`는 첨부 여부만 허용한다. 기존 카탈로그 패턴을 참조하고 신규 프로젝트 도메인 이벤트는 해당 앱 카탈로그에서 타입으로 관리한다. [analytics.catalog.ts](/Users/gimjingeon/Desktop/safedoc/side-project/projects/game-feedback/apps/web/src/shared/analytics/analytics.catalog.ts)
- 현재 관측 문서는 입력 원문·URL 쿼리·fragment를 전송하지 않고 서버 성공 뒤 집계하며, 실제 수집 요청과 서비스 내 재조회 성공을 구분한다. [관측 문서](/Users/gimjingeon/Desktop/safedoc/side-project/projects/game-feedback/docs/observability.md:83)

### Inferences

- 단계 0, 실행 기준: 사용 목적/장비/동시 사용자/개인정보 경계 확정; 두 후보 모델을 같은 한국어 대화·소설 fixture로 비교. TTFT(첫 토큰), tokens/s, peak VRAM, 요청별 p50/p95, 모델 로딩 시간과 긴 입력/오류를 기록한다. 목표값은 사용자 경험과 실제 장비 측정 뒤 고정한다.
- 단계 1, 텍스트 MVP: 직접 편집하는 페르소나 카드, 대화 기록/요약, 인물·세계관·장면→소설 초고→편집, 저장 실패 후 초안 보존. 가짜 추론기로 API 계약/취소/타임아웃/중복 재시도 테스트, 실모델은 소수 고정 평가 fixture. 실제 사람 데이터 없이 먼저 완성한다.
- 단계 2, 동의 기반 카카오 import: 파일 검증·화자 확인·마스킹·미리보기·삭제; 관측 가능한 말투/대화 선호 근거를 제시하고 사용자 수정으로 페르소나 확정. 엉뚱한 화자 매칭, prompt injection 문자열, 중복 import, 데이터 부족, 원문·벡터·프로필 삭제까지 평가한다.
- 단계 3, 영상: Mac에서 대본·스토리보드·FFmpeg 편집을 먼저, 생성 backend의 Mac 지원/속도 검증 후 짧은 클립 1개→검토→여러 클립 편집. Mac 생성 성능이 목표에 미달하면 별도 클라우드 GPU worker를 선택적으로 연결하되 업로드 데이터와 비용을 사용자에게 보여준다. 사용자가 대본·스토리보드·캐릭터/이미지 권한을 확인한 뒤 GPU 작업을 실행한다. 취소와 OOM, 중간 파일 정리, 재시도 때 완료 장면 재사용, 채팅 동시 부하를 검사한다.
- 단계 4, 하이브리드 비공개 운영: 계정/프로젝트 격리, 큐 lease 만료와 워커 재부팅, 중복 callback, 업로드 중단, 서명 만료, 외부 사용자의 파일 접근 차단, 삭제 후 복원으로 삭제 데이터가 부활하지 않는지 검사한다.
- 단계 5, 카카오 채널과 공개 운영: 공식 지원 범위 내 webhook/작업 접수와 결과 보기, rate limit/오프라인 표시/비용 상한/기능 플래그·롤백. 개인 카톡 계정의 임의 대화방 수집/자동 대리 발신은 MVP 범위에서 제외한다.
- 테스트 소유권: API Vitest+Supertest; 웹 Vitest와 실제 핵심 화면 흐름만 Playwright; Python worker pytest를 worker 안에 둔다. CPU CI는 fake inference로 권한·계약·재시도를 검증하고, 실 GPU 평가 결과는 장비·모델 revision·양자화·컨텍스트·설정·샘플을 함께 기록한다. 이 구분 없이 CI 성공을 모델 품질/운영 안정성으로 보고하지 않는다.
- 이벤트 예시(신규 카탈로그 제안): 클릭은 기존 `ui_interaction` 패턴; `conversation_import_succeeded`, `persona_saved`, `generation_job_succeeded`, `generation_job_failed`, `artifact_deleted`는 서버 상태 전이 성공 후 한 번만 기록. 속성은 `feature`, `input_source`(manual/kakao_export), `model_family`, `model_revision`, `duration_bucket`, `failure_code`, `client`. 원문 대화·프롬프트·소설 본문·추론 성격·실명·상대방 ID·파일명·서명 URL·토큰은 전송하지 않는다. strict local은 SDK 키 없이 생략한다.
- Amplitude 검증: 클릭만 발생했을 때 성공 이벤트 없음, 실제 성공 뒤 1회, 재시도/재연결 때 중복 없음, 키 누락 시 네트워크 0회, 금지 값/원문 marker가 전송 payload에 없는지. 실제 전송 확인이 필요할 때 합성 데이터로 시행하고 PR에 이벤트·속성·명령·결과를 기록한다.
- 이번 필수 결정: 모노레포 유지, 텍스트 우선 MVP, 원문 로컬 보관, 비동기 GPU 작업, 성공·실패 복구/삭제 검증. 후속: fine-tuning, 영상 고해상도/장편, 다중 GPU, Kubernetes, 상시 운영 SLA, 외부 모델 자동 fallback. 필요성을 확인하기 전 구축하지 않는다.

### Gaps

- 전체 일정은 작업 가능 시간과 장비에 크게 의존한다. 단계별 1~2주 같은 숫자는 작업 분량 추정일 뿐 실측이 아니므로 최종 문서에서는 가정과 함께 표기하거나 날짜 대신 완료 조건을 사용한다.
- 이번 조사에서 저장소 읽기와 공식 문서 확인만 수행했다. 코드 변경·테스트 실행·커밋·push·PR·배포는 수행하지 않았다.
