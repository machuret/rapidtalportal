#!/usr/bin/env node
/**
 * Styling guard — Phase 0 "stop the bleeding" for the frontend CSS architecture.
 *
 * The token system (app/globals.css + tailwind.config.ts) is the single source
 * of truth. This guard prevents regressions against it:
 *
 *   1. UNDEFINED CSS VARS  — every var(--x) used in source must be defined in
 *                            globals.css (or be an allowed runtime prefix).
 *   2. ARBITRARY HEX UTILS — no Tailwind `bg-[#fff]` / `text-[#abc]` etc.
 *   3. RAW HEX COLOURS     — no new `#rrggbb` literals in .ts/.tsx (tokens only).
 *   4. INLINE STYLES       — no new `style={{…}}` files (dynamic exceptions are
 *                            grandfathered in the baseline and reviewed there).
 *   5. ARBITRARY DESIGN    — no NEW Tailwind arbitrary values that bypass the
 *      VALUES                design tokens: font-size (`text-[13px]`), spacing
 *                            (`p-[18px]`), radius (`rounded-[10px]`) and literal
 *                            colours (`[…rgba(…)]`, `[…#abc…]`). Use the token
 *                            scale (text-xs…, p-4, rounded-lg) or `rgb(var(--…))`.
 *                            Sizing (w-/h-) and any value that references a token
 *                            via `var(…)` are intentionally allowed.
 *
 * (1) and (2) are absolute (the codebase is already clean). (3), (4) and (5) use
 * a baseline (scripts/styles-baseline.json) so existing, legitimate exceptions
 * are grandfathered while NEW ones fail — phased migration, zero regression.
 * (5) ratchets per-file COUNTS: a file may never gain arbitrary values, and a
 * file not in the baseline must have zero. Clean a file, then `--update` to
 * ratchet its baseline down — the count is forward-only (it can only shrink).
 *
 *   node scripts/styles-guard.mjs            # check (exit 1 on violation)
 *   node scripts/styles-guard.mjs --update   # rewrite the baseline
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["app", "components", "lib"];
const TOKEN_FILE = join(ROOT, "app/globals.css");
const BASELINE_FILE = join(ROOT, "scripts/styles-baseline.json");

// Vars defined outside our source (framework runtime) — never flagged.
const ALLOWED_VAR_PREFIXES = ["--tw-", "--radix-", "--alpha-value"];

const SOURCE_RE = /\.(tsx?|css)$/;
const isCode = (f) => /\.tsx?$/.test(f);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SOURCE_RE.test(name)) out.push(full);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
const rel = (f) => relative(ROOT, f).split("\\").join("/");

// ── Defined tokens (from globals.css) ────────────────────────────────────────
const tokenCss = readFileSync(TOKEN_FILE, "utf8");
const defined = new Set([...tokenCss.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

// ── Scan ─────────────────────────────────────────────────────────────────────
const undefinedVars = [];
const arbitraryHex = [];
const rawHexFiles = new Set();
const inlineStyleFiles = new Set();
const arbitraryByFile = {};   // file → count of token-bypassing arbitrary values
const arbitrarySamples = {};  // file → matched strings (for the failure report)

const ARB_HEX_RE = /\b(?:bg|text|border|from|to|via|ring|fill|stroke|shadow|decoration|outline|caret|accent)-\[#[0-9a-fA-F]{3,8}\]/g;
const RAW_HEX_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/;
const VAR_RE = /var\(\s*(--[\w-]+)/g;

// (5) Arbitrary design-token bypasses. One concern per pattern; a value that
// references a token via var(…) is NOT a bypass and is allowed (the color RE
// requires a literal digit right after rgb(/hsl(, so rgb(var(--x)) is exempt).
const ARB_PATTERNS = [
  /\btext-\[[\d.]+(?:px|rem|em)\]/g,                                                                                  // font-size
  /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-\[[\d.]+(?:px|rem)\]/g,              // spacing
  /\brounded(?:-[a-z]+)?-\[[\d.]+px\]/g,                                                                              // radius
  /\[[^\]]*(?:#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?)\(\s*[\d.])[^\]]*\]/g,                                                 // literal colour
];

// Strip /* … */ blocks (incl. JSX {/* … */}) so documentation examples like
// "var(--zinc-N)" in comments aren't mistaken for real usage.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

