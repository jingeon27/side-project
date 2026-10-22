> 이전 단독 배포 구성의 기록입니다. 현재 공통 EC2 운영 절차는 [공통 배포 가이드](../../../deploy/shared-instance/README.md)를 따릅니다.

# 단일 VM 배포

Oracle A1(ARM64) VM 한 대에 Caddy·Next.js·NestJS·PostgreSQL을 Docker Compose로 실행한다. 현재는 아이디·비밀번호 가입만 사용하며 소셜·개발 로그인·테스트 API는 운영에서 켜지 않는다. 사진·영상은 비공개 S3 호환(R2/S3/MinIO) 버킷에만 저장하고 서버에는 미디어 volume이 없다.

서버 정보가 없어도 CI의 `containers` 작업은 ARM64 운영 이미지를 빌드하고 격리한 PostgreSQL·HTTPS Caddy에서 가입·파일·댓글·재시작·백업 복원을 검사한다. 실제 운영 배포는 명시적으로 활성화하기 전에는 실행되지 않는다.

## 배포 흐름

1. 배포 브랜치에 push되면 기존 verify·browser와 운영 컨테이너 검증을 실행한다.
2. 컨테이너 검증이 성공한 **동일 이미지**를 일회용 Actions artifact로 전달한다. 다시 빌드하지 않는다. 배포 대상 push에서만 만들고 보관 기간은 1일이다.
3. 모든 검사가 성공하면 `GITHUB_TOKEN`으로 GHCR에 게시하고 API·웹의 `sha256` digest를 확정한다.
4. 직렬화된 deploy 작업에서 아직 배포 브랜치의 최신 커밋인지 확인한다. 오래된 커밋이면 건너뛴다.
5. SSH로 배포 파일을 전송하고, 작업 중에만 유효한 GHCR 읽기 토큰을 stdin으로 전달한다. 서버의 임시 Docker 로그인 파일은 종료 시 지운다. 별도 장기 PAT는 필요하지 않다.
6. VM에서 이미지 받기 → DB 준비 → DB 백업 → migrate deploy → 앱 교체 → 공개 HTTPS 헬스 체크 순서로 진행한다.

새 앱이 실패하면 이전 **앱 이미지**를 다시 실행한다. 마이그레이션 실패 시 앱은 교체하지 않는다. DB 스키마는 자동으로 되돌리지 않으므로 이전 앱과 호환되는 추가 중심 마이그레이션을 사용한다. 첫 배포 실패 시 앱만 멈추고 DB·미디어·백업을 보존한다. 단일 VM의 Compose 교체이므로 짧은 중단은 발생할 수 있다.

## 사용자가 처음 준비할 것

