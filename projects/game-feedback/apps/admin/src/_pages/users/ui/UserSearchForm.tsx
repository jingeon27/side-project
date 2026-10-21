import { Button, Input } from '@side/design-system';

import { adminUserPath } from '@/shared/lib';
import { useZodForm } from '@/shared/model';

import { userSearchSchema } from '../model/user-search.schema';

export function UserSearchForm({ initialUserId }: { initialUserId: string }) {
  const form = useZodForm(userSearchSchema, { defaultValues: { id: initialUserId } });
  const handleSearch = form.handleSubmit(({ id }) => {
    window.location.hash = adminUserPath(id);
  });
  return (
    <form className="form-stack" onSubmit={handleSearch}>
      <div className="admin-actions">
        <label>
          사용자 ID
          <Input
            {...form.register('id')}
            placeholder="사용자 ID를 입력하세요."
            aria-invalid={Boolean(form.formState.errors.id)}
            maxLength={100}
          />
        </label>
        <Button type="submit">조회</Button>
      </div>
      {form.formState.errors.id && <p role="alert">사용자 ID를 확인해주세요.</p>}
    </form>
  );
}
