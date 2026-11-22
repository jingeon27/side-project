import { createRoot } from 'react-dom/client';

import { CaseApp } from './CaseApp';

import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('조사 화면을 열 수 없습니다.');

createRoot(root).render(<CaseApp />);
