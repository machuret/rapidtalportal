# Frontend Styling Architecture

How styling works in this app, and the rules that keep it from drifting. Read
this before adding a component or a page.

## TL;DR

- **Tailwind utilities + a token system in `app/globals.css`** are the single
  source of truth. Don't hand-roll colours, radii, shadows, or z-index.
- **Compose with utilities and the canonical component classes** (`surface-card`,
  `label-section`, `stat-value`, …). Reach for a new class only when a pattern
  repeats.
- **No raw hex, no arbitrary hex utilities, no new inline styles.** A guard
  (`npm run styles:check`, also run in the test suite) enforces this.

## Where tokens live

Everything is defined once in **`app/globals.css`** (`:root`) and bridged into
Tailwind via **`tailwind.config.ts`**, so `text-sm`, `rounded-lg`, `shadow-md`,
`bg-zinc-900`, etc. all consume the same values as the CSS variables.

| Concern | Source | Use via |
| --- | --- | --- |
| Colour palette | `--zinc-50…950` (RGB channels) | `bg-zinc-*`, `text-zinc-*` (themable: change the vars, reskin the app) |
| Semantic colour | `--background`, `--primary`, `--border`, … (shadcn) | shadcn components, `border-border`, etc. |
| Surfaces | `--surface-base/raised/overlay/subtle` | `surface-card` class, `bg-zinc-*` |
| Text | `--text-primary/secondary/tertiary` | `.text-muted`, `.text-subtle`, `text-zinc-*` |
| Accents / charts | `--accent-*`, `--chart-*` | chart configs, accent utilities |
| Typography scale | `--text-xs…4xl` | `text-xs … text-4xl` (and bare `h1–h4`) |
| Spacing | **Tailwind's 4pt scale only** (no `--space-*`) | `p-*`, `gap-*`, `m-*` |
| Radius | `--radius-sm/md/lg/xl/full` | `rounded-sm/md/lg/xl/full` |
| Shadows | `--shadow-sm/md/lg` | `shadow-sm/md/lg` |
| Z-index | `--z-base/raised/overlay/modal/toast` | the `.overlay-backdrop` / `.modal-panel` classes, or `z-[var(--z-*)]` |
| Motion | `--duration-fast/base/slow`, `--ease-standard/out/in` | `duration-fast/base/slow`, `ease-standard` (reduced-motion honoured globally) |

## When to use which approach

1. **Tailwind utility classes** — the default for layout and one-off styling.
2. **Canonical component classes** (`@layer components` in `globals.css`) — when a
   visual pattern repeats (cards, section labels, stat numbers, overlays). Add a
   new one here instead of copy-pasting a utility string a third time.
3. **A real component** (`components/ui/*`, `components/<feature>/*`) — when markup
   + behaviour repeat, not just classes. Components own their styles; pages
   compose components.
4. **Inline `style={{}}`** — only for genuinely **dynamic** values that can't be a
   class (e.g. a progress bar `width: ${pct}%`). Never for colours, spacing, or
   typography. New inline-style files must be added to the guard baseline on
   purpose (see below) — that's the "temporary exception" checkpoint.

## Forbidden patterns (the guard fails on these)

- `var(--something)` that isn't defined in `globals.css` → **define the token first**.
- Arbitrary hex Tailwind classes: `bg-[#1d4ed8]`, `text-[#fff]`, `border-[#333]` →
  use a `zinc-*`/token utility.
- New raw hex literals (`#1d4ed8`) in `.ts`/`.tsx` → use a token or Tailwind class.
- New `style={{…}}` files → own the styles in a component/class instead.

## The guard (Phase 0 — regression prevention)

`scripts/styles-guard.mjs`, run by `npm run styles:check` and by the Jest suite
(`__tests__/styles-guard.test.ts`), so CI blocks regressions.

- Undefined CSS vars and arbitrary hex utilities are **hard failures** (the
  codebase is already clean — keep it that way).
- Raw hex and inline styles are checked against a **baseline**
  (`scripts/styles-baseline.json`): existing, legitimate exceptions are
  grandfathered; only **new** ones fail.
- If you add a justified dynamic exception, regenerate the baseline with
  `npm run styles:baseline` **in the same PR** so the addition is reviewed in the
  diff.

## Roadmap (incremental, low-risk)

Phase 0 (guardrails) and the bulk of Phase 2 (single token source) are **done**.
Remaining phases are migrations to do gradually, never as a big-bang rewrite:

- **Phase 1 — scope isolation:** themes/layout-level ownership; keep global CSS to
  `globals.css` only; no page-level style hacks.
- **Phase 3 — inline-style burn-down:** migrate the 7 baselined inline-style files
  to classes/components where the value isn't truly dynamic; shrink the baseline.
- **Phase 4 — component consolidation:** fold repeated page structures into shared
  primitives (the `surface-card` / `label-section` pattern, extended).
- **Phase 5 — typography/naming cleanup:** one font/type-scale vocabulary; retire
  any duplicate aliases.
- **Phase 6 — docs:** keep this file current as the system evolves.

The goal: every visual decision originates from the token system, styling stays
scoped and predictable, and the guard keeps entropy out.
