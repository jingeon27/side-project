# 게시물 첨부와 저장

게시물에는 사진·동영상 또는 HTTP·HTTPS 링크 중 하나가 필요하다. 파일과 링크를 함께 넣을 수도 있다. 링크만 있는 게시물은 kind=LINK, mediaUrl=null이다. 제목·공유 권리 동의·그룹 멤버십·대회 접수 규칙은 첨부 방식과 관계없이 적용한다.

Post.uploadId는 nullable로 확장하고 linkUrl을 추가한다. 기존 파일·게시물은 보존한다. DB의 Post_attachment_check도 첨부가 하나 이상 있는지 확인하며 기존 업로드 FK의 RESTRICT 동작을 유지한다. 20261020030000_post_links 마이그레이션은 격리 테스트 DB에서 검증하며 개발·운영 DB 적용은 별도 배포 절차다.

링크는 공백 제거 후 최대 2048자, HTTP·HTTPS, 인증정보 없는 절대 주소만 허용한다. API가 외부 페이지를 가져오지 않아 사용자 URL로 내부 서버에 요청하지 않는다. 외부 링크에는 noopener·noreferrer·ugc를 붙인다. 유튜브 재생은 정확한 youtube.com·www.youtube.com·m.youtube.com·youtu.be 호스트와 11자 동영상 ID만 사용하고, 사용자가 재생 버튼을 누른 뒤 youtube-nocookie.com 프레임을 연다. 임의 주소를 iframe에 넣지 않는다.

공개 그룹의 링크는 익명 SSR과 JSON-LD의 citation에 포함한다. 링크 게시물의 사진·파일·썸네일을 만들어 넣지 않는다. 비공개 그룹의 링크도 기존 게시물과 같은 권한·noindex·SEO 제외 정책을 따른다.

## 파일 업로드

등록 버튼을 누르면 브라우저가 사진 전송량을 줄인 다음 `requestPostUpload(groupId, contentType, byteSize)`로 15분짜리 저장소 POST 티켓을 받는다. 서버가 `staging/` 키를 만들며 JPEG·PNG·WebP는 10MB, MP4·WebM은 100MB 이하만 허용한다. POST policy는 키·타입·신고한 정확한 파일 크기를 고정한다. 서명은 파일 내용의 안전성을 보장하지 않으므로 완료 검증을 거쳐야 게시할 수 있다.

브라우저는 `fields`를 먼저, `file`을 마지막에 넣은 FormData를 `url`로 POST한다. multipart Content-Type 경계는 브라우저가 정하고 저장소에 세션 쿠키를 보내지 않는다. 이후 `completePostUpload(uploadId)`가 소유자·그룹 멤버십·만료를 다시 검사하고 HEAD 확인 → 서버 전용 최종 키로 복사 → 최종 객체 Range 검증을 수행한다. 검증된 `storageKey`만 createPost에 사용할 수 있으며 완료 후 등록 유효기간은 1시간이다. 이미 완료된 요청의 재시도는 같은 결과를 반환한다.

사진은 Range로 실제 형식과 해상도를 읽어 40MP 상한을 검사하며 서버에서 다시 인코딩하지 않는다. 동영상은 MediaInfo로 MP4(H.264/AAC)·WebM(VP8·VP9/Opus·Vorbis)와 5분 상한을 검사한다. Range 캐시와 분석 동시성·작업량을 제한한다. 사진 헤더 검사는 파일 전체의 디코딩 성공을 보장하지 않는다.

브라우저가 사진을 다시 그리면 JPEG로 전송하지만 디코딩·변환을 할 수 없는 지원 형식은 원본을 보낸다. 서버는 사진·동영상의 EXIF·GPS 등 메타데이터를 제거하지 않는다. 공개 그룹의 다운로드에도 업로드된 파일의 위치·촬영 정보가 남을 수 있다. 게시자는 공유 전에 파일 내용을 확인한다.

로컬도 같은 티켓과 FormData 계약을 사용한다. `STORAGE_BACKEND=local`일 때만 `/backend/local-post-uploads`를 등록하며 URL의 HMAC·만료를 파일 본문을 읽기 전에 확인한다. 업로드를 임시 파일에 스트리밍한 후 원자적으로 staging을 교체한다. 운영 shared-instance는 S3를 강제한다.

