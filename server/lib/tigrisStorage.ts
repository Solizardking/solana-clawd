import crypto from "crypto";

type TigrisConfig = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  publicBaseUrl: string;
};

function env(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

function config(): TigrisConfig | null {
  const endpoint = env("TIGRIS_ENDPOINT_S3", "TIGRIS_S3_ENDPOINT", "R2_ENDPOINT", "CLOUDFLARE_R2_ENDPOINT", "S3_ENDPOINT");
  const bucket = env("TIGRIS_BUCKET", "TIGRIS_BUCKET_NAME", "R2_BUCKET", "CLOUDFLARE_R2_BUCKET", "GALLERY_TIGRIS_BUCKET", "GALLERY_STORAGE_BUCKET");
  const accessKeyId = env("TIGRIS_ACCESS_KEY_ID", "TIGRIS_ACCESS_KEY", "R2_ACCESS_KEY_ID", "CLOUDFLARE_R2_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID");
  const secretAccessKey = env("TIGRIS_SECRET_ACCESS_KEY", "TIGRIS_SECRET_KEY", "TIGRIS_SECRET", "R2_SECRET_ACCESS_KEY", "CLOUDFLARE_R2_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY");
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint: endpoint.replace(/\/$/, ""),
    bucket,
    accessKeyId,
    secretAccessKey,
    region: env("TIGRIS_REGION", "AWS_REGION") || "auto",
    publicBaseUrl: env("TIGRIS_PUBLIC_URL", "TIGRIS_CDN_URL").replace(/\/$/, ""),
  };
}

export function hasTigrisStorageConfig() {
  return Boolean(config());
}

function hmac(key: Buffer | string, value: string) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest();
}

function sha256Hex(value: Buffer | string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function amzTimestamp(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function encodePath(key: string) {
  return key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function encodeQuery(params?: URLSearchParams) {
  if (!params) return "";
  const pairs = Array.from(params.entries())
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)] as const)
    .sort(([aKey, aValue], [bKey, bValue]) => aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey));
  return pairs.map(([key, value]) => `${key}=${value}`).join("&");
}

function signingKey(secret: string, dateStamp: string, region: string) {
  const dateKey = hmac(`AWS4${secret}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function signedRequest(
  method: "GET" | "PUT",
  key: string,
  body?: Buffer,
  contentType = "application/octet-stream",
  query?: URLSearchParams,
  extraHeaders: Record<string, string> = {},
) {
  const cfg = config();
  if (!cfg) return null;

  const endpoint = new URL(cfg.endpoint);
  const path = `/${cfg.bucket}${key ? `/${encodePath(key)}` : ""}`;
  const canonicalQuery = encodeQuery(query);
  const url = `${cfg.endpoint}${path}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
  const payloadHash = sha256Hex(body ?? "");
  const { amzDate, dateStamp } = amzTimestamp();
  const headers: Record<string, string> = {
    host: endpoint.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...Object.fromEntries(Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), v])),
  };
  if (method === "PUT") {
    headers["content-type"] = contentType;
  }

  const sortedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderNames.map((name) => `${name}:${headers[name].trim()}\n`).join("");
  const signedHeaders = sortedHeaderNames.join(";");
  const canonicalRequest = [
    method,
    path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = crypto
    .createHmac("sha256", signingKey(cfg.secretAccessKey, dateStamp, cfg.region))
    .update(stringToSign, "utf8")
    .digest("hex");

  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { url, headers };
}

export function tigrisPublicUrl(key: string) {
  const cfg = config();
  if (!cfg?.publicBaseUrl) return "";
  return `${cfg.publicBaseUrl}/${encodePath(key)}`;
}

export async function putTigrisObject(
  key: string,
  body: Buffer,
  contentType: string,
  cacheControl = "public, max-age=31536000, immutable",
) {
  const request = signedRequest("PUT", key, body, contentType, undefined, {
    "cache-control": cacheControl,
  });
  if (!request) return null;
  const res = await fetch(request.url, {
    method: "PUT",
    headers: request.headers,
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Tigris upload failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return {
    key,
    url: tigrisPublicUrl(key),
    etag: res.headers.get("etag") ?? undefined,
  };
}

export async function getTigrisObject(key: string) {
  const request = signedRequest("GET", key);
  if (!request) return null;
  const res = await fetch(request.url, { headers: request.headers });
  if (!res.ok) return null;
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || "application/octet-stream",
  };
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function listTigrisKeys(prefix: string, limit = 1000) {
  const params = new URLSearchParams({
    "list-type": "2",
    prefix,
    "max-keys": String(Math.min(Math.max(limit, 1), 1000)),
  });
  const request = signedRequest("GET", "", undefined, "application/octet-stream", params);
  if (!request) return [];
  const res = await fetch(request.url, { headers: request.headers });
  if (!res.ok) return [];
  const xml = await res.text();
  return Array.from(xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)).map((match) => decodeXml(match[1]));
}
