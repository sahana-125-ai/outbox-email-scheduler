import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#e5f6ec",
          100: "#d7f2e2",
          200: "#b0e6c7",
          300: "#79d6a7",
          400: "#36c46f",
          500: "#00a63e",
          600: "#009238",
          700: "#007a2e",
          800: "#0a5f2a",
          900: "#0b4a24"
        },
        ink: "#1e1e1e",
        surface: "#f4f7f5",
        line: "#e3e3e3",
        hairline: "#f3f4f6"
      },
      fontFamily: {
        sans: [
          "Segoe UI",
          "-apple-system",
          "BlinkMacSystemFont",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif"
        ],
        mono: ["Cascadia Code", "SFMono-Regular", "Consolas", "Liberation Mono", "monospace"]
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,24,21,0.035)",
        lift: "0 24px 70px -32px rgba(20,24,21,0.32)",
        soft: "0 1px 2px rgba(20,24,21,0.05)",
        pop: "0 18px 50px -22px rgba(20,24,21,0.28)"
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" }
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "translateX(0)" }
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.98) translateY(8px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" }
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" }
        }
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-right": "slide-in-right 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scale-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)"
      }
    }
  },
  plugins: []
};

export default config;
