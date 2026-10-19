# 운영 배포

현재 구성은 Game Feedback과 공유하는 **서울 EC2 한 대, 외부 AWS RDS PostgreSQL, 서비스별 비공개 S3**다. 준비·CD·IAM·DB role·TLS·PITR 복구·롤백 명령은 [공통 배포 가이드](../../../deploy/shared-instance/README.md)를 따른다.

Photo Contest의 실제 운영 Compose는 [`deploy/shared-instance/compose.yaml`](../../../deploy/shared-instance/compose.yaml)이다. Web·API 이미지는 `linux/amd64`이며, public origin은 `PHOTO_CONTEST_SITE_URL`로 빌드하고 runtime의 `PHOTO_CONTEST_DOMAIN`과 맞춘다. `/backend/graphql`은 공통 Caddy가 Web의 Next Route Handler로 보내 캐시 무효화와 쿠키·업로드 전달을 처리하고, 나머지 `/backend/*`는 API로 직접 전달한다. runtime은 `photo_contest`, migration은 `photo_contest_migrator`를 사용하고 다른 서비스의 DB·버킷에는 접근하지 않는다.

운영은 직접 아이디·비밀번호 가입을 지원한다. OAuth를 켜면 실제 도메인의 `/backend/auth/<provider>/callback`을 등록한다. 개발 로그인·테스트 API는 운영에서 꺼져 있다. API Sentry는 서버 환경 파일의 `SENTRY_DSN`, 공개 Web Sentry·Amplitude 값은 GitHub repository variable에서 빌드 시 전달한다.

이전 Oracle ARM64·단독 Compose·로컬 DB 백업 절차는 [기록](deployment-legacy.md)으로 보존한다. 해당 Compose는 기존 컨테이너 회귀 테스트에 쓰며 새 CD의 운영 대상으로 쓰지 않는다.

공개 캐시를 도입한 릴리스는 API·Web 이미지뿐 아니라 공통 Caddyfile도 운영 호스트의 `proxy/Caddyfile`에 갱신해야 한다. 이미지 배포만으로 공통 프록시 설정이 바뀌지는 않는다. 기존 [proxy.sh](../../../deploy/shared-instance/scripts/proxy.sh)의 `validate` 후 `reload`를 실행한다. PC 경로는 내부 URL 차단→GraphQL→일반 API→Web 순서를 route 블록으로 고정한다.
