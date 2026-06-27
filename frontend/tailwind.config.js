/** @type {import('tailwindcss').Config} */
//
// AlphaForge "Warm Ivory + Ocean Teal" light theme.
//
// The existing components were written with a dark vocabulary (slate backgrounds,
// indigo brand, etc.). Rather than rewrite every file, we remap those color
// *scales* to light-theme values so the whole app flips consistently:
//   - slate is inverted: 800=white cards, 900=ivory page, 300/200=dark ink text
//   - indigo  -> ocean-teal brand
//   - yellow/amber -> honey accent
//   - green/red kept semantic (gains/losses) but tuned for a light background
//
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic names (used by newly-converted markup)
        canvas: '#F5F2EC',
        surface: '#FFFFFF',
        panel: '#FBF8F2',
        line: '#E8E1D6',
        ink: '#23201B',
        subtle: '#5E564A',
        faint: '#9A8F7E',

        // --- remapped scales -------------------------------------------------
        // slate, inverted + warmed: high numbers = light surfaces, low = dark ink
        slate: {
          50:  '#23201B',
          100: '#2A251F',
          200: '#322C24',
          300: '#4A4236',
          400: '#6E6455',
          500: '#9A8F7E',
          600: '#DED5C7',
          700: '#E8E1D6',
          800: '#FFFFFF',
          900: '#F5F2EC',
          950: '#EFEAE1',
        },
        // indigo -> ocean teal (brand)
        indigo: {
          100: '#0B616A',
          200: '#0B5159',
          300: '#3DA0A8',
          400: '#0E7C86',
          500: '#0E7C86',
          600: '#0B6E78',
          700: '#0B616A',
          800: '#094E55',
          950: '#08454C',
          DEFAULT: '#0E7C86',
        },
        brand: { DEFAULT: '#0E7C86', deep: '#0B616A', soft: '#E3F3F4' },
        // green -> gains
        green: {
          300: '#3FA56F',
          400: '#1A8A50',
          500: '#1A7F4B',
          600: '#157A45',
          700: '#0F5C32',
        },
        up: { DEFAULT: '#1A7F4B', soft: '#E3F5EA' },
        // red -> losses
        red: {
          300: '#E0726F',
          400: '#D23B3B',
          500: '#CE3636',
          600: '#BE2F2F',
          700: '#A52727',
        },
        down: { DEFAULT: '#D23B3B', soft: '#FBE6E4' },
        // yellow + amber -> honey accent
        yellow: {
          300: '#E0A437',
          400: '#C77D11',
          500: '#C77D11',
          600: '#A9690C',
        },
        amber: {
          300: '#D99114',
          400: '#C77D11',
          500: '#C77D11',
          600: '#A9690C',
        },
        accent: { DEFAULT: '#C77D11', soft: '#FBEFD9' },
        // purple -> plum (kept distinct for the "crypto" tag etc.)
        purple: {
          100: '#5E3A86',
          200: '#5E3A86',
          300: '#9B6FD4',
          400: '#8A5CC0',
          500: '#8A5CC0',
          600: '#7A4FB0',
        },
        // pink -> rose (SMA-20 line, challenger accents)
        pink: {
          300: '#E07FA0',
          400: '#D2557A',
          500: '#D2557A',
        },
        // blue kept an actual blue (the "stock" tag), distinct from teal brand
        blue: {
          300: '#5B8DEF',
          400: '#2F6FE0',
          500: '#2F6FE0',
          600: '#2560C8',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(35,32,27,0.04), 0 6px 20px rgba(35,32,27,0.07)',
      },
    },
  },
  plugins: [],
}
