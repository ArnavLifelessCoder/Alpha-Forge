/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'nextbull-blue': '#4F46E5',
        'nextbull-dark': '#1E1B4B',
      },
    },
  },
  plugins: [],
}
