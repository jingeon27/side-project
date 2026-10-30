# media-chat

S3 버킷·CORS·IAM 설정과 외부 확인 범위는 프로젝트 `docs/media-upload.md`, 엔드포인트 배치는 [endpoint](endpoint.md), 하네스(`S3TestStorage`, SSE 읽기)는 [test](test.md) 스킬을 따른다. 경로는 apps/api 기준이다.

## 저장소 (`src/media-storage/`)

- 모든 파일은 `GF_S3_*`로 설정한 비공개 S3에 저장한다. `GF_S3_KEY_PREFIX`는 공유 테스트 버킷의 서비스/개발 경로를 제한한다. 자격 증명 쌍이 없으면 SDK의 기본 체인(AWS_PROFILE·EC2 역할)을 사용한다. DATABASE·FILESYSTEM 드라이버와 API multipart 수신 경로는 없다.
- `MediaStorage.reserveUpload`는 서버가 생성한 staging 키에 크기·타입을 고정한 5분 presigned POST를 발급한다. `completeUpload`는 HEAD → 동일 ETag로 앞 4KB Range 서명 검사 → 동일 ETag 조건 CopyObject로 새 최종 키에 복사한다. 검증 뒤 변경은 409 `UPLOAD_CHANGED`다. API가 전체 파일을 읽지 않는다.
- 게시글·채팅 예약은 사용자 행 `FOR UPDATE` 아래 초안 개수 제한을 적용하고 `uploadedAt:null`로 만든다. 완료는 소유권·만료를 확인하고 조건부 갱신해 멱등성을 지킨다. 만료는 서명 5분이 아니라 그 뒤 30분 유예(`MEDIA_COMPLETE_GRACE_SECONDS`, `completionDeadline`)까지다. 느린 링크의 25MB 전송이 서명 직전에 시작해도 확정되며, HEAD·ETag·조건부 복사가 무결성을 지킨다. 미완료 파일의 글/메시지 연결은 서비스와 DB CHECK가 함께 막는다.
- 프로필은 `AvatarUpload` 예약 테이블과 `/api/profile/avatar/uploads`, `/:id/complete`, DELETE `/:id`를 사용한다. 5MB JPEG·PNG·WebP만 허용하며 웹에서 512px JPEG로 변환한다. 서버는 헤더를 검사하고 전체 이미지 디코딩·메타데이터 제거를 보장하지 않는다. 교체와 캐시 무효화는 같은 트랜잭션이다.
- 조회는 공개 범위·소유권·차단·대화 참여/기록 경계를 확인한 뒤 private/no-store, no-referrer 307로 60초 S3 GET 주소를 발급한다. 유효한 Range는 S3가 처리하며 범위 초과는 API 416이다. HEAD는 DB 메타데이터만 반환한다.
- `prune`는 24시간 지난 초안/예약 → 참조 없는 객체 retire → 14일 뒤 객체 삭제 순서다. 모든 파일 및 AvatarUpload 참조를 확인한다. 운영자 유지보수만 호출하며 HTTP 경로를 만들지 않는다.
- 기존 bytes·FILESYSTEM 참조는 오프라인 `migrate-legacy-media.ts`/`scripts/migrate-media.ts`에서만 읽는다. 기본은 dry-run, `--apply`는 한 파일씩 S3 전송·HEAD·SHA-256 재확인 후 조건부 DB 참조 교체다. 이행 전에 백업하며 원본 파일은 지우지 않는다.
- rate-limit: 게시글·채팅·프로필 예약은 `upload:` 분당 20, 완료는 `upload-complete:` 분당 20을 공유한다.

## 채팅 (`src/chat/`)

