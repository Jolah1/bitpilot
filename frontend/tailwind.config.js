/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['DM Sans', 'sans-serif'],
                mono: ['Space Mono', 'monospace'],
            },
            colors: {
                bitcoin: '#F7931A',
                lightning: '#792DE4',
                nostr: '#8B5CF6',
                sat: {
                    green: '#1D9E75',
                    'green-light': '#E1F5EE',
                },
            },
        },
    },
    plugins: [],
}