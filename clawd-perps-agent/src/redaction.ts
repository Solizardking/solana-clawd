const SENSITIVE_QUERY_KEY = /(?:api[-_]?key|token|password|secret|signature|auth|access[-_]?key)/i;

export function redactSensitiveText(value: string): string {
  return value
    .replace(/(api-key=)[^&\s"]+/gi, "$1[REDACTED]")
    .replace(/((?:token|password|secret|signature|auth|access[-_]?key)=)[^&\s"]+/gi, "$1[REDACTED]");
}

export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEY.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return url.toString().replaceAll("%5BREDACTED%5D", "[REDACTED]");
  } catch {
    return redactSensitiveText(value);
  }
}
