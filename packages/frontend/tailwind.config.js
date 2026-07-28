/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        atlas: {
          canopy: '#0D3B2A',
          current: '#147A50',
          fieldNote: '#B7D96B',
          signalCoral: '#D85F5F',
          mist: '#DDE5E0',
          paper: '#F3F5F3',
          ink: '#181C1A',
          sprout: '#73BF96',
          sky: '#E4EFEA',
          blush: '#F7E5E5',
        },
        primary: {
          50: '#eef8f2',
          100: '#d8efe1',
          200: '#b4dfc6',
          300: '#82c7a2',
          400: '#4cab78',
          500: '#278e5d',
          600: '#197249',
          700: '#145b3d',
          800: '#124a33',
          900: '#0d3b2a',
          950: '#062117',
        },
      },
      fontFamily: {
        atlasDisplay: ['Manrope', 'sans-serif'],
        atlasBody: ['Inter', 'sans-serif'],
        atlasMono: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
