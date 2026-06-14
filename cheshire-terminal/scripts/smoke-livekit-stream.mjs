#!/usr/bin/env node

const baseUrl = (process.env.LIVEKIT_SMOKE_BASE_URL || process.env.APP_URL || "http://localhost:5005").replace(/\/$/, "");
const roomName = process.env.LIVEKIT_SMOKE_ROOM || "cheshire-terminal-live";
const createIngress = process.env.LIVEKIT_SMOKE_CREATE_INGRESS === "true";
const listIngress = process.env.LIVEKIT_SMOKE_LIST_INGRESS === "true" || createIngress;
const listEgress = process.env.LIVEKIT_SMOKE_LIST_EGRESS === "true";
const egressUrl = process.env.LIVEKIT_SMOKE_EGRESS_RTMP_URL || "";
const checkRoomHealth = process.env.LIVEKIT_SMOKE_ROOM_HEALTH === "true";

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function tokenSmoke(role) {
  const participantName = `smoke-${role}`;
  const result = await request("/api/livekit/livestream-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomName, role, participantName }),
  });

  assert(result.response.ok, `${role} token failed: ${result.response.status} ${result.body.error || ""}`);
  assert(typeof result.body.token === "string" && result.body.token.length > 20, `${role} token missing`);
  assert(typeof result.body.url === "string" && result.body.url.startsWith("wss://"), `${role} url missing`);
  assert(result.body.roomName === roomName, `${role} room mismatch`);
  assert(result.body.participantName === participantName, `${role} participant mismatch`);
  assert(result.body.role === role, `${role} role mismatch`);
  console.log(`[livekit-smoke] ${role} token ok`);
}

async function ingressSmoke(protocol) {
  const agentName = `smoke-${protocol}-agent`;
  const result = await request("/api/livekit/livestream-ingress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomName, protocol, agentName }),
  });

  assert(result.response.ok, `${protocol} ingress failed: ${result.response.status} ${result.body.error || ""}`);
  assert(result.body.protocol === protocol, `${protocol} protocol mismatch`);
  assert(result.body.roomName === roomName, `${protocol} room mismatch`);
  assert(result.body.agentName === agentName, `${protocol} agent mismatch`);
  assert(typeof result.body.url === "string" && result.body.url.length > 0, `${protocol} ingress url missing`);
  assert(typeof result.body.ingressId === "string" && result.body.ingressId.length > 0, `${protocol} ingress id missing`);
  if (protocol === "rtmp") {
    assert(typeof result.body.streamKey === "string" && result.body.streamKey.length > 0, "rtmp stream key missing");
  }
  console.log(`[livekit-smoke] ${protocol} ingress ok`);
}

async function listIngressSmoke() {
  const result = await request(`/api/livekit/livestream-ingresses?roomName=${encodeURIComponent(roomName)}`);
  assert(result.response.ok, `ingress list failed: ${result.response.status} ${result.body.error || ""}`);
  assert(Array.isArray(result.body.items), "ingress list items must be an array");
  for (const item of result.body.items) {
    assert(!("streamKey" in item), "ingress list must not expose stream keys");
  }
  console.log(`[livekit-smoke] ingress list ok count=${result.body.items.length}`);
}

async function deleteGuardSmoke() {
  const result = await request("/api/livekit/livestream-ingresses/not-valid-id!", {
    method: "DELETE",
  });
  assert(result.response.status === 400, `invalid ingress delete should return 400, got ${result.response.status}`);
  console.log("[livekit-smoke] invalid ingress delete validation ok");
}

async function egressGuardSmoke() {
  const startResult = await request("/api/livekit/livestream-egress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomName, rtmpUrl: "https://not-rtmp.example/live" }),
  });
  assert(startResult.response.status === 400, `invalid egress start should return 400, got ${startResult.response.status}`);

  const stopResult = await request("/api/livekit/livestream-egresses/not-valid-id!/stop", {
    method: "POST",
  });
  assert(stopResult.response.status === 400, `invalid egress stop should return 400, got ${stopResult.response.status}`);
  console.log("[livekit-smoke] egress validation ok");
}

