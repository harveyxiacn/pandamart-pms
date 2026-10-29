/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* semantic roles */
        surface: token("surface"),
        "surface-muted": token("surface-muted"),
        "surface-inset": token("surface-inset"),
        "surface-raised": token("surface-raised"),
        line: token("line"),
        "line-strong": token("line-strong"),
        ink: token("ink"),
        "ink-muted": token("ink-muted"),
        "ink-subtle": token("ink-subtle"),
        primary: token("primary"),
        "primary-hover": token("primary-hover"),
        accent: token("accent"),
        "accent-hover": token("accent-hover"),
        "accent-soft": token("accent-soft"),
        danger: token("danger"),
        "danger-soft": token("danger-soft"),
        warning: token("warning"),
        "warning-soft": token("warning-soft"),
        success: token("success"),
        "success-soft": token("success-soft"),
        ring: token("ring"),

        /* categorical series for charts — same roles in every screen */
        "chart-1": token("chart-1"),
        "chart-2": token("chart-2"),
        "chart-3": token("chart-3"),
        "chart-4": token("chart-4"),
        "chart-5": token("chart-5"),
        "chart-6": token("chart-6"),
        grid: token("grid"),

        /* Legacy names still used by older markup; they alias the roles
           above, so one token change re-themes the whole app. */
        pine: token("primary"),
        deep: token("primary-hover"),
        coral: token("danger"),
        amber: token("warning"),
        mist: token("surface-muted"),
      },
      fontFamily: {
        sans: ["Fira Sans", "Noto Sans SC", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        /* five steps, documented in docs/design-system.md */
        label: ["11px", { lineHeight: "16px", letterSpacing: "0.04em" }],
        meta: ["12px", { lineHeight: "18px" }],
        body: ["13px", { lineHeight: "20px" }],
        "body-lg": ["15px", { lineHeight: "22px" }],
        title: ["17px", { lineHeight: "24px" }],
        display: ["22px", { lineHeight: "28px" }],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)",
        "card-hover": "0 1px 2px rgba(15, 23, 42, 0.05), 0 6px 16px -6px rgba(15, 23, 42, 0.12)",
        pop: "0 12px 32px -10px rgba(15, 23, 42, 0.22), 0 2px 6px rgba(15, 23, 42, 0.06)",
        inset: "inset 0 1px 2px rgba(15, 23, 42, 0.04)",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "translateY(-2px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "sheet-in": {
          "0%": { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "sheet-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        rise: "rise 0.24s cubic-bezier(0.2, 0.8, 0.2, 1)",
        "fade-in": "fade-in 0.16s ease-out",
        "scale-in": "scale-in 0.16s cubic-bezier(0.2, 0.8, 0.2, 1)",
        "sheet-in": "sheet-in 0.24s cubic-bezier(0.2, 0.8, 0.2, 1)",
        "sheet-up": "sheet-up 0.24s cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
    },
  },
  plugins: [],
};
