# 게시물 첨부와 저장

게시물에는 사진·동영상 또는 HTTP·HTTPS 링크 중 하나가 필요하다. 파일과 링크를 함께 넣을 수도 있다. 링크만 있는 게시물은 kind=LINK, mediaUrl=null이며 사진·영상은 기존 파일 처리와 검증을 유지한다. 제목·공유 권리 동의·그룹 멤버십·대회 접수 규칙은 첨부 방식과 관계없이 적용한다.

Post.uploadId는 nullable로 확장하고 linkUrl을 추가한다. 기존 파일·게시물은 보존한다. DB의 Post_attachment_check도 첨부가 하나 이상 있는지 확인하며 기존 업로드 FK의 RESTRICT 동작을 유지한다. 20261020030000_post_links 마이그레이션은 격리 테스트 DB에서 검증하며 개발·운영 DB 적용은 별도 배포 절차다.

링크는 공백 제거 후 최대 2048자, HTTP·HTTPS, 인증정보 없는 절대 주소만 허용한다. API가 외부 페이지를 가져오지 않아 사용자 URL로 내부 서버에 요청하지 않는다. 외부 링크에는 noopener·noreferrer·ugc를 붙인다. 유튜브 재생은 정확한 youtube.com·www.youtube.com·m.youtube.com·youtu.be 호스트와 11자 동영상 ID만 사용하고, 사용자가 재생 버튼을 누른 뒤 youtube-nocookie.com 프레임을 연다. 임의 주소를 iframe에 넣지 않는다.

공개 그룹의 링크는 익명 SSR과 JSON-LD의 citation에 포함한다. 링크 게시물의 사진·파일·썸네일을 만들어 넣지 않는다. 비공개 그룹의 링크도 기존 게시물과 같은 권한·noindex·SEO 제외 정책을 따른다.

## 파일 저장

웹의 PostDownloadButton은 클릭할 때마다 Apollo PostDownload query를 no-cache로 실행한다. postDownload(postId)는 readablePost로 공개 범위·멤버십·숨김·파일 존재 여부를 먼저 검사한 뒤 URL·filename·expiresAt을 반환한다. 링크만 있는 글에는 저장 버튼을 표시하지 않으며 파일 조회도 NOT_FOUND다.

- S3: GetObject presigned URL의 최대 유효 기간은 60초다. Content-Disposition attachment와 한글 파일명, private/no-store 응답 헤더도 서명한다. S3 권한·임시 자격 증명 만료에 따라 더 일찍 사용할 수 없게 될 수 있다.
- 로컬: /backend/media/:id/download를 반환하고 expiresAt은 null이다. 다운로드할 때마다 현재 세션과 공개 범위를 다시 확인하며 Range와 기존 스트리밍을 유지한다.
- 저장 파일은 게시된 파일이다. 사진은 기존 업로드 과정에서 변환한 WebP, 동영상은 검증된 MP4·WebM이다. 원본 사진을 별도로 보존하지 않는다.
- S3 URL은 발급 시점의 짧은 읽기 권한이다. 멤버십 철회·숨김 뒤 이미 발급한 URL도 최대 60초간 사용할 수 있다. URL을 DB·Apollo 정규화 캐시·분석 이벤트에 저장하지 않는다.
- 앱에서는 S3 URL을 기존 link.open으로 시스템 브라우저에 전달한다. 긴 임시 자격 증명을 처리하도록 link.open은 HTTP·HTTPS 주소를 8KB까지 허용하며 기존 일반 공유 링크의 제한은 유지한다. 새 브리지 동작은 앱 빌드에도 포함해야 한다.

브라우저는 Content-Disposition과 download 속성으로 파일 저장을 시작한다. 브라우저·OS가 제공하는 파일 저장 위치를 사용하며 네이티브 사진 보관함 자동 저장 기능을 추가한 것은 아니다. 파일을 웹 메모리에 전부 읽어 Blob으로 복제하지 않는다.

## 투네이션 확인 범위

2026-10-20에 사용자가 제공한 [크리에이터 후원 페이지](https://toon.at/donate/sugirit?viewMode)와 이 페이지가 로드하는 공개 프런트엔드의 영상 주소 처리 코드를 확인했다. 해당 구현은 영상 주소를 유튜브·트위치로 나누며 일반 서비스 주소를 그대로 받는 분기는 확인되지 않았다. [공식 영상 후원 안내](https://help.toon.at/hc/ko/articles/360009275214)는 유튜브 영상 주소를 안내한다. 방송 플랫폼과 후원할 영상의 출처는 별개다.

이번 변경은 유튜브·일반 링크 첨부와 업로드 파일 저장을 제공한다. 웃긴순간 자체 주소가 투네이션에서 영상 후원으로 재생된다는 뜻은 아니다. 외부 영상 제공자 지원과 연동 규격은 투네이션 측 확인이 필요하며 실제 결제·영상 후원은 실행하지 않았다.

## 검증

API 통합 사양은 파일 없는 링크, 위험한 주소·빈 첨부 거부, 공개·비공개·숨김 권한, 반응·댓글·삭제, 실제 사진·영상 다운로드·Range·한글 파일명, 실제 AWS SDK의 60초 서명을 확인한다. S3 서명 테스트는 테스트 자격 증명으로 서명하며 운영 버킷에 접속하지 않는다. 실제 운영 S3 객체·IAM 검증과 구분한다.

웹 API 레인은 생성 문서를 실제 격리 API에 실행한다. Playwright는 Chrome·iPhone WebKit·데스크톱에서 링크만 등록·공개 SSR·유튜브 재생 프레임·사진과 동영상의 실제 파일 저장을 확인한다. 유튜브 프레임 HTTP 경계만 fixture로 대체한다.
