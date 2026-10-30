---
name: commit
description: 피식(side 저장소) 작업을 커밋할 때 커밋 단위를 작게 나누고 메시지를 쓰는 규칙. 커밋을 만들거나 나눌 때 사용한다.
---

- main에서 바로 커밋하지 않는다. 작업 브랜치(`feat/…`, `fix/…`, `refactor/…`)를 만든다. 사용자가 요청하기 전에는 push하지 않는다.
- 커밋은 작게: 기능 하나·모듈 하나·설정 하나 단위. 앱(api/web/mobile)이나 패키지를 한 커밋에 섞지 않는다. 테스트는 그 테스트가 지키는 코드와 같은 커밋에 넣는다.
- 의존성 변경(package.json의 dependencies + yarn.lock)은 그 의존성을 처음 쓰는 커밋보다 먼저, 별도 `chore(deps)` 커밋으로 둔다. lockfile만 따로 떼지 않는다.
- 파일 이동·이름 변경만 하는 커밋과 동작을 바꾸는 커밋을 나눈다.
- 스테이징은 경로를 지정한다(`git add -A -- <경로>`). `git add .`·`git add -A`로 다른 작업을 섞지 않는다.
- 생성 파일(Prisma client, `.next`, `next-env.d.ts`, `.e2e-build`, `.expo`)과 `.env`는 커밋하지 않는다. codegen 결과 `src/shared/api/generated.ts`는 스키마·문서 변경과 같은 커밋에 넣는다.
- 메시지: `<type>(<scope>): <무엇을 ~한다>` 한국어. type은 feat·fix·refactor·test·docs·chore, scope는 api·web·mobile·bridge·test-kit·deps·photo-contest. 필요하면 빈 줄 뒤 본문에 '왜'를 한두 줄.
  - 예: `feat(web): 사진 좋아요 버튼을 추가한다`, `refactor(api): 투표와 신고·숨김·삭제를 각 모듈로 분리한다`, `chore(deps): API에 es-toolkit과 ts-pattern을 추가한다`
- 커밋 전에 그 단위의 검사(typecheck·lint·관련 test)가 통과하는지 확인한다. 큰 리팩터링 중간이라 앱 전체가 아직 통과하지 않으면 본문에 무엇이 다음 커밋에서 이어지는지 적는다.
- PR은 merge commit으로 합쳐 브랜치 커밋이 그대로 남는다. push 전에 fixup·WIP 커밋을 원래 커밋과 합치고(`git rebase --autosquash <base>`), `Co-Authored-By` trailer는 넣지 않는다(루트 AGENTS.md, PR `Commits` 검사).