async function listEgressSmoke() {
  const result = await request(`/api/livekit/livestream-egresses?roomName=${encodeURIComponent(roomName)}`);
  assert(result.response.ok, `egress list failed: ${result.response.status} ${result.body.error || ""}`);
  assert(Array.isArray(result.body.items), "egress list items must be an array");
  for (const item of result.body.items) {
    assert(!("url" in item), "egress list must not expose destination URLs");
    assert(!("streamKey" in item), "egress list must not expose stream keys");
  }
  console.log(`[livekit-smoke] egress list ok count=${result.body.items.length}`);
}

async function egressSmoke() {
  const result = await request("/api/livekit/livestream-egress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomName, rtmpUrl: egressUrl, layout: "grid" }),
  });

  assert(result.response.ok, `egress start failed: ${result.response.status} ${result.body.error || ""}`);
  assert(result.body.roomName === roomName, "egress room mismatch");
  assert(typeof result.body.destinationHost === "string" && result.body.destinationHost.length > 0, "egress destination host missing");
  assert(result.body.egress && typeof result.body.egress.egressId === "string", "egress id missing");
  assert(!("rtmpUrl" in result.body), "egress response must not expose destination URL");
  console.log(`[livekit-smoke] egress start ok id=${result.body.egress.egressId}`);
}

async function roomHealthSmoke() {
  const result = await request(`/api/livekit/livestream-room?roomName=${encodeURIComponent(roomName)}`);
  assert(result.response.ok, `room health failed: ${result.response.status} ${result.body.error || ""}`);
  assert(result.body.roomName === roomName, "room health room mismatch");
  assert(typeof result.body.exists === "boolean", "room health exists must be boolean");
  assert(Number.isFinite(Number(result.body.numParticipants)), "room health participant count missing");
  assert(Number.isFinite(Number(result.body.numPublishers)), "room health publisher count missing");
  assert(Number.isFinite(Number(result.body.numTracks)), "room health track count missing");
  assert(Array.isArray(result.body.participants), "room health participants must be an array");
  console.log(
    `[livekit-smoke] room health ok exists=${result.body.exists} participants=${result.body.numParticipants} publishers=${result.body.numPublishers} tracks=${result.body.numTracks}`
  );
}

async function main() {
  console.log(`[livekit-smoke] base=${baseUrl} room=${roomName}`);

  const status = await request("/api/livekit/status");
  assert(status.response.ok, `status endpoint failed: ${status.response.status}`);
  assert(typeof status.body.configured === "boolean", "status.configured must be boolean");
  assert(typeof status.body.url === "string", "status.url missing");
  assert(typeof status.body.livestreamRoom === "string", "status.livestreamRoom missing");
  console.log(`[livekit-smoke] configured=${status.body.configured} agent=${status.body.agentName || "none"}`);

  if (!status.body.configured) {
    const unconfigured = await request("/api/livekit/livestream-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomName, role: "viewer", participantName: "smoke-viewer" }),
    });
    assert(unconfigured.response.status === 503, `unconfigured token should return 503, got ${unconfigured.response.status}`);
    console.log("[livekit-smoke] unconfigured token behavior ok");
    return;
  }

  await tokenSmoke("viewer");
  await tokenSmoke("host");
  await tokenSmoke("agent");
  await deleteGuardSmoke();
  await egressGuardSmoke();

  if (checkRoomHealth) await roomHealthSmoke();
  if (listEgress) await listEgressSmoke();
  if (egressUrl) await egressSmoke();

  if (!createIngress) {
    if (listIngress) await listIngressSmoke();
    console.log("[livekit-smoke] ingress creation skipped; set LIVEKIT_SMOKE_CREATE_INGRESS=true to provision RTMP/WHIP ingresses");
    if (!egressUrl) console.log("[livekit-smoke] egress start skipped; set LIVEKIT_SMOKE_EGRESS_RTMP_URL to start a real RTMP egress");
    return;
  }

  await ingressSmoke("rtmp");
  await ingressSmoke("whip");
  await listIngressSmoke();
}

main().catch((error) => {
  console.error(`[livekit-smoke] failed: ${error.message}`);
  process.exit(1);
});
