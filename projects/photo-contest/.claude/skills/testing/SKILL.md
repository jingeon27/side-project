---
name: testing
description: 사진 공모전의 BDD 요구사항, 회귀 테스트, 실제 PostgreSQL 통합 테스트와 Playwright E2E를 작성하거나 실행할 때 사용한다.
---

새 동작은 `*.spec.ts(x)`, 확인된 버그의 회귀는 `*.test.ts(x)`. 기대 결과를 `~해야 한다`로 적는다.
의미 없는 구현 호출 횟수 대신 사용자 동작과 서버·DB 결과를 본다.
폼은 실제 RHF·Base UI, API는 실제 PostgreSQL에서 권한과 동시 요청을 검증한다.
외부 OAuth 인증은 credentials 없이 실제 성공을 주장하지 않는다. provider 응답만 경계에서 대체할 수 있다.

앱별 Vitest 설정을 사용한다. API unit은 apps/api/src, integration은 apps/api/test/integration, 웹 UI는 apps/web/src에 둔다.
프로젝트의 e2e 워크스페이스에서 Playwright 설정과 전체 흐름 테스트를 관리한다. 상위 저장소에 전역 테스트 폴더나 러너 설정을 만들지 않는다.

프로젝트의 `yarn test`는 API·웹 unit/UI를 위임 실행하며, `DATABASE_URL`을 지정한 `yarn test:integration`은 격리된 개발 DB의 API 검증.
`yarn test:e2e`는 두 서버를 띄워 실제 API로 그룹·제출·투표를 수행한다.
로컬에서도 기존 프로젝트의 서버를 재사용하거나 종료하지 않는다.
테스트 성공과 diff 확인, dev 화면 확인은 서로를 대체하지 않는다.
