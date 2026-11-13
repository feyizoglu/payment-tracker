import { vars } from "nativewind";

// The dark values of tailwind.css. The game screens apply them whatever the app theme is,
// so the themed classes inside (text-gray-900, bg-surface, …) always read on the game's dark
// background. game-theme.test.ts fails when this drifts from tailwind.css.
export const GAME_DARK_TOKENS = {
  "--surface": "17 24 39",
  "--gray-50": "3 7 18",
  "--gray-100": "31 41 55",
  "--gray-200": "55 65 81",
  "--gray-300": "75 85 99",
  "--gray-400": "139 147 161",
  "--gray-500": "180 186 196",
  "--gray-600": "209 213 219",
  "--gray-700": "229 231 235",
  "--gray-800": "243 244 246",
  "--gray-900": "249 250 251",
  "--red-50": "59 18 25",
  "--red-700": "252 165 165",
  "--green-50": "15 42 26",
  "--green-100": "20 83 45",
  "--green-700": "134 239 172",
  "--emerald-50": "5 46 34",
  "--emerald-700": "110 231 183",
  "--emerald-900": "209 250 229",
  "--amber-50": "58 42 5",
  "--amber-700": "252 211 77",
  "--blue-50": "23 37 84",
  "--blue-600": "96 165 250",
  "--purple-50": "46 16 101",
} as const;

export const gameDarkVars = vars(GAME_DARK_TOKENS);
