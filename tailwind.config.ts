import type { Config } from "tailwindcss";

const config: Config = {
  // Always-dark app — use media strategy so no .dark class is needed
  darkMode: "media",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ── Font family — bridges --font-sans CSS variable set by next/font ───
      // Without this, font-sans maps to system-ui, not Inter.
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
      },

      // ── Z-index — token-bridged, removes need for inline style={{ zIndex }} 
      zIndex: {
        base:    "var(--z-base)",
        raised:  "var(--z-raised)",
        overlay: "var(--z-overlay)",
        modal:   "var(--z-modal)",
        toast:   "var(--z-toast)",
      },

      // ── Font sizes bridged from CSS token scale ────────────────────────────
      // Tailwind text-* utilities now consume the same values as --text-* vars,
      // so components and globals.css h1/h2 rules are on the exact same scale.
      fontSize: {
        xs:   ["var(--text-xs)",   { lineHeight: "1.5" }],
        sm:   ["var(--text-sm)",   { lineHeight: "1.5" }],
        base: ["var(--text-base)", { lineHeight: "1.6" }],
        lg:   ["var(--text-lg)",   { lineHeight: "1.4" }],
        xl:   ["var(--text-xl)",   { lineHeight: "1.3" }],
        // Heading-scale (2xl+) is FLUID via clamp() and mirrors the base
        // h1/h2/h3 rules in globals.css exactly — so a `text-3xl` page title
        // scales on mobile just like a bare <h1> instead of sitting fixed.
        "2xl": ["clamp(1.3rem, 1.05rem + 1vw, var(--text-2xl))",   { lineHeight: "1.2" }],
        "3xl": ["clamp(1.5rem, 1.1rem + 1.8vw, var(--text-3xl))",  { lineHeight: "1.15" }],
        "4xl": ["clamp(1.875rem, 1.4rem + 2.2vw, var(--text-4xl))", { lineHeight: "1.1" }],
      },

      // ── Border radius bridged from CSS token scale ─────────────────────────
      // Eliminates the silent mismatch where rounded-xl (Tailwind default 12px)
      // ≠ --radius-xl (16px). Components and tokens are now in sync.
      borderRadius: {
        sm:   "var(--radius-sm)",   // 6px  — badges, inputs
        DEFAULT: "var(--radius-md)", // 8px  — buttons
        md:   "var(--radius-md)",   // 8px  — buttons
        lg:   "var(--radius-lg)",   // 12px — cards
        xl:   "var(--radius-xl)",   // 16px — panels, drawers
        full: "var(--radius-full)", // 9999px — pills
      },

      // ── Semantic surface colours ───────────────────────────────────────────
      colors: {
        // shadcn/ui compatibility tokens
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input:  "hsl(var(--input))",
        ring:   "hsl(var(--ring))",

        // `white` routed through a var too, so the ~200 `text-white` headings/
        // values flip in light mode. Surfaces that must stay white live in a
        // data-theme="dark" wrapper (see globals.css).
        white: "rgb(var(--white) / <alpha-value>)",

        // ── zinc scale routed through CSS vars ──────────────────────────────
        // Every zinc-* utility already used across the app now reads from
        // --zinc-* in globals.css. <alpha-value> keeps /opacity modifiers
        // (bg-zinc-900/60) and hover:/gradient variants working. Theme the
        // whole app by editing the vars — no component changes.
        zinc: {
          50:  "rgb(var(--zinc-50) / <alpha-value>)",
          100: "rgb(var(--zinc-100) / <alpha-value>)",
          200: "rgb(var(--zinc-200) / <alpha-value>)",
          300: "rgb(var(--zinc-300) / <alpha-value>)",
          400: "rgb(var(--zinc-400) / <alpha-value>)",
          500: "rgb(var(--zinc-500) / <alpha-value>)",
          600: "rgb(var(--zinc-600) / <alpha-value>)",
          700: "rgb(var(--zinc-700) / <alpha-value>)",
          800: "rgb(var(--zinc-800) / <alpha-value>)",
          900: "rgb(var(--zinc-900) / <alpha-value>)",
          950: "rgb(var(--zinc-950) / <alpha-value>)",
        },

        // ── Semantic aliases (prefer these in NEW code) ─────────────────────
        // Same source of truth as zinc-*; names document intent. e.g.
        // bg-surface-raised, text-content-secondary, border-hairline.
        surface: {
          base:    "rgb(var(--zinc-950) / <alpha-value>)",
          raised:  "rgb(var(--zinc-900) / <alpha-value>)",
          overlay: "rgb(var(--zinc-800) / <alpha-value>)",
          subtle:  "rgb(var(--zinc-700) / <alpha-value>)",
        },
        content: {
          primary:   "rgb(var(--zinc-50) / <alpha-value>)",
          secondary: "rgb(var(--zinc-400) / <alpha-value>)",
          tertiary:  "rgb(var(--zinc-500) / <alpha-value>)",
          faint:     "rgb(var(--zinc-600) / <alpha-value>)",
        },
        hairline: {
          subtle:  "rgb(var(--zinc-800) / <alpha-value>)",
          DEFAULT: "rgb(var(--zinc-700) / <alpha-value>)",
          strong:  "rgb(var(--zinc-600) / <alpha-value>)",
        },
      },

      // ── Box shadows — elevation system ────────────────────────────────────
      // Named shadow-card/modal/overlay to avoid overriding Tailwind's own
      // shadow-sm/md/lg which shadcn/ui components rely on.
      boxShadow: {
        card:    "var(--shadow-sm)",
        raised:  "var(--shadow-md)",
        modal:   "var(--shadow-lg)",
      },

      // ── Motion — token-bridged durations + easing ─────────────────────────
      // Use duration-fast/base/slow and ease-standard so transitions share one
      // vocabulary. (Tailwind's built-in ease-in/out are left intact.)
      transitionDuration: {
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)",
      },
      transitionTimingFunction: {
        standard: "var(--ease-standard)",
      },
    },
  },
  plugins: [],
};
export default config;
