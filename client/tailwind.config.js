/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Resolved through CSS variables so a tenant can re-theme the whole app at
      // runtime. Defaults live in index.css and match the original palette
      // exactly, so nothing changes visually until an organization overrides it.
      colors: {
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)', // the soft off-white the whole app sits on
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        sunken: 'rgb(var(--c-sunken) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        hairline: 'rgb(var(--c-hairline) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)', // lime highlight from the reference
        accentInk: 'rgb(var(--c-accent-ink) / <alpha-value>)',
        // Derived from the accent — see derivePalette() in lib/color.js
        accentSoft: 'rgb(var(--c-accent-soft) / <alpha-value>)',
        accentMuted: 'rgb(var(--c-accent-muted) / <alpha-value>)',
        accentDeep: 'rgb(var(--c-accent-deep) / <alpha-value>)',
        accentSurface: 'rgb(var(--c-accent-surface) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        dangerSoft: 'rgb(var(--c-danger-soft) / <alpha-value>)',
        ok: 'rgb(var(--c-ok) / <alpha-value>)',
        okSoft: 'rgb(var(--c-ok-soft) / <alpha-value>)',
        warn: 'rgb(var(--c-warn) / <alpha-value>)',
        warnSoft: 'rgb(var(--c-warn-soft) / <alpha-value>)',
        info: 'rgb(var(--c-info) / <alpha-value>)',
        infoSoft: 'rgb(var(--c-info-soft) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '28px',
        tile: '20px',
      },
      boxShadow: {
        soft: '0 2px 4px rgba(24,23,19,0.03), 0 12px 32px -12px rgba(24,23,19,0.10)',
        lift: '0 8px 20px -6px rgba(24,23,19,0.16)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        rise: 'rise .4s cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
};
