/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: "#06111b",
          panel: "#08111c",
          border: "rgba(153, 188, 217, 0.14)",
          accent: "#0fe0c7",
          accent2: "#5a7cff",
        },
      },
    },
  },
  plugins: [],
};

