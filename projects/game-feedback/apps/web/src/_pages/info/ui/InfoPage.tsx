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
      <article className="info-card" lang={language}>
        <h1>{translate(language, infoTitles[kind])}</h1>
        {match(kind)
          .with('guide', () => <GuideContent locale={language} />)
          .with('terms', () => <TermsContent locale={language} />)
          .with('privacy', () => <PrivacyContent locale={language} />)
          .with('contact', () => <ContactContent locale={language} />)
          .exhaustive()}
      </article>
    </>
  );
}
