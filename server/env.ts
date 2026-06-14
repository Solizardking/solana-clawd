import dotenv from "dotenv";
import path from "path";

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ quiet: true });
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true, quiet: true });
}
