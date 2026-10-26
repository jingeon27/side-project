---
name: game-feedback-web-compose-media
description: Game Feedback 웹(apps/web)에서 글쓰기·수정 폼(widgets/post-composer), Quill Delta 본문 편집기와 허용 서식, 공개 본문 렌더(RichTextBody), 게시글 사진·동영상 삽입과 채팅 첨부 업로드(S3 직접 전송), 실패 시 초안·첨부·재전송 보존, 채팅 입력 키 동작을 만들거나 고칠 때 사용한다.
---

폼(RHF+Zod `useZodForm`)·mutation 일반 규칙은 프로젝트 `game-feedback-code-style`, 검증은 `game-feedback-test` 스킬을 따른다. 캐시·재전송 키는 `game-feedback-web-server-state` 스킬이다. 저장소 설정·S3 CORS는 `projects/game-feedback/docs/media-upload.md`.

## 본문 계약

- 저장 값은 `body`(평문) + `document`(Quill Delta)다. 허용 범위는 `packages/contracts/src/rich-text.ts`의 `RichTextAttributesSchema`(strict): bold·italic·underline·strike·link(http/https, 2048자)·header 2|3·list ordered|bullet·blockquote. embed는 `{ image | video: '/api/post-media/<id>' }`(`PostMediaUrlSchema`)뿐이다. 글자 합계 10001, embed 10개, ops 2000, 마지막 insert는 `\n`으로 끝난다.
- 서식을 늘리려면 contracts 스키마 → API 검증 → `shared/ui/rich-text/quill-session.ts`의 `formats`·toolbar·`labels` → `RichTextBody` 렌더 → `rich-text.spec.tsx`를 함께 바꾼다. 하나만 바꾸면 저장이 거부되거나 표시되지 않는다.
- 렌더는 `shared/ui/rich-text/RichTextBody.tsx`(서버에서도 동작, `dangerouslySetInnerHTML` 없음)가 Delta를 React 요소로 만든다. 링크는 `target="_blank" rel="nofollow ugc noopener noreferrer"`, 이미지는 `next/image` `unoptimized`(쿠키 인증 같은 origin), 동영상은 native `<video controls playsInline preload="metadata">`다. `document`가 없으면 평문으로 그린다.

## 편집기

- `RichTextEditor`(`@/shared/ui`) → `QuillController`(lazy `useState`로 수명 고정) → callback ref `attach`가 `QuillSession`을 만들고 반환한 `dispose`로 정리한다. Quill은 `start()`에서 `await import('quill')`·`./quill-media`로 지연 로드한다. 컴포넌트 상단에서 quill을 import하지 않는다(SSR·첫 번들). CSS는 `_app/styles/tailwind.css`의 `quill/dist/quill.snow.css`(components 레이어)와 `editor.css`다.
- 로드 실패는 `useSyncExternalStore` 스냅샷을 통해 렌더 중 throw되고, 감싼 `ServiceErrorBoundary title="본문 편집기"`가 받는다. 폼의 다른 입력은 유지된다.
- 변경은 `onChange({ body, document, valid })`다. `PostContentFields`가 `setValue('body' | 'document' | 'editorValid')`로 넣고 `postComposerSchema`(`PostInputSchema` + `editorValid`)가 검증한다. 편집기 값을 useState에 복제하지 않는다. effect는 `disabled`·`placeholder` 동기화에만 쓴다.
- 분류(board)를 바꾸면 `key={board}`로 편집기를 다시 만들지만 값은 폼에 있어 초안이 남는다. 분류별 메타데이터(coaching·friendSale·battle)는 `postContentInput`이 해당 board일 때만 보낸다.
- 접근성 이름: 편집기 root는 `role="textbox"`·`aria-label`(필드 라벨)·`aria-multiline`, 툴바 버튼은 `labels`의 번역 문구(`사진 삽입`, `동영상 삽입`, `링크` …)다. e2e가 이 이름을 쓴다.
- 제출은 `form.handleSubmit` 안에서 try/catch로 감싸고 성공 뒤에만 `form.reset()`·이동·닫기를 한다(`CreatePostForm`은 `router.replace(appRoutes.post(…))`, `EditPostSheet`는 닫고 `router.refresh()`). 실패하면 제목·본문·삽입한 embed가 남고 오류는 `ErrorNotice`에 mutation `error`로 보인다.

## 업로드 흐름

`uploadMediaFile(file, { reserve, complete, remove })`(`shared/api/media-upload.ts`)가 게시글·채팅 공용이다.

