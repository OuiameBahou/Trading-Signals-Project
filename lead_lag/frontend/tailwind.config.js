/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                awb: {
                    red: {
                        DEFAULT: '#C8102E',
                        light: '#E83050',
                        dark: '#A00D25',
                    },
                    gold: {
                        DEFAULT: '#A0823F',
                        light: '#C4A86A',
                        dark: '#7A622A',
                    }
                },
                navy: {
                    900: '#0a0e1a',
                    800: '#141b2d',
                    700: '#1f2937',
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
