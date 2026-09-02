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
      // Emscripten output, copied in by scripts/copy-ffmpeg.mjs on prebuild and
      // gitignored. It is a build artifact of somebody else's compiler, so its
      // style is not ours to have an opinion about — and editing it to satisfy
      // a rule would be undone by the next `npm run build`.
      "public/ffmpeg/**",
    ],
  },
];

export default eslintConfig;
