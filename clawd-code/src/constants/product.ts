export const PRODUCT_URL = 'https://github.com/Solizardking/solana-clawd'

// Clawd Code session URLs
export const BASE_URL = 'https://clawd.code'

/**
 * Determine the session environment based on session ID format and ingress URL.
 */
export function isStagingSession(
  sessionId?: string,
  ingressUrl?: string,
): boolean {
  return (
    sessionId?.includes('_staging_') === true ||
    ingressUrl?.includes('staging') === true
  )
}

/**
 * Determine if we're in a local-dev environment for remote sessions.
 */
export function isLocalSession(
  sessionId?: string,
  ingressUrl?: string,
): boolean {
  return (
    sessionId?.includes('_local_') === true ||
    ingressUrl?.includes('localhost') === true
  )
}

/**
 * Get the base URL for Clawd Code based on environment.
 */
export function getClawdBaseUrl(
  sessionId?: string,
  ingressUrl?: string,
): string {
  if (isLocalSession(sessionId, ingressUrl)) {
    return 'http://localhost:4000'
  }
  if (isStagingSession(sessionId, ingressUrl)) {
    return 'https://staging.clawd.code'
  }
  return BASE_URL
}

/**
 * Get the full session URL for a remote session.
 */
export function getRemoteSessionUrl(
  sessionId: string,
  ingressUrl?: string,
): string {
  const baseUrl = getClawdBaseUrl(sessionId, ingressUrl)
  return `${baseUrl}/code/${sessionId}`
}