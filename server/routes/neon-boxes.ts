import { Router } from "express";

const router = Router();

const NEON_API_KEY = process.env.NEON_API_KEY ?? "";
const NEON_PROJECT_ID = process.env.NEON_PROJECT_ID ?? "";
const NEON_BASE = "https://console.neon.tech/api/v2";

function neonFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${NEON_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${NEON_API_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
}

function guard(res: import("express").Response) {
  if (!NEON_API_KEY) {
    res.status(500).json({ error: "NEON_API_KEY not configured" });
    return false;
  }
  if (!NEON_PROJECT_ID) {
    res.status(500).json({ error: "NEON_PROJECT_ID not configured" });
    return false;
  }
  return true;
}

// List branches (agent boxes)
router.get("/", async (_req, res) => {
  if (!guard(res)) return;
  try {
    const r = await neonFetch(`/projects/${NEON_PROJECT_ID}/branches`);
    const data = await r.json() as { branches: unknown[] };
    res.json({ branches: data.branches ?? [] });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "fetch failed" });
  }
});

// Create a new branch (spawn an agent box)
router.post("/create", async (req, res) => {
  if (!guard(res)) return;
  const { name, parentId } = req.body as { name?: string; parentId?: string };
  try {
    const body: Record<string, unknown> = {};
    if (name) body.branch = { name };
    if (parentId) body.branch = { ...(body.branch as object), parent_id: parentId };

    const r = await neonFetch(`/projects/${NEON_PROJECT_ID}/branches`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const data = await r.json() as { branch: unknown; connection_uris?: unknown[] };
    if (!r.ok) {
      return res.status(r.status).json({ error: (data as { message?: string }).message ?? "create failed" });
    }
    res.json({ branch: data.branch, connectionUris: data.connection_uris ?? [] });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "fetch failed" });
  }
});

// Get single branch
router.get("/:branchId", async (req, res) => {
  if (!guard(res)) return;
  try {
    const r = await neonFetch(`/projects/${NEON_PROJECT_ID}/branches/${req.params.branchId}`);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "fetch failed" });
  }
});

// Get connection URI for a branch
router.get("/:branchId/connection", async (req, res) => {
  if (!guard(res)) return;
  try {
    const r = await neonFetch(
      `/projects/${NEON_PROJECT_ID}/connection_uri?branch_id=${req.params.branchId}&database_name=neondb&role_name=neondb_owner`,
    );
    const data = await r.json() as { uri?: string };
    res.json({ uri: data.uri });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "fetch failed" });
  }
});

// Delete a branch (destroy agent box)
router.delete("/:branchId", async (req, res) => {
  if (!guard(res)) return;
  try {
    const r = await neonFetch(`/projects/${NEON_PROJECT_ID}/branches/${req.params.branchId}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      const data = await r.json() as { message?: string };
      return res.status(r.status).json({ error: data.message ?? "delete failed" });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "fetch failed" });
  }
});

export default router;
