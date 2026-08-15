import tseslint from "typescript-eslint";

export default [
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {},
  },
];
