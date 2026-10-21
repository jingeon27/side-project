# 운영 배포

현재 구성은 Game Feedback과 공유하는 **서울 EC2 한 대, 외부 AWS RDS PostgreSQL, 서비스별 비공개 S3**다. 준비·CD·IAM·DB role·TLS·PITR 복구·롤백 명령은 [공통 배포 가이드](../../../deploy/shared-instance/README.md)를 따른다.

Photo Contest의 실제 운영 Compose는 [`deploy/shared-instance/compose.yaml`](../../../deploy/shared-instance/compose.yaml)이다. Web·API 이미지는 `linux/amd64`이며, public origin은 `PHOTO_CONTEST_SITE_URL`로 빌드하고 runtime의 `PHOTO_CONTEST_DOMAIN`과 맞춘다. `/backend/graphql`은 공통 Caddy가 Web의 Next Route Handler로 보내 캐시 무효화와 JSON·쿠키 전달을 처리하고, 나머지 `/backend/*`는 API로 직접 전달한다. runtime은 `photo_contest`, migration은 `photo_contest_migrator`를 사용하고 다른 서비스의 DB·버킷에는 접근하지 않는다.

운영은 직접 아이디·비밀번호 가입을 지원한다. OAuth를 켜면 실제 도메인의 `/backend/auth/<provider>/callback`을 등록한다. 개발 로그인·테스트 API는 운영에서 꺼져 있다. API Sentry는 서버 환경 파일의 `SENTRY_DSN`, 공개 Web Sentry·Amplitude 값은 GitHub repository variable에서 빌드 시 전달한다.

이전 Oracle ARM64·단독 Compose·로컬 DB 백업 절차는 [기록](deployment-legacy.md)으로 보존한다. 해당 Compose는 기존 컨테이너 회귀 테스트에 쓰며 새 CD의 운영 대상으로 쓰지 않는다.

공개 캐시를 도입한 릴리스는 API·Web 이미지뿐 아니라 공통 Caddyfile도 운영 호스트의 `proxy/Caddyfile`에 갱신해야 한다. 이미지 배포만으로 공통 프록시 설정이 바뀌지는 않는다. 기존 [proxy.sh](../../../deploy/shared-instance/scripts/proxy.sh)의 `validate` 후 `reload`를 실행한다. PC 경로는 내부 URL 차단→GraphQL→일반 API→Web 순서를 route 블록으로 고정한다.

링크 게시물 릴리스는 20261020030000_post_links 마이그레이션을 API·Web 교체 전에 적용한다. S3 다운로드는 기존 GetObject 권한으로 최대 60초 presigned URL을 만든다. 긴 서명 URL을 8KB까지 전달하려면 변경한 bridge 패키지를 포함해 모바일 앱을 빌드한다. [첨부·저장 계약](post-attachments.md)을 참고한다.

게시물 직접 업로드 릴리스는 다음 순서로 배포한다. 이 저장소의 설정 파일 변경만으로 운영 버킷이 갱신되지는 않는다.

1. 먼저 기존 업로드를 유지하는 호환 버전을 배포한다. `MediaStorage`의 읽기·삭제·다운로드 키 검사가 JPG·PNG를 허용해야 한다. 새 파일을 쓴 뒤에는 이 호환 버전 이상만 롤백 대상으로 쓴다. 현재 업로드 이전 바이너리는 JPG·PNG를 읽지 못한다.
2. Photo Contest 버킷에 [CORS](../deploy/shared-instance/s3-cors.json)의 origin을 실제 웹 도메인으로 바꿔 적용한다. localhost 예시는 운영에서 제거한다. [Photo Contest 수명 주기](../deploy/shared-instance/s3-lifecycle.json)는 기존 30일 이전 버전 보관을 유지하면서 staging/의 current/noncurrent 객체를 1일 뒤 만료시킨다. 기존 버킷의 다른 규칙이 있다면 함께 보존해 적용한다. 버킷 공개 접근 차단·암호화·Versioning은 유지한다. 기존 GetObject·PutObject·DeleteObject IAM 권한으로 서버 측 복사도 가능하다.
3. staging·검증 시도 추적용 `20261021010000_presigned_post_uploads`와 대회 파일 관계용 `20261022030000_presigned_submission_uploads`, 대표 사진 관계용 `20261022152000_presigned_group_avatars` expand 마이그레이션을 적용한 뒤 API·Web을 함께 교체한다. `tokenHash`는 NOT NULL을 유지하고 새 티켓에도 사용하지 않는 임의 해시를 채워 이전 Prisma client의 행 읽기를 보장한다. 기존 Web 탭의 `uploadPostMedia`·`uploadSubmissionPhoto`·`uploadGroupAvatar` 호출은 실패하므로 새로고침한다. requestUploadUrl도 contentType·byteSize·fields를 사용하는 새 계약으로 함께 배포한다.
4. `/post-uploads`·`/uploads` raw 경로와 GraphQL multipart 처리를 모두 제거한다. 운영 S3에서는 파일을 API·Next 프록시로 보내지 않는다. graphql-upload·apollo-upload-client는 제거하며 대회·대표 사진의 완료 변환에는 sharp가 계속 필요하다. 로컬 서명 저장소 경로는 backend=local에서만 디스크 스트리밍으로 동작한다.

DB는 자동으로 되돌리지 않는다. `tokenHash` 컬럼 삭제는 후속 코드가 해당 컬럼을 전혀 조회하지 않는 버전까지 배포하고 그 이전 버전으로의 롤백을 종료한 뒤 별도 contract 마이그레이션으로 진행한다. 단순히 다음 릴리스라는 이유로 삭제하면 이전 Prisma client의 기본 조회가 실패할 수 있다.
