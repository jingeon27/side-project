import { useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';

import { playPath, receiptCaseTitle } from './case-file';
import {
  matchesPagePath,
  readCasePath,
  receiptLandingPath,
  returnedKeyPath,
  subscribeToCaseNavigation,
} from './case-routes';
import { CaseApp } from './CaseApp';
import { CaseLibrary } from './CaseLibrary';
import { returnedKeyTitle } from './returned-key/returned-key';
import { ReturnedKeyApp } from './returned-key/ReturnedKeyApp';

import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('조사 화면을 열 수 없습니다.');

function pageFor(pathname: string) {
  if (matchesPagePath(pathname, returnedKeyPath)) return { View: ReturnedKeyApp, title: returnedKeyTitle };
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
