/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#faf9f6',
          deep: '#f3f0ea',
          card: '#ffffff',
        },
        ink: {
          DEFAULT: '#1b1917',
          soft: '#44403c',
          muted: '#7c756c',
        },
        line: {
          DEFAULT: '#e8e3da',
          strong: '#d9d2c7',
        },
        brand: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          900: '#881337',
        },
        surface: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
      fontFamily: {
        sans: [
          'Segoe UI Variable Text',
          'Segoe UI',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['Cascadia Code', 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'monospace'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        lift: '0 1px 2px rgba(27,25,23,.05), 0 20px 44px -26px rgba(27,25,23,.35)',
      },
    },
  },
  plugins: [],
};
