import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,ts,jsx,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0f172a',
        card: '#1e293b',
        accent: '#38bdf8',
        green: '#4ade80',
        amber: '#f59e0b',
        indigo: '#818cf8',
        violet: '#a78bfa',
      },
      animation: {
        flow: 'flowAnimation 3s infinite linear',
        'flow-delay': 'flowAnimation 3s infinite linear 1.5s',
        'spin-slow': 'spin 8s linear infinite',
        'fade-in-up': 'fadeInUp 0.3s ease-out forwards',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        flowAnimation: {
          '0%': { left: '-10%', opacity: '0' },
          '10%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { left: '110%', opacity: '0' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      typography: ({ theme }) => ({
        invert: {
          css: {
            '--tw-prose-body': theme('colors.slate.300'),
            '--tw-prose-headings': theme('colors.white'),
            '--tw-prose-links': theme('colors.accent'),
            '--tw-prose-bold': theme('colors.white'),
            '--tw-prose-code': theme('colors.accent'),
            '--tw-prose-pre-bg': theme('colors.slate.900'),
            '--tw-prose-quote-borders': theme('colors.accent'),
            '--tw-prose-bullets': theme('colors.slate.500'),
          },
        },
      }),
    },
  },
  plugins: [typography],
};
