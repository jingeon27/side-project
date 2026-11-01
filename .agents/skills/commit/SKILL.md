---
name: commit
description: 이 모노레포에서 변경을 작은 커밋으로 나누고 기능 브랜치를 push하거나 develop 대상 PR을 만들 때 사용한다. 릴리스 PR과 merge 정책은 루트 AGENTS.md를 따른다.
---

# 커밋과 PR

Git 흐름·메시지·hook·merge 방식의 단일 기준은 [루트 AGENTS.md](../../../AGENTS.md)다. 기존 요청과 승인 범위 안에서 진행하며 세션 변경만으로 같은 승인을 반복 요청하지 않는다.

1. 현재 원격·브랜치·worktree와 diff를 확인한다. 다른 작업의 변경을 포함하지 않는다. 새 작업은 develop 기준 기능 브랜치에서 하며 이미 머지한 PR의 브랜치를 새 PR에 재사용하지 않는다.
2. 기능·모듈·앱·패키지별로 나눈다. 관련 테스트는 구현과, 계약·스키마와 검토 가능한 codegen 결과는 함께 둔다. 파일 이동만 하는 변경과 동작 변경은 가능한 한 분리한다.
3. 의존성은 manifest와 lockfile을 함께, 이를 처음 사용하는 코드보다 앞선 커밋으로 둔다. 루트 공통 파일을 바꾼 이유는 PR이나 구현 기록에 남긴다.
4. `git add -A -- <명시한 경로>`로 선택하고 staged diff를 확인한다. .env·자격 증명·쿠키·DB·빌드 산출물·생성 Prisma client는 제외한다. 프로젝트가 추적하는 GraphQL/REST SDK codegen은 해당 계약과 포함한다.
5. 변경 단위에 맞는 타입·lint·테스트와 format을 확인하고 hook을 정상 실행한다. 실패하면 수정하며 기본적으로 우회하지 않는다. 커밋 메시지는 한국어로 무엇을 바꾸는지 쓴다. scope는 `photo-contest`, `game-feedback`, `blog`, 공통 패키지/영역 이름을 사용한다.
6. push 전 원격이 `https://github.com/jingeon27/side-project.git`인지 다시 확인하고 WIP·fixup·squash 이력을 정리한다. 기존 연결/CLI를 먼저 사용하며 실제 인증 실패가 있을 때만 필요한 조치를 설명한다.
7. PR의 저장소·head·base와 diff를 확인하고 변경·검증·미확인 범위를 적는다. 기능 PR은 develop, main 릴리스는 develop에서만 올린다. PR 요청에는 필요한 기능 브랜치 push가 포함되지만 merge·배포 승인을 임의로 확대하지 않는다.