로컬에서 실제 S3를 시험하려면 프로젝트 `.env`에 `STORAGE_BACKEND=s3`, `S3_BUCKET=jingeon-side-project`, `S3_REGION=ap-northeast-2`와 AWS SDK가 사용할 자격 증명을 설정한다. `game-feedback/*`로 제한한 IAM 정책을 쓰는 경우 `S3_KEY_PREFIX=game-feedback/photo-contest`를 추가하면 새 임시 객체는 `game-feedback/photo-contest/staging/<UUID>`, 완료 객체는 `game-feedback/photo-contest/<UUID>.<확장자>`에 저장한다. 버킷 값에는 경로를 붙이지 않는다. DB에는 전체 객체 키를 기록하므로 prefix 설정 이전의 파일도 계속 읽는다. 로컬 파일 저장소의 경로는 바뀌지 않는다. prefix를 쓰면 S3 staging 수명 주기의 필터도 같은 prefix에 맞춘다. 이 설정은 실제 AWS 권한이나 버킷 정책을 변경하지 않는다.

미사용 staging과 완료되지 않은 최종 복사본은 DB 정리 작업이 재시도한다. 복사 후보 키는 외부 I/O 전에 추적하며 완료 경합에서 게시되지 않은 복사본도 정리한다. S3의 `staging/` current/noncurrent 객체는 수명 주기로 1일 뒤 정리한다. 로컬도 DB 행이 사라진 뒤 재전송되거나 프로세스 중단으로 남은 staging·타입 정보·임시 업로드 파일을 1일 경과 후 배치 한도 안에서 정리한다. UUID 업로드 파일만 검사하고 심볼릭 링크를 따라가지 않는다. S3 수명 주기 처리는 비동기이며 최종 게시 파일에는 이 만료 규칙을 적용하지 않는다.

기존 대회 Submission도 `requestUploadUrl(contestId, contentType, byteSize)` → 저장소 FormData POST → `completeSubmissionUpload(uploadId)` → `createSubmission`으로 전송한다. 대회 사진의 서명은 5분이며 JPEG·PNG·WebP 10MB 이하만 예약할 수 있다. 완료 단계에서 접수 기간과 소유자·멤버십을 재확인하고, 원본을 고정한 뒤 기존 sharp의 실제 디코딩·40MP 검사·EXIF 방향 보정·1600px WebP 변환·메타데이터 제거를 수행한다. 대회 파일은 게시물 업로드 ID로 사용할 수 없다. 게시물과 대회의 완료 동시성 제한·후보 객체 추적·실패 복구는 `MediaUploadService`가 공유한다. 제출된 대회 사진은 미사용 게시물 업로드 정리에서 제외한다.

그룹 대표 사진도 `requestGroupAvatarUpload(groupId, contentType, byteSize)` → 저장소 FormData POST → `completeGroupAvatarUpload(uploadId)` → `updateGroupProfile(avatarId)`로 전송한다. 서명은 5분, JPEG·PNG·WebP 10MB 이하이며 완료 전에는 프로필에 지정할 수 없다. 발급·완료 및 프로필 저장 트랜잭션에서 관리자 권한을 다시 확인하고 소유자와 업로드 목적을 분리한다. 완료 단계에서 실제 디코딩·40MP 상한·512px WebP 변환·EXIF/GPS 제거를 유지한다. 사용 중인 대표 사진은 공통 미사용 업로드 정리에서 제외하고 교체·포기한 사진만 재시도하며 정리한다. `20261022152000_presigned_group_avatars`는 nullable 관계를 추가해 기존 대표 사진을 유지한다.

`uploadPostMedia`·`uploadSubmissionPhoto`·`uploadGroupAvatar`·`Upload` scalar와 `/post-uploads/:token`·`/uploads/:token`은 제거한다. 이전 탭은 새로고침해야 한다. GraphQL은 JSON 메타데이터만 전송하고 웹과 앱 WebView는 같은 저장소 전송 helper를 사용한다. nullable `Upload.mediaUploadId` 관계는 추가형 migration `20261022030000_presigned_submission_uploads`로 연결하며 기존 파일·제출 행은 그대로 읽는다. graphql-upload·apollo-upload-client 의존성은 제거하지만 대회 완료 변환에 필요한 sharp는 유지한다.

