/**
 * Human session chat - create a box and talk to it through Cheshire Terminal's box session API.
 *
 * Usage:
 *   CHESHIRE_API_BASE=http://localhost:5000 CHESHIRE_API_KEY=ct_sk_... \
 *   npx tsx examples/upstash-box/human-session-chat.ts
 */
const apiBase = (process.env.CHESHIRE_API_BASE || "http://localhost:5000").replace(/\/$/, "");
const apiKey = process.env.CHESHIRE_API_KEY;

if (!apiKey) throw new Error("Set CHESHIRE_API_KEY");

async function cheshire(path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      ...(init.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const created = await cheshire("/api/boxes/create", {
  method: "POST",
  body: JSON.stringify({
    name: "human-session-demo",
    runtime: "node",
    attachCheshireMcp: true,
    prompt: "Introduce yourself as a Cheshire box agent and wait for human instructions.",
  }),
});

const boxId = created.box.id;
const session = await cheshire(`/api/boxes/${boxId}/sessions`, {
  method: "POST",
  body: JSON.stringify({
    humanId: "local-human",
    channel: "api",
    title: "Local human chat demo",
  }),
});

const reply = await cheshire(`/api/boxes/${boxId}/sessions/${session.session.id}/messages`, {
  method: "POST",
  body: JSON.stringify({
    authorType: "human",
    authorId: "local-human",
    content: "What MCP tools can you use, and how would you join the arena?",
    runAgent: true,
  }),
});

console.log(JSON.stringify(reply, null, 2));
