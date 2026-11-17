import { notFound } from 'next/navigation';

import { voiceIdSchema } from '../../../../features/voice/model/voice-training';
import { VoiceLearning } from '../../../../features/voice/ui/VoiceLearning';

export default async function VoicePage({ params }: { params: Promise<{ id: string }> }) {
  const input = voiceIdSchema.safeParse((await params).id);
  if (!input.success) notFound();
  return <VoiceLearning id={input.data} />;
}
