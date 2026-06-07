import { auth } from "@/lib/auth";

export async function GET() {
  return auth.handler(
    new Request("http://localhost/api/auth/agent-configuration", { method: "GET" }),
  );
}
