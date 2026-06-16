import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    API_URL: z.string().url(),
  },
  client: {
    NEXT_PUBLIC_WEB_URL: z.string().url(),
    NEXT_PUBLIC_REDPILL_API_URL: z.string().url(),
    NEXT_PUBLIC_GTM_ID: z.string().optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
    NEXT_PUBLIC_REDPILL_API_URL: process.env.NEXT_PUBLIC_REDPILL_API_URL,
    NEXT_PUBLIC_GTM_ID: process.env.NEXT_PUBLIC_GTM_ID,
  },
});
