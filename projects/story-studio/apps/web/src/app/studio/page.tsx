import { Studio } from '../../components/Studio';
import { formatSchema } from '../../lib/story';

export default async function Workspace({
  searchParams,
}: {
  searchParams: Promise<{ format?: string; sample?: string; demo?: string }>;
}) {
  const query = await searchParams;
  const format = formatSchema.safeParse(query.format);
  return (
    <Studio
      initialFormat={format.success ? format.data : undefined}
      openSample={query.sample === '1'}
      openDemo={query.demo === '1'}
    />
  );
}
