import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/tokens.css';
import '@/styles/app.css';
import { App } from '@/app/App';
import { blockZoomGestures } from '@/app/zoom';

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing');

blockZoomGestures();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
