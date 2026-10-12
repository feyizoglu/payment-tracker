/** @type {import('tailwindcss').Config} */
const defaults = require("tailwindcss/colors");

// Shades backed by the CSS variables in tailwind.css; the rest keep Tailwind's values.
const themed = (name, shades) =>
  Object.fromEntries(shades.map((shade) => [shade, `rgb(var(--${name}-${shade}) / <alpha-value>)`]));

module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2563eb",
          fg: "#ffffff",
        },
        surface: "rgb(var(--surface) / <alpha-value>)",
        gray: themed("gray", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        red: { ...defaults.red, ...themed("red", [50, 700]) },
        green: { ...defaults.green, ...themed("green", [50, 100, 700]) },
        emerald: { ...defaults.emerald, ...themed("emerald", [50, 700, 900]) },
        amber: { ...defaults.amber, ...themed("amber", [50, 700]) },
        blue: { ...defaults.blue, ...themed("blue", [50, 600]) },
        purple: { ...defaults.purple, ...themed("purple", [50]) },
      },
    },
  },
  plugins: [],
};
