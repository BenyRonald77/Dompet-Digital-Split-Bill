import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#ecfeff",
          100: "#cffafe",
          500: "#0891b2",
          600: "#0e7490",
          700: "#155e75",
          900: "#164e63",
        },
      },
    },
  },
  plugins: [],
};

export default config;
