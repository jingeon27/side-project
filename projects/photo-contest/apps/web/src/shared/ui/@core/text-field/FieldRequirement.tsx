import { cn } from '../../../lib/cn.helper';

/** 접근성 이름은 유지하고 필수 여부는 입력의 required 속성으로 전달한다. */
export function FieldRequirement({ required = false }: { required?: boolean }) {
  return (
    <span aria-hidden className={cn('ml-1 text-micro', required ? 'text-danger' : 'text-muted')}>
      {required ? '필수' : '선택'}
    </span>
  );
}