## 파일 저장

웹의 PostDownloadButton은 클릭할 때마다 Apollo PostDownload query를 no-cache로 실행한다. postDownload(postId)는 readablePost로 공개 범위·멤버십·숨김·파일 존재 여부를 먼저 검사한 뒤 URL·filename·expiresAt을 반환한다. 링크만 있는 글에는 저장 버튼을 표시하지 않으며 파일 조회도 NOT_FOUND다.

- S3: GetObject presigned URL의 최대 유효 기간은 60초다. Content-Disposition attachment와 한글 파일명, private/no-store 응답 헤더도 서명한다. S3 권한·임시 자격 증명 만료에 따라 더 일찍 사용할 수 없게 될 수 있다.
- 로컬: /backend/media/:id/download를 반환하고 expiresAt은 null이다. 다운로드할 때마다 현재 세션과 공개 범위를 다시 확인하며 Range와 기존 스트리밍을 유지한다.
- 저장 파일은 게시된 JPEG·PNG·WebP 또는 검증된 MP4·WebM이다. 브라우저에서 줄인 사진은 줄인 파일을 저장하며 변환에 실패해 원본을 올렸다면 원본이 저장된다. 이전 게시물의 WebP도 그대로 읽는다.
- S3 URL은 발급 시점의 짧은 읽기 권한이다. 멤버십 철회·숨김 뒤 이미 발급한 URL도 최대 60초간 사용할 수 있다. URL을 DB·Apollo 정규화 캐시·분석 이벤트에 저장하지 않는다.
- 앱에서는 S3 URL을 기존 link.open으로 시스템 브라우저에 전달한다. 긴 임시 자격 증명을 처리하도록 link.open은 HTTP·HTTPS 주소를 8KB까지 허용하며 기존 일반 공유 링크의 제한은 유지한다. 새 브리지 동작은 앱 빌드에도 포함해야 한다.

브라우저는 Content-Disposition과 download 속성으로 파일 저장을 시작한다. 브라우저·OS가 제공하는 파일 저장 위치를 사용하며 네이티브 사진 보관함 자동 저장 기능을 추가한 것은 아니다. 파일을 웹 메모리에 전부 읽어 Blob으로 복제하지 않는다.

## 투네이션 확인 범위

2026-10-20에 사용자가 제공한 [크리에이터 후원 페이지](https://toon.at/donate/sugirit?viewMode)와 이 페이지가 로드하는 공개 프런트엔드의 영상 주소 처리 코드를 확인했다. 해당 구현은 영상 주소를 유튜브·트위치로 나누며 일반 서비스 주소를 그대로 받는 분기는 확인되지 않았다. [공식 영상 후원 안내](https://help.toon.at/hc/ko/articles/360009275214)는 유튜브 영상 주소를 안내한다. 방송 플랫폼과 후원할 영상의 출처는 별개다.

이번 변경은 유튜브·일반 링크 첨부와 업로드 파일 저장을 제공한다. 웃긴순간 자체 주소가 투네이션에서 영상 후원으로 재생된다는 뜻은 아니다. 외부 영상 제공자 지원과 연동 규격은 투네이션 측 확인이 필요하며 실제 결제·영상 후원은 실행하지 않았다.

## 검증

API 통합 사양은 파일 없는 링크, 위험한 주소·빈 첨부 거부, 공개·비공개·숨김 권한, 반응·댓글·삭제, 실제 사진·영상 다운로드·Range·한글 파일명, 실제 AWS SDK의 60초 서명을 확인한다. S3 서명 테스트는 테스트 자격 증명으로 서명하며 운영 버킷에 접속하지 않는다. 실제 운영 S3 객체·IAM 검증과 구분한다.

웹 API 레인은 생성 문서를 실제 격리 API에 실행한다. Playwright는 Chrome·iPhone WebKit·데스크톱에서 링크만 등록·공개 SSR·유튜브 재생 프레임·사진과 동영상의 실제 파일 저장을 확인한다. 유튜브 프레임 HTTP 경계만 fixture로 대체한다.
