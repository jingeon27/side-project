# 게시글·채팅 첨부와 S3 직접 업로드

S3 저장소를 설정하면 게시글과 채팅의 사진·동영상은 브라우저에서 private S3 버킷으로 직접 전송한다. `DATABASE`와 `FILESYSTEM`에서는 기존 API multipart 업로드를 사용한다. 프로필 사진은 기존 서버 변환 업로드를 사용한다.

## 로컬 설정

`projects/game-feedback/.env`에 서버 전용 설정을 넣고 프로젝트 집계 실행을 다시 시작한다.

```dotenv
GF_MEDIA_STORAGE=S3
GF_S3_BUCKET=<Game Feedback private 버킷>
GF_S3_REGION=ap-northeast-2
GF_S3_ACCESS_KEY_ID=<서버용 access key>
GF_S3_SECRET_ACCESS_KEY=<서버용 secret key>
```

AWS S3는 `GF_S3_ENDPOINT`를 비워 두고 `GF_S3_FORCE_PATH_STYLE=false`를 사용한다. 로컬 S3 호환 서버는 브라우저와 API 양쪽에서 접근할 수 있는 endpoint와 필요한 path-style 옵션을 지정한다. 서명 주소를 발급한 뒤 hostname을 바꾸면 서명이 깨진다. AWS 비밀 키를 `NEXT_PUBLIC_*`에 넣지 않는다.

버킷의 Block Public Access를 유지한다. 앱 역할의 `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` 권한은 해당 버킷의 `staging/*`, `objects/*`에 필요하다. 기존 [공통 IAM 정책](../../../deploy/shared-instance/s3-app-policy.json)은 버킷 내부 객체 권한을 포함한다. 브라우저에 AWS 자격 증명을 전달하지 않는다.

AWS 콘솔 → S3 → 해당 버킷 → Permissions → Cross-origin resource sharing (CORS)에 [CORS 예시](../deploy/shared-instance/s3-cors.json)를 적용한다. `AllowedOrigins`는 로컬에서 사용하는 정확한 origin과 실제 서비스 HTTPS origin으로 바꾼다. 예시 도메인을 그대로 공개하지 않는다. S3 POST는 브라우저가 multipart boundary를 정하므로 fetch에서 Content-Type 헤더를 직접 지정하지 않는다. 버킷의 기본 암호화는 유지한다.

## 요청과 검증

1. 게시글의 `POST /api/post-media/uploads`와 채팅의 `POST /api/conversations/{id}/attachments/uploads`가 인증·파일명·허용 MIME·크기(최대 25MB)를 검증하고 5분짜리 presigned POST 폼을 발급한다. 채팅은 대화 참여자 권한도 확인한다. 정책은 예약한 크기와 Content-Type 및 staging key를 제한한다.
2. 브라우저는 서명 필드와 파일을 S3로 전송한다. 서비스 쿠키와 Bearer 토큰은 S3에 보내지 않는다.
3. 게시글의 `POST /api/post-media/{id}/complete`와 채팅의 `POST /api/conversations/{id}/attachments/{attachmentId}/complete`가 소유자·만료·실제 객체 크기와 타입을 확인하고 파일 내용을 읽어 기존 signature 검증을 수행한다. 검증된 바이트는 별도 최종 객체에 저장한다. staging 주소가 재사용되어도 확정 파일을 덮어쓸 수 없다. 검증 때문에 서버에서 파일을 한 번 읽고 최종 객체를 저장하는 전송은 남는다.
4. 확정 전 파일은 조회하거나 게시글·메시지에 연결할 수 없다. 본문과 메시지에는 같은 origin의 안정적인 첨부 경로만 저장한다.
5. 조회 API가 게시글 공개 범위 또는 채팅 참여자·대화 삭제 경계와 차단·숨김 등을 확인한 후 60초짜리 S3 GET 주소로 307 이동한다. 파일과 이동 응답은 `private, no-store`다. 동영상 Range와 HEAD도 지원한다.

이미 발급된 S3 주소는 유효 시간 동안 사용할 수 있다. 글 숨김·삭제나 채팅 차단·대화 내역 삭제로 접근 권한이 없어지면 새 주소 발급은 중단되며 이전 주소는 최대 60초 후 만료된다. URL 자체가 임시 접근 권한이므로 로그나 분석 이벤트에 기록하지 않는다.

실패하면 브라우저는 예약 삭제를 시도하고 초안을 유지한다. 첨부되지 않은 업로드 예약과 staging 객체는 하루 후 정리 대상이다. 최종 객체는 백업 복구를 위한 기존 14일 보관 유예를 유지한다. 정리는 기존 운영자 `prune` 작업에서 수행하며 S3 Lifecycle을 설정한다면 staging 객체에만 별도 정책을 적용한다.

기존 개발 DB에는 프로젝트 `dev`/`dev:test` 준비 과정의 URL 가드가 있는 스키마 동기화를 사용한다. 새 운영 버전은 포함된 migration을 `migrate deploy`로 적용한다. 기존 첨부는 완료 상태로 보존하며 DB CHECK 제약은 미완료 첨부를 게시글·메시지에 연결하는 것을 거부한다.

## 확인 범위

격리 PostgreSQL·실제 AWS SDK와 로컬 S3 HTTP fixture로 POST 정책 서명/크기/타입, 완료 전 접근 거부, 완료 시 파일 검사, 주소 재사용, 중복 완료, 공개/비공개 조회, 채팅 참여자·삭제·차단, Range와 정리를 검사한다. 실제 AWS 버킷의 권한·CORS·브라우저 업로드는 사용자가 위 설정을 넣은 뒤 글쓰기와 채팅의 사진/동영상 전송으로 확인해야 한다. 로컬 fixture 성공을 실제 AWS 수신으로 기록하지 않는다.
