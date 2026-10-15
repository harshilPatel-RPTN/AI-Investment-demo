import type { WidgetFrame } from '../types/widgets';

export interface ModuleProps {
  frame: WidgetFrame;
  updateSettings: (s: Record<string, unknown>) => void;
}
