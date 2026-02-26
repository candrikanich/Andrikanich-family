/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream:    { DEFAULT: '#F5F0E8', dark: '#EDE6D6' },
        walnut:   { DEFAULT: '#3D2B1F', light: '#5C3D2E', muted: '#8B6F5E' },
        sage:     { DEFAULT: '#6B7C6B', light: '#8FA08F', muted: '#B5C4B5' },
        dusty:    { DEFAULT: '#C4856A', light: '#D9A089', muted: '#E8C4B0' },
        parchment: { DEFAULT: '#D4C5A9', light: '#E8DDC9' },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
