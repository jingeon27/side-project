'use client';

import { NativeSelect, NativeSelectOption } from '@side/design-system';
import { Globe2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ChangeEvent } from 'react';
import { setLanguagePreference, useI18n } from './LanguageProvider';
import { languagePreference, localePath } from './locale';

interface ILanguageSelectProps {
  id?: string;
  compact?: boolean;
}

export function LanguageSelect({ id, compact = false }: ILanguageSelectProps) {
  const { t, automaticLocale, preference } = useI18n();
  const router = useRouter();

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = languagePreference(event.target.value);
    setLanguagePreference(next);
    const target = next === 'auto' ? automaticLocale : next;
    router.replace(
      localePath(window.location.pathname + window.location.search + window.location.hash, target),
      {
        scroll: false,
      },
    );
  }

  return (
    <div className={compact ? 'relative shrink-0' : undefined}>
      <NativeSelect
        id={id}
        size={compact ? 'sm' : 'default'}
        className={
          compact
            ? 'size-touch [&_select]:cursor-pointer [&_select]:border-transparent [&_select]:px-0 [&_select]:text-transparent [&_select:hover]:bg-neutral-soft [&_[data-slot=native-select-icon]]:hidden'
            : undefined
        }
        aria-label={t('언어 설정')}
        title={compact ? t('언어 설정') : undefined}
        value={preference}
        onChange={handleChange}
      >
        <NativeSelectOption value="auto">{t('기기 설정에 맞춤')}</NativeSelectOption>
        <NativeSelectOption value="ko" lang="ko">
          한국어
        </NativeSelectOption>
        <NativeSelectOption value="en" lang="en">
          English
        </NativeSelectOption>
        <NativeSelectOption value="ja" lang="ja">
          日本語
        </NativeSelectOption>
      </NativeSelect>
      {compact && (
        <Globe2
          size={20}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-muted"
        />
      )}
    </div>
  );
}
