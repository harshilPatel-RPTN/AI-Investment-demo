import { z } from 'zod';
import type { Workspace } from '../types/widgets';
import { WIDGET_TYPES } from './registry';

export const LAYOUT_SCHEMA_VERSION = 2;

const colorish = z.string().max(64);

export const appearanceSchema = z
  .object({
    background: colorish.optional(),
    textColor: colorish.optional(),
    accent: colorish.optional(),
    borderColor: colorish.optional(),
    radius: z.number().min(0).max(60).optional(),
    opacity: z.number().min(0.2).max(1).optional(),
    surface: z.enum(['raised', 'inset', 'flat']).optional(),
    shadowIntensity: z.number().min(0).max(3).optional(),
    fontSize: z.number().min(9).max(22).optional(),
    fontFamily: z.string().max(60).optional(),
    padding: z.number().min(0).max(40).optional(),
    gradient: z.boolean().optional(),
  })
  .strip();

export const frameSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(WIDGET_TYPES as [string, ...string[]]),
  title: z.string().max(80),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  prefW: z.number().finite().positive().optional(),
  prefH: z.number().finite().positive().optional(),
  zIndex: z.number().int().nonnegative(),
  minimized: z.boolean(),
  maximized: z.boolean(),
  locked: z.boolean(),
  visible: z.boolean(),
  dockSide: z.enum(['left', 'right', 'top', 'bottom']).nullable().optional(),
  screenId: z.string().regex(/^(main|s[2-6])$/).optional(),
  appearance: appearanceSchema.default({}),
  settings: z.record(z.unknown()).default({}),
});

export const workspaceSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  presetId: z.string().optional(),
  canvas: z.object({ w: z.number().positive(), h: z.number().positive() }).optional(),
  screenCanvas: z.record(z.object({ w: z.number().positive(), h: z.number().positive() })).optional(),
  screens: z.array(z.string().regex(/^s[2-6]$/)).max(5).optional(),
  windows: z.array(frameSchema).max(60),
  updatedAt: z.string(),
});

export const layoutFileSchema = z.object({
  app: z.literal('ai-trading-os'),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  workspace: workspaceSchema,
});

/** Migrates older exported layout files to the current schema version. */
export function migrateLayoutFile(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const obj = raw as Record<string, unknown>;
  const v = typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 1;
  if (v === 1) {
    // v1 stored windows under `layout` and used `w`/`h` keys.
    const layout = (obj.layout ?? obj.workspace) as Record<string, unknown> | undefined;
    if (layout && Array.isArray(layout.windows)) {
      layout.windows = (layout.windows as Array<Record<string, unknown>>).map((w) => ({
        ...w,
        width: w.width ?? w.w,
        height: w.height ?? w.h,
        visible: w.visible ?? true,
        appearance: w.appearance ?? {},
        settings: w.settings ?? {},
      }));
    }
    return { ...obj, workspace: layout, schemaVersion: 2 };
  }
  return obj;
}

export type ParsedLayout = { ok: true; workspace: Workspace & { presetId?: string } } | { ok: false; error: string };

export function parseLayoutFile(text: string): ParsedLayout {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'File is not valid JSON.' };
  }
  const migrated = migrateLayoutFile(raw);
  const res = layoutFileSchema.safeParse(migrated);
  if (!res.success) {
    const first = res.error.issues[0];
    return { ok: false, error: `Invalid layout: ${first.path.join('.') || 'root'} — ${first.message}` };
  }
  if (res.data.schemaVersion > LAYOUT_SCHEMA_VERSION) return { ok: false, error: `Layout was made by a newer version (schema ${res.data.schemaVersion}).` };
  const ids = new Set<string>();
  for (const w of res.data.workspace.windows) {
    if (ids.has(w.id)) return { ok: false, error: `Duplicate window id "${w.id}".` };
    ids.add(w.id);
  }
  return { ok: true, workspace: res.data.workspace as unknown as Workspace & { presetId?: string } };
}
