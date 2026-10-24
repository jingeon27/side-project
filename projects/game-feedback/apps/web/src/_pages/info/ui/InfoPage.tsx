import { ArrowLeft } from 'lucide-react';
import { match } from 'ts-pattern';

import { appRoutes } from '@game-feedback/bridge';

import { isLocale, translate } from '@/shared/i18n/index.server';
import { BackLink } from '@/shared/navigation';
import { CommunityPage } from '@/widgets/community-shell';

import { infoTitles, type TInfoKind } from '../model/info';
import { ContactContent } from './ContactContent';
import { ContactSupport } from './ContactSupport';
import { ContactTopbar } from './ContactTopbar';
import { GuideContent } from './GuideContent';
import { GuideTopbar } from './GuideTopbar';
import { PrivacyContent } from './PrivacyContent';
import { PrivacyTopbar } from './PrivacyTopbar';
import { TermsContent } from './TermsContent';
import { TermsTopbar } from './TermsTopbar';

export function InfoPage({ kind, locale }: { kind: TInfoKind; locale: string }) {
  const language = isLocale(locale) ? locale : 'ko';
  return (
    <CommunityPage
      locale={locale}
      topbar={match(kind)
        .with('guide', () => <GuideTopbar locale={locale} />)
        .with('terms', () => <TermsTopbar locale={locale} />)
        .with('privacy', () => <PrivacyTopbar locale={locale} />)
        .with('contact', () => <ContactTopbar locale={locale} />)
        .exhaustive()}
    >
      {kind !== 'guide' && (
        <BackLink className="back-link" href={appRoutes.feed(locale)}>
          <ArrowLeft size={16} />
          {translate(language, '홈')}
        </BackLink>
      )}
      <article className="info-card" lang={language}>
        <h1>{translate(language, infoTitles[kind])}</h1>
        {match(kind)
          .with('guide', () => <GuideContent locale={language} />)
          .with('terms', () => <TermsContent locale={language} />)
          .with('privacy', () => <PrivacyContent locale={language} />)
          .with('contact', () => <ContactContent locale={language} />)
          .exhaustive()}
      </article>
      {kind === 'contact' && <ContactSupport />}
    </CommunityPage>
  );
}
