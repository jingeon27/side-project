> 이전 Lightsail 단독 배포 기록입니다. 현재 운영은 [공통 EC2·RDS·S3 가이드](../../../../deploy/shared-instance/README.md)를 따릅니다. 이 디렉터리의 Dockerfile과 Compose는 기존 회귀 테스트에서도 사용합니다.

# Lightsail 서울 운영

Ubuntu 24.04 LTS의 IPv4 2GB 인스턴스 한 대에서 Caddy, Next.js, NestJS, PostgreSQL을 실행한다. 이미지는 GitHub Actions에서 빌드하며 서버에서 Yarn/Next 빌드를 하지 않는다. Admin은 이 서버에 배포하지 않고 로컬 React 서비스에서 SSH 터널로 연결한다.

## 비용과 용량

기본 `small_3_0`는 월 $12, 2vCPU, RAM 2GB, SSD 60GB, 월 전송량 3TB다. 서울의 포함량 초과 인터넷 송신은 $0.13/GB이며 수신과 송신이 포함량을 함께 소모한다. AWS의 2026-10-19 [전송량 설명](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-data-transfer-allowance.html)을 기준으로 했다. 세금, 도메인, 선택한 스냅샷·외부 저장소·패키지 저장소 비용은 별도다. 인스턴스에 연결하지 않은 Static IP도 과금 여부를 확인한다.

이는 동시 접속자 보장이 아니다. 영상은 특히 전송량과 디스크를 빠르게 사용한다. 파일을 S3/R2에 저장해도 현재는 API가 권한을 확인하고 전송하므로 Lightsail 송신량이 발생한다. 공개 CDN으로 채팅 파일을 노출하지 않는다. 부하 측정 후 번들 상향 또는 인증된 파일 전송 구조 분리를 결정한다.

`GF_BUDGET_EMAIL`을 지정해 프로비저닝하면 Lightsail 월 $20 예산에 실제 비용 80%와 예측 비용 100% 이메일 알림을 만든다. 알림은 지연될 수 있으며 트래픽 제한이나 과금 차단 장치가 아니다. Lightsail 콘솔의 네트워크 전송량과 디스크도 확인한다.

## 최초 설정: 사용자가 할 일

1. AWS 계정에서 서울(`ap-northeast-2`) Lightsail SSH 키 페어를 준비하고 개인키를 로컬에 보관한다. AWS CLI 로그인과 CloudFormation/Lightsail 권한이 필요하다. 예산 알림을 만들면 Budgets 권한도 필요하다.
2. 아래 명령을 **직접** 실행하면 유료 인스턴스와 Static IP를 만든다. 이 저장소를 수정하거나 PR을 만드는 것만으로 AWS가 생성되지 않는다.

   ```sh
   GF_BUDGET_EMAIL=jingeon27@gmail.com bash projects/game-feedback/deploy/lightsail/provision.sh <서울-키페어-이름>
   ```

   활성 Ubuntu 24.04 blueprint를 조회하고 `stack.yaml`을 적용한다. SSH 허용 CIDR은 기본 전체 IPv4이며 키 인증을 사용한다. 제한할 때에는 GitHub 배포 러너의 접근 경로도 준비해야 한다. SSH 키는 GitHub 전용 키를 서버의 `ubuntu/.ssh/authorized_keys`에 별도 등록하는 편이 좋다. Docker 그룹 사용자는 호스트 관리 권한이 있으므로 전용 키를 관리한다.

