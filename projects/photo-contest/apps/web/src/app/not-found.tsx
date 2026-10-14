import { ImageOff } from 'lucide-react';

import { ROUTES } from '@/shared/constants/routes';
import { ButtonLink } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col justify-center">
      <EmptyState
        icon={<ImageOff className="size-6" />}
        title="페이지를 찾을 수 없어요"
        description="주소가 바뀌었거나 볼 수 없는 화면이에요."
        action={<ButtonLink href={ROUTES.HOME}>홈으로 가기</ButtonLink>}
      />
    </div>
  );
}
