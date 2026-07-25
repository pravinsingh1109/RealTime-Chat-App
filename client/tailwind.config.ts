import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#edfcf8',
          100: '#d2f7ef',
          200: '#a8efdf',
          300: '#75e2ca',
          400: '#3dcdae',
          500: '#1baa8f',
          600: '#0a8b74',
          700: '#08705f',
          800: '#095a4f',
          900: '#094a42',
          950: '#022e2b'
        }
      },
      boxShadow: {
        float: '0 20px 55px -22px rgba(8, 32, 31, 0.32)',
        card: '0 8px 26px -12px rgba(15, 23, 42, 0.18)'
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '1' }
        }
      },
      animation: {
        rise: 'rise 240ms ease-out both',
        'pulse-soft': 'pulseSoft 1.1s ease-in-out infinite'
      }
    }
  },
  plugins: []
} satisfies Config;
