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
        canvas: '#FFFFFF', soft: '#F6F6F7', panel: '#FAFAFB',
        ink: { DEFAULT: '#161616', secondary: '#393941', muted: '#606069' },
        brand: {
          violet: '#D91F46', violetHover: '#B9193B', violetSoft: '#FFF0F3',
          pink: '#087F83', pinkSoft: '#E7FAFA', orange: '#087F83', orangeSoft: '#E7FAFA',
        },
        line: { DEFAULT: '#E4E4E9', strong: '#D1D1D8' },
      },
    },
  },
};
