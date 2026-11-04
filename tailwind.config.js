/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/ui/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        ghost: { 50: '#f0e6ff', 100: '#d9b3ff', 200: '#b366ff', 300: '#8c00ff', dark: '#0a0010' },
        specter: { green: '#00ff88', dim: '#00cc6a' },
        bone: { white: '#e8e8e8', dim: '#aaaaaa' }
      }
    }
  },
  plugins: []
};
