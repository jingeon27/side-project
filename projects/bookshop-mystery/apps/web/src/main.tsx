import { useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';

import { playPath, receiptCaseTitle } from './case-file';
import {
  matchesPagePath,
  musicRollPath,
  readCasePath,
  receiptLandingPath,
  returnedKeyPath,
  subscribeToCaseNavigation,
  wetMapPath,
} from './case-routes';
import { CaseApp } from './CaseApp';
import { CaseLibrary } from './CaseLibrary';
import { musicRoll } from './music-roll/music-roll';
import { MusicRollApp } from './music-roll/MusicRollApp';
import { returnedKeyTitle } from './returned-key/returned-key';
import { ReturnedKeyApp } from './returned-key/ReturnedKeyApp';
import { wetMap } from './wet-map/wet-map';
import { WetMapApp } from './wet-map/WetMapApp';

import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('조사 화면을 열 수 없습니다.');

function pageFor(pathname: string) {
  if (matchesPagePath(pathname, musicRollPath)) return { View: MusicRollApp, title: musicRoll.title };
  if (matchesPagePath(pathname, returnedKeyPath)) return { View: ReturnedKeyApp, title: returnedKeyTitle };
  if (matchesPagePath(pathname, wetMapPath)) return { View: WetMapApp, title: wetMap.title };
  if ([receiptLandingPath, playPath].some((route) => matchesPagePath(pathname, route))) {
    return { View: CaseApp, title: receiptCaseTitle };
  }
  return { View: CaseLibrary, title: '새벽 기록실 | 사건 목록' };
}

function DawnRecordsApp() {
  const pathname = useSyncExternalStore(subscribeToCaseNavigation, readCasePath);
  const { View, title } = pageFor(pathname);
  useEffect(() => {
    document.title = title;
  }, [title]);
  return <View />;
}

createRoot(root).render(<DawnRecordsApp />);
