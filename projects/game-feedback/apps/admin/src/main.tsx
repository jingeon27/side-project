import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './_app/App';

import './_app/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Admin root is missing.');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