3. 출력된 Static IP로 도메인의 A 레코드를 지정한다. 이 템플릿은 IPv4만 제공하므로 다른 주소를 가리키는 AAAA 레코드를 두지 않는다. 80/443은 공개하고 DB 포트는 열지 않는다.
4. `ssh ubuntu@<IP>`로 접속한 뒤 `cloud-init status --wait`와 `docker compose version`을 확인한다. Docker 그룹 적용을 위해 다시 접속한다. `/srv/game-feedback`은 이 서비스 전용이다.
5. `production.env.example`을 서버 `/srv/game-feedback/.env`로 복사하고 **서버에서 편집**한다. 권한은 600이다. `source .env`나 `docker compose config`로 비밀을 출력하지 않는다. 최소 설정은 다음과 같다.

   | 변수                                     | 값                                             |
   | ---------------------------------------- | ---------------------------------------------- |
   | `GF_DOMAIN`                              | `https://` 없이 실제 도메인                    |
   | `GF_CONTACT_EMAIL`                       | `contact@bambyul.com`                          |
   | `GF_IMAGE_PREFIX`                        | `ghcr.io/jingeon27/side-project-game-feedback` |
   | `GF_DB_PASSWORD`, `GF_DB_ADMIN_PASSWORD` | 각각 따로 생성한 `openssl rand -hex 32` 값     |
   | OAuth client ID/secret                   | 아래 제공자 중 적어도 한 쌍의 실제 운영 키     |
   | `GF_INDEXING`                            | 최초에는 `false`                               |

   운영은 HTTPS origin, 강한 DB 암호, 완전한 OAuth 설정을 검사한다. 테스트 계정·데모·Next testing API는 꺼져 있고 설정으로 켜면 시작을 거부한다. Supercell 조회에는 실제 API 토큰과 서버 Static IP 등록이 별도로 필요하다.

6. OAuth 제공자에 실제 도메인의 callback을 등록한다. 제공자가 허용한 앱 상태·동의 항목도 확인한다.

   | 제공자  | Callback                                            |
   | ------- | --------------------------------------------------- |
   | Google  | `https://<도메인>/api/auth/google/callback`         |
   | X       | `https://<도메인>/api/auth/social/x/callback`       |
   | 카카오  | `https://<도메인>/api/auth/social/kakao/callback`   |
   | Discord | `https://<도메인>/api/auth/social/discord/callback` |

7. GitHub 저장소의 Actions 변수와 `production` Environment의 secret을 설정한다. **빌드에도 필요한 변수는 repository variable**로 둔다.

   | 종류     | 이름                 | 내용                                       |
   | -------- | -------------------- | ------------------------------------------ |
   | Variable | `GF_SITE_URL`        | `https://<도메인>` origin, 마지막 `/` 없음 |
   | Variable | `GF_CONTACT_EMAIL`   | 문의 이메일                                |
   | Variable | `GF_SSH_HOST`        | Static IP 또는 SSH용 호스트                |
   | Variable | `GF_SSH_USER`        | `ubuntu`                                   |
   | Variable | `GF_DEPLOY_ENABLED`  | 준비 완료 후 `true`                        |
   | Secret   | `GF_SSH_PRIVATE_KEY` | 등록한 배포 SSH 개인키 전체                |
   | Secret   | `GF_SSH_KNOWN_HOSTS` | 검증한 호스트 키의 known_hosts 행          |

   호스트 키 fingerprint는 Lightsail 브라우저 콘솔에서 `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`로 확인하고 로컬에서 취득한 키와 비교한다. CD에서 검증 없이 `ssh-keyscan`을 실행하지 않는다. GHCR에는 워크플로의 단기 `GITHUB_TOKEN`을 사용하므로 별도 장기 PAT가 필요 없다. Packages 정책이 허용하고 GitHub Actions에 package read/write 권한이 있어야 한다.

8. 기능 PR을 `develop`에서 검토하고 준비된 변경을 `main`으로 반영한다. `main` push 또는 `main`의 수동 workflow 실행만 운영 배포 대상이다. 기능 PR과 develop 검증은 AWS에 연결하지 않는다. 아직 AWS·도메인·secret이 준비되지 않았다면 `GF_DEPLOY_ENABLED`를 켜지 않는다.

## CD 동작

`.github/workflows/game-feedback.yml`은 코드 생성, 타입/린트, 단위·API·브라우저 검사와 실제 Docker 스택 검사를 수행한다. Docker 검사는 새 프로젝트에서 HTTPS·운영 migration·비로그인 읽기·테스트 인증 차단·미디어 권한/Range·SSE·재시작 보존·새 DB로 백업 복구를 확인한다. 외부 OAuth 또는 AWS를 호출하는 검사는 아니다.

검증된 linux/amd64 API/Web 이미지만 GHCR에 커밋 SHA 태그로 올린다. 배포는 verify와 containers 작업이 모두 성공해야 하며, 실행 시점의 최신 main인지 확인한다. 같은 서비스의 배포는 직렬화하고 진행 중 migration을 취소하지 않는다. Environment에 승인 규칙을 설정했다면 GitHub의 해당 규칙이 적용된다.

