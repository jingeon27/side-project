# 파일 업로드와 S3

게시글·채팅 첨부와 프로필 사진은 모두 서명 발급 → 브라우저 S3 POST → 완료 확인으로 처리한다. API는 JSON 메타데이터만 받는다. 저장소를 선택하는 DATABASE·FILESYSTEM 모드와 프록시 multipart 업로드는 제거한다. 조회는 사용자·공개 범위·차단·대화 접근을 확인한 뒤 60초 presigned GET으로 307 이동한다.

완료는 HEAD의 크기·타입·ETag와 앞 4KB의 파일 서명을 확인하고 같은 ETag를 조건으로 별도 최종 키에 CopyObject한다. 발급한 주소를 다시 써도 게시된 파일은 덮어쓰지 못한다. 프로필 사진은 웹에서 방향·중앙 자르기·최대 512px JPEG 변환으로 촬영 메타데이터를 제거한다. 서버의 파일 헤더 검사는 이미지 전체 디코딩이나 제3자 클라이언트의 메타데이터 제거를 보장하지 않는다.

## 기본 로컬 실행

`yarn workspace @side/game-feedback dev:test`와 `yarn workspace @side/game-feedback admin:dev`를 사용한다. 로컬 개발도 프로젝트 `.env`에 설정한 실제 AWS S3 버킷과 자격 증명을 사용한다. 버킷이 비어 있어도 로컬 저장소 서버를 시작하거나 가짜 자격 증명을 채우지 않는다.

통합·브라우저 테스트는 같은 버킷의 `<GF_S3_KEY_PREFIX>/tests/<실행 ID>/` 아래에서만 객체를 만들고 종료 시 그 경로만 정리한다. 버킷 생성·삭제는 하지 않는다. 테스트 계정에는 해당 경로의 GetObject·PutObject·DeleteObject와 `s3:prefix` 조건으로 제한한 ListBucket 권한이 필요하다. 단위 테스트는 AWS에 접속하지 않고 설정·서명 정책만 확인한다. 강제 종료로 정리가 중단되면 실패한 실행 ID의 경로만 확인해 정리한다.

브라우저 테스트를 실행하려면 버킷 CORS에 실제 사용하는 웹 origin(기본 `http://127.0.0.1:3301`, `http://127.0.0.1:3302`, `http://127.0.0.1:3304`, 관측 레인 `http://127.0.0.1:3353`, `http://127.0.0.1:3354`)을 허용한다. CI는 Repository Variables의 `GAME_FEEDBACK_S3_BUCKET`·`GAME_FEEDBACK_S3_KEY_PREFIX`와 Secrets의 `GAME_FEEDBACK_S3_ACCESS_KEY_ID`·`GAME_FEEDBACK_S3_SECRET_ACCESS_KEY`를 앱의 `GF_S3_*` 환경변수로 전달한다. 공유 배포 검증에는 Photo Contest의 S3 설정도 필요하다. 설정이 없는 통합 검사는 대역으로 대체하거나 성공 처리하지 않고 실패한다. 외부 fork PR처럼 Secrets가 제공되지 않는 실행도 동일하다.

관리자 화면은 http://127.0.0.1:3303 이며 로컬 관리자 로그인을 사용한다. 개발 API의 테스트 인증이 켜져 있어야 테스트 관리자가 문의 담당자가 된다. 일반 개발 모드에서 실제 ADMIN 계정이 없으면 관리자·프로필 인증 문의 모두 SUPPORT_UNAVAILABLE을 반환한다.

## 실제 AWS에서 로컬 테스트하기

기존 버킷 `jingeon-side-project`의 `game-feedback/local/` 경로를 예로 든다. 운영 파일과 분리된 경로에만 권한을 준다.

