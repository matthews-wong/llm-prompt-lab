// ESLint flat config (ESM). Uses typescript-eslint's non-type-checked
// recommended rules so linting needs no TypeScript program.
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  ...tseslint.configs.recommended,
);
