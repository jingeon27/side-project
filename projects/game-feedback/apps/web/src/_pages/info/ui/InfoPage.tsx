import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { match } from 'ts-pattern';
import { infoTitles, type TInfoKind } from '../model/info';
import { GuideContent } from './GuideContent';
import { TermsContent } from './TermsContent';
import { PrivacyContent } from './PrivacyContent';
import { ContactContent } from './ContactContent';

export function InfoPage({ kind, locale }: { kind: TInfoKind; locale: string }) {
  return (
    <>
      <Link className="back-link" href={`/${locale}`}>
        <ArrowLeft size={16} />
        피드백 라운지
      </Link>
      <article className="info-card">
        <span className="section-eyebrow">
          {kind === 'guide' ? 'PLAY BETTER, TOGETHER' : 'COMMUNITY & TRUST'}
        </span>
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
