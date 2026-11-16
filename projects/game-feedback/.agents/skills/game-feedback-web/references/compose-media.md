# compose-media

폼(RHF+Zod `useZodForm`)·mutation 일반 규칙은 프로젝트 [game-feedback-client](../../game-feedback-client/SKILL.md), 검증은 [game-feedback-testing](../../game-feedback-testing/SKILL.md) 스킬을 따른다. 캐시·재전송 키는 [server-state](server-state.md) 스킬이다. 저장소 설정·S3 CORS는 `projects/game-feedback/docs/media-upload.md`.

## 본문 계약

- 저장 값은 `body`(평문) + `document`(기존 Delta 호환 형식)다. 허용 범위는 `packages/contracts/src/rich-text.ts`의 `RichTextAttributesSchema`(strict): bold·italic·underline·strike·link(http/https, 2048자)·header 2|3·list ordered|bullet·blockquote. embed는 `{ image | video: '/api/post-media/<id>' }`(`PostMediaUrlSchema`)뿐이다. 글자 합계 10001, embed 10개, ops 2000, 마지막 insert는 `\n`으로 끝난다.
- 서식을 늘리려면 contracts 스키마 → API 검증 → `shared/ui/rich-text/tiptap-extensions.ts`·툴바·`tiptap-document.ts` 변환 → `RichTextBody` 렌더 → `rich-text.spec.tsx`를 함께 바꾼다. 하나만 바꾸면 저장이 거부되거나 표시되지 않는다.
- 렌더는 `shared/ui/rich-text/RichTextBody.tsx`(서버에서도 동작, `dangerouslySetInnerHTML` 없음)가 Delta를 React 요소로 만든다. 링크는 `target="_blank" rel="nofollow ugc noopener noreferrer"`, 이미지는 `next/image` `unoptimized`(쿠키 인증 같은 origin), 동영상은 native `<video controls playsInline preload="metadata">`다. `document`가 없으면 평문으로 그린다.

## 편집기

- 글쓰기 제출·이동은 `_pages/compose/ui/CreatePostForm.tsx`, 수정·닫기·새로고침은 `_pages/post/ui/editor/EditPostSheet.tsx`가 소유한다. 두 흐름이 쓰는 `PostContentFields`, `postComposerSchema`, `postContentInput`만 `widgets/post-composer`의 공개 API로 공유한다.
- 현재 작성 게임은 활성 `clash-royale` 카테고리로 고정하고 게임 입력란을 표시하지 않는다. 카테고리 ID는 숨은 필드로 보내며 클래시로얄 카테고리가 없으면 제출을 막는다. 코칭의 모집 유형과 수강료 기준은 native radio fieldset으로 두 선택/세 선택을 바로 표시한다.
- 툴바는 기본 서식·링크·첨부와 `서식 더보기`로 조립한다. 툴바는 Tab 한 번으로 진입하고 방향키/Home/End로 이동하며, 다음 Tab은 본문으로 간다. 고급 메뉴는 선택 영역과 Escape 포커스 복귀를 유지한다. 제목의 길이 안내/오류와 본문의 도움말/오류를 실제 컨트롤의 ARIA에 연결한다.
- 홈·게시판의 `widgets/compose-entry` 버튼은 고정 위치에서 스크롤 중 `+`, 180ms 정지 후 `+ 글쓰기`로 표시한다. 키보드 포커스가 있으면 문구를 유지한다. 프로필·설정·내 글에는 작성 버튼을 두지 않는다.

- `RichTextEditor`(`@/shared/ui`)는 React.lazy/Suspense로 `TiptapEditor`를 지연 로드한다. `useEditor({ immediatelyRender: false })`로 SSR 중 DOM 생성을 피하고 Tiptap이 편집기 수명을 관리한다. CSS는 `_app/styles/editor.css`다. `tiptap-document.ts`가 Delta와 Tiptap JSON을 변환하며 기존 DB 문서를 일괄 변환하지 않는다. 사진과 동영상은 inline atom으로 문서 순서를 보존하고 CSS로 본문 폭 안에 표시한다.
- 지연 로드 실패는 감싼 `ServiceErrorBoundary title="본문 편집기"`가 받는다. 폼의 다른 입력은 유지된다.
- 변경은 `onChange({ body, document, valid })`다. `PostContentFields`가 `setValue('body' | 'document' | 'editorValid')`로 넣고 `postComposerSchema`(`PostInputSchema` + `editorValid`)가 검증한다. 편집기 값을 useState에 복제하지 않는다. 본문 평문은 변환한 Delta의 `richTextToPlainText`로 계산해 API 일치 검증을 유지한다. 한글 조합 중 content를 재설정하지 않으며 placeholder만 숨긴다. 포커스된 편집기에서 viewport 크기가 바뀌면 레이아웃 갱신 뒤 ProseMirror가 커서를 스크롤 영역 안에 노출한다. callback ref가 리스너와 예약 프레임을 정리한다. 저장 계약에 없는 중첩 목록과 임의 시작 번호는 편집기에서 제공하지 않는다.
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

