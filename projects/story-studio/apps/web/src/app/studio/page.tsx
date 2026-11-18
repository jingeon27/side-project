import { formatSchema } from '../../features/story/model/story';
import { Studio } from '../../features/studio/ui/Studio';

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
      demoSource={query.demo === 'bundled' ? 'bundled' : query.demo === '1' ? 'local' : undefined}
    />
  );
}
