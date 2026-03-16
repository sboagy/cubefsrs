/** @type {import('tailwindcss').Config} */
export default {
	darkMode: "class",
	content: [
		"./index.html",
		"./src/**/*.{js,ts,jsx,tsx}",
		// Scan compiled rhizome output so shared component Tailwind classes are generated
		"./node_modules/@rhizome/core/dist/**/*.{js,mjs}",
	],
	theme: {
		extend: {},
	},
	plugins: [],
};
