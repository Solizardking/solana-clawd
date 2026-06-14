const baseUrl = (process.env.STREAM_SMOKE_BASE_URL || process.env.APP_URL || "http://localhost:5005").replace(/\/$/, "");
const streamUid = process.env.STREAM_SMOKE_UID || "5c8b99baa82a276adb69d5b4af205836";

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
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log(`[stream-smoke] base=${baseUrl}`);

  const status = await request("/api/cloudflare-stream/status");
  assert(status.response.ok, `status endpoint failed: ${status.response.status}`);
  assert(typeof status.body.configured === "boolean", "status.configured must be boolean");
  assert(typeof status.body.liveInputsEnabled === "boolean", "status.liveInputsEnabled must be boolean");
  console.log(`[stream-smoke] configured=${status.body.configured} tokenSource=${status.body.tokenSource || "none"}`);

  const playback = await request(`/api/cloudflare-stream/playback/${encodeURIComponent(streamUid)}`);
  assert(playback.response.ok, `playback endpoint failed: ${playback.response.status}`);
  assert(playback.body.playback?.hls?.includes("/manifest/video.m3u8"), "playback.hls missing HLS manifest URL");
  assert(playback.body.playback?.iframe?.includes("/iframe"), "playback.iframe missing iframe URL");
  console.log("[stream-smoke] playback ok");

  const views = await request(`/api/cloudflare-stream/views/${encodeURIComponent(streamUid)}`);
  assert(views.response.ok, `views endpoint failed: ${views.response.status}`);
  assert(Number.isFinite(Number(views.body.liveViewers)), "views.liveViewers must be numeric");
  console.log(`[stream-smoke] liveViewers=${views.body.liveViewers}`);

  const health = await request(`/api/cloudflare-stream/health/${encodeURIComponent(streamUid)}`);
  assert(health.response.ok, `health endpoint failed: ${health.response.status}`);
  assert(typeof health.body.ok === "boolean", "health.ok must be boolean");
  assert(typeof health.body.liveReady === "boolean", "health.liveReady must be boolean");
  assert(typeof health.body.hls?.isPlaylist === "boolean", "health.hls.isPlaylist must be boolean");
  assert(Number.isFinite(Number(health.body.hls?.mediaSegmentCount)), "health.hls.mediaSegmentCount must be numeric");
  assert(Number.isFinite(Number(health.body.hls?.variantPlaylistCount)), "health.hls.variantPlaylistCount must be numeric");
  assert(health.body.checks?.hls, "health.checks.hls missing");
  assert(health.body.checks?.iframe, "health.checks.iframe missing");
  console.log(
    `[stream-smoke] health ok=${health.body.ok} liveReady=${health.body.liveReady} hlsSegments=${health.body.hls.mediaSegmentCount}`,
  );

  const invalid = await request("/api/cloudflare-stream/playback/not-valid-uid-with-asterisk*");
  assert(invalid.response.status === 400, `invalid playback id should return 400, got ${invalid.response.status}`);
  console.log("[stream-smoke] invalid-id validation ok");

  if (!status.body.liveInputsEnabled) {
    const live = await request("/api/cloudflare-stream/live-inputs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "stream-smoke", creator: "smoke" }),
    });
    assert(live.response.status === 503, `unconfigured live input should return 503, got ${live.response.status}`);
    console.log("[stream-smoke] unconfigured live-input behavior ok");
  } else {
    console.log("[stream-smoke] live input creation is configured; skipping create to avoid provisioning a channel");
  }
}

main().catch((error) => {
  console.error(`[stream-smoke] failed: ${error.message}`);
  process.exit(1);
});
