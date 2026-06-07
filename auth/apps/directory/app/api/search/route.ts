import { searchProvidersByIntent } from "@/lib/search";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const intent = searchParams.get("intent")?.trim();
    const limit = Number(searchParams.get("limit") ?? "10");
    const offset = Number(searchParams.get("offset") ?? "0");

    if (!intent) {
      return Response.json({ error: "intent query parameter is required" }, { status: 400 });
    }

    const { results, total } = await searchProvidersByIntent(intent, { limit, offset });
    return Response.json({
      providers: results,
      intent,
      count: results.length,
      total,
      offset,
      limit,
    });
  } catch (err) {
    console.error("GET /api/search failed:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
