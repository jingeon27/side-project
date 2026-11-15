import type { ReactNode } from 'react';

import { VoiceDataProvider } from '../../components/voice/VoiceDataProvider';

export default function StudioLayout({ children }: { children: ReactNode }) {
  return <VoiceDataProvider>{children}</VoiceDataProvider>;
}
