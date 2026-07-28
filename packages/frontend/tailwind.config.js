/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        atlas: {
          canopy: '#6656A8',
          current: '#7B6BC2',
          fieldNote: '#FFD975',
          signalCoral: '#F47F8F',
          mist: '#E9E4F6',
          paper: '#FFFAF6',
          ink: '#352F52',
          sprout: '#A9DCC8',
          sky: '#DCEEFF',
          blush: '#FFE5EA',
        },
        primary: {
          50: '#f5f2ff',
          100: '#ece7ff',
          200: '#dcd2ff',
          300: '#c4b3fa',
          400: '#a990ed',
          500: '#8d75d4',
          600: '#6f5bb2',
          700: '#5d4b96',
          800: '#4f4388',
          900: '#41386c',
          950: '#292044',
        },
      },
      fontFamily: {
        atlasDisplay: ['Fredoka', 'sans-serif'],
        atlasBody: ['"Nunito Sans"', 'sans-serif'],
        atlasMono: ['"Nunito Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};
