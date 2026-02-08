import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--bg-page)",
        card: "var(--bg-surface)",
        cardStrong: "var(--bg-surface-strong)",
        foreground: "var(--text-primary)",
        muted: "var(--text-secondary)",
        inverse: "var(--text-inverse)",
        border: "var(--border-default)",
        ring: "var(--focus-ring)",
        primary: "var(--accent)",
        primaryStrong: "var(--accent-strong)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)"
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)"
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        raised: "var(--shadow-raised)"
      },
      fontFamily: {
        body: "var(--font-body)",
        heading: "var(--font-heading)"
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)"
      },
      transitionTimingFunction: {
        standard: "var(--ease-standard)"
      }
    }
  },
  plugins: []
} satisfies Config;