for (const file of files) {
  const src = stripComments(readFileSync(file, "utf8"));
  const r = rel(file);

  for (const m of src.matchAll(VAR_RE)) {
    const name = m[1];
    if (defined.has(name)) continue;
    if (ALLOWED_VAR_PREFIXES.some((p) => name.startsWith(p))) continue;
    undefinedVars.push({ file: r, name });
  }

  for (const m of src.matchAll(ARB_HEX_RE)) arbitraryHex.push({ file: r, value: m[0] });

  // Raw hex + inline styles only apply to component/code files, not the token CSS.
  if (isCode(file)) {
    if (RAW_HEX_RE.test(src)) rawHexFiles.add(r);
    if (/style=\{\{/.test(src)) inlineStyleFiles.add(r);

    // (5) Count arbitrary design-token bypasses for the per-file ratchet.
    const hits = ARB_PATTERNS.flatMap((re) => [...src.matchAll(re)].map((m) => m[0]));
    if (hits.length) { arbitraryByFile[r] = hits.length; arbitrarySamples[r] = [...new Set(hits)]; }
  }
}

// ── Baseline ─────────────────────────────────────────────────────────────────
const current = {
  rawHexFiles: [...rawHexFiles].sort(),
  inlineStyleFiles: [...inlineStyleFiles].sort(),
  arbitrary: Object.fromEntries(Object.keys(arbitraryByFile).sort().map((f) => [f, arbitraryByFile[f]])),
};

if (process.argv.includes("--update")) {
  writeFileSync(BASELINE_FILE, JSON.stringify(current, null, 2) + "\n");
  const arbTotal = Object.values(current.arbitrary).reduce((a, b) => a + b, 0);
  console.log(`✓ Baseline written: ${current.rawHexFiles.length} raw-hex files, ${current.inlineStyleFiles.length} inline-style files, ${arbTotal} arbitrary values in ${Object.keys(current.arbitrary).length} files.`);
  process.exit(0);
}

const baseline = existsSync(BASELINE_FILE)
  ? JSON.parse(readFileSync(BASELINE_FILE, "utf8"))
  : { rawHexFiles: [], inlineStyleFiles: [], arbitrary: {} };
const baseArb = baseline.arbitrary ?? {};

const newRawHex = current.rawHexFiles.filter((f) => !baseline.rawHexFiles.includes(f));
const newInline = current.inlineStyleFiles.filter((f) => !baseline.inlineStyleFiles.includes(f));

// A file fails if it has MORE arbitrary values than its grandfathered count
// (files absent from the baseline have an implied count of 0 → must stay clean).
const worseArb = Object.keys(arbitraryByFile)
  .filter((f) => arbitraryByFile[f] > (baseArb[f] ?? 0))
  .map((f) => `${f} → ${arbitraryByFile[f]} arbitrary value(s) (baseline ${baseArb[f] ?? 0}): ${arbitrarySamples[f].slice(0, 6).join(", ")}`);

// ── Report ───────────────────────────────────────────────────────────────────
const problems = [];
if (undefinedVars.length) problems.push(["Undefined CSS variables (define in app/globals.css)", undefinedVars.map((v) => `${v.file} → var(${v.name})`)]);
if (arbitraryHex.length) problems.push(["Arbitrary hex Tailwind classes (use a token/zinc utility)", arbitraryHex.map((v) => `${v.file} → ${v.value}`)]);
if (newRawHex.length) problems.push(["New raw hex colours in code (use a token/Tailwind class, or --update if intentional)", newRawHex]);
if (newInline.length) problems.push(["New inline style={{…}} (own styles in components/classes, or --update if a justified dynamic exception)", newInline]);
if (worseArb.length) problems.push(["New arbitrary design values bypassing tokens — use the token scale (text-xs…, p-4, rounded-lg) or rgb(var(--…)). The count is forward-only; a file may not gain new ones", worseArb]);

export const result = { undefinedVars, arbitraryHex, newRawHex, newInline, worseArb };

if (problems.length) {
  console.error("\n✗ Styling guard failed:\n");
  for (const [title, items] of problems) {
    console.error(`  ${title}:`);
    for (const it of items) console.error(`    - ${it}`);
    console.error("");
  }
  process.exit(1);
} else {
  const arbTotal = Object.values(arbitraryByFile).reduce((a, b) => a + b, 0);
  console.log(`✓ Styling guard passed — tokens defined, no arbitrary hex, no new inline styles, no new arbitrary values (${arbTotal} grandfathered).`);
}
