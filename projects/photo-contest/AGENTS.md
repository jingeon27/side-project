# Photo Contest

상위 `side`의 Yarn workspaces에 속한다. Next.js 웹은 `apps/web`, NestJS GraphQL API는 `apps/api`.
세이프닥 저장소는 참고 자료일 뿐이다. 그 저장소의 서버 주소, 환경변수, 사내 데이터는 가져오지 않는다.

## Conventions

- 일반 모듈은 named export, 명시적 re-export. `export *`는 쓰지 않는다. Next route/config만 default export.
- 컴포넌트와 공개 함수는 function 선언, 내부 이벤트는 `handle` 접두사.
- 서버 상태는 Apollo, 폼은 RHF·Zod, 일시적 UI는 useState. 같은 상태를 복제하지 않는다.
- shadcn Base UI. Radix의 `asChild`가 아니라 Base UI의 `render`로 조합한다.
- 구현은 `src/_pages`의 화면 slice부터 시작한다. URL과 폴더를 1:1로 만들지 않는다.
- 생성 타입은 `yarn codegen`, Prisma client는 `yarn db:generate`. 생성 파일을 손으로 고치지 않는다.

## Skills

관련 작업 전에 해당 파일 전체를 읽는다.
- 구조·폼·UI: `.claude/skills/frontend/SKILL.md`
- 권한·투표·사진 API: `.claude/skills/contest-api/SKILL.md`
- 테스트: `.claude/skills/testing/SKILL.md`

Next.js API는 설치된 `node_modules/next/dist/docs`에서 확인한다. 다른 프로젝트의 프로세스를 끄지 않는다.

테스트는 API와 웹의 소스 옆 또는 각 앱의 test 폴더에 둔다. 전체 흐름 테스트는 이 프로젝트의 e2e 워크스페이스에 둔다. 루트에 tests 또는 Vitest/Playwright 설정을 만들지 않는다.
