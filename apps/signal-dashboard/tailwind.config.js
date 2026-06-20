/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#0d0f14",
        panel:   "#13161e",
        border:  "#1e2330",
        accent:  "#7c3aed",
        long:    "#22c55e",
        short:   "#ef4444",
        neutral: "#6b7280",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
}
