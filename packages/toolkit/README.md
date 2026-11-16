# @side/toolkit

여러 프로젝트에서 사용하는 도구와 서버 유틸리티입니다. 기능별 subpath로 가져옵니다.

- `@side/toolkit/push-notifications`: Expo 푸시 전송·메시지 검증. API가 소비하는 CommonJS와 타입 선언을 빌드합니다.
- `@side/toolkit/migration-check`: Prisma migration의 파괴적 DDL 검사. 루트 CLI에서 설치 전에도 실행할 수 있도록 Node.js 기본 모듈만 사용합니다.
- `@side/toolkit/sentry-check`: 서비스의 Sentry 이벤트 수집 확인. 환경변수 로딩과 실행 진입점은 각 API가 소유합니다.

`yarn workspace @side/toolkit check`로 lint·타입·단위 테스트를 실행하고, `yarn workspace @side/toolkit build`로 서버 런타임 코드를 빌드합니다.

## 릴리스 PR의 기존 migration

develop → main에서도 main 이후의 migration 전체를 검사합니다. #133에서 발견한 기존 SQL 12개는 이미 공유된 적용 이력이어서 수정하지 않고, `src/migration-check/reviewed-migrations.json`에 경로·SHA-256·검토 사유를 기록했습니다. 11개는 #40의 검사 강화 전 이력이고, #63의 프로필 업로드는 새 nullable 키의 유일성·외래 키를 별도로 검토했습니다. 원문 변경·삭제는 실패하며 다른 경로나 새 migration에는 이 기록이 적용되지 않습니다. 새로운 SQL은 기존처럼 expand/deploy/contract 또는 문장 바로 앞의 검토 사유를 사용합니다.

이 기록은 무중단 실행을 보장하지 않습니다. 기존 테이블의 인덱스 생성과 제약 검증은 잠금을 잡으므로 배포 전 데이터 규모·잠금 시간을 점검해야 합니다. 링크 게시글은 uploadId가 NULL일 수 있어 구버전 앱과 호환되지 않습니다. 링크 생성은 새 API·웹 배포 후에만 엽니다. 운영 DB를 직접 검사하거나 변경한 기록은 아닙니다.
