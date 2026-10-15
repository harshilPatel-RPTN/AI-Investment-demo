import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design-system/tokens.css';
import './design-system/shell.css';
import './design-system/modules.css';
import './design-system/system.css';
import { App } from './app/App';
import { useApp } from './store/appStore';
import { useWorkspace } from './workspace/WorkspaceStore';
import { getTransport, useFin } from './fin/finStore';
import { startSync } from './lib/sync';
import { startPresence } from './lib/screens';

// Multi-monitor: keep every screen window in sync and announce this screen.
startSync();
startPresence();

// Dev-only test hook for automated smoke checks; stripped from production builds.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__aitos = { useApp, useWorkspace, useFin, getTransport };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