SSH로 `/srv/game-feedback/releases/<sha>`에 비밀 없는 네 파일만 전달한다. 서버 `.env`는 덮어쓰지 않는다. 서버는 이미지 pull → 설정 검증 → DB 준비 → 기존 서비스 백업 → `prisma migrate deploy`와 카테고리 seed → 서비스 health 확인 순서로 진행한다. 성공한 버전은 `.deployed-tag`와 `current`에 기록한다. 프록시는 SSE와 Next 스트리밍을 버퍼링하지 않는다.

새 앱 health가 실패하면 이전 이미지와 배포 설정을 다시 시작한다. DB migration은 되돌리지 않는다. 앞으로의 migration도 이전 앱과 호환되는 추가 변경과 이후 정리 단계로 나눠야 한다. migration 실패 시 기존 앱을 계속 두며 첫 배포 실패 시 실패한 앱을 중지하고 DB는 보존한다. 외부 DNS/TLS 오류나 이미 적용된 SQL을 자동으로 되돌린다고 보장하지 않는다.

DB는 PostgreSQL 18 전용 volume에 있고 앱 역할에 superuser·DB 생성·역할 생성 권한이 없다. API는 호스트 `127.0.0.1:4300`, DB/Web은 Docker 내부에만 노출된다. 앱 컨테이너는 non-root이며 메모리·로그 크기를 제한한다. 2GB 호스트의 일시적인 메모리 부족을 줄이기 위해 swap 2GB를 구성하지만 처리량 보장은 아니다.

## 운영 확인과 검색 공개

```sh
ssh ubuntu@<IP>
bash /srv/game-feedback/current/ops.sh status
curl --fail https://<도메인>/api/health
systemctl status game-feedback-backup.timer
journalctl -u game-feedback-backup.service --since yesterday
df -h
```

실제 OAuth 가입/재로그인, Supercell, 계정 차단/신고/문의, WebView, 업로드와 다운로드를 운영 도메인에서 확인한다. 접속 로그에서 URL·request/response headers를 제외해 OAuth code와 쿠키가 남지 않게 했다. 앱의 health는 DB 연결까지 확인하며, 현재 외부 Sentry/Amplitude 수신은 연결·검증하지 않았다. 이 배포 설정을 외부 모니터링이 완성된 것으로 해석하지 않는다.

실제 콘텐츠·약관·개인정보·문의 경로와 SEO를 확인한 뒤 서버 `.env`의 `GF_INDEXING=true`로 바꾸고 같은 SHA를 재배포한다. title/canonical/JSON-LD, robots, sitemap과 Search Console은 실제 도메인에서 확인한다. 비밀이 아닌 공개 도메인/문의 이메일은 빌드에도 쓰이므로 GitHub variable도 일치시킨다.

## 로컬 Admin

우선 일반 소셜 로그인으로 실제 사용자 계정을 만든다. SSH에서 다음으로 사용자 ID를 확인하고 해당 계정에만 운영 권한을 부여한다.

```sh
bash /srv/game-feedback/current/ops.sh operator users
bash /srv/game-feedback/current/ops.sh operator grant <실제-사용자-id>
```

운영자는 기존 사용자 활동과 동일한 권한 검사와 감사 기록을 거친다. 테스트 계정과 밴된 계정에는 발급하지 않는다. 로컬의 별도 터미널에서 SSH 터널을 유지한다.

```sh
ssh -N -L 14300:127.0.0.1:4300 ubuntu@<IP>
```

저장소 루트에서 아래와 같이 실행하면 한 시간짜리 세션을 **로컬 Vite 프록시만** 사용한다. token을 브라우저 번들·localStorage·Git·CI 로그에 넣지 않는다.

```sh
GF_ADMIN_API_ORIGIN=http://127.0.0.1:14300 \
GF_ADMIN_WEB_ORIGIN=https://<도메인> \
GF_ADMIN_ACCESS_TOKEN="$(ssh ubuntu@<IP> 'bash /srv/game-feedback/current/ops.sh operator session <실제-사용자-id>')" \
corepack yarn workspace @side/game-feedback admin:dev
```

