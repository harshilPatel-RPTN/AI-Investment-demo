# AI Trading Assistance OS (demo)

A Neumorphic, desktop-first trading research workspace: a floating multi-window OS with 22 apps covering equities, indices, gold, silver, crypto, oil and forex, plus a contextual AI assistant (Google Gemini).

> **All data is simulated.** Prices, news, events, fundamentals and holdings are deterministic demo fixtures. There is no live feed, no brokerage connection and no order placement. AI output is informational and may be wrong.

## Run

```bash
npm install
cp .env.example .env      # then put your free key from https://aistudio.google.com/apikey into GEMINI_API_KEY
npm run dev               # web on http://localhost:5173, AI proxy on :8787
```

Without a key, everything still works except AI calls. Reports fall back to a local rule-based version.

**Full screen by default:** double-click **`Open AI-TOS.cmd`** — it starts the servers if needed and opens the OS in Chrome/Edge as a full-screen app window. In a normal browser tab the OS switches to full screen on your first click (browsers don't allow it without one); you can also install it (browser menu → *Install AI-TOS*) and it will always launch full screen. Toggle in Settings → Workspace.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite + AI proxy (watch mode) |
| `npm run build` | Typecheck + production build |
| `npm test` | Vitest unit tests (indicators, risk, backtest, screener, layout validation) |

## AI configuration (`.env`, server-side only)

```env
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-flash-latest
GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite,gemini-flash-lite-latest
```

- The browser only talks to `/api/ai/*` on the local Express proxy. The key never reaches the client; production bundles are free of both the key and the dev test hook.
- The proxy uses Gemini's OpenAI-compatible endpoint. Free-tier models are often overloaded (503) or retired (404), so the proxy walks the fallback chain automatically.
- `.env` is re-read on each request, so pasting a key needs no restart.
- Requests are validated with Zod (size limits). Model JSON is coerced into a fixed schema and rendered as text only, never HTML. Repeat submissions are debounced.

## Layout

```
src/
  app/            App root, global shortcuts
  shell/          TopBar, Sidebar dock, AppLauncher, CommandPalette, NotificationCentre, DesktopOnlyGate
  workspace/      Window manager (react-rnd), store with undo/redo, presets, layout schema + migrations
  design-system/  Tokens, 8 themes, ThemeProvider, AppearanceEditor
  modules/        22 apps (lazy-loaded)
  data/           Seeded fixtures: instruments, price series, news, events, fundamentals, portfolios, presets
  lib/            Indicators, risk, screener, strategy rules, backtest, scenarios, evidence engine, AI client, persistence
  tests/          Unit tests
server/src/       Express AI proxy (routes, Zod schemas, Gemini service)
```

## Presentation script (spec §17)

1. Press full screen (top-right). Market Overview loads by default.
2. **Add app** → add Chart Studio, News, Screener and AI Copilot. Drag, resize and overlap them; click a window to bring it to the front.
3. Open the palette (🎨) → change a theme, candle colours, radius and typography. Use window **⋯ → Appearance** for per-panel styling.
4. **Save as** → "Harshil Custom Desk".
5. Use the workspace menu to switch to the **Metals & Energy**, **Crypto Watch** and **Forex Desk** presets.
6. Pick an instrument. In AI Copilot, ask a question (context chips show exactly what is sent).
7. Open **Four-Lane Evidence** → **Generate report** → **Save to notebook**.
8. In **Risk Lab**, click Prefill and review the hypothetical sizing.
9. In **Screener**, load a preset, tick rows → **Send to AI**.
10. Reload the browser: the saved workspace comes back. The SIMULATED banner stays visible throughout.

Shortcuts: `Ctrl+K` palette · `Alt+L` launcher · `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo · `Alt+M` maximise · `Alt+W` close · double-click a title bar to maximise.