- 대화 쌍은 정렬한 `[firstUserId, secondUserId]` + `@@unique`로 하나다. 접근은 항상 `ChatAccessService.visible(userId, id, tx?)`: 참여자가 아니면 404, 지원 문의가 아닌 대화는 밴 403·차단 404, 일반 모드에서 테스트 계정 상대는 404.
- 전송 `ChatMessageService.send`: 권한 확인을 멱등 조회보다 먼저 한다(다른 대화의 UUID를 드러내지 않게). 대화 행 `FOR UPDATE` 아래에서 같은 `(senderId, clientMessageId)` 재시도는 본문·첨부가 같으면 기존 메시지, 다르면 409 `MESSAGE_CONFLICT`, 내가 지운 경계 이전이면 409 `MESSAGE_HISTORY_CLEARED`. `createdAt`은 `max(now, 최신 + 1ms)`로 대화 안에서 단조 증가한다.
- 경계는 `(createdAt, id)` 쌍이다: 기록 삭제 `first/secondClearedAt·Id`(`chat-history.ts`의 `historyWhere`·`advancesBoundary`), 읽음 `first/secondReadAt·Id`(`chat-read.policy.ts`). 둘 다 뒤로 가지 않고 상대 쪽 값에 영향을 주지 않는다.

## SSE (`src/chat/events/chat.events.ts`, `GET /api/chat/events`)

- 프로세스 메모리 구독이다(다중 인스턴스는 미지원). 이벤트는 `invalidate { conversationId }`와 `heartbeat`뿐 — 본문·발신자를 싣지 않고 클라이언트가 REST로 다시 읽는다. 연결 직후 `conversationId: null` 무효화를 한 번 보낸다.
- 5초마다 하나의 타이머가 열린 모든 스트림의 세션(존재·같은 사용자·만료·테스트 계정 규칙)을 `session.findMany` 한 번으로 다시 확인해 아니면 닫고, 나머지에 heartbeat를 보낸다. 세션당 4개, 사용자당 8개(`MAX_STREAMS_PER_SESSION`·`MAX_STREAMS_PER_USER`)를 넘으면 가장 오래된 스트림을 닫는다. 단위 사양은 `src/chat/events/chat.events.spec.ts`. 수신자마다 `canAccess`(= `ChatAccessService.visible`)를 다시 본다.
- `publish`는 트랜잭션이 끝난 뒤 `void this.events.publish([...userIds], conversationId)`로 부른다. 세션 회전·로그아웃·탈퇴·차단·해제는 `chat-lifecycle.middleware.ts`가 200 응답 뒤 처리하고, 밴은 `AdminUsersService.ban`이 `closeUser`를 부른다.

## 건드리면 있어야 하는 테스트

- unit: `src/chat/message/chat-history.spec.ts`, `src/common/media-file.spec.ts`(파일명·Range·위장 타입), `src/rate-limit.spec.ts`.
- integration: `src/posts/media/post-media-upload.service.integration.spec.ts`·`src/chat/attachment/chat-attachment-upload.service.integration.spec.ts`(예약·전송·완료·만료·위장 파일·주소 재사용·정리), `src/media-storage/media-storage.service.integration.spec.ts`(S3 저장·초안 소유·Range·기존 파일 이행), `src/posts/posts.controller.integration.test.ts`(본문 미디어의 원자적 연결·숨김·차단), `src/chat/chat.controller.integration.test.ts`(멱등 전송·페이지·읽음·기록 삭제·차단·SSE), `src/users/profile/profile.service.integration.spec.ts`(프로필 직접 업로드·소유권·만료·정리).
- 로컬 fixture 성공을 실제 AWS 버킷·CORS·브라우저 업로드 확인으로 기록하지 않는다.

## 명령 (side 루트)

```sh
yarn workspace @game-feedback/api test:unit
yarn workspace @game-feedback/api test:integration src/posts src/chat src/media-storage src/users/profile/profile.service
```

## 책임별 경로

- chat의 conversation은 접근·대화 쌍, message는 전송·히스토리·읽음, attachment는 업로드·파일 전달, events는 SSE와 세션 변경 수명을 소유한다. chat root의 controller·공통 입력·presenter·module은 여러 책임을 조합한다.
- posts/media는 업로드·미디어 전달, posts/views는 조회수 집계를 소유한다. CRUD·검색·답변 수는 posts root에 유지한다. 모듈 exports·HTTP 경로·구독 수명은 폴더 이동으로 바꾸지 않는다.