- 게시글: `features/post-media/api/post-media.api.ts`의 `uploadMedia` → `uploadPostMediaMutationOptions(userId)` → 작성·수정 폼이 직접 호출하는 `useMutation` 결과의 `mutateAsync`. Tiptap 툴바가 숨은 file input을 만들고 받은 `media.url`을 선택 위치에 embed한다. 실패하면 편집기는 아무것도 넣지 않고 mutation 오류만 남는다.
- 채팅: `features/chat/api/chat.api.ts`의 `uploadAttachment(conversationId, file)` → `uploadChatAttachmentMutationOptions`. 메시지당 파일 하나이며 `upload.data.id`를 `attachmentIds`로 보낸다. 다른 파일로 바꿀 때는 기존 첨부를 `removeChatAttachmentMutationOptions`로 먼저 지운다(`ATTACHMENT_NOT_FOUND`는 성공으로 본다). 대화를 떠나면(언마운트·대화 변경) effect cleanup이 `useEffectEvent`로 그때 남은 미전송 첨부만 `discardChatAttachment`(keepalive)로 정리 요청한다. 보냈거나 지운 첨부는 `upload.reset()`으로 비울 뿐 다시 지우지 않는다(`use-chat-composer.test.tsx`).
- 미디어 URL은 항상 같은 origin이다(`/api/post-media/<id>`, `/api/conversations/<id>/attachments/<id>`). S3 저장소에서는 API가 권한 확인 뒤 짧은 S3 주소로 이동시킨다. S3 주소·서명 필드를 저장·로그·분석 이벤트에 넣지 않고, S3 키를 `NEXT_PUBLIC_*`에 두지 않는다.

## 채팅 입력

- Enter 전송·Shift+Enter 줄바꿈은 `useDesktopKeyboard()`(hover + fine pointer, 앱 WebView 아님)가 true일 때만이다. IME 조합(`isComposing`, keyCode 229)과 `repeat`은 무시한다. 모바일·앱 Enter는 줄바꿈이며 안내 문구도 보이지 않는다.
- 전송·업로드·삭제 중복은 `client.isMutating({ mutationKey, exact: true })`와 mutation 상태로 막는다. 실패한 본문·첨부·`clientMessageId`는 남기고 성공 뒤에만 `form.reset`·`upload.reset`한다. 본문을 고치면 실패 상태를 `mutation.reset()`한다.
- 401·403·404는 `onUnavailable()`로 대화 상태를 다시 읽는다. 파일 오류는 `form.setError('root.attachment', …)`로 입력 옆에 보인다.

## 테스트

- 단위: `src/shared/ui/rich-text/rich-text.spec.tsx`(허용·거부 embed, 붙여넣은 HTML, 실행 가능한 URL), `tiptap-document.spec.ts`(기존 문서 왕복과 미디어 순서), `src/features/post-media/api/post-media.api.spec.ts`·`src/features/chat/api/chat.api.spec.ts`(S3 전송·예약 정리, `fetch` mock).
- e2e: `e2e/compose.spec.ts`(분류 전환 중 초안 유지), `e2e/community-enhancements.spec.ts`(사진·동영상 삽입, 실패 후 재시도, `page.waitForEvent('filechooser')`), `e2e/chat-media.spec.ts`(`getByLabel('이미지 또는 동영상 첨부').setInputFiles`). e2e API는 실제 AWS S3의 실행별 tests/ 객체 경로를 사용하며 브라우저도 직접 전송한다. 실제 AWS 권한·CORS 수신은 로컬 성공으로 기록하지 않는다.

```sh
yarn workspace @game-feedback/web test src/shared/ui/rich-text src/features/post-media src/features/chat/api
yarn workspace @game-feedback/web test:e2e e2e/compose.spec.ts e2e/community-enhancements.spec.ts e2e/chat-media.spec.ts
```

- 편집기 호환 E2E: `yarn workspace @game-feedback/web test:editor`. 격리 API/DB와 운영 빌드에서 Desktop Chromium, Android Chromium, iOS WebKit 대역을 사용한다. 합성 IME 이벤트 검증을 실기기 한글 키보드 검증으로 보고하지 않는다.
