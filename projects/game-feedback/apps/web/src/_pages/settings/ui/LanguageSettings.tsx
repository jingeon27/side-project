'use client';
import { NativeSelect, NativeSelectOption } from '@side/design-system';
import { Globe2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useI18n, setLanguagePreference, languagePreference, localePath } from '@/shared/i18n';

const languageNames = { ko: '한국어', en: 'English', ja: '日本語' } as const;
export function LanguageSettings() {
  const { t, automaticLocale, preference } = useI18n();
  const router = useRouter();
  return (
    <section className="settings-card language-settings" id="language" aria-labelledby="language-title">
      <h2 id="language-title">
        <Globe2 size={19} />
        {t('언어')}
      </h2>
      <label htmlFor="language-preference" className="sr-only">
        {t('언어 설정')}
      </label>
      <NativeSelect
        id="language-preference"
        value={preference}
        onChange={(event) => {
          const next = languagePreference(event.target.value);
          setLanguagePreference(next);
          const target = next === 'auto' ? automaticLocale : next;
          router.replace(localePath(window.location.pathname + window.location.search, target), {
            scroll: false,
          });
        }}
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
      <p className="muted small">
        {preference === 'auto'
          ? t('기기나 브라우저의 언어와 지역 설정을 사용합니다.')
          : t('직접 선택한 언어를 이 브라우저와 앱에 저장합니다.')}
      </p>
      <p className="muted small">
        {t('자동 선택 언어: {language}', { language: languageNames[automaticLocale] })}
      </p>
    </section>
  );
}
