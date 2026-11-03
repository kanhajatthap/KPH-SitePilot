/** @type {import('tailwindcss').Config} */
/**
 * E9-17: these hex values mirror the CSS custom properties in
 * `src/app/globals.css` and `src/lib/design-tokens.ts`. The design-token test
 * asserts all three are in sync. `ink.muted` is #6b645b (AA on paper), not the
 * old #7c756c which was only 4.32:1.
 */
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
          muted: '#6b645b',
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
        card: '1rem',
        control: '0.75rem',
      },
      /* E9-16: 44px minimum touch target for phone controls. */
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
      spacing: {
        touch: '44px',
      },
      boxShadow: {
        lift: '0 1px 2px rgba(27,25,23,.05), 0 20px 44px -26px rgba(27,25,23,.35)',
      },
    },
  },
  plugins: [],
};
