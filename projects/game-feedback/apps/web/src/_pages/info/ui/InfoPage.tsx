import { BackLink } from '@/shared/navigation';
import { appRoutes } from '@game-feedback/bridge';
import { ArrowLeft } from 'lucide-react';
import { match } from 'ts-pattern';
import { infoTitles, type TInfoKind } from '../model/info';
import { GuideContent } from './GuideContent';
import { TermsContent } from './TermsContent';
import { PrivacyContent } from './PrivacyContent';
import { ContactContent } from './ContactContent';
import { translate, isLocale } from '@/shared/i18n/index.server';

export function InfoPage({ kind, locale }: { kind: TInfoKind; locale: string }) {
  const language = isLocale(locale) ? locale : 'ko';
  return (
    <>
      <BackLink className="back-link" href={appRoutes.feed(locale)}>
        <ArrowLeft size={16} />
        {translate(language, '홈')}
      </BackLink>
      {language !== 'ko' && (
        <p className="language-banner">{translate(language, '한국어 원문으로 제공되는 안내입니다.')}</p>
      )}
      <article className="info-card" lang="ko">
        <h1>{infoTitles[kind]}</h1>
        {match(kind)
          .with('guide', () => <GuideContent locale={locale} />)
          .with('terms', () => <TermsContent locale={locale} />)
          .with('privacy', () => <PrivacyContent />)
          .with('contact', () => <ContactContent />)
          .exhaustive()}
      </article>
    </>
  );
}
