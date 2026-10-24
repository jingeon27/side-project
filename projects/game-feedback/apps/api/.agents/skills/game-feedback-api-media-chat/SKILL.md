---
name: game-feedback-api-media-chat
description: Game Feedback API의 게시글 본문 미디어·채팅 첨부·프로필 사진 저장(DATABASE·FILESYSTEM·S3 드라이버, S3 presigned 직접 업로드 예약·완료, prune 정리)이나 1:1 채팅의 멱등 전송·읽음·기록 삭제 경계, /api/chat/events SSE 무효화 이벤트를 추가·변경·검토할 때 사용한다.
---

S3 버킷·CORS·IAM 설정과 외부 확인 범위는 프로젝트 `docs/media-upload.md`, 엔드포인트 배치는 `game-feedback-api-endpoint`, 하네스(`S3Fixture`, SSE 읽기)는 `game-feedback-api-test` 스킬을 따른다. 경로는 apps/api 기준이다.

## 저장소 (`src/media-storage/`)

- 드라이버는 `GF_MEDIA_STORAGE`(`media-storage.config.ts`): `DATABASE`(개발 기본, 행의 `bytes`), `FILESYSTEM`(운영 기본, `GF_MEDIA_DIRECTORY`), `S3`(`GF_S3_*`). 운영은 `DATABASE`와 https가 아닌 S3 endpoint를 거부한다. 파일 행은 `bytes`와 `objectId` 중 하나만 갖는다.
- `MediaStorage`(`media-storage.service.ts`, `@Global`):
  - `save`: `MediaObject`(`objects/<uuid>`) 행을 **외부 IO 전에** 만들고 덮어쓰기 없이 쓴다(`wx`, S3 `IfNoneMatch: '*'`). 실패한 업로드도 정리 대상에 남기려는 순서다.
  - `reserveUpload`: S3일 때만 `staging/<uuid>`에 presigned POST(정확한 `content-length-range`·`Content-Type`, `MEDIA_UPLOAD_TTL_SECONDS` 300초). 아니면 null.
  - `completeUpload`: HEAD로 크기·타입·ETag 확인 → 같은 ETag로 앞 `MEDIA_SIGNATURE_BYTES`(4KB)만 Range로 읽어 `validateMediaHeader` → **같은 ETag 조건의 CopyObject로 새 `objects/` 키에 확정**(본문을 API로 내려받지 않는다). staging 주소를 재사용해도 확정 파일은 바뀌지 않고, 검사 뒤 바뀌면 412 → 409 `UPLOAD_CHANGED`.
  - `assertProxyUpload`: S3면 multipart 경로를 409 `DIRECT_UPLOAD_REQUIRED`로 막는다. 컨트롤러는 `ProxyUploadGuard`(`media-work.ts`)로 multer보다 먼저 부른다.
  - `presignRead`: S3만 `MEDIA_READ_TTL_SECONDS`(60초) GET 주소를 만들고 컨트롤러가 307 + `Referrer-Policy: no-referrer`로 보낸다.
  - `prune`: 연결 안 된 초안을 24시간 뒤 삭제 → 참조 없는 객체 retire → retire 14일·staging 24시간 지난 객체를 100개씩 삭제. 운영자 `scripts/maintenance.mjs`만 부른다(HTTP 경로 없음).
- 파일 검증 `src/common/media-file.ts`: 25MB(`MEDIA_FILE_LIMIT`), 매직 바이트로 png·jpeg·gif·webp·mp4·webm을 판별하고 선언 MIME·크기와 같아야 한다(아니면 400 `INVALID_ATTACHMENT`). 채팅은 `src/chat/chat-file.ts`가 같은 함수를 다시 내보낸다.
- 프로필 사진은 다르다: `ProfileService`(`src/users/profile.service.ts`)가 5MB JPEG·PNG·WebP를 sharp로 512px webp로 다시 인코딩하고, 직접 업로드 경로가 없다.

## 직접 업로드 흐름 (게시글 `src/posts/post-media*`, 채팅 `src/chat/chat-attachment*`)

