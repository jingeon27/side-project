# 블로그 전체 감사 — 2026-11-01

전체 31글, 한국어·영어 62본문을 읽고 현재 공개 코드와 연결한 근거, 예제, 이미지와 링크를 확인했다. 검토 원본은 `origin/develop`과 같은 HEAD `9576836125cfd91e977b417b50dd9b049e649cff`다. 이 읽기 감사에서는 기술 본문이나 제품 코드를 수정하지 않았다. 뒤의 후속 갱신 절에는 감사 뒤에 교체한 실제 제품 화면과 검증을 구분해 적었다.

평균 **18.39/20**, 중앙값 **19/20**, 글별 범위 **15–20/20**다. 실제 수정 후보는 **P2 5건, P3 1건**이다. 형식·링크 검사가 통과해도 코드 예제의 동작이 맞다는 뜻은 아니었다.

## 평가 기준

각 항목은 0–4점, 5항목 합계 20점이다.

| 점수 | 기준                                                                         |
| ---- | ---------------------------------------------------------------------------- |
| 0    | 필요한 근거·설명이 없거나 내용을 판단할 수 없음                              |
| 1    | 핵심 주장·흐름에 반복되는 중대한 결함                                        |
| 2    | 해당 항목에 확인된 실질 오류 또는 독해에 영향을 주는 누락                    |
| 3    | 대체로 정확하고 읽히지만, 검증 자료의 제약·맥락 부족·구성 개선점이 남음      |
| 4    | 현재 확인 가능한 근거와 주장의 범위가 맞고, 독자가 판단할 조건·한계가 충분함 |

근거 정확성은 코드와 공식 자료, 과거/현재·계획/구현/운영의 구분을 본다. 논리/서사는 문제와 선택, 확인한 결과가 이어지는지 본다. 문장 명료성은 구체성, 반복, 자연스러운 말투를 본다. 한영 정합은 문장 일치가 아니라 사실·제약·어조를 비교한다. 자료/링크는 필요한 버전·원문·그림 구분·alt·연결과 경로를 본다. 사내 경험을 독립 재측정하지 못한 경우 근거 점수는 보통 3점으로 두었으며, 이를 거짓 경험으로 판정하지 않았다.

## 확인된 수정 후보

### T1 · P2 · cross-domain-token-handoff

