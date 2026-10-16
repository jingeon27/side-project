---
name: form
description: 웹(apps/web)에서 입력 폼(그룹·대회 만들기, 사진 제출, 신고, 닉네임 등)을 만들거나 zod 스키마·값 구독·제출 잠금·서버 오류 표시·닫을 때 초기화를 고칠 때 사용한다.
---

시트 여닫기는 `overlay` 스킬, mutation·캐시는 `apollo` 스킬을 따른다.

## 스키마

- `src/features/<domain>/model/<domain>.schema.ts`에 둔다(화면 전용이면 `src/_pages/<screen>/@page/model/*.schema.ts`). `*.schema` 파일은 다른 slice에서 깊게 import해도 된다.
- zod 4 `z.object`로, 문자열은 `.trim()` 뒤 `.min()`·`.max()`에 한국어 안내문을 단다. 길이·형식은 API 제한과 같은 값으로 맞춘다(최종 판단은 서버). 입력에도 같은 `maxLength`를 건다.
- `type="datetime-local"` 값은 `toDateTimeLocalValue`·`fromDateTimeLocalValue`(`src/shared/lib/format.helper.ts`)로만 바꾼다(기기 시간대 ↔ ISO, 형식이 틀리면 null). 여러 필드에 걸친 검사(시작 < 제출 마감 < 종료)는 `refine`·`superRefine`에 `path`를 달아 해당 입력에 붙인다.

## 폼

- `useZodForm(schema, { defaultValues })`(`@/shared/model/form`): 입력 타입은 스키마 input, 제출 값은 output(trim·변환 뒤)이다. `defaultValues`에는 모든 필드를 빈 문자열·false·null로 빠짐없이 준다.
- `<form noValidate>`로 브라우저 검증 말풍선을 끄고 zod 하나로 검증한다.
- 글자 입력은 `TextField`·`TextArea`(`@/shared/ui/@core/text-field`)에 `label`, `error={form.formState.errors.name?.message}`, `{...form.register('name')}`를 그대로 넘긴다. ref가 이어져 제출이 막히면 첫 오류 입력으로 포커스가 간다. 입력 글자 16px(iOS 확대 방지)은 컴포넌트가 맞추므로 글자 크기 클래스를 덧붙이지 않는다.
- 직접 만드는 입력(파일·체크박스)은 `aria-invalid`, `useId`로 만든 `aria-describedby`, `role="alert"` 안내문을 손으로 잇고, 감싸는 label에 `min-h-touch`(44px)를 줘 누를 영역을 확보한다. 파일은 `Controller`의 `field.onChange(file)`로 넣고 `event.currentTarget.value = ''`로 비워 같은 파일을 다시 고를 수 있게 한다.
- 시트에서는 `<form id={FORM_ID}>`를 `BottomSheet.Content` 안에 두고, 제출 버튼은 `BottomSheet.Footer`에서 `type="submit" form={FORM_ID}`로 잇는다. form으로 Content와 Footer를 함께 감싸면 Content만 스크롤되는 구조가 깨진다.
- 렌더에 쓰는 값(글자 수, 미리보기, 버튼 활성)은 `useWatch({ control: form.control, name })`, 핸들러 안에서는 `form.getValues()`. 렌더 중 `form.watch()`는 폼 전체를 다시 그린다.

## 제출

```tsx
<form
  id={FORM_ID}
  noValidate
  onSubmit={form.handleSubmit(async (values) => {
    try {
      await createGroup({ variables: values });
    } catch {
      // ErrorLink가 토스트했다. 시트를 열어 두어 고쳐서 다시 보내게 한다.
    }
  })}
>
  {/* 입력 필드 */}
</form>
// <Button type="submit" form={FORM_ID} fullWidth loading={form.formState.isSubmitting}>
```

- onValid 안에서 던진 오류는 `form.handleSubmit` 밖으로 다시 던져진다. 반드시 onValid 안에서 잡는다.
- 제출 버튼 `loading`에는 `form.formState.isSubmitting`(검증 시작부터 onValid가 끝날 때까지)을 준다. 사진 줄이기 → 업로드 → mutation처럼 단계가 여럿이면 mutation 하나의 `loading`으로는 다른 단계 동안 다시 눌린다. 진행 상태를 useState로 따로 두지 않는다.
- `formState.isSubmitSuccessful`은 mutation 성공을 뜻하지 않는다(catch로 삼켜도 true다). 성공 뒤 일(캐시 갱신·이동·닫기·이벤트)은 mutation의 `update`·`onCompleted`나 `await` 다음 줄에 둔다.

## 서버 오류

- 기본은 ErrorLink 토스트다. 사용자가 그 입력 하나를 고쳐 풀 수 있는 거절(BAD_USER_INPUT)만 입력 아래에 보인다.

```ts
try {
  await createSubmission({ variables, context: { errorToast: false } });
} catch (error) {
  if (getErrorCode(error) === ERROR_CODE.BadUserInput) {
    form.setError('caption', { message: getErrorMessage(error) }, { shouldFocus: true });
    return;
  }
  toast.error(getErrorMessage(error));
}
```

## 초기화

- 시트의 폼은 닫힐 때 `unmount`로 함께 사라지고 다시 열면 새로 만들어진다. 닫기에서 `reset()`을 부르지 말고 `unmount`를 넘겼는지만 확인한다. 화면에 남는 폼만 성공 뒤 `form.reset()`.

## 테스트

- 목 없이 실제 RHF·Base UI로 검증한다(본보기 `src/shared/ui/@core/text-field/TextField.spec.tsx`, `src/shared/model/form/form.hook.spec.tsx`): 레이블로 찾아 `user.type` → 제출 → 안내문·`aria-invalid`·포커스, 통과하면 스키마 output 값으로 제출됐는지.
- `corepack yarn workspace @photo-contest/web test <spec 경로>`(side 루트).
