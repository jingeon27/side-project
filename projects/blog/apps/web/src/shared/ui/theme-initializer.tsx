'use client';

import { useRef } from 'react';
import { useServerInsertedHTML } from 'next/navigation';

const initialTheme = `(function(){try{const t=localStorage.getItem('blog-theme');document.documentElement.dataset.theme=t==='dark'||t==='light'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){}})()`;

export function ThemeInitializer() {
  const inserted = useRef(false);
  // 첫 HTML의 head에만 넣어 언어 전환 때 실행 가능한 script가 클라이언트에서 생성되지 않게 한다.
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <script id="blog-initial-theme" dangerouslySetInnerHTML={{ __html: initialTheme }} />;
  });
  return null;
}
