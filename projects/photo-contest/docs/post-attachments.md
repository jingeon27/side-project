# 게시물 첨부와 저장

게시물에는 사진·동영상 또는 HTTP·HTTPS 링크 중 하나가 필요하다. 파일과 링크를 함께 넣을 수도 있다. 링크만 있는 게시물은 kind=LINK, mediaUrl=null이다. 제목·공유 권리 동의·그룹 멤버십·대회 접수 규칙은 첨부 방식과 관계없이 적용한다.

Post.uploadId는 nullable로 확장하고 linkUrl을 추가한다. 기존 파일·게시물은 보존한다. DB의 Post_attachment_check도 첨부가 하나 이상 있는지 확인하며 기존 업로드 FK의 RESTRICT 동작을 유지한다. 20261020030000_post_links 마이그레이션은 격리 테스트 DB에서 검증하며 개발·운영 DB 적용은 별도 배포 절차다.

링크는 공백 제거 후 최대 2048자, HTTP·HTTPS, 인증정보 없는 절대 주소만 허용한다. API가 외부 페이지를 가져오지 않아 사용자 URL로 내부 서버에 요청하지 않는다. 외부 링크에는 noopener·noreferrer·ugc를 붙인다. 유튜브 재생은 정확한 youtube.com·www.youtube.com·m.youtube.com·youtu.be 호스트와 11자 동영상 ID만 사용하고, 사용자가 재생 버튼을 누른 뒤 youtube-nocookie.com 프레임을 연다. 임의 주소를 iframe에 넣지 않는다.

공개 그룹의 링크는 익명 SSR과 JSON-LD의 citation에 포함한다. 링크 게시물의 사진·파일·썸네일을 만들어 넣지 않는다. 비공개 그룹의 링크도 기존 게시물과 같은 권한·noindex·SEO 제외 정책을 따른다.

## 파일 업로드

모든 미디어(게시물·기존 대회 사진·그룹 대표 사진)는 S3 presigned POST로 브라우저가 저장소에 직접 올린다. API는 파일 바이트를 받거나 읽거나 변환하지 않는다.

등록 버튼을 누르면 브라우저가 사진 전송량을 줄이고, 동영상은 메타데이터로 읽은 길이가 5분을 넘으면 요청하지 않는다(길이를 읽지 못하면 막지 않는다). 이어서 `requestPostUpload(groupId, contentType, byteSize)`로 15분짜리 POST 티켓을 받는다. 서버는 권한과 허용 형식(JPEG·PNG·WebP 10MB, MP4·WebM 100MB)을 확인하고 `<prefix><UUID>.<확장자>` 최종 키를 만든다. POST 정책은 그 키·`Content-Type`·정확한 `content-length-range`와 티켓보다 늦지 않은 만료를 서명한다.

브라우저는 `fields`를 먼저, `file`을 마지막에 넣은 FormData를 `url`로 POST한다. multipart 경계는 브라우저가 정하고 저장소에 세션 쿠키를 보내지 않는다. 이후 `completePostUpload(uploadId)`가 소유자·만료·용도를 확인하고 저장소 HEAD로 크기·형식이 발급과 같은지 본 다음, 같은 트랜잭션에서 멤버십을 다시 확인해 완료로 표시한다. 완료한 `storageKey`만 createPost에 쓸 수 있으며 완료 후 등록 유효기간은 1시간이다. 완료 재시도와 동시 완료는 같은 결과를 반환한다.

staging 복사는 하지 않는다. 서버가 파일 내용을 검사하지 않으므로 복사본으로 고정해도 지킬 불변식이 없기 때문이다. 대신 완료 뒤에도 POST 정책이 끝나기 전(최대 15분, 대회·대표 사진 5분)에는 업로더가 같은 키에 같은 크기·형식의 파일을 다시 올릴 수 있다. 형식은 발급 허용 목록, 정책의 `Content-Type`, 조회 서명의 응답 형식 고정으로만 제한한다.

브라우저가 사진을 다시 그리면 JPEG로 전송하지만 디코딩·변환을 할 수 없는 지원 형식은 원본을 보낸다. 서버는 사진·동영상의 EXIF·GPS 등 메타데이터를 제거하지 않는다. 공개 그룹의 다운로드에도 업로드된 파일의 위치·촬영 정보가 남을 수 있다. 게시자는 공유 전에 파일 내용을 확인한다.

