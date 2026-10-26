/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx,json}', './public/saveframe.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['var(--font-jakarta)', 'var(--font-inter)', 'sans-serif'],
      },
      colors: {
        canvas: '#FFFFFF', soft: '#F8F9FD', panel: '#FAF9FE',
        ink: { DEFAULT: '#171827', secondary: '#344054', muted: '#525866' },
        brand: {
          violet: '#7C3AED', violetHover: '#6D28D9', violetSoft: '#F3EEFF',
          pink: '#EC4899', pinkSoft: '#FDF2F8', orange: '#F97316', orangeSoft: '#FFF7ED',
        },
        line: { DEFAULT: '#E9EAF0', strong: '#D0D5DD' },
      },
    },
  },
};
