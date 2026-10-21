---
name: overlay
description: 웹(apps/web)에서 바텀시트·확인 대화상자를 만들거나 여닫는 방식, 뒤로 가기로 닫기, 포커스 복귀, 오버레이 안에서의 이동·mutation, 새 종류의 오버레이를 다룰 때 사용한다.
---

## 열기

- 한 번만 쓰는 열기 동작은 버튼의 `onClick`에 `overlay.open`을 직접 선언한다. 여러 곳에서 재사용할 때만 핸들러를 분리한다. 열림 상태를 컴포넌트가 들지 않는다.

```tsx
<Button
  onClick={() =>
    overlay.open(({ isOpen, close, unmount }) => (
      <XxxBottomSheet isOpen={isOpen} onClose={close} unmount={unmount} contestId={contestId} />
    ))
  }
>
  열기
</Button>
```

- `unmount`를 꼭 넘긴다. 시트는 닫힘 애니메이션이 끝나면 이것을 불러 자신을 지운다. 빠지면 닫힌 시트가 `OverlayProvider`에 계속 남는다.
- 결과 값이 필요할 때만 `overlay.openAsync<T>`를 쓴다. 고른 값은 `close(value)`로 돌려주고 `onClose={() => close(<취소 값>)}`을 넘겨, 뒤로 가기·스와이프·Esc로 닫혀도 Promise가 끝나게 한다.
- `useState`로 열림(`open`·`isOpen`·`…Open`)이나 오류(`error`·`…Error`)를 들지 않는다(`eslint.config.ts`의 `no-restricted-syntax`). 진행·실패는 `useMutation`의 `loading`·`error`와 ErrorLink 토스트로 보여 준다.

## 시트 만들기

- 두 화면 이상에서 쓰면 `src/features/<domain>/ui/XxxBottomSheet.tsx`, 한 화면이면 `src/_pages/<screen>/@page/bottom-sheet/XxxBottomSheet.tsx`. props는 `IBottomSheetControlProps`(`@/shared/ui/@core/bottom-sheet`)에 id 같은 원시값만 더한다.

```tsx
<BottomSheet.Root isOpen={isOpen} onClose={onClose} unmount={unmount}>
  <BottomSheet.Header title="사진 신고하기" description="…" /> {/* title = 대화상자 이름, 필수 */}
  <BottomSheet.Content>{/* 이 부분만 스크롤된다 */}</BottomSheet.Content>
  <BottomSheet.Footer>{/* 주 버튼. 하단 안전 영역이 들어 있다 */}</BottomSheet.Footer>
</BottomSheet.Root>
```

- 오버레이는 `OverlayProvider` 자리(`src/_app/providers/AppProviders.tsx`, Apollo·Bridge·Toast 안쪽)에서 그려진다. Apollo 훅과 `toast`는 쓸 수 있지만 화면 안에서 만든 Context는 닿지 않으니 필요한 값은 props로 넘긴다.
- `OverlayProvider`는 레이아웃에 있어 화면이 바뀌어도 열린 시트가 남는다. 시트 안에서 이동할 때는 `useAppRouter().push(href)`를 부르고 같은 핸들러에서 `onClose()`한다. 열린 시트의 history 항목을 replace해 뒤로 가기에 빈 항목이 남지 않는다. `<Link>`로 옮기면 시트가 새 화면 위에 남는다.
- 폼이 든 시트는 `form` 스킬을 따른다.
- 높이를 조절하는 시트는 `BottomSheet.Root`에 `snapPoints`(예: `[0.75, 1]`)와 충분한 기본 높이(`className="h-dvh"`)를 준다. 첫 스냅으로 열리고 헤더 드래그로 크기를 조절하고 별도의 확대·축소 버튼은 두지 않는다. 공통 Root의 스냅 오프셋·하단 패딩이 입력창을 화면 안에 유지하므로 화면에서 드래그 상태나 고정 footer를 따로 구현하지 않는다. 댓글은 75%와 전체 높이를 사용한다.

## 확인 대화상자

- `ConfirmDialog`(`@/shared/ui/@core/confirm-dialog`): `title`, `description`, `confirmLabel`(행동 이름 — "사진 삭제하기", "확인" 금지), 되돌릴 수 없는 행동이면 `tone="danger"`, `onConfirm`.
- `onConfirm`이 돌려준 Promise가 끝날 때까지 버튼을 잠그고, 성공하면 닫고 실패하면 열어 둔다. 그래서 mutate Promise를 try/catch로 삼키지 말고 그대로 돌려준다(삼키면 실패해도 닫힌다). 성공 뒤 할 일은 `await` 다음 줄에 둔다.

```tsx
onConfirm={async () => {
  await deleteSubmission({ variables: { submissionId } });
  toast.success('사진을 삭제했어요');
}}
```

- 시트 위 대화상자도 `overlay.open`으로 연다. 뒤로 가기는 맨 위부터 닫고, 포커스는 시트 안의 연 버튼으로 돌아간다(`ConfirmDialogInSheet.spec.tsx`).

## 새 종류의 오버레이

- Base UI로 직접 만들 때(사진 크게 보기 등)는 `useOverlayHistory(isOpen, onClose)`(`@/shared/model/router`)와 `Portal container={getOverlayContainer()}`(`src/shared/lib/overlay-container.helper.ts`)를 함께 쓴다. 그래야 브라우저·안드로이드 뒤로 가기(`navigation.back`)가 화면보다 오버레이를 먼저 닫고, 오버레이가 앱의 provider와 기록 안에서 동작한다. 바텀시트는 모든 화면에서 아래에 붙고 브라우저 너비를 채운다. z-index는 `z-sheet`·`z-dialog` 토큰.
- 포커스는 닫힐 때 Base UI가 열기 전 포커스 요소로 돌려준다. 그러니 effect가 아니라 연 버튼의 클릭 핸들러에서 연다.

## 테스트 (ui 레인)

- `render(<OverlayProvider>…</OverlayProvider>)`, `afterEach(() => act(() => overlay.unmountAll()))`. `findByRole('dialog' | 'alertdialog', { name: 제목 })`로 찾고, "닫기" 버튼·Esc·`act(() => window.history.back())`로 닫은 뒤 연 버튼 포커스와 `hasOpenOverlay() === false`를 단언한다. 본보기: `src/shared/ui/@core/bottom-sheet/BottomSheet.spec.tsx`.
- 한 파일만: `corepack yarn workspace @photo-contest/web test <spec 경로>`(side 루트).
