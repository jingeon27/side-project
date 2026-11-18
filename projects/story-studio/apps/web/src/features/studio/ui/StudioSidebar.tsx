'use client';

import { useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';

import {
  BookOpen,
  ChevronDown,
  Clapperboard,
  Film,
  FolderOpen,
  LibraryBig,
  Mic2,
  Plus,
  Settings2,
  Upload,
} from 'lucide-react';

import { trackStudioEvent } from '../../../shared/analytics';
import { formats, type TProject } from '../../story/model/story';
import type { TConfiguration } from '../api/studio-client';
import styles from './StudioSidebar.module.css';

type TProps = {
  projects: TProject[];
  selected: string | null;
  ready: boolean;
  busy: boolean;
  config: TConfiguration | null;
  settingsOpen: boolean;
  onSettings: () => void;
  onImport: (file: File) => Promise<void>;
  onSelect: (id: string | null) => void;
};

function connectionLabel(config: TConfiguration | null) {
  if (!config) return 'AI 연결 확인 중';
  if (config.provider === 'cloud') return config.configured ? 'AI 연결 설정됨' : 'AI 연결이 필요해요';
  return config.configured ? '로컬 모델 사용 중' : '로컬 모델 준비 필요';
}

export function StudioSidebar({
  projects,
  selected,
  ready,
  busy,
  config,
  settingsOpen,
  onSettings,
  onImport,
  onSelect,
}: TProps) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const label = connectionLabel(config);

  function select(id: string | null) {
    if (open) {
      setOpen(false);
      toggle.current?.focus();
    }
    onSelect(id);
  }

  function guardNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (busy) event.preventDefault();
  }

  return (
    <aside className={styles.sidebar} aria-label="작업실">
      <Link className={`brand ${styles.brand}`} href="/" onClick={guardNavigation}>
        <span className="brand-mark">
          <Clapperboard size={22} />
        </span>
        <span>
          장면<small>STORY STUDIO</small>
        </span>
      </Link>
      <button
        ref={toggle}
        className={styles.toggle}
        aria-expanded={open}
        aria-controls="studio-library"
        onClick={() => {
          setOpen(!open);
          void trackStudioEvent('studio_menu_toggled', { expanded: !open });
        }}
      >
        <LibraryBig size={16} /> 작업실 메뉴 <ChevronDown size={14} />
      </button>
      <div id="studio-library" className={styles.library} data-open={open}>
        <button
          className={`button primary ${styles.newProject}`}
          disabled={busy || !ready}
          onClick={() => select(null)}
        >
          <Plus size={17} /> 새 이야기 만들기
        </button>
        <div className={styles.libraryHeading}>
          <span>내 작품</span>
          <span>{projects.length}</span>
        </div>
        <nav className={styles.projects} aria-label="저장한 작품">
          {projects.map((item) => (
            <button
              key={item.id}
              className={styles.project}
              disabled={busy}
              aria-current={selected === item.id ? 'page' : undefined}
              onClick={() => select(item.id)}
            >
              {item.brief.format === 'novel' ? <BookOpen size={16} /> : <Film size={16} />}
              <span>
                <strong>{item.title}</strong>
                <small>
                  {formats.find((format) => format.id === item.brief.format)?.name} · {item.scenes.length}
                  {item.brief.format === 'novel' ? '개 장' : '개 장면'}
                </small>
              </span>
            </button>
          ))}
          {ready && projects.length === 0 && (
            <p className={styles.empty}>
              <FolderOpen size={17} />
              아직 저장한 작품이 없어요
            </p>
          )}
        </nav>
        <div className={styles.tools}>
          <Link href="/studio/voices" onClick={guardNavigation}>
            <Mic2 size={16} /> 목소리 학습
          </Link>
          {config && config.provider !== 'cloud' && (
            <Link href="/studio/materials" onClick={guardNavigation}>
              <LibraryBig size={16} /> 참고 자료실
            </Link>
          )}
          <button disabled={busy || !ready} onClick={() => fileInput.current?.click()}>
            <Upload size={16} /> 작품 가져오기
          </button>
          <input
            hidden
            type="file"
            accept="application/json,.json"
            ref={fileInput}
            aria-label="작품 백업 파일"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onImport(file);
              event.target.value = '';
            }}
          />
        </div>
      </div>
      <button
        className={styles.connection}
        aria-label={label}
        title={label}
        aria-expanded={settingsOpen}
        onClick={onSettings}
      >
        <i aria-hidden data-connected={Boolean(config?.configured)} />
        <span>{label}</span>
        <Settings2 size={16} />
      </button>
    </aside>
  );
}