- Ubuntu ARM64 VM, SSH 접속, Docker Engine와 Compose plugin. Docker 설치는 [공식 Ubuntu 안내](https://docs.docker.com/engine/install/ubuntu/)를 따른다. 운영에는 `bash`, `curl`, `flock`(util-linux), `openssl`, `tar`도 필요하다.
- 실제 공개 도메인과 VM을 가리키는 DNS. Oracle 보안 목록·VM 방화벽에는 80/443을 열고 SSH는 필요한 접속 경로에만 허용한다. 3200·4200·5432는 공개하지 않는다.
- 처음에는 DNS만 연결한다. Cloudflare 프록시를 추가하면 실제 사용자 주소 전달을 별도로 설정해야 한다. API는 Caddy 한 단계만 신뢰한다.
- 필요하면 R2의 비공개 버킷과 해당 버킷만 읽기·쓰기·삭제 가능한 키. 최소 구성에서는 local volume으로 먼저 시작할 수 있다.
- 운영 브랜치 선택. `develop`은 예시이며 PR base가 develop이라는 이유로 운영 배포를 자동 활성화하지 않는다.

VM의 배포 사용자(예: `ubuntu`)로 다음 경로를 준비한다. Docker를 실행할 수 있는 권한도 필요하다.

```sh
sudo install -d -m 700 -o ubuntu -g ubuntu /opt/photo-contest
```

`deploy/.env.example`을 `/opt/photo-contest/.env`에 복사한 뒤 실제 값으로 수정한다.

```sh
chmod 600 /opt/photo-contest/.env
openssl rand -hex 32
```

생성한 64자리 값을 POSTGRES_PASSWORD에 넣는다. URL 인코딩 문제를 피하도록 이 템플릿에서는 hex 비밀번호를 사용한다. DOMAIN과 WEB_ORIGIN(`https://DOMAIN`)은 일치해야 한다. ACME_EMAIL은 인증서 알림을 받을 주소다. 인증서·DB는 각각 영속 volume에 남고 미디어는 버킷에 있다. 기존 DB의 비밀번호 변경은 `.env` 수정만으로 처리되지 않는다.

S3_BUCKET·AWS_ACCESS_KEY_ID·AWS_SECRET_ACCESS_KEY는 필수다. R2·MinIO는 브라우저가 직접 접속할 https:// S3_ENDPOINT를 채우고 AWS S3는 비운다. S3_REGION은 R2의 경우 auto다. 버킷 CORS에 WEB_ORIGIN의 POST를 허용한다. 키는 서버 `.env`에만 둔다. 이미지·GitHub artifact·채팅에 넣지 않는다. R2의 실제 권한·연결 검증은 키를 설정한 뒤 별도로 한다.

## GitHub 설정

저장소 Settings → Secrets and variables → Actions에서 다음 값을 등록한다. SSH 개인 키는 **Secret**, 나머지는 **Variables**다.

| 종류     | 이름                                 | 값                                     |
| -------- | ------------------------------------ | -------------------------------------- |
| Secret   | PHOTO_CONTEST_DEPLOY_SSH_KEY         | 배포용 SSH 개인 키                     |
| Variable | PHOTO_CONTEST_DEPLOY_HOST            | VM IP 또는 접속 호스트                 |
| Variable | PHOTO_CONTEST_DEPLOY_SSH_USER        | 예: ubuntu                             |
| Variable | PHOTO_CONTEST_DEPLOY_SSH_PORT        | 예: 22                                 |
| Variable | PHOTO_CONTEST_DEPLOY_SSH_KNOWN_HOSTS | 별도 경로로 확인한 VM의 known_hosts 줄 |
| Variable | PHOTO_CONTEST_DEPLOY_BRANCH          | 선택한 운영 브랜치, 예: develop        |
| Variable | PHOTO_CONTEST_DEPLOY_ENABLED         | 준비가 끝난 뒤에만 true                |

서버에 배포용 공개 키를 등록하고 개인 키는 위 Secret에 저장한다. SSH 호스트 키는 Oracle 콘솔 등 신뢰한 경로에서 fingerprint를 대조한 후 등록한다. 워크플로는 StrictHostKeyChecking을 끄거나 접속 중 키를 자동 신뢰하지 않는다.

GitHub Environment `photo-contest-production`에서 배포 이력을 확인할 수 있다. 필요한 경우 허용 브랜치와 검토자도 이 환경에서 설정한다. GHCR 패키지는 워크플로가 생성하며 이미지의 source label로 이 저장소와 연결한다. 기존에 같은 이름의 패키지가 있다면 해당 저장소의 Actions 읽기·쓰기 접근이 허용돼 있어야 한다. 패키지를 공개로 전환할 필요는 없다.

준비 후 선택한 브랜치에 새 커밋을 push하면 검증을 거쳐 배포된다. ENABLED=false이거나 브랜치 값이 비어 있으면 이미지 게시·서버 접속을 하지 않는다. 이미지 게시·artifact 저장은 GitHub 플랜의 할당량을 사용한다.

## 서버에서 백업·앱 복구

현재 릴리스는 `/opt/photo-contest/current`, 이전 릴리스는 `previous`다. 모든 작업은 같은 파일 잠금으로 동시에 실행되지 않게 한다.

```sh
# DB를 custom-format으로 백업한다. 미디어는 버킷에 있으므로 서버 백업에 포함하지 않는다.
bash /opt/photo-contest/current/scripts/backup.sh

# 캐시에 보존한 이전 앱 이미지로 복구한다. DB 마이그레이션은 되돌리지 않는다.
bash /opt/photo-contest/current/scripts/rollback.sh
```

백업은 `/opt/photo-contest/backups/<시각-릴리스>/`에 0600으로 만들고 SHA-256 체크섬을 함께 저장한다. API를 멈추지 않는다. 백업·이전 이미지·릴리스를 자동 삭제하거나 전역 Docker prune을 실행하지 않는다. VM 밖으로 백업을 복사하고 보관 용량을 관리해야 한다. 미디어는 버킷의 버전 관리·복제·수명 주기로 보존 방법을 별도로 정한다.

예를 들어 DB 백업만 매일 실행하려면 배포 사용자 crontab에 다음을 등록한다. 실제 사용량에 맞춰 시간을 정한다.

```cron
17 3 * * * /bin/bash /opt/photo-contest/current/scripts/backup.sh >> /opt/photo-contest/backup.log 2>&1
```

DB 복원은 먼저 별도 DB에 pg_restore로 검증하고, 쓰기를 멈춘 운영 점검 시간에 진행한다. 기존 운영 DB를 덮어쓰는 자동 복원 명령은 제공하지 않는다. 이미지 정리가 필요해도 current·previous의 digest는 보존해야 수동 복구할 수 있다.

## 운영 경로와 검증 한계

- Caddy는 `/backend/*`를 API로 직접 전달하고 나머지는 웹으로 보낸다. 파일은 브라우저가 버킷에 직접 올리므로 프록시를 지나지 않는다. 형식·크기는 API가 발급할 때 정하고 서명 POST 정책과 완료 시 HEAD로 제한한다.
- Next.js는 monorepo root를 tracing root로 둔 standalone 산출물과 static/public 파일만 실행한다. API 이미지는 GraphQL schema·Prisma client·migrate CLI를 포함하며 미디어 처리 런타임(sharp·MediaInfo)은 없다.
- 운영 환경에는 OAuth·Sentry·Amplitude 키를 넣지 않는다. 현재 기존 아이디·비밀번호 가입/로그인을 사용한다. 게스트 자동 계정은 별도 기능이며 이번 배포 설정에서 추가하지 않는다.
- 컨테이너 검증은 자체 인증서를 쓰는 격리한 localhost와 같은 네트워크의 test-kit S3 대역(`storage.localhost:3383`)에서 실행한다. 실제 도메인 인증서, Oracle 네트워크, GHCR 서버 접근, R2 버킷 권한·CORS는 서버·계정 설정 후 확인할 항목이다.
- 개인정보 처리방침·보관 기간은 실제 사용하는 호스팅·저장소와 백업 정책에 맞게 공개 전에 확정한다.
