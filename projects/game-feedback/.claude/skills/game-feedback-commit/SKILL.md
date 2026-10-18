---
name: game-feedback-commit
description: Review scoped Game Feedback changes and prepare commits without unrelated app or secret changes.
---

# Game Feedback 커밋

1. 사용자가 요청한 범위와 현재 브랜치·Worktree를 확인한다. 기존 사용자 변경을 덮어쓰지 않는다.
2. `git diff --stat`과 관련 diff를 읽고 변경 파일을 명시적으로 선택한다. 기본 범위는 `projects/game-feedback/**`다.
3. 루트 README, scripts, CI, package.json, yarn.lock을 변경했다면 이유를 구현 기록 또는 커밋 설명에 남긴다. 다른 앱의 코드를 포함하지 않는다.
4. 의존성을 변경하면 manifest와 yarn.lock을 함께 검토한다. `.env`, `.data`, 쿠키, 비밀 키, 생성 Prisma 바이너리, 빌드 결과를 포함하지 않는다.
5. 변경 범위에 맞는 검증 결과를 확인한다. 외부 서비스 미확인·공개 검토 미완료를 숨기지 않는다.
6. 배포 전 DB는 schema.prisma만 관리하고 db:sync 대상이 이 서비스의 로컬 DB인지 검토한다. reset이나 데이터 손실 강제 옵션을 포함하지 않는다.
7. 커밋 권한이 주어진 작업에서는 구체적인 사용자 동작을 설명하는 제목을 사용한다. 커밋이 요청되지 않았다면 검토 가능한 변경 상태와 검증 결과를 보고한다.
