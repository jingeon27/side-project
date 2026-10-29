'use client';

import { Globe2 } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Spinner } from '@side/design-system';

import { useI18n } from './LanguageProvider';
import { languagePreference } from './locale';

interface ILanguageSelectProps {
  id?: string;
  compact?: boolean;
}

export function LanguageSelect({ id, compact = false }: ILanguageSelectProps) {
  const { t, preference, pending, changePreference } = useI18n();
  const items = [
    { value: 'auto', label: t('기기 설정에 맞춤') },
    { value: 'ko', label: '한국어' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
  ];
  const handleChange = (value: string | null) => {
    if (!value) return;
    changePreference(languagePreference(value));
  };
  return (
    <Select items={items} value={preference} onValueChange={handleChange} disabled={pending}>
      <SelectTrigger
        id={id}
        aria-busy={pending}
        aria-label={t('언어 설정')}
        title={compact ? t('언어 설정') : undefined}
        hideIcon={compact}
        className={
          compact
            ? 'size-touch justify-center border-transparent bg-transparent p-0 text-muted hover:bg-neutral-soft [&>svg]:size-5'
            : 'w-full'
        }
      >
        {compact ? (
          <>
            <span aria-hidden>{pending ? <Spinner className="size-5" /> : <Globe2 size={20} />}</span>
            <SelectValue className="sr-only" />
          </>
        ) : (
          <SelectValue />
        )}
      </SelectTrigger>
      <SelectContent align={compact ? 'end' : 'start'} alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
            lang={item.value === 'auto' ? undefined : item.value}
          >
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
