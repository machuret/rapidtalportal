# Frontend styling architecture

How visual decisions are made, enforced, and migrated in this app. Read this
before adding a component or page. The goal is a **system-driven** frontend:
predictable, theme-safe, enforceable, resistant to entropy.

The companion enforcement is `scripts/styles-guard.mjs` (run by CI and Jest).
If a rule here isn't machine-checkable yet, treat it as aspirational and prefer
adding a check over relying on review.

---

## 1. Single source of truth — where tokens live

Every visual primitive originates in **`app/globals.css` `:root`** and is bridged
into Tailwind in **`tailwind.config.ts`**. Nothing else defines design values.

| Concern    | Token family                                   | Use via                              |
|------------|------------------------------------------------|--------------------------------------|
| Color      | `--zinc-50…950` (+ `--white`, accent `--blue-400`…, brand `--orange-500/600`) | `bg-zinc-900`, `text-zinc-50`, `text-orange-500` |
| Typography | `--text-3xs…5xl` (size; micro tier 10/11px → hero 42px), font vars `--font-sans/display/mono` | `text-2xs`, `text-sm`, `font-display` |
| Spacing    | Tailwind's built-in 4pt scale (intentionally **not** tokenised) | `p-4`, `gap-3`, `mt-2`               |
| Border     | `--border-default/subtle`, `--zinc-700/800`    | `border`, `border-zinc-800`          |
| Radius     | `--radius-sm/md/lg/xl/full`                     | `rounded-md`, `rounded-xl`           |
| Shadow     | `--shadow-sm/md/lg`                             | `shadow-sm`, `shadow-md`             |
| Motion     | `--duration-fast/base/slow`, `--ease-*`        | `duration-base`, `ease-standard`     |
| Z-index    | `--z-base/raised/overlay/modal/toast`          | `z-modal`, `.overlay-backdrop`       |

**Rule:** one naming convention (kebab CSS vars → Tailwind utilities), one source.
Don't invent a parallel value (`text-[42px]`, `#1c1c1c`, `z-[55]`). If the scale
genuinely lacks a step, add the **token**, then use it.

## 2. Theme architecture — owned at the layout

Themes are **var overrides**, not component forks. Because every `zinc-*` utility
and `white` is `rgb(var(--zinc-N) / <alpha>)`, re-pointing the vars reskins the
whole app with zero component edits.

- `app/layout.tsx` reads the `theme` cookie server-side and sets
  `<html data-theme="light|dark">` **before paint** (no flash). Default dark.
- Dark values live in `:root`; light values in `:root[data-theme="light"]`
  (zinc scale inverted + accents contrast-tuned for cream).
- A subtree can re-pin to dark via `[data-theme="dark"]` (used for print docs /
  the report sheet that must stay white-on-dark regardless of app theme).

**Rule:** theme ownership is layout-level. Never branch on theme inside a
component (`theme === 'light' ? …`) for color — use a var-backed utility and let
the override do the work.

**Content width is layout-owned too.** The portal layout
(`app/(portal)/layout.tsx`) wraps every page in one centered column
(`max-w-6xl mx-auto px-4 … md:p-8`). Pages must **not** set their own root
`max-w-*` — that's what made features render at six different widths (Compose
narrow, Tasks wide). A page fills the standard column; the only sanctioned
exceptions are a deliberately **centered** form/document (`max-w-… mx-auto`) and
the print report sheet.

## 3. How to style — pick the right tool, in order

This codebase uses **two** styling mechanisms, on purpose. There are **no CSS
Modules** — don't introduce them; a third paradigm fragments the system.

1. **Tailwind utilities (default).** 95% of styling. Token-backed utilities only.
2. **`@layer components` canonical classes** in `globals.css` — for a *repeated,
   named* pattern that deserves one definition: `.surface-card`, `.label-section`,
   `.stat-value`, `.modal-panel`, `.overlay-backdrop`, `.notebook-prose`. Reuse
   these; don't inline their utilities again or fork a near-copy.
3. **Inline `style={{…}}` — exception only.** Allowed solely for values that are
   *computed at runtime* (a progress width from a number, a chart geometry). These
   are grandfathered in the baseline and reviewed there; new ones fail CI.

Components own their styles; pages compose components. Styling should be
reusable, searchable (grep a class), and enforceable.

## 4. Forbidden patterns (enforced by `styles:check`)

| # | Forbidden                                          | Do instead                                  | Severity |
|---|----------------------------------------------------|---------------------------------------------|----------|
| 1 | `var(--undefined)` — variable not in globals.css   | Define the token first                      | hard fail |
| 2 | `bg-[#fff]`, `text-[#abc]` arbitrary hex utilities  | Token/zinc utility                          | hard fail |
| 3 | New `#rrggbb` literal in `.ts/.tsx`                 | Token or Tailwind class                      | ratchet  |
| 4 | New `style={{…}}` file                              | Component class / utility                    | ratchet  |
| 5 | New arbitrary design value bypassing tokens:<br>`text-[13px]` (font-size), `p-[18px]` (spacing), `rounded-[10px]` (radius), `[…rgba(…)]`/`[…#abc…]` (literal color) | Token scale (`text-sm`, `p-4`, `rounded-lg`) or `rgb(var(--token))` | ratchet  |

**Allowed arbitrary values:** sizing (`w-[264px]`, `h-[18px]` for fixed
dimensions/icons) and anything referencing a token via `var(…)`
(`shadow-[0_6px_18px_rgb(var(--orange-500)/0.28)]`) — these aren't token bypasses.

## 5. Adding a component or page

- Use token-backed utilities. Reach for a `@layer components` class if one fits.
- Typography: use `text-xs…text-4xl` + `font-display`/`font-mono`. Display type
  (hero, big stat numbers) may exceed the scale; keep it to **one** size, not a
  scatter of `text-[Npx]`.
- New repeated structure (a card header, a KPI tile, a list row)? Extract a
  **component or `@layer` class** — don't copy classes between pages (Phase 4:
  build systems, not pages).
- Run `pnpm styles:check` (and `pnpm test`) before committing.

## 6. Migrating existing debt (forward-only ratchet)

Rules 3–5 are **ratchets**: the baseline (`scripts/styles-baseline.json`) records
current counts; a file may never gain new violations, and a file not in the
baseline must be clean. To migrate:

1. Replace a file's arbitrary values with tokens (`text-[13px]` → `text-xs`).
2. `pnpm styles:baseline` to ratchet the baseline **down** (it only shrinks).
3. The file is now protected at the new, lower count.

**Arbitrary design values are now fully retired — the baseline is 0.** The
original 140-value `text-[…]` backlog was cleared by extending the scale with the
micro tier (`text-2xs`/`text-3xs`) and a `text-5xl` display step, then converting
every file. So rule 5 now behaves as an absolute "zero new arbitrary values"
gate. (Raw-hex and inline-style still have a small reviewed baseline.)

## 7. Known debt / roadmap (not yet enforced)

- **Duplicate semantic tokens (Phase 2).** Some accent/surface vars duplicate the
  zinc/accent scale (`--accent-blue` ≈ `--blue-400`, `--surface-raised` ≈
  `--zinc-900`, `--chart-*` hardcode hex). Consolidate to one alias during
  migration; don't add new duplicates.
- **Arbitrary typography backlog — done.** The 140-value `*-[Npx]` backlog is
  fully retired; the scale now carries a micro tier (10/11px) and a 42px display
  step, so the whole app is on tokens.
- **Spacing tokenisation is deliberately omitted** — the 4pt Tailwind scale is the
  single spacing system. Do not reintroduce `--space-*`.
</content>
