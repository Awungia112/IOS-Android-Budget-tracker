import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";

export default [
  { ignores: ["dist", "packages/server/dist"] },
  {
    files: ["**/*.{js,ts,tsx}"],
    plugins: {
      security,
    },
    rules: {
      // Keep as error - high-risk patterns that should fail CI
      "security/detect-eval-with-expression": "error",
      "security/detect-child-process": "error",
      "security/detect-new-buffer": "error",
      "security/detect-buffer-noassert": "error",
      "security/detect-unsafe-regex": "error",
      "security/detect-bidi-characters": "error",
      "security/detect-pseudoRandomBytes": "error",
      "security/detect-disable-mustache-escape": "error",
      
      // Keep as warn - rules that are often noisy or context-dependent
      "security/detect-object-injection": "warn",
      "security/detect-non-literal-regexp": "warn",
      "security/detect-non-literal-require": "warn",
      "security/detect-non-literal-fs-filename": "warn",
      "security/detect-possible-timing-attacks": "warn",
      "security/detect-no-csrf-before-method-override": "warn",
    },
  },
  {
    // Migration code must be read-only - prevent SQLite write methods
    files: ["**/migration/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='execute']",
          message: "SQLite execute() is prohibited in migration code. Migration must be read-only. Use queryReadOnly() instead.",
        },
        {
          selector: "CallExpression[callee.property.name='run']",
          message: "SQLite run() is prohibited in migration code. Migration must be read-only. Use queryReadOnly() instead.",
        },
        {
          selector: "CallExpression[callee.property.name='executeSet']",
          message: "SQLite executeSet() is prohibited in migration code. Migration must be read-only. Use queryReadOnly() instead.",
        },
      ],
    },
  },
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ...config.languageOptions,
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      ...config.plugins,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...config.rules,
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-unused-expressions": "off",
      "no-case-declarations": "off",
      "react-hooks/exhaustive-deps": "warn",
    },
  })),
  {
    files: ["packages/server/**/*.{ts,tsx}", "packages/recovery-server/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.node,
    },
  },
];