API는 항상 S3 호환 저장소를 쓴다(`S3_BUCKET`·`S3_ENDPOINT`·`S3_REGION`·`S3_FORCE_PATH_STYLE`·`S3_KEY_PREFIX`, 자격 증명은 AWS SDK 기본 체인). 로컬 개발과 테스트는 `@photo-contest/test-kit`의 S3 호환 대역을 가리킨다. 대역은 서명 POST 정책(키·형식·크기·만료·서명), 서명 GET(Range·응답 헤더 덮어쓰기), HEAD·DELETE와 웹 origin의 CORS를 실제 AWS SDK와 같은 SigV4로 처리하는 임시 구현이다. 로컬에서 실제 S3를 시험하려면 `.env`의 `S3_ENDPOINT`를 비우고 `S3_BUCKET=jingeon-side-project`, `S3_REGION=ap-northeast-2`, `S3_FORCE_PATH_STYLE=false`와 실제 자격 증명을 넣는다. `game-feedback/*`로 제한한 IAM 정책을 쓰면 `S3_KEY_PREFIX=game-feedback/photo-contest`로 새 객체를 그 아래에 둔다. DB에는 전체 키를 기록하므로 prefix 이전의 파일도 계속 읽는다. 이 설정은 실제 AWS 권한이나 버킷 정책을 바꾸지 않는다.

완료하지 않고 만료된 티켓의 키와 쓰지 않은 완료 파일, 삭제 실패 파일은 DB 정리 작업이 재시도해 지운다. 모든 업로드 정리는 만료 시각에서 5분 유예가 지난 뒤에 실행해 만료 직전에 시작한 완료 확정과 겹치지 않게 한다. 발급할 때 POST 정책의 만료 시각을 `PostUpload.policyExpiresAt`에 따로 기록한다. 완료하면 `expiresAt`은 게시 유효기간으로 바뀌기 때문이다. 정책이 끝나기 전에 게시물을 지우면 파일은 바로 지우지만 업로드 행은 남기고(다시 게시에는 쓰지 못한다) 정책 만료 5분 뒤 정리 작업이 같은 키를 한 번 더 지운다. 그래서 그 사이 업로더가 같은 키에 다시 올린 파일도 버킷에 남지 않는다. 정책이 끝난 뒤에는 그 키에 늦은 전송이 다시 쓰이지 않는다.

기존 대회 Submission도 `requestUploadUrl(contestId, contentType, byteSize)` → 저장소 FormData POST → `completeSubmissionUpload(uploadId)` → `createSubmission`으로 전송한다. 서명은 5분이며 JPEG·PNG·WebP 10MB 이하만 예약한다. 완료할 때 접수 기간과 소유자·멤버십을 다시 확인한다. 대회 파일은 게시물 업로드 ID로 쓸 수 없다. 서버의 sharp 디코딩·1600px WebP 변환은 없앴으며 이전에 변환한 WebP는 그대로 읽는다.

그룹 대표 사진도 `requestGroupAvatarUpload(groupId, contentType, byteSize)` → 저장소 FormData POST → `completeGroupAvatarUpload(uploadId)` → `updateGroupProfile(avatarId)`로 전송한다. 서명은 5분, JPEG·PNG·WebP 10MB 이하이며 완료 전에는 프로필에 지정할 수 없다. 서버의 512px WebP 변환은 없애고 원본을 그대로 저장한다. 사용 중인 대표 사진은 정리에서 제외하고 교체·포기한 사진만 지운다.

`uploadPostMedia`·`uploadSubmissionPhoto`·`uploadGroupAvatar`·`Upload` scalar, `/post-uploads/:token`·`/uploads/:token`, 로컬 디스크 저장소와 `/local-post-uploads`는 제거했다. 이전 탭은 새로고침해야 한다. `PostUpload.completionKey`·`completionStartedAt`과 `PostUploadAttempt` 테이블은 더 이상 쓰지 않지만 파괴적 migration을 피하려고 남겨 둔다.

## 파일 조회와 저장

