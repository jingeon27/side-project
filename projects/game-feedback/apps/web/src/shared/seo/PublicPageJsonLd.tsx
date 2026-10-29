import { JsonLd } from './JsonLd';
import { publicPageStructuredData, type TPublicStaticPage } from './structured-data';

export function PublicPageJsonLd({ kind, locale }: { kind: TPublicStaticPage; locale: string }) {
  return <JsonLd data={publicPageStructuredData(kind, locale)} />;
}
