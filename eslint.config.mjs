import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import configPrettier from "eslint-config-prettier";
import importX from "eslint-plugin-import-x";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: ["dist/**", "dist-electron/**", "native/.build/**", "node_modules/**", "resources/bin/**"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
  },
  react.configs.flat.recommended,
  reactHooks.configs.flat["recommended-latest"],
  {
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "import-x": importX,
    },
    settings: {
      react: { version: "19.0" },
    },
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "import-x/order": [
        "error",
        {
          alphabetize: { caseInsensitive: true, order: "asc" },
          distinctGroup: false,
          groups: ["builtin", "external", "internal", "parent", "sibling", "index", "object"],
          "newlines-between": "always",
          pathGroups: [
            { group: "internal", pattern: "@/**" },
            { group: "builtin", pattern: "node:**" },
            { group: "object", pattern: "./**.css" },
          ],
          warnOnUnassignedImports: true,
        },
      ],
      "no-console": ["warn", { allow: ["info", "warn", "error"] }],
      "no-unused-vars": "off",
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react/react-in-jsx-scope": "off",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/require-await": "off",
      "require-yield": "off",
    },
  },
  configPrettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.config.js", "*.config.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
  },
]);
