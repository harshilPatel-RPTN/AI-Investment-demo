import { useShallow } from 'zustand/react/shallow';
import { useWorkspace } from './WorkspaceStore';
import { CURRENT_SCREEN, onScreen } from './screen';

/** Windows of the active workspace that belong to this browser window's screen (shallow-stable). */
export function useScreenWindows() {
  return useWorkspace(useShallow((s) => s.active().windows.filter(onScreen(CURRENT_SCREEN))));
}
