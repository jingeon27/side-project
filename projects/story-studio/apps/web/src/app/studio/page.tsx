import { formatSchema } from '../../features/story/model/story';
import { Studio } from '../../features/studio/ui/Studio';

export default async function Workspace({
  searchParams,
}: {
  searchParams: Promise<{ format?: string; sample?: string; demo?: string }>;
}) {
  const query = await searchParams;
  const format = formatSchema.safeParse(query.format);
  const demoSource = query.demo === 'bundled' ? 'bundled' : query.demo === '1' ? 'local' : undefined;
  const openSample = query.sample === '1';
  return (
    <Studio
      key={JSON.stringify([format.data, openSample, demoSource])}
      initialFormat={format.success ? format.data : undefined}
      openSample={openSample}
      demoSource={demoSource}
    />
  );
}
