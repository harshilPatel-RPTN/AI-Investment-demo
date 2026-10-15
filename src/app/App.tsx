import { useEffect } from 'react';
import { ThemeProvider } from '../design-system/ThemeProvider';
import { AppearanceEditor } from '../design-system/AppearanceEditor';
import { DesktopOnlyGate } from '../shell/DesktopOnlyGate';
import { TopBar } from '../shell/TopBar';
import { Sidebar } from '../shell/Sidebar';
import { AppLauncher } from '../shell/AppLauncher';
import { CommandPalette } from '../shell/CommandPalette';
import { Toasts } from '../shell/Toasts';
import { WorkspaceCanvas } from '../workspace/WorkspaceCanvas';
import { WorkspaceToolbar } from '../workspace/WorkspaceToolbar';
import { useWorkspace } from '../workspace/WorkspaceStore';
import { ConfirmHost, PromptHost } from '../components/ui';
import { isTypingTarget } from '../components/hooks';
import { useApp } from '../store/appStore';
import { checkAIHealth } from '../lib/ai-client';
import { recoveredKeys } from '../lib/persistence';
import { useAlertEngine } from '../modules/alerts/engine';
import { FinHost } from '../fin/ui/FinSurfaces';
import { VoiceControlHost } from '../fin/control/VoiceControlUI';
import { FullscreenPrompt } from '../shell/FullscreenPrompt';
import { useFin } from '../fin/finStore';
import { IS_POPOUT } from '../workspace/screen';
import { PopoutShell } from '../shell/PopoutShell';
import { AccountHost } from '../shell/Account';

function useGlobalShortcuts() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const app = useApp.getState();
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        app.set({ paletteOpen: !app.paletteOpen, launcherOpen: false });
        return;
      }
      if (isTypingTarget(e.target)) return; // never hijack typing
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        useWorkspace.getState().undo();
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        useWorkspace.getState().redo();
      } else if (e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        app.set({ launcherOpen: !app.launcherOpen, paletteOpen: false });
      } else if (e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const fin = useFin.getState();
        if (fin.mode === 'closed') fin.open('compact');
        else if (fin.mode === 'compact') fin.open('immersive');
        else fin.minimise();
      } else if (e.altKey && e.key.toLowerCase() === 'w') {
        const id = useWorkspace.getState().focusedId;
        if (id) {
          e.preventDefault();
          useWorkspace.getState().closeWindow(id);
        }
      } else if (e.altKey && e.key.toLowerCase() === 'm') {
        const id = useWorkspace.getState().focusedId;
        if (id) {
          e.preventDefault();
          useWorkspace.getState().toggleMaximize(id);
        }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
}

export function App() {
  useGlobalShortcuts();
  useAlertEngine();
  useEffect(() => {
    void checkAIHealth();
    if (recoveredKeys.size) {
      useApp.getState().toast({ title: 'Saved data was corrupt', body: 'Some local settings could not be read and were restored to defaults.', tone: 'warning' });
    }
  }, []);

  if (IS_POPOUT)
    return (
      <ThemeProvider>
        <PopoutShell />
        <AppearanceEditor />
        <Toasts />
        <ConfirmHost />
        <PromptHost />
      </ThemeProvider>
    );

  return (
    <ThemeProvider>
      <DesktopOnlyGate>
        <div className="os-root">
          <TopBar />
          <Sidebar />
          <main className="main-area">
            <WorkspaceToolbar />
            <WorkspaceCanvas />
          </main>
        </div>
        <AppLauncher />
        <CommandPalette />
        <AppearanceEditor />
        <FinHost />
        <VoiceControlHost />
        <FullscreenPrompt />
        <AccountHost />
        <Toasts />
        <ConfirmHost />
        <PromptHost />
      </DesktopOnlyGate>
    </ThemeProvider>
  );
}
