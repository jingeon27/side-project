import type { ReactNode } from 'react';

import { VoiceDataProvider } from '../../features/voice/ui/VoiceDataProvider';

export default function StudioLayout({ children }: { children: ReactNode }) {
  return <VoiceDataProvider>{children}</VoiceDataProvider>;
}