http://127.0.0.1:3303 에 접속한다. 이 모드는 테스트 로그인 버튼을 숨긴다. 만료되면 Vite를 중지하고 같은 명령으로 새 세션을 발급한다. Admin 서버를 공인 IP로 바인딩하지 않는다. 운영 API에 테스트 인증 endpoint를 여는 방식이 아니다.

## 파일과 백업

기본 `FILESYSTEM`은 추가 요금 없이 private media volume을 사용한다. DB에는 파일 메타데이터만 넣고 실제 bytes는 volume에 저장한다. 이미지/동영상의 형식·시그니처·25MB 제한과 게시글·채팅 권한을 유지한다. 기존 개발 DB의 bytes 파일도 계속 읽는다. 운영에서 FILESYSTEM→S3를 설정만 바꿔 전환하면 기존 파일이 이동하지 않으므로, 이관 절차 없이 변경하지 않는다.

선택한 S3/R2도 비공개 bucket을 사용한다. `GF_S3_*`를 설정하고 해당 bucket의 objects prefix에 Get/Put/Delete만 허용하는 자격 증명을 사용한다. 별도의 backup bucket에는 `GF_BACKUP_*`로 Get/List/Put와 multipart에 필요한 권한을 관리한다. bucket public access는 해제하며 TLS와 서버측 암호화를 적용한다. endpoint는 HTTPS여야 한다. 외부 자격 증명과 실제 S3/R2 송수신은 별도로 확인한다.

매일 약 03:00 KST에 DB `pg_dump -Fc`와 filesystem archive를 서버 `backups/<UTC>-<random>-<sha>`에 private 권한으로 저장한다. 배포 전에도 같은 백업을 만든다. 완료된 로컬 백업은 7일 보관한다. 선택한 외부 bucket이 있으면 두 파일을 streaming multipart로 복사한다. 외부 복사 실패는 작업 실패로 남기고 로컬 백업을 보존한다. 외부 bucket의 수명 주기/7일 이상 보존 정책은 별도 설정이다. **기본 로컬 백업만으로 서버 디스크 유실을 복구할 수 없다.** 운영 데이터가 생기기 전에 외부 백업 또는 별도 스냅샷을 구성한다.

S3 파일은 private object bucket 자체의 수명 주기·versioning·복구 정책도 관리해야 한다. 로컬 tar는 S3 bucket을 복사하지 않는다. daily prune은 미등록 업로드를 정리하고 참조가 끊긴 객체를 14일 더 보관해 7일 DB 백업의 파일을 유지한다. daily backup과 prune은 배포와 같은 lock으로 직렬화된다.

```sh
bash /srv/game-feedback/current/ops.sh backup
```

복구는 **기존 database volume이 전혀 없는 새 서버/새 배포**에서만 가능하다. 기존 운영 DB에 덮어쓰지 않는다. 백업명에 기록된 SHA의 이미지를 GHCR에서 보존하고 새 서버에 동일 release 파일·도메인/저장소 설정을 준비한다. 백업 두 파일을 새 서버의 private 디렉터리에 복사하고 다음을 실행한다.

```sh
# SHA는 백업 파일명에 기록된 40자 커밋 값이다. 필요한 private 이미지는 먼저 login/pull한다.
bash /srv/game-feedback/releases/<sha>/ops.sh restore /srv/game-feedback/recovery/<backup> <sha> --new-stack
bash /srv/game-feedback/releases/<sha>/ops.sh deploy <sha>
```

복구 archive는 상대 경로의 regular file만 허용하고 DB 복구는 단일 트랜잭션이다. 복구 실패가 남긴 새 volume도 자동 삭제하지 않는다. 운영자는 실패 원인을 확인하고 또 다른 새 스택에서 재시도한다. 주기적으로 별도 서버에서 복구를 확인한다. `docker compose down -v`, DB reset과 운영 데이터 강제 삭제를 배포 명령에 사용하지 않는다.

## 자원 종료

CloudFormation의 Instance/Static IP는 데이터 보호를 위해 Retain이다. 스택을 삭제해도 두 자원과 요금이 남을 수 있다. 서비스를 종료할 때 외부 백업과 복구 여부를 확인한 뒤 Lightsail 콘솔에서 인스턴스·Static IP·스냅샷·bucket·예산 등 남은 자원을 직접 확인한다. 이 저장소는 종료 시 자동 데이터 삭제를 수행하지 않는다.
