# 운영 배포

현재 구성은 Game Feedback과 공유하는 **서울 EC2 한 대, 외부 AWS RDS PostgreSQL, 서비스별 비공개 S3**다. 준비·CD·IAM·DB role·TLS·PITR 복구·롤백 명령은 [공통 배포 가이드](../../../deploy/shared-instance/README.md)를 따른다.

Photo Contest의 실제 운영 Compose는 [`projects/photo-contest/deploy/shared-instance/compose.yaml`](../deploy/shared-instance/compose.yaml)이고, 공용 프록시는 [`deploy/shared-instance/compose.yaml`](../../../deploy/shared-instance/compose.yaml)·[`Caddyfile`](../../../deploy/shared-instance/Caddyfile)이다. Web·API 이미지는 `linux/amd64`이며, public origin은 `PHOTO_CONTEST_SITE_URL`로 빌드하고 runtime의 `PHOTO_CONTEST_DOMAIN`과 맞춘다. `/backend/graphql`은 공통 Caddy가 Web의 Next Route Handler로 보내 캐시 무효화와 JSON·쿠키 전달을 처리하고, 나머지 `/backend/*`는 API로 직접 전달한다. runtime은 `photo_contest`, migration은 `photo_contest_migrator`를 사용하고 다른 서비스의 DB·버킷에는 접근하지 않는다.

운영은 직접 아이디·비밀번호 가입을 지원한다. OAuth를 켜면 실제 도메인의 `/backend/auth/<provider>/callback`을 등록한다. 개발 로그인·테스트 API는 운영에서 꺼져 있다. API Sentry는 서버 환경 파일의 `SENTRY_DSN`, 공개 Web Sentry·Amplitude 값은 GitHub repository variable에서 빌드 시 전달한다.

이전 Oracle ARM64·단독 Compose·로컬 DB 백업 절차는 [기록](deployment-legacy.md)으로 보존한다. 해당 Compose는 기존 컨테이너 회귀 테스트에 쓰며 새 CD의 운영 대상으로 쓰지 않는다.

공개 캐시를 도입한 릴리스는 API·Web 이미지뿐 아니라 공통 Caddyfile도 운영 호스트의 `proxy/Caddyfile`에 갱신해야 한다. 이미지 배포만으로 공통 프록시 설정이 바뀌지는 않으며, 호스트 Caddyfile이 릴리스와 다르면 배포가 마이그레이션 전에 멈춘다. [공용 Caddyfile 동기화](../../../deploy/shared-instance/README.md#공용-caddyfile-동기화)의 `proxy.sh sync` 후 배포를 다시 실행한다. PC 경로는 내부 URL 차단→GraphQL→일반 API→Web 순서를 route 블록으로 고정한다.

링크 게시물 릴리스는 20261020030000_post_links 마이그레이션을 API·Web 교체 전에 적용한다. S3 다운로드는 기존 GetObject 권한으로 최대 60초 presigned URL을 만든다. 긴 서명 URL을 8KB까지 전달하려면 변경한 bridge 패키지를 포함해 모바일 앱을 빌드한다. [첨부·저장 계약](post-attachments.md)을 참고한다.

미디어 presigned 전환 릴리스는 다음 순서로 배포한다. 모든 사진·동영상은 브라우저가 S3로 직접 올리고 읽으며 API는 파일을 받거나 읽거나 변환·중계하지 않는다. 이 저장소의 설정 파일 변경만으로 운영 버킷이 갱신되지는 않는다.

1. 먼저 기존 업로드를 유지하는 호환 버전을 배포한다. `MediaStorage`의 읽기·삭제·다운로드 키 검사가 JPG·PNG를 허용해야 한다. 새 파일을 쓴 뒤에는 이 호환 버전 이상만 롤백 대상으로 쓴다. 현재 업로드 이전 바이너리는 JPG·PNG를 읽지 못한다.
2. Photo Contest 버킷에 [CORS](../deploy/shared-instance/s3-cors.json)의 origin을 실제 웹 도메인으로 바꿔 적용한다(POST만 필요하다. 조회는 307 서명 GET 이동이라 CORS가 없어도 된다). localhost 예시는 운영에서 제거한다. 수명 주기는 [공통 규칙](../../../deploy/shared-instance/s3-lifecycle.json)만 쓴다. staging 키를 쓰지 않으므로 이전에 적용한 `staging/` 만료 규칙은 지워도 된다. 완료하지 않은 업로드와 쓰지 않은 파일은 API 정리 작업이 지운다. 버킷 공개 접근 차단·암호화·Versioning은 유지한다. IAM은 기존 GetObject(HEAD·서명 GET)·PutObject(서명 POST)·DeleteObject로 충분하며 CopyObject는 쓰지 않는다.
3. `20261021010000_presigned_post_uploads`, `20261022030000_presigned_submission_uploads`, `20261022152000_presigned_group_avatars` expand 마이그레이션을 적용한 뒤 API·Web을 함께 교체한다. `PostUpload.stagingKey`는 완료 전의 최종 키를 담고, `completionKey`·`completionStartedAt`·`PostUploadAttempt`는 쓰지 않지만 남겨 둔다. `tokenHash`는 NOT NULL을 유지하고 새 티켓에도 사용하지 않는 임의 해시를 채워 이전 Prisma client의 행 읽기를 보장한다. 기존 Web 탭의 `uploadPostMedia`·`uploadSubmissionPhoto`·`uploadGroupAvatar` 호출은 실패하므로 새로고침한다.
4. `/post-uploads`·`/uploads` raw 경로, GraphQL multipart, 로컬 디스크 저장소(`STORAGE_BACKEND`·`STORAGE_DIR`)는 제거했다. API 이미지에서 sharp·image-size·mediainfo.js가 빠지므로 메모리 사용량이 줄어든다. `/backend/media/:id` 등 고정 경로는 권한을 확인한 뒤 `private, no-store` 307로 60초 서명 GET에 보낸다.

DB는 자동으로 되돌리지 않는다. `tokenHash` 컬럼 삭제는 후속 코드가 해당 컬럼을 전혀 조회하지 않는 버전까지 배포하고 그 이전 버전으로의 롤백을 종료한 뒤 별도 contract 마이그레이션으로 진행한다. 단순히 다음 릴리스라는 이유로 삭제하면 이전 Prisma client의 기본 조회가 실패할 수 있다.