- 예약 `POST …/uploads`: S3가 아니면 `{ mode: 'PROXY' }` → 클라이언트가 multipart(`POST /api/post-media`, `POST /api/conversations/:id/attachments`)로 보낸다. S3면 `register(…, false)`로 `uploadedAt: null` 행을 만든다.
- `register`: 사용자 행 `FOR UPDATE` → 24시간 지난 초안 삭제 → 대기 개수 제한(게시글 20개 409 `MEDIA_LIMIT`, 채팅 4개 409 `ATTACHMENT_LIMIT`) → 생성. multipart와 예약이 같은 제한을 쓴다.
- 완료 `POST …/:id/complete`: 본인·미연결 행만, 이미 `uploadedAt`이 있으면 그대로 반환(멱등), 300초가 지나면 409 `UPLOAD_EXPIRED`. 갱신은 `updateMany({ …, uploadedAt: null, objectId })` 조건이라 동시 완료가 한 번만 반영된다.
- 연결: `uploadedAt`이 있는 행만 글·메시지에 붙는다. 서비스 필터(`PostMediaService.sync`, `ChatMessageService.send`의 본인·미연결·24시간 조건)와 DB CHECK(`PostMedia_published_upload_ready`, `ChatAttachment_sent_upload_ready`)가 함께 막는다.
- 본문 참조는 계약 `richTextMediaReferences(document)`가 찾는 `/api/post-media/<id>`뿐이다. `sync`는 글 트랜잭션 안에서 참조를 연결하고(`image/`·`video/` 종류 일치, 개수가 다르면 400 `INVALID_MEDIA`) 그 글에서 참조가 사라진 미디어를 지운다. 글 삭제도 `postMedia`를 지운다.
- 조회 GET: 게시글 미디어는 미연결이면 업로더만, 연결되면 `ACTIVE_POST` + 제외 작성자 필터. 채팅 첨부는 참여자(`ChatAttachmentGuard`) + 내 기록 경계 안의 메시지 또는 내 미전송 초안. 응답은 `private, no-store`, `Content-Security-Policy: default-src 'none'; sandbox`, Range 206/416, HEAD. 서명 URL을 로그·이벤트에 남기지 않는다.
- 요청 제한(`src/rate-limit.ts`): multipart와 예약이 `upload:` 분당 20, 완료가 `upload-complete:` 분당 20. 경로를 바꾸면 `src/rate-limit.spec.ts`도 바꾼다.
- 메모리 상한(`src/media-storage/media-work.ts`): multipart 수신과 프로필 사진 변환은 `@UseInterceptors(MediaWorkInterceptor, FileInterceptor(…))` 순서로 두어 multer가 본문을 읽기 전에 프로세스 슬롯(동시 3, 대기 12, 넘치면 503 `MEDIA_BUSY`)을 잡는다. 새 업로드 경로도 같은 순서를 쓴다.

## 채팅 (`src/chat/`)

- 대화 쌍은 정렬한 `[firstUserId, secondUserId]` + `@@unique`로 하나다. 접근은 항상 `ChatAccessService.visible(userId, id, tx?)`: 참여자가 아니면 404, 지원 문의가 아닌 대화는 밴 403·차단 404, 일반 모드에서 테스트 계정 상대는 404.
- 전송 `ChatMessageService.send`: 권한 확인을 멱등 조회보다 먼저 한다(다른 대화의 UUID를 드러내지 않게). 대화 행 `FOR UPDATE` 아래에서 같은 `(senderId, clientMessageId)` 재시도는 본문·첨부가 같으면 기존 메시지, 다르면 409 `MESSAGE_CONFLICT`, 내가 지운 경계 이전이면 409 `MESSAGE_HISTORY_CLEARED`. `createdAt`은 `max(now, 최신 + 1ms)`로 대화 안에서 단조 증가한다.
- 경계는 `(createdAt, id)` 쌍이다: 기록 삭제 `first/secondClearedAt·Id`(`chat-history.ts`의 `historyWhere`·`advancesBoundary`), 읽음 `first/secondReadAt·Id`(`chat-read.policy.ts`). 둘 다 뒤로 가지 않고 상대 쪽 값에 영향을 주지 않는다.

## SSE (`src/chat/chat.events.ts`, `GET /api/chat/events`)

- 프로세스 메모리 구독이다(다중 인스턴스는 미지원). 이벤트는 `invalidate { conversationId }`와 `heartbeat`뿐 — 본문·발신자를 싣지 않고 클라이언트가 REST로 다시 읽는다. 연결 직후 `conversationId: null` 무효화를 한 번 보낸다.
- 5초마다 세션(존재·같은 사용자·만료·테스트 계정 규칙)을 다시 확인해 아니면 닫는다. 세션당 4개를 넘으면 가장 오래된 스트림을 닫는다. 수신자마다 `canAccess`(= `ChatAccessService.visible`)를 다시 본다.
- `publish`는 트랜잭션이 끝난 뒤 `void this.events.publish([...userIds], conversationId)`로 부른다. 세션 회전·로그아웃·탈퇴·차단·해제는 `chat-lifecycle.middleware.ts`가 200 응답 뒤 처리하고, 밴은 `AdminUsersService.ban`이 `closeUser`를 부른다.

## 건드리면 있어야 하는 테스트

- unit: `src/chat/chat-history.spec.ts`, `src/chat/chat-file.test.ts`(파일명·Range·위장 타입), `src/rate-limit.spec.ts`.
- integration: `src/posts/post-media-upload.service.integration.spec.ts`·`src/chat/chat-attachment-upload.service.integration.spec.ts`(예약·전송·완료·만료·위장 파일·주소 재사용·정리), `src/media-storage/media-storage.service.integration.spec.ts`(FILESYSTEM 저장·초안 소유·Range), `src/posts/posts.controller.integration.test.ts`(본문 미디어의 원자적 연결·숨김·차단), `src/chat/chat.controller.integration.test.ts`(멱등 전송·페이지·읽음·기록 삭제·차단·SSE), `src/users/profile.service.integration.spec.ts`(사진 정규화·정리).
- 로컬 fixture 성공을 실제 AWS 버킷·CORS·브라우저 업로드 확인으로 기록하지 않는다.

## 명령 (side 루트)

```sh
corepack yarn workspace @game-feedback/api test:unit
corepack yarn workspace @game-feedback/api test:integration src/posts src/chat src/media-storage src/users/profile.service
```
