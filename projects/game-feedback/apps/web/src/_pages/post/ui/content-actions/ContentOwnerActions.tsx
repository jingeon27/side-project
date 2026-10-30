'use client';

import { Pencil, Trash2 } from 'lucide-react';

import { useI18n } from '@/shared/i18n';

interface IContentOwnerActionsProps {
  onEdit: () => void;
  onDelete: () => void;
}

/** 작성자에게 보이는 수정·삭제 버튼. 무엇을 수정·삭제할지는 호출부가 정한다. */
export function ContentOwnerActions({ onEdit, onDelete }: IContentOwnerActionsProps) {
  const { t } = useI18n();
  return (
    <div className="content-actions">
      <button type="button" className="text-action" onClick={onEdit}>
        <Pencil size={13} />
        {t('수정')}
      </button>
      <button type="button" className="text-action danger-text" onClick={onDelete}>
        <Trash2 size={13} />
        {t('삭제')}
      </button>
    </div>
  );
}
