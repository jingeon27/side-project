<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## Web FSD와 코드 규칙

- `src/app`은 Next 라우트 어댑터만 둔다. 화면은 `_pages`, 앱 조합·Provider·전역 스타일은 `_app`, 여러 화면의 조합 UI는 `widgets`, 서버 도메인은 `features`, 도메인 비의존 코드는 `shared`가 소유한다. `entities` 레이어를 별도로 만들지 않는다.
- features의 `api`는 REST SDK와 요청·응답 IO, `model`은 query options와 mutation 훅을 소유한다. 페이지의 폼·흐름·URL 상태를 features의 서버 상태와 분리한다. GraphQL을 추가하지 않는다.
- 다른 slice는 명시적인 named export `index.ts`를 통한다. 상위 레이어 import·자기 barrel import·페이지 간 직접 import는 금지한다.
- `*.options.ts`의 `queryOptions`/`infiniteQueryOptions`가 쿼리 키의 단일 출처다. 조회·무효화·캐시 쓰기는 같은 factory를 재사용한다. 인자가 없으면 prefix, 조회에 필요한 인자가 없으면 `skipToken`을 사용한다. 서버 조회를 감싼 전용 useQuery 훅은 만들지 않는다.
- mutation 훅은 원본 useMutation 결과를 반환한다. 대기·오류는 mutation 상태, 폼은 RHF+Zod `useZodForm`, 모달은 overlay-kit으로 관리한다. 서버 데이터를 전역 UI store나 useState로 복제하지 않는다.
- SSE·DOM observer 등 외부 동기화에만 effect를 사용한다. 필터·선택 대화는 URL을 단일 출처로 사용한다.
- 컴포넌트 파일은 PascalCase, 나머지는 kebab-case다. named function 컴포넌트, `I` interface·`T` type, 내부 `handle*`·prop `on*`를 사용한다. any·non-null assertion·else·enum을 추가하지 않는다.
- 계정 전환은 실행 중 query 취소 → 이전 계정 cache 제거 → 새 세션 저장 순서를 지킨다. SSE는 사용자 ID별로 닫고 다시 연결한다. 재전송 UUID·실패 초안·읽음 경계를 보존한다.
- `lint`는 공유 Next·FSD preset과 앱의 query-key 규칙을 실제 검사한다. `@side/game-feedback check`에도 포함된다. Vitest와 Playwright는 Web이 소유한다.