1. `MediaUploadInputSchema`로 형식(JPEG/PNG/GIF/WebP/MP4/WebM)·25MB를 먼저 검사한다(`INVALID_MEDIA`).
2. `reserve` → `{ id, url, fields, expiresAt }` 계획을 받는다. 로컬 개발·통합 테스트도 실제 AWS S3를 사용하고 저장소 모드 분기는 없다.
3. `plan.fields`를 FormData에 넣고 `file`을 마지막에 추가해 `plan.url`로 POST한다. `credentials: 'omit'`, `redirect: 'error'`, `referrerPolicy: 'no-referrer'`이며 Content-Type 헤더를 직접 넣지 않는다.
4. 성공하면 `complete(id)`로 확정한다. S3 전송 실패·확정 실패는 모두 `remove(id)`로 예약을 정리하고 원래 오류를 던진다.
5. 프로필은 `features/user/api/avatar.api.ts`에서 `prepareAvatar`로 방향·중앙 자르기·512px JPEG 변환 후 같은 전송 함수를 사용한다. 5MB JPEG/PNG/WebP만 받으며 변환 오류는 초안을 보존한다.

- 게시글: `features/post-media/api/post-media.api.ts`의 `uploadMedia` → `uploadPostMediaMutationOptions(userId)` → `widgets/post-composer/model/use-post-media-upload.ts`의 `handleUpload`(`mutateAsync`). Quill 툴바가 숨은 file input을 만들고 받은 `media.url`을 선택 위치에 embed한다. 실패하면 편집기는 아무것도 넣지 않고 mutation 오류만 남는다.
- 채팅: `features/chat/api/chat.api.ts`의 `uploadAttachment(conversationId, file)` → `uploadChatAttachmentMutationOptions`. 메시지당 파일 하나이며 `upload.data.id`를 `attachmentIds`로 보낸다. 다른 파일로 바꿀 때는 기존 첨부를 `removeChatAttachmentMutationOptions`로 먼저 지운다(`ATTACHMENT_NOT_FOUND`는 성공으로 본다). 첨부가 바뀌거나 대화를 떠나면 effect cleanup이 이전 미전송 첨부를 `discardChatAttachment`(keepalive)로 정리 요청한다.
- 미디어 URL은 항상 같은 origin이다(`/api/post-media/<id>`, `/api/conversations/<id>/attachments/<id>`). S3 저장소에서는 API가 권한 확인 뒤 짧은 S3 주소로 이동시킨다. S3 주소·서명 필드를 저장·로그·분석 이벤트에 넣지 않고, S3 키를 `NEXT_PUBLIC_*`에 두지 않는다.

## 채팅 입력

- Enter 전송·Shift+Enter 줄바꿈은 `useDesktopKeyboard()`(hover + fine pointer, 앱 WebView 아님)가 true일 때만이다. IME 조합(`isComposing`, keyCode 229)과 `repeat`은 무시한다. 모바일·앱 Enter는 줄바꿈이며 안내 문구도 보이지 않는다.
- 전송·업로드·삭제 중복은 `client.isMutating({ mutationKey, exact: true })`와 mutation 상태로 막는다. 실패한 본문·첨부·`clientMessageId`는 남기고 성공 뒤에만 `form.reset`·`upload.reset`한다. 본문을 고치면 실패 상태를 `mutation.reset()`한다.
- 401·403·404는 `onUnavailable()`로 대화 상태를 다시 읽는다. 파일 오류는 `form.setError('root.attachment', …)`로 입력 옆에 보인다.

## 테스트

- 단위: `src/shared/ui/rich-text/rich-text.spec.tsx`(허용·거부 embed, 붙여넣은 HTML, 실행 가능한 URL), `src/features/post-media/api/post-media.api.spec.ts`·`src/features/chat/api/chat.api.spec.ts`(S3 전송·예약 정리, `fetch` mock).
- e2e: `e2e/compose.spec.ts`(분류 전환 중 초안 유지), `e2e/community-enhancements.spec.ts`(사진·동영상 삽입, 실패 후 재시도, `page.waitForEvent('filechooser')`), `e2e/chat-media.spec.ts`(`getByLabel('이미지 또는 동영상 첨부').setInputFiles`). e2e API는 실제 AWS S3의 실행별 tests/ 객체 경로를 사용하며 브라우저도 직접 전송한다. 실제 AWS 권한·CORS 수신은 로컬 성공으로 기록하지 않는다.

```sh
yarn workspace @game-feedback/web test src/shared/ui/rich-text src/features/post-media src/features/chat/api
yarn workspace @game-feedback/web test:e2e e2e/compose.spec.ts e2e/community-enhancements.spec.ts e2e/chat-media.spec.ts
```
