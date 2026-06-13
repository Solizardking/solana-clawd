import { NextResponse } from "next/server";
import { callRouter, requireRouterClerkAuth } from "@/lib/router-keys";

export async function GET() {
  const auth = await requireRouterClerkAuth("read:router_keys");
  if (auth instanceof Response) return auth;

  const routerResponse = await callRouter("/v1/usage", { method: "GET" });
  const data = await routerResponse.json().catch(() => ({ error: "Invalid router response" }));
  return NextResponse.json(data, { status: routerResponse.status });
}
