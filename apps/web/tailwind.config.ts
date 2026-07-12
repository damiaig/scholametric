import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#1E4ED8",
        secondary: "#059669",
        accent: "#F59E0B",
        danger: "#DC2626",
        warning: "#EA580C",
        success: "#16A34A",
        background: "#F8FAFC",
        card: "#FFFFFF",
        text: "#111827",
        muted: "#6B7280",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
