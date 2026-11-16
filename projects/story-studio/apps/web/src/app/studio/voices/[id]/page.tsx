import { notFound } from 'next/navigation';

import { VoiceLearning } from '../../../../components/voice/VoiceLearning';
import { voiceIdSchema } from '../../../../lib/voice-training';

export default async function VoicePage({ params }: { params: Promise<{ id: string }> }) {
  const input = voiceIdSchema.safeParse((await params).id);
  if (!input.success) notFound();
  return <VoiceLearning id={input.data} />;
}
