import { connection } from 'next/server';
import { sitemap } from '@/_app/seo';
export default async function Sitemap() {
  await connection();
  return sitemap();
}