위치: [한국어 230행](https://github.com/jingeon27/side-project/blob/9576836125cfd91e977b417b50dd9b049e649cff/projects/blog/apps/web/content/posts/cross-domain-token-handoff/ko.mdx#L230), [영어 230행](https://github.com/jingeon27/side-project/blob/9576836125cfd91e977b417b50dd9b049e649cff/projects/blog/apps/web/content/posts/cross-domain-token-handoff/en.mdx#L230).

new URL(destination ?? '', '<http://x>')의 base 문자열이 무효이므로 정상 정산 목적지도 항상 catch의 /finance/overview로 바뀐다.

근거: Node24에서 /finance/settlements와 https://finance.example.net/finance/reports 모두 /finance/overview 반환.

최소 재현: `new URL('/finance/settlements', '<http://x>')` → `ERR_INVALID_URL`.

수정 방향: base를 'http://x'로 바꾸고 경로 유지 예시를 확인한다.

### T2 · P2 · puppeteer-event-lifecycle

위치: [한국어 87행](https://github.com/jingeon27/side-project/blob/9576836125cfd91e977b417b50dd9b049e649cff/projects/blog/apps/web/content/posts/puppeteer-event-lifecycle/ko.mdx#L87), [영어 87행](https://github.com/jingeon27/side-project/blob/9576836125cfd91e977b417b50dd9b049e649cff/projects/blog/apps/web/content/posts/puppeteer-event-lifecycle/en.mdx#L87).

consume(onRequest(request))에서 onRequest가 동기 throw하면 consume 진입 전에 이벤트 호출 스택으로 예외가 탈출한다. onResponse도 동일하다.

근거: 추출한 원문 함수를 fake EventEmitter Page로 실행: escapedEmit=callback exploded, 예외 직후 listenerCount 합 2, Promise는 원래 오류 대신 timeout으로 reject.

최소 재현: `onRequest`를 `() => { throw new Error('callback exploded'); }`로 넘기고 요청 이벤트를 emit한다. `consume` 호출 전에 동기 예외가 발생해 listener 2개가 남는다.

수정 방향: 콜백 호출 자체를 try 안으로 옮기거나 consume이 thunk를 받아 try 안에서 실행하도록 한다.

### T3 · P2 · nextjs-tanstack-query-ssr

위치: [한국어 91행](https://github.com/jingeon27/side-project/blob/9576836125cfd91e977b417b50dd9b049e649cff/projects/blog/apps/web/content/posts/nextjs-tanstack-query-ssr/ko.mdx#L91), [영어 91행](https://github.com/jingeon27/side-project/blob/9576836125cfd91e977b417b50dd9b049e649cff/projects/blog/apps/web/content/posts/nextjs-tanstack-query-ssr/en.mdx#L91).

서버·브라우저에서 공유한다는 categoryOptions의 queryFn이 process.env.API_URL에 의존한다. 기본 Next 설정에서 비 NEXT_PUBLIC 변수는 브라우저에 없으므로 클라이언트 재조회 URL이 잘못된다.

근거: Next 공식 환경변수 문서의 브라우저 번들 규칙 확인. 글에 next.config env 등의 별도 노출 설정이 없으므로 게시된 예제 자체의 누락으로 판정; 실제 업무 서비스 장애로 단정하지 않음.

수정 방향: 공개 API origin은 NEXT_PUBLIC 변수로 명시하거나 양 환경에서 안전한 요청 함수를 분리한다.

공식 자료: [Next.js 브라우저 환경변수](https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser)

### T4 · P2 · sentry-observability

위치: [한국어 295행](https://github.com/jingeon27/side-project/blob/9576836125cfd91e977b417b50dd9b049e649cff/projects/blog/apps/web/content/posts/sentry-observability/ko.mdx#L295), [영어 291행](https://github.com/jingeon27/side-project/blob/9576836125cfd91e977b417b50dd9b049e649cff/projects/blog/apps/web/content/posts/sentry-observability/en.mdx#L291).

sentryUrl: '<https://sentry.example.com/>'의 꺾쇠가 URL 문자열 안에 있어 유효한 서버 URL이 아니다.

근거: Node24 new URL으로 ERR_INVALID_URL 확인. 토큰을 넣어도 예제 설정 그대로는 정상 업로드 주소를 만들 수 없다.

최소 재현: `new URL('<https://sentry.example.com/>')` → `ERR_INVALID_URL`.

수정 방향: URL 문자열을 'https://sentry.example.com/'로 적는다.

### T5 · P3 · zod-assertion-boundaries

위치: [한국어 135행](https://github.com/jingeon27/side-project/blob/9576836125cfd91e977b417b50dd9b049e649cff/projects/blog/apps/web/content/posts/zod-assertion-boundaries/ko.mdx#L135), [영어 135행](https://github.com/jingeon27/side-project/blob/9576836125cfd91e977b417b50dd9b049e649cff/projects/blog/apps/web/content/posts/zod-assertion-boundaries/en.mdx#L135).

useZodForm<TSchema extends z.ZodType> 예제에 지원 버전 및 FieldValues 입력·출력 제약이 없다. 현재 설치된 Zod4/RHF에서는 이 선언만으로 컴파일되지 않는다.

근거: Zod4.6.7, RHF7.90.0, resolvers5.9.1에서 발췌한 코드와 schema-only Options로 TS2344(output unknown)·TS2769(resolver input unknown) 재현. 업무의 과거 버전은 확인하지 않았으므로 역사 구현 오류로 단정하지 않는다.

재현 조건: `TSchema extends z.ZodType`와 `useForm<z.infer<TSchema>>({ resolver: zodResolver(schema) })`를 위 의존성에서 strict TypeScript로 검사한다. `z.infer<TSchema>`의 output과 resolver input이 `unknown`일 수 있어 `FieldValues` 제약을 만족하지 않는다.

수정 방향: 실제 사용한 버전과 제네릭 조건을 밝히고 변환 스키마는 z.input/z.output을 나누어 설명한다.

### T6 · P2 · review-form-funnel

위치: [한국어 377행](https://github.com/jingeon27/side-project/blob/9576836125cfd91e977b417b50dd9b049e649cff/projects/blog/apps/web/content/posts/review-form-funnel/ko.mdx#L377), [영어 377행](https://github.com/jingeon27/side-project/blob/9576836125cfd91e977b417b50dd9b049e649cff/projects/blog/apps/web/content/posts/review-form-funnel/en.mdx#L377).

await prefetchQuery가 끝났다는 사실을 첫 클라이언트 렌더에 수정용 응답이 반드시 있다는 보장으로 설명한다. prefetchQuery는 오류를 삼키며 기본 dehydrate는 실패한 쿼리를 제외하므로 이 보장은 실패 케이스에서 성립하지 않는다.

근거: query-core 5.104.3으로 source 성공/draft 실패를 Promise.all로 기다렸다. await는 정상 반환했지만 draftStatus=error, dehydratedKeys=[[source,1]], firstRenderDraft=null이었다. 이 상태에서 useForm은 emptyDraft를 초기값으로 캐시한다.

최소 재현: `await client.prefetchQuery({ queryKey: ['draft'], retry: false, queryFn: async () => { throw new Error('unavailable'); } })` 뒤 `dehydrate(client).queries`는 `[]`다.

수정 방향: 정상 prefetch 성공 시라는 조건을 명시하고, 편집에 필수인 데이터는 오류를 드러내는 조회나 성공 상태 검사로 렌더를 막는 경로를 설명한다. 뒤늦은 클라이언트 성공의 폼 초기화도 별도 다룬다.

공식 자료: [TanStack Query 서버 렌더링 오류 처리](https://tanstack.com/query/latest/docs/framework/react/guides/ssr#error-handling)

## 글별 결과

| 글                            | 근거 | 논리 | 문장 | 한영 | 자료 | 합계 | 한줄 검토                                                                                                                                                           |
| ----------------------------- | ---: | ---: | ---: | ---: | ---: | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bottom-sheet-drag-crash       |    3 |    4 |    4 |    4 |    4 |   19 | 재현하지 못한 트리거와 라이브러리에서 사라진 null 접근을 분리했고, 배포 전후 관찰 기간도 명시했어요.                                                                |
| chatbot-message-layer         |    3 |    3 |    3 |    4 |    2 |   15 | 두 SSE의 송신·수신 분리가 구체적이지만 단계가 자주 끊기고 TanStack AI 버전과 공식 API 링크가 빠졌어요. 취소·중복 한계는 이미 명시돼 있어 새 결함으로 세지 않았어요. |
| cross-domain-token-handoff    |    2 |    3 |    3 |    4 |    4 |   16 | 구현과 보강안을 구분하지만 resolveDestination 예제의 URL 문자열 오기로 정상 목적지가 모두 기본 경로가 돼요.                                                         |
| declarative-code              |    3 |    4 |    4 |    4 |    4 |   19 | 선호를 보편 법칙으로 만들지 않고 화면·조회·계산의 실제 전후 예제로 설명해요. 새로운 실질 오류를 찾지 못했어요.                                                      |
| electron-module-boundaries    |    3 |    4 |    4 |    4 |    4 |   19 | NestJS 제거와 책임 분리 유지의 결정이 명확하고 static 설정 결합도도 숨기지 않아요. 새 결함을 찾지 못했어요.                                                         |
| error-boundary-recovery       |    3 |    4 |    4 |    4 |    4 |   19 | 오류 발생 위치와 경계 배치를 함께 설명하고 관측 검증·차단 검증·재조회 실패를 구분해요. 새 결함을 찾지 못했어요.                                                     |
| fsd-layer-boundaries          |    3 |    4 |    4 |    4 |    4 |   19 | 로컬 레이어 변형과 적용 수준을 구분하고 633→8초를 원래 환경 복구로 한정해요. 새 결함을 찾지 못했어요.                                                               |
| health-check-program          |    3 |    4 |    4 |    4 |    4 |   19 | 등록 권한, 검사 선택, 결제 복귀의 실제 결정을 구체적으로 설명하며 한영 범위가 맞음. 사내 구현·결제 결과는 공개 자료로 재측정하지 않음.                              |
| low-effort-success            |    4 |    4 |    4 |    4 |    3 |   19 | 태도와 투입량을 구분해 순위가 바뀐 이유를 설명하고, 개인 성찰을 보편적 성과로 과장하지 않음.                                                                        |
| nextjs-seo-prefetch           |    3 |    4 |    4 |    4 |    4 |   19 | 기본 dehydration·pending streaming·prefetch 실패 처리 차이를 명확히 해요. 이 글에서는 await 성공을 무조건 보장하지 않아요.                                          |
| nextjs-server-client-issues   |    3 |    3 |    4 |    4 |    4 |   18 | 원인이 다른 사례를 한 편에 묶어 길지만 공식 PR #94144/#97164와 Activity/bfcacheId 설명이 대체로 일치해요.                                                           |
| nextjs-tanstack-query-ssr     |    2 |    4 |    4 |    4 |    4 |   18 | 캐시 수명과 queryOptions 재사용 설명은 명확하지만 공유 queryFn의 비공개 API_URL이 브라우저에서는 제공되지 않아요.                                                   |
| payment-coupon-branches       |    3 |    4 |    4 |    4 |    4 |   19 | 저장 여부와 결제 상태를 구분한 렌더 순서, DTO·폼 값의 차이와 조합 테스트 부재를 명확히 남김.                                                                        |
| plan-gated-ai-workflow        |    3 |    4 |    4 |    4 |    4 |   19 | 허위 양성 테스트를 고친 구체적인 사례와 plan·사람의 검토·자동 검사의 역할이 잘 연결됨. 사내 CI 상태는 독립 재검증 범위 밖.                                          |
| prototype-working-rules       |    3 |    4 |    4 |    4 |    4 |   19 | props·mount gate·mutation 상태에 대한 규칙을 적용할 범위와 예외로 좁혀 설명함. before/after 컴포넌트 예제는 설명용 축약임.                                          |
| puppeteer-event-lifecycle     |    2 |    4 |    4 |    4 |    2 |   16 | 이벤트 수집과 수명 정리는 잘 설명하지만 동기 콜백 예외가 consume의 try 바깥에서 빠지는 예제 결함이 있어요.                                                          |
| query-key-factory             |    3 |    4 |    4 |    4 |    4 |   19 | v4/v5 문법과 prefix·exact 무효화 범위, API 함수 직접 전달 조건을 구체적으로 구분해요. 새 결함을 찾지 못했어요.                                                      |
| reading-ai-code               |    3 |    4 |    4 |    4 |    4 |   19 | 코드 읽기와 테스트 실행을 구분하고 임시 진료일의 조건 순서와 시트 스크롤 사례가 서로 보완됨.                                                                        |
| reservation-form-state        |    3 |    4 |    4 |    4 |    4 |   19 | 폼 상태 이동의 동기와 RHF 검증 시점, 같은 길이 목록 교체의 한계를 모두 명시함. 이미 인정한 한계를 새 결함으로 중복 집계하지 않음.                                   |
| review-form-funnel            |    2 |    4 |    3 |    4 |    4 |   17 | 임시 선택·단계 검증·최종 검증의 범위는 정직하나 prefetch 완료를 최초 렌더 데이터 보장으로 설명한 문장은 실패 케이스에서 틀림.                                       |
| review-like-optimistic-update |    3 |    4 |    4 |    4 |    4 |   19 | 목록·상세 snapshot과 rollback을 구체적으로 설명하고 한 번의 조작 범위와 연속 요청 한계를 명시해요.                                                                  |
| reviewing-ai-output           |    3 |    4 |    4 |    4 |    4 |   19 | 실서비스 diff 검토와 사이드프로젝트 결과 피드백의 저자 역할을 분명히 구분함. 외부 인용과 재구성 그림의 표기도 일치함.                                               |
| sentry-observability          |    2 |    3 |    4 |    4 |    3 |   16 | 수집·전송·저장을 구분한 근거는 좋지만 sentryUrl 예제에 URL을 무효화하는 꺾쇠 문자열이 남았어요.                                                                     |
| side-project-design           |    4 |    3 |    3 |    4 |    4 |   18 | 현재 공개 코드와 기능 설명이 대체로 맞고 미모집·미배포의 한계를 남김. 여러 제품과 19개 절을 오가고 역할 설명이 반복되어 서사 밀도가 낮아지는 곳은 있음.             |
| side-project-infrastructure   |    4 |    4 |    4 |    4 |    4 |   20 | 한도 합계와 물리 메모리, 설정과 부하·복구 검증을 구분함. Terraform·배포 코드와 R2·AWS 문서의 설명이 맞음.                                                           |
| side-project-technology       |    4 |    3 |    3 |    4 |    4 |   18 | API·캐시·동시성·관측 설명의 구체적인 공개 코드 근거가 있고 한영이 맞음. 선택 배경에 비해 구현 영역이 넓고 저자 역할 문장이 반복됨.                                  |
| sitemap-api-boundaries        |    3 |    4 |    4 |    4 |    4 |   19 | 시간 재검증과 태그·부분 실패·메타데이터의 남은 문제를 구현 완료처럼 쓰지 않아요. 새 결함을 찾지 못했어요.                                                           |
| testing-standards             |    3 |    4 |    4 |    4 |    4 |   19 | 실제 제품 경로와 서버 제약을 확인한 사례를 통해 테스트 기준이 생긴 이유를 설명함. 도구·파일명 규칙을 보편적 표준으로 과장하지 않음.                                 |
| typed-program-form            |    3 |    4 |    4 |    4 |    4 |   19 | 타입 접근과 입력 조립, 변환·제출의 책임을 구체적으로 구분하며 타입 검사가 런타임 검증은 아님을 남김.                                                                |
| typescript-patterns           |    4 |    4 |    4 |    4 |    4 |   20 | satisfies·optional·generic·XOR 예제의 설명 범위가 정확하며 exactOptionalPropertyTypes 조건과 JSON 직렬화를 구분함.                                                  |
| zod-assertion-boundaries      |    3 |    4 |    4 |    4 |    2 |   17 | 관측·복구·차단을 구체적으로 나누지만 generic 폼 예제의 지원 버전·입출력 제약을 보완해야 해요.                                                                       |

## 코드·숫자·날짜 대조

- 사이드프로젝트 글의 공개 조회와 세션별 조회 분리, SDK 응답 스키마, 가입·투표 권한, DB unique 및 복합 외래 키, 메시지 재전송과 대화 행 잠금, 캐시 revision 재시도, Sentry span/metric 전송 정책과 테스트 레인을 현재 코드에서 확인했다. 문서가 가리키는 GitHub 근거 21경로는 고정 commit에서 모두 존재했다.
- EC2 t3.small 2GiB와 swap 2GiB, 컨테이너 한도 약 3.1GiB, 일일 스냅샷 7개, migration 전 덤프, 백업 쓰기 전용 IAM과 SSM 배포의 설명을 설정과 대조했다. 부하·복구의 실제 성공을 입증한 것으로 확대하지 않았다.
- 피식과 Game Mate 글은 아직 답변자 미모집, 번역 운영·실제 기기·스토어 배포 등의 남은 작업을 명시한다. 계획으로 적은 5–10명과 응답률은 이미 달성한 성과로 읽지 않았다.
- 과거 글의 오류 수·발생 비율·633→8초 같은 수치는 당시 기록으로 취급했다. 이번 감사에서 사내 데이터나 벤치마크 로그로 재측정하지 않았고, 문체나 숫자의 존재만으로 진위를 판정하지 않았다.
- 작성 기준 날짜를 붙이는 문장, 파일·호출부·줄 수 작업 집계를 다시 추가하지 않았다. 현재 관측 결과를 모든 과거 상태에 소급하거나 과거 라이브러리 사례를 최신 버전의 보장으로 읽지 않았다.

## 이미지·링크·배포 경로

- 31글 모두 전용 표지와 본문 이미지가 있다. 본문 이미지 124회, 고유 93경로는 모두 public 파일과 연결된다. 지역별 alt와 한영 구조가 콘텐츠 테스트를 통과했다.
- 감사 원본의 실제 제품 화면은 side-project-design의 한국어 합성물 2개, 원래 4개 화면이었다. 당시 영문판 2개는 재구성 그림이며 캡션도 그렇게 명시했다. 추가 요청에 따라 아래 후속 갱신에서 실제 화면으로 바꿨다. 재구성 도해·일러스트를 실제 화면 증거로 취급하지 않았다.
- 한국어 실제 캡처 2개를 직접 열어 테스트 데이터 표기와 구성, 캡션을 확인했다. 전체 이미지 93개의 픽셀 단위 시각 검수나 현재 블로그의 모든 viewport 렌더링을 이번 읽기 감사에 포함한 것은 아니다.
- 외부 URL 98개는 직접 GET 94개 200, 3개 공식 문서 redirect, 1개 직접 403이었다. 뒤 4개도 웹 도구로 최종 문서·원문을 확인해 단절을 확정한 링크는 없다. 저장소 근거 링크 42회/고유21개도 commit:path 존재를 확인했다.
- 감사 원본 커밋에서 public/images의 파일 합계는 80,221,620바이트, 본문에서 참조하는 고유 파일은 74,566,217바이트다. Next Image의 sizes·lazy loading·최적화 경로가 있으므로 원본 파일 합계를 방문 시 전송량으로 해석하지 않았다. 기존 아카이브를 공개 경로에서 삭제하지 않았다.
- 캡처 재생성 스크립트는 저장소에서 찾지 못했다. 이전 HTML/CSS 합성 방식과 screen-captures.json의 원본 해시·촬영 revision은 남아 있다.

## 실행한 검증

- Node 24.19.0 / Yarn 4.17.0을 사용했다.
- `yarn workspace @blog/web content:validate`: 62 article locales, 62 static MDX imports, 27 redirects 통과.
- 콘텐츠·번역·편집 계약·이관 무결성의 기존 Vitest 4파일, 25테스트 통과. 새 문구 검사 테스트는 만들지 않았다.
- Node24로 잘못된 URL, Puppeteer 콜백 동기 예외, 실패한 prefetch의 캐시 전달을 재현했다. Zod 폼 예제는 현재 설치 의존성에서 타입 오류를 재현했다. 재현은 별도 로컬 감사 환경에서 수행했다.
- 읽기 감사 단계에서는 새 서버·DB를 띄우거나 사용자 개발 서버·데이터를 바꾸지 않았다. AWS apply, 실제 Sentry 수신과 결제 승인은 이 작업에서 실행하지 않았다. 후속 화면 갱신은 별도 격리 실행기로 촬영했으며 아래 검증 결과와 구분한다.

## 범위와 다음 편집

공개 코드와 공식 문서는 현재 읽을 수 있는 범위에서 대조했다. 사내 원본 저장소, 운영 계정, 비공개 대화와 원본 측정 로그의 모든 주장을 독립 검증한 결과는 아니다. 글에 이미 적은 SSE 취소·중복, 예약 동기화, 전체 제출 재검증, 낙관적 갱신의 연속 요청 한계를 새 결함으로 중복 집계하지 않았다. 문체만으로 AI 저자를 판정하거나 저자가 하지 않은 검토·운영 경험을 만들어 넣지 않았다.

위 6건의 본문 기술 설명은 감사 결과로 남겼고 일괄 재작성하지 않았다. 실제 제품 화면 갱신의 출처와 해시는 [캡처 기록](screen-captures.json)에서 관리한다.

## 후속 화면 갱신

실제 제품 화면 원본 7장으로 한국어와 영어 합성물 4개를 새로 만들었다. Game Mate 영어 UI를 실제로 촬영했고 피식 한국어 UI와 한국어 테스트 게시글은 캡션에서 구분했다. 이전 화면·재구성 도해는 보존했다. 원본 화면과 합성물, UI 소스 revision 및 수정 중인 파일의 해시를 [캡처 기록](screen-captures.json)에 연결했다. 이 갱신으로 위 6건의 기술 설명을 고친 것은 아니다.

같은 날 Game Mate의 한 줄 분류 칩과 현재 프로필 화면을 반영해 Game Mate 원본 6장과 합성물 4개를 다시 갱신했다. 촬영은 합동 브라우저 검사 24개가 통과한 프로덕션 빌드를 새 프로세스로 실행하고, 별도의 UUID 테스트 스키마와 새 브라우저 문맥에서 진행했다. 촬영 당시 전체 런타임 소스와 빌드 출처를 고정했으며 이후 소스 변경으로 이 해시를 갱신하지 않는다. 피식 원본의 픽셀, 촬영일, 소스와 준비 상태 기록은 그대로 유지했다. 전체 감사 점수와 이전 검증 결과는 당시 범위를 보존한다.

## 최초 화면 갱신 검증

- 콘텐츠 생성·검증: 한국어와 영어 62본문, 정적 MDX import 62개, 기존 redirect 27개 통과.
- TypeScript와 ESLint, 블로그 앱 범위 Knip, 변경 파일 Prettier 및 diff 공백 검사 통과.
- 단위·컴포넌트·콘텐츠 테스트 39파일, 146테스트 통과. 원본과 합성물의 해시·크기, 이전 이미지 보존과 한영 대응을 포함한다.
- 프로덕션 빌드는 정적 경로 203개를 생성했다.
- 격리된 3111 포트에서 데스크톱·모바일 Chromium E2E 54개가 통과했다. 새 한영 이미지 로딩, alt, 가로 넘침과 관련 글 이동을 포함한다.
- 최종 합성물 4개를 열어 검토했다. 피식 검색과 그룹 만들기 버튼은 실제 native disabled가 false, aria-disabled와 data-disabled가 없는 상태, opacity 1임을 확인한 뒤 촬영했다. 테스트 중 만든 기계적인 그룹 이름 대신 일반 검색 조건 “함께”로 기존 테스트 그룹을 보여 줬다. 화면 내용이나 색은 수정하지 않았다.
- Game Mate 촬영용 서버와 자체 테스트 스키마는 정리했고 기존 개발 서버와 DB 프로세스는 유지했다. 피식의 자체 실행 환경은 그 실행기 소유자가 정리한다.

## 같은 날 Game Mate 재촬영 검증

- 원본 6장을 실제로 다시 촬영하고 합성물 4개를 재생성했다. 픽셀이 동일한 결과는 그대로 유지해 변경된 PNG는 원본 3장과 합성물 3개다.
- 촬영 당시 런타임 소스 1,060개와 삭제된 경로 4개를 기록하고, 보존한 프로덕션 빌드의 출처와 겹치는 런타임 파일의 해시가 일치함을 확인했다. 후속 제품 리팩터링은 이 촬영 기록에 반영하지 않는다.
- 콘텐츠·이미지 크기 레지스트리 생성과 검증에서 62개 언어별 본문, 정적 import 62개와 redirect 27개가 통과했다. 이미지 크기는 이전과 같아 크기 레지스트리의 변경은 없었다.
- TypeScript, 캡처 스크립트 ESLint, 변경 텍스트 파일 Prettier와 diff 검사가 통과했다. 관련 콘텐츠 번역·마이그레이션 테스트는 2개 파일의 6개가 통과했다.
- 합성물 4개를 직접 열어 확인했다. Game Mate 피드는 현재 경로와 제목, 글쓰기 버튼 활성화 및 분류 영역 opacity 1을 확인했고, 화면에 보이는 이미지의 실제 로딩도 확인했다. 수정하지 않은 프로필 저장 버튼의 비활성 상태는 유지했다.
- 피식 원본 해시와 각 화면의 출처·촬영일·버튼 상태 기록은 이전과 동일하다. 촬영용 서버와 자체 스키마는 정리하고 기존 개발 서버와 공유 테스트 PostgreSQL은 유지했다.

## 2026-11-02 후속 수정

위 T1–T6을 한영 본문에 반영했다. 고쳐 쓴 예제는 처음 공개한 코드를 고쳤다고 본문에 밝혔고, 사내 서비스의 코드를 고쳤다고 주장하지 않는다.

- T1, T4: URL 문자열의 꺾쇠를 지웠다. 같은 변환 오류가 있던 토큰 글의 307 로그 예제 두 줄도 함께 고쳤다.
- T2: `consume`이 함수를 받아 `try` 안에서 콜백을 호출하게 했다.
- T3: 공유 `queryFn`의 주소를 `NEXT_PUBLIC_API_URL`로 바꾸고 환경변수 조건을 설명했다.
- T5: 같은 의존성 버전을 쓰는 `projects/game-feedback/apps/web/src/shared/model/form/use-zod-form.ts`의 제네릭 형태로 바꾸고 기준 버전을 적었다. 글의 예제를 따로 타입 검사하지는 않았다.
- T6: 조회 성공 조건을 명시하고 실패할 때의 초기값과 대안을 적었다.

이관 때 빠진 인라인 코드 서식을 이관 글 27편의 한영 본문에 복원했다. 해당 글의 코드 블록에 실제로 있는 식별자만 대상으로 했고, 제목, 이미지 설명과 링크는 건드리지 않았다. 문장은 바꾸지 않았으므로 서식만 바뀐 글의 `updatedAt`은 유지했다.

## 2026-11-02 문체 재작성

저자 피드백에 따라 이관 글 26편의 한영 본문을 두 번에 걸쳐 다시 썼다. 첫 번째는 보고서 같은 문체를 경험 서술로 바꾸고 글마다 구성과 끝맺음을 달리했다. 두 번째는 2026-10-29 `bd71c217`에서 줄어든 배경을 되찾고, 배경지식이 없는 독자가 따라오도록 문제 상황, 용어 풀이, 전후 코드를 넣었다. `reading-ai-code`와 최근 글 4편은 저자 요청과 범위에 따라 문장을 바꾸지 않았다.

- 기존 코드 블록의 언어와 내용, 이미지 파일과 링크는 유지했다. 순서를 옮긴 코드 블록과 이미지는 한영을 같은 순서로 맞췄다. `chatbot-message-layer`는 앞선 수정에서 빠진 코드 블록을 커밋된 판에서 되살렸다.
- 새 코드 블록은 옛 판의 실제 코드가 있으면 그것을 쓰고, 없으면 재구성해 본문에 줄인 예시나 설명용 값이라고 밝혔다.
- 배경은 현재 본문, 코드, 그림과 git 기록에서 가져왔다. 저자가 지운 작업 집계 수치와 실명, 내부 식별자는 옮기지 않았다.
- 코드나 그림과 어긋난 설명을 고쳤다. `cross-domain-token-handoff`의 비교 대상(script 18개 중 11개), `declarative-code`의 컴포넌트 이름과 쿠폰 칩 설명, `review-like-optimistic-update`의 서버 필드 설명, `reservation-form-state`의 백업과 복원 설명, `payment-coupon-branches`의 요청 범위(예약 확정 요청), `sentry-observability`의 `--host` 표기와 URL 계측 설명, `health-check-program`의 결제 확인 범위가 해당한다.
- 이미지 아래 기울임 설명을 모든 글에서 지우고 alt만 남겼다. 사실을 구분하는 말은 본문으로 옮겼다.
- 요약과 같았던 SEO 설명을 새 요약에 맞췄다. 제목과 slug는 바꾸지 않았다.
- 고치기 전 본문의 스냅샷과 대조해 기존 코드 블록, 이미지, 링크, 수치의 유지와 한영 구조를 확인했다. 콘텐츠 생성과 검증, 타입 검사, 변경한 코드의 ESLint, Prettier가 통과했다. 로컬 Vitest, 빌드, E2E는 실행하지 않았고 렌더링은 보지 않았다.

## 2026-11-02 그림의 조직 식별자 제거

`45fb547b`의 익명화에서 빠진 `typed-program-form`의 한국어 그림 `03.png`, `04.png`에 회사 이름이 들어간 코드 식별자 4곳이 남아 있었다. 글꼴이 달라지지 않도록 해당 접두어의 픽셀 열만 잘라 뒤 글자를 붙였고, 이미지 크기와 나머지 픽셀은 그대로다. 같은 글의 영어 그림에는 없었다.

블로그의 PNG와 JPG 116장을 macOS Vision으로 글자 인식해 회사 이름이 이 4곳뿐임을 확인했다. 글자가 인식되지 않은 26장은 일러스트임을 눈으로 확인했다. 저장소의 추적 파일 전체를 검색한 결과도 0건이다. 글자 인식은 작은 글씨를 놓칠 수 있고, 이전 판은 git 기록에 남아 있다.
