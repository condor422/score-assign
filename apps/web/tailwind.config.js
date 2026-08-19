/**
 * Brand tokens are sampled from the ScoreAssign logo: a gold mark on a deep
 * maroon field. Hex values and usage rules are documented in docs/BRAND.md;
 * keep the two in step.
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        maroon: {
          950: '#2A0203',
          900: '#3A0304',
          800: '#4A0E0F',
          700: '#6B1418',
          600: '#8A1D22',
          500: '#A83A3F',
          100: '#F6E4E4',
          50: '#FCF4F4',
        },
        gold: {
          800: '#7A5A1E',
          700: '#A87C2E',
          600: '#C09A47',
          500: '#D8B058',
          400: '#E8C868',
          100: '#F7EBCF',
          50: '#FCF7EA',
        },
        ink: '#1C1A17',
        surface: '#FAF7F2',
        success: '#2F6B4F',
        caution: '#8F5A0C',
        danger: '#B02418',
        info: '#2C5F73',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        brand: '0 1px 2px rgba(42, 2, 3, 0.06), 0 8px 24px -12px rgba(42, 2, 3, 0.25)',
      },
    },
  },
  plugins: [],
};
