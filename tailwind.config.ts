import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "*.{js,ts,jsx,tsx,mdx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // shadcn compat — эти имена завязаны на components/ui/*,
        // значения переназначены на новые токены в app/globals.css
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // ModeMorph design tokens (test/gauntlet/design/BAR.md contract)
        canvas: "hsl(var(--canvas) / <alpha-value>)",
        "canvas-sunk": "hsl(var(--canvas-sunk) / <alpha-value>)",
        surface: "hsl(var(--surface) / <alpha-value>)",
        ink: "hsl(var(--ink) / <alpha-value>)",
        "ink-2": "hsl(var(--ink-2) / <alpha-value>)",
        "ink-3": "hsl(var(--ink-3) / <alpha-value>)",
        line: "hsl(var(--line) / <alpha-value>)",
        signal: "hsl(var(--signal) / <alpha-value>)",
        "signal-ink": "hsl(var(--signal-ink) / <alpha-value>)",
      },
      fontSize: {
        display: ["34px", { lineHeight: "38px", fontWeight: "800", letterSpacing: "-0.03em" }],
        h1: ["26px", { lineHeight: "30px", fontWeight: "800", letterSpacing: "-0.03em" }],
        h2: ["20px", { lineHeight: "24px", fontWeight: "700", letterSpacing: "-0.02em" }],
        body: ["15px", { lineHeight: "22px", fontWeight: "500", letterSpacing: "-0.01em" }],
        caption: ["13px", { lineHeight: "18px", fontWeight: "500", letterSpacing: "0em" }],
        micro: ["11px", { lineHeight: "14px", fontWeight: "600", letterSpacing: "0.08em" }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      transitionDuration: {
        press: "var(--dur-press)",
        enter: "var(--dur-enter)",
        sheet: "var(--dur-sheet)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        spring: "var(--ease-spring)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        pop: {
          "0%": { transform: "scale(1)" },
          "40%": { transform: "scale(1.08)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fade-up var(--dur-enter) var(--ease-out) both",
        "scale-in": "scale-in var(--dur-enter) var(--ease-out) both",
        shimmer: "shimmer 1.6s ease-in-out infinite",
        pop: "pop 420ms var(--ease-spring) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