1. AWS 콘솔에서 **IAM → 사용자 → 사용자 생성**으로 이동한다. 이름은 `game-feedback-local-s3`처럼 정하고 콘솔 로그인 권한은 추가하지 않는다. 기존 `s3-allow` 역할과는 다른 IAM 사용자다. 역할은 EC2 또는 임시 자격 증명에 사용하며 이 사용자는 로컬 개발용 키를 발급받는 대상이다.
2. **권한 직접 연결 → 정책 생성 → JSON**에 아래 정책을 넣고 `game-feedback-local-s3`라는 이름으로 저장한다. 사용자 생성 화면을 새로고침해 정책을 선택하거나, 생성된 사용자의 **권한 → 권한 추가**에서 연결한다. 정책은 IAM 사용자에 연결하며 버킷의 공개 정책이나 ACL에 붙이는 내용이 아니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::jingeon-side-project/game-feedback/local/*"
    }
  ]
}
```

3. 사용자의 **보안 자격 증명 → 액세스 키 → 액세스 키 생성**에서 **Command Line Interface(CLI)**를 선택한다. 설명을 붙이고 발급한다. Access key ID와 Secret access key를 로컬에 보관한다. Secret은 생성 화면을 닫은 뒤 다시 볼 수 없다. 채팅·Git·프런트 환경변수에는 넣지 않는다.
4. AWS CLI에서 다음 명령을 실행하고 발급한 키를 대화형 입력으로 넣는다. 키를 명령 자체에 쓰지 않는다.

```sh
aws configure --profile game-feedback-local
# Access key ID: 발급한 값
# Secret access key: 발급한 값
# Region: ap-northeast-2
# Output: json
aws sts get-caller-identity --profile game-feedback-local
```

5. Git에서 제외된 `projects/game-feedback/.env`에 아래를 지정한다. GF_S3_ACCESS_KEY_ID·GF_S3_SECRET_ACCESS_KEY가 비어 있으면 AWS SDK가 AWS_PROFILE 또는 EC2 역할의 자격 증명을 사용한다. 직접 키를 쓰는 경우에도 두 값은 서버 전용이다. 컨테이너 smoke는 호스트의 AWS_PROFILE을 공유하지 않으므로 직접 키를 지정한다.

```dotenv
AWS_PROFILE=game-feedback-local
GF_S3_BUCKET=jingeon-side-project
GF_S3_REGION=ap-northeast-2
GF_S3_KEY_PREFIX=game-feedback/local
GF_S3_ENDPOINT=
GF_S3_FORCE_PATH_STYLE=false
GF_S3_ACCESS_KEY_ID=
GF_S3_SECRET_ACCESS_KEY=
```

6. 버킷 CORS에 `http://localhost:3300`을 허용한다. [CORS 예시](../deploy/shared-instance/s3-cors.json)의 POST·GET·HEAD, Content-Type·Range와 응답 노출 헤더를 참고한다. API와 웹 개발 서버를 다시 시작한 뒤 글·채팅·프로필에서 업로드한다. 개발자 도구 Network에서 파일 POST가 S3로 가고 API에는 JSON만 가는지 확인한다. 공개 접근 차단과 BucketOwnerEnforced를 유지한다.

AWS 공식 자료: [IAM 사용자 키 발급과 CLI 설정](https://docs.aws.amazon.com/cli/latest/userguide/cli-authentication-user.html), [S3 경로별 IAM 정책](https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-policies-s3.html). 장기 키 대신 임시 자격 증명을 사용할 수 있는 계정은 [로컬 개발용 AWS 로그인](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html)도 사용할 수 있다.

## Terraform과의 관계

앱의 S3 전환은 버킷·IAM 리소스나 Terraform state를 바꾸지 않는다. 두 서비스는 기존 비공개 버킷 하나(`jingeon-side-project`)를 서비스 폴더로 나눠 쓰고, Terraform은 이 버킷을 만들거나 설정하지 않은 채 `game-feedback/production/`만 다루는 전용 IAM 사용자를 만든다. 액세스 키는 관리하지 않는다. 적용한 구성은 `terraform output -raw media_bucket_name`, `terraform output -json s3_key_prefixes`, `terraform output -json s3_iam_user_names`의 해당 서비스 값을 사용한다. 기본 사용자 이름은 `side-shared-game-feedback-s3`이며 발급 절차는 위와 같다.

같은 버킷에서 운영은 `game-feedback/production/`, 로컬은 `game-feedback/local/`, CI는 `game-feedback/ci/`를 쓴다. 로컬·CI 키에는 자기 폴더 권한만 주어 운영 파일에 닿지 않게 한다. 운영 앱은 `GF_S3_KEY_PREFIX`가 `game-feedback/<폴더>`가 아니면 시작하지 않는다. name_prefix를 바꾸면 IAM 사용자 교체가 계획될 수 있다.

버킷 CORS는 Terraform이 관리하지 않는다. 콘솔에서 같은 버킷의 규칙 배열에 운영 도메인, `http://localhost:3300`, 브라우저 테스트 origin을 둔다. 앱 키는 Terraform apply 권한이나 state 버킷 권한을 받을 필요가 없다.

## 기존 파일 이행과 배포

기존 DB의 bytes와 FILESYSTEM 객체는 자동 삭제하지 않는다. 별도 이행 도구로 참조 파일을 S3에 복사하고 크기·내용을 확인한 뒤 DB 참조를 바꾼다. 이미 S3에 있는 참조와 고정 조회 URL은 유지한다. 이전 컬럼은 이행·롤백이 끝날 때까지 남긴다. 개발 데이터와 운영 데이터는 각각 해당 저장소에 이행한다.

새 AvatarUpload 테이블을 추가하는 migration을 먼저 적용하고 새 API·웹을 함께 교체한다. 예전 업로드 탭은 새로고침한다. 실제 AWS 키·CORS·업로드 검증과 Terraform apply는 로컬 대역의 테스트 통과와 별도로 확인한다.

이행 도구는 API 빌드 후 실행한다. 로컬에서는 프로젝트 `.env`를 읽고 개발 DB URL 가드를 적용한다. 운영은 배포 환경변수와 NODE_ENV=production을 제공해야 한다. 먼저 백업하고 업로드 쓰기를 잠시 중단한 상태에서 전환한다. 기본 명령은 건수 확인만 한다.

```sh
yarn workspace @game-feedback/api build
yarn workspace @game-feedback/api exec node scripts/migrate-media.ts
# 대상과 백업을 확인한 뒤 실행
yarn workspace @game-feedback/api exec node scripts/migrate-media.ts --apply
# 기존 파일 저장소가 있는 경우 --source-directory=/absolute/media/path 추가
```

한 파일씩 최대 25MB만 읽고 S3의 크기·타입·SHA-256을 재검증한다. 실패하면 해당 파일의 DB 참조는 유지된다. 재실행 시 이미 S3로 옮긴 파일은 건너뛴다. 이전 파일 원본은 유지하며 DB bytes를 비우기 전의 백업을 보관한다. 기존 S3 객체를 다른 버킷으로 옮기는 도구는 아니므로 운영 버킷 이름을 동시에 변경하지 않는다.
