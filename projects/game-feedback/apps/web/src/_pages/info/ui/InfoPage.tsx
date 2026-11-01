import Link from 'next/link';

import { ArrowLeft } from 'lucide-react';
import { match } from 'ts-pattern';

import { appRoutes } from '@game-feedback/bridge';

import { isLocale, translate } from '@/shared/i18n/index.server';
import { CommunityPage } from '@/widgets/community-shell';

import { infoTitles, type TInfoKind } from '../model/info';
import { ContactContent } from './contact/ContactContent';
import { ContactSupport } from './contact/ContactSupport';
import { ContactTopbar } from './contact/ContactTopbar';
import { GuideContent } from './guide/GuideContent';
import { GuideTopbar } from './guide/GuideTopbar';
import { PrivacyContent } from './privacy/PrivacyContent';
import { PrivacyTopbar } from './privacy/PrivacyTopbar';
import { TermsContent } from './terms/TermsContent';
import { TermsTopbar } from './terms/TermsTopbar';

export function InfoPage({ kind, locale }: { kind: TInfoKind; locale: string }) {
  const language = isLocale(locale) ? locale : 'ko';
  return (
    <CommunityPage
      locale={locale}
      screenKey={kind}
      topbar={match(kind)
        .with('guide', () => <GuideTopbar locale={locale} />)
        .with('terms', () => <TermsTopbar locale={locale} />)
        .with('privacy', () => <PrivacyTopbar locale={locale} />)
        .with('contact', () => <ContactTopbar locale={locale} />)
        .exhaustive()}
    >
      <Link className="back-link" href={appRoutes.feed(locale)}>
        <ArrowLeft size={16} aria-hidden />
        {translate(language, '홈')}
      </Link>
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
