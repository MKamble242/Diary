/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        diary: {
          bg: '#FAF8F3',
          surface: '#FFFFFF',
          text: '#1C2924',
          muted: '#5E6C65',
          primary: '#1F6B52',
          pressed: '#16513E',
          selected: '#E6F2EC',
          border: '#D9E0DB',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'Noto Sans Devanagari', 'sans-serif'],
        brand: ['DM Sans', 'Noto Sans Devanagari', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