`/backend/media/:id`, `/backend/media/:id/download`, 대회 사진 `/backend/photos/:id`, 그룹 대표 사진 `/backend/groups/:groupId/avatar/:avatarId`는 바뀌지 않는 고정 경로다. 서버 HTML·Apollo·공개 캐시에는 이 경로만 남긴다. 요청마다 기존과 같은 읽기 권한을 확인한 뒤 `Cache-Control: private, no-store`인 307로 60초 서명 GET에 보낸다. 서명에는 응답 형식(키의 확장자로 정한 허용 형식), `private, no-store`, 다운로드 경로의 Content-Disposition attachment·한글 파일명을 넣는다. 재생·탐색의 Range는 저장소가 처리한다.

웹의 PostDownloadButton은 클릭할 때마다 PostDownload query를 no-cache로 실행한다. `postDownload(postId)`는 readablePost로 공개 범위·멤버십·숨김·파일 존재 여부를 먼저 검사한 뒤 같은 60초 서명 URL·filename·expiresAt을 반환한다. 링크만 있는 글에는 저장 버튼을 표시하지 않으며 파일 조회도 NOT_FOUND다.

- 서명 URL은 발급 시점의 짧은 읽기 권한이다. 멤버십 철회·숨김 뒤 이미 발급한 URL도 최대 60초간 쓸 수 있다. URL을 DB·Apollo 정규화 캐시·분석 이벤트에 저장하지 않는다.
- 브라우저는 리다이렉트된 서명 주소로 이어서 Range 요청을 보낸다. 60초가 지난 뒤 멈춘 긴 동영상을 다시 탐색하면 고정 경로를 다시 열어야 할 수 있다.
- 저장 파일은 올린 JPEG·PNG·WebP 또는 MP4·WebM 그대로다. 이전 게시물·대회의 WebP도 그대로 읽는다.
- 앱에서는 서명 URL을 기존 link.open으로 시스템 브라우저에 전달한다. 긴 임시 자격 증명을 처리하도록 link.open은 HTTP·HTTPS 주소를 8KB까지 허용하며 일반 공유 링크의 제한은 유지한다.

브라우저는 Content-Disposition으로 파일 저장을 시작한다. 브라우저·OS가 제공하는 파일 저장 위치를 사용하며 네이티브 사진 보관함 자동 저장 기능을 추가한 것은 아니다. 파일을 웹 메모리에 전부 읽어 Blob으로 복제하지 않는다.

## 투네이션 확인 범위

2026-10-20에 사용자가 제공한 [크리에이터 후원 페이지](https://toon.at/donate/sugirit?viewMode)와 이 페이지가 로드하는 공개 프런트엔드의 영상 주소 처리 코드를 확인했다. 해당 구현은 영상 주소를 유튜브·트위치로 나누며 일반 서비스 주소를 그대로 받는 분기는 확인되지 않았다. [공식 영상 후원 안내](https://help.toon.at/hc/ko/articles/360009275214)는 유튜브 영상 주소를 안내한다. 방송 플랫폼과 후원할 영상의 출처는 별개다.

이번 변경은 유튜브·일반 링크 첨부와 업로드 파일 저장을 제공한다. 웃긴순간 자체 주소가 투네이션에서 영상 후원으로 재생된다는 뜻은 아니다. 외부 영상 제공자 지원과 연동 규격은 투네이션 측 확인이 필요하며 실제 결제·영상 후원은 실행하지 않았다.

## 검증

API 단위 사양은 test-kit S3 대역에 실제 AWS SDK로 POST 정책(최종 키·형식·크기·만료)과 HEAD·DELETE를 확인한다. 통합 사양은 발급 권한, 정책을 벗어난 크기·형식·키·추가 필드 거부, HEAD 불일치 거부, 완료 재시도·동시 완료·커밋 응답 유실, 고정 경로의 307·60초 서명·Range·한글 파일명과 공개·비공개·숨김 권한을 확인한다. test-kit 사양은 대역이 변조·만료된 정책과 서명 GET을 거부하는지 확인한다. 운영 S3 객체·IAM·CORS는 접속하지 않으며 별도로 확인한다.

웹 API 레인은 생성 문서를 실제 격리 API와 대역에 실행한다. Playwright는 Chrome·iPhone WebKit·데스크톱에서 저장소 POST 실패 후 재시도, 고정 경로의 307과 Range, 사진과 동영상의 실제 파일 저장을 확인한다. test:cache는 프로덕션 프록시가 307과 캐시 금지를 그대로 넘기는지 확인한다.
