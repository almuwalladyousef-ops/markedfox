import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "coverage/**",
      // Git worktrees live inside the repo, so their build output and installed
      // packages would otherwise be linted as if they were source.
      ".claude/worktrees/**",
    ],
  },
];

export default eslintConfig;
