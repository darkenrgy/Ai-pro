/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(148, 163, 184, 0.18), 0 24px 80px rgba(15, 23, 42, 0.24)',
      },
      colors: {
        ink: {
          950: '#050816',
          900: '#0b1220',
          800: '#10192e',
        },
      },
    },
  },
  plugins: [],
};