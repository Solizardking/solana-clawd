import dotenv from "dotenv";
import path from "path";

if (process.env.NODE_ENV !== "production") {
  const initialEnv = new Set(Object.keys(process.env));
  dotenv.config({ quiet: true });
  const localEnv = dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true }).parsed ?? {};

  for (const [key, value] of Object.entries(localEnv)) {
    if (initialEnv.has(key) || value === "") continue;
    process.env[key] = value;
  }
}
