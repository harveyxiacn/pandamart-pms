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
        line: token("line"),
        "line-strong": token("line-strong"),
        ink: token("ink"),
        "ink-muted": token("ink-muted"),
        "ink-subtle": token("ink-subtle"),
        primary: token("primary"),
        "primary-hover": token("primary-hover"),
        accent: token("accent"),
        "accent-soft": token("accent-soft"),
        danger: token("danger"),
        "danger-soft": token("danger-soft"),
        warning: token("warning"),
        "warning-soft": token("warning-soft"),
        success: token("success"),
        "success-soft": token("success-soft"),
        ring: token("ring"),

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
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.06)",
        pop: "0 10px 30px rgba(15, 23, 42, 0.14)",
      },
      animation: {
        rise: "rise 0.28s ease-out",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
