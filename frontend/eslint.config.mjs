import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** Next 16 ships flat configs; no compatibility bridge is needed. */
const config = [
  { ignores: [".next/**", "node_modules/**"] },
  ...coreWebVitals,
  ...typescript,
];

export default config;
