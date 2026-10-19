import { connection } from 'next/server';
import { dailySitemap } from '@/_app/seo';
export default async function Sitemap() {
  await connection();
  return dailySitemap();
}
