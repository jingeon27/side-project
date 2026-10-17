'use client';
import { Globe2 } from 'lucide-react';
import { LanguageSelect, useI18n } from '@/shared/i18n';

const languageNames = { ko: '한국어', en: 'English', ja: '日本語' } as const;
export function LanguageSettings() {
  const { t, automaticLocale, preference } = useI18n();
  return (
    <section className="settings-card language-settings" id="language" aria-labelledby="language-title">
      <h2 id="language-title">
        <Globe2 size={19} />
        {t('언어')}
      </h2>
      <label htmlFor="language-preference" className="sr-only">
        {t('언어 설정')}
      </label>
      <LanguageSelect id="language-preference" />
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
