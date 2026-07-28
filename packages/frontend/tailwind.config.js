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
          canopy: '#123C3A',
          current: '#25766F',
          fieldNote: '#F2CB67',
          signalCoral: '#F27B55',
          mist: '#DCE9E6',
          paper: '#F8FAF8',
          ink: '#183432',
        },
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
      },
      fontFamily: {
        atlasDisplay: ['Archivo', 'sans-serif'],
        atlasBody: ['"Source Sans 3"', 'sans-serif'],
        atlasMono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};
