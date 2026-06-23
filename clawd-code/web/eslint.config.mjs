import nextVitals from "eslint-config-next/core-web-vitals";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "package-lock.json",
    ],
  },
  ...nextVitals,
];
