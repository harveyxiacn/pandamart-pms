/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#2e1f1f",
        mist: "#fff7f7",
        pine: "#c62828",
        amber: "#f59e0b",
        coral: "#dc2626",
        deep: "#991b1b",
      },
      boxShadow: {
        card: "0 8px 30px rgba(153, 27, 27, 0.12)",
      },
      animation: {
        rise: "rise 0.45s ease-out",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
