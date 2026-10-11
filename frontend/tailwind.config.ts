import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep Eco Palette
        forest: {
          DEFAULT: "#064E3B",
          50: "#F0FDF4",
          100: "#DCFCE7",
          600: "#059669",
          700: "#047857",
          800: "#065F46",
          900: "#064E3B",
          950: "#03281E",
        },
        emerald: {
          50: "#ECFDF5",
          100: "#D1FAE5",
          200: "#A7F3D0",
          300: "#6EE7B7",
          400: "#34D399",
          500: "#10B981",
          600: "#059669",
          700: "#047857",
          800: "#065F46",
          900: "#064E3B",
          950: "#022C22",
        },
        mint: {
          light: "#D1FAE5",
          DEFAULT: "#A7F3D0",
          dark: "#6EE7B7",
          bg: "#ECFDF5",
        },
        lime: {
          DEFAULT: "#BEF264",
          300: "#D9F99D",
          400: "#BEF264",
          500: "#A3E635",
          600: "#65A30D",
        },
        turquoise: {
          DEFAULT: "#2DD4BF",
          300: "#5EEAD4",
          400: "#2DD4BF",
          500: "#14B8A6",
          600: "#0D9488",
        },
        cream: {
          DEFAULT: "#FAFCF5",
          50: "#FFFFFF",
          100: "#FAFCF5",
          200: "#F3F7ED",
        },
        darkbg: {
          DEFAULT: "#0B130E",
          card: "#121E17",
          border: "#1C3125",
          hover: "#182C22",
        },
        // Role & Functional Colors
        amber: {
          DEFAULT: "#F59E0B",
          400: "#FBBF24",
          500: "#F59E0B",
          600: "#D97706",
        },
        coral: {
          DEFAULT: "#F43F5E",
          400: "#FB7185",
          500: "#F43F5E",
          600: "#E11D48",
        },
        sky: {
          DEFAULT: "#38BDF8",
          400: "#38BDF8",
          500: "#0EA5E9",
          600: "#0284C7",
        },
        violet: {
          DEFAULT: "#A78BFA",
          400: "#A78BFA",
          500: "#8B5CF6",
          600: "#7C3AED",
        },
        surface: {
          light: "#FFFFFF",
          "light-alt": "#FAFCF5",
          "light-border": "#E3EBE5",
          dark: "#0B130E",
          "dark-alt": "#121E17",
          "dark-card": "#15251C",
          "dark-border": "#1F382A",
        },
        text: {
          primary: "#17211D",
          secondary: "#5C6E64",
          muted: "#889A90",
          "dark-primary": "#F2F7F4",
          "dark-secondary": "#A1B4A9",
          "dark-muted": "#6E8276",
        },
        status: {
          verified: "#059669",
          warning: "#F59E0B",
          danger: "#F43F5E",
          info: "#38BDF8",
          ai: "#A78BFA",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Courier New", "monospace"],
      },
      boxShadow: {
        glow: "0 0 25px -5px rgba(5, 150, 105, 0.28)",
        "glow-lg": "0 0 40px -5px rgba(5, 150, 105, 0.4)",
        "glow-lime": "0 0 25px -5px rgba(190, 242, 100, 0.35)",
        "glow-turq": "0 0 25px -5px rgba(45, 212, 191, 0.35)",
        "glow-violet": "0 0 25px -5px rgba(167, 139, 250, 0.35)",
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)",
        "card-hover": "0 12px 30px -8px rgba(6, 78, 59, 0.12), 0 6px 12px -4px rgba(6, 78, 59, 0.06)",
        "card-dark": "0 12px 30px -8px rgba(0, 0, 0, 0.5)",
      },
      animation: {
        "pulse-subtle": "pulseSubtle 3s ease-in-out infinite",
        "float": "float 6s ease-in-out infinite",
        "shimmer": "shimmer 2.5s linear infinite",
      },
      keyframes: {
        pulseSubtle: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.85" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
