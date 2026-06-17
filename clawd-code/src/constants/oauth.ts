import { isEnvTruthy } from 'src/utils/envUtils.js'

// OAuth configuration for Clawd Code provider integrations
// Supports xAI Grok (default), Anthropic Claude, DeepSeek, and OpenRouter
type OauthConfigType = 'prod' | 'staging' | 'local'

function getOauthConfigType(): OauthConfigType {
  if (isEnvTruthy(process.env.USE_LOCAL_OAUTH)) {
    return 'local'
  }
  if (isEnvTruthy(process.env.USE_STAGING_OAUTH)) {
    return 'staging'
  }
  return 'prod'
}

export function fileSuffixForOauthConfig(): string {
  switch (getOauthConfigType()) {
    case 'local':
      return '-local-oauth'
    case 'staging':
      return '-staging-oauth'
    case 'prod':
      return ''
  }
}

export const INFERENCE_SCOPE = 'user:inference' as const
export const PROFILE_SCOPE = 'user:profile' as const
export const OAUTH_BETA_HEADER = 'oauth-2025-04-20' as const

type OauthConfig = {
  BASE_API_URL: string
  AUTHORIZE_URL: string
  TOKEN_URL: string
  SUCCESS_URL: string
  MANUAL_REDIRECT_URL: string
  CLIENT_ID: string
  OAUTH_FILE_SUFFIX: string
}

// Production OAuth configuration
const PROD_OAUTH_CONFIG = {
  BASE_API_URL: 'https://api.clawd.code',
  AUTHORIZE_URL: 'https://clawd.code/oauth/authorize',
  TOKEN_URL: 'https://clawd.code/v1/oauth/token',
  SUCCESS_URL: 'https://clawd.code/oauth/code/success',
  MANUAL_REDIRECT_URL: 'https://clawd.code/oauth/code/callback',
  CLIENT_ID: 'clawd-code-cli-prod',
  OAUTH_FILE_SUFFIX: '',
}

// Staging OAuth configuration
const STAGING_OAUTH_CONFIG: OauthConfig = {
  BASE_API_URL: 'https://api-staging.clawd.code',
  AUTHORIZE_URL: 'https://staging.clawd.code/oauth/authorize',
  TOKEN_URL: 'https://staging.clawd.code/v1/oauth/token',
  SUCCESS_URL: 'https://staging.clawd.code/oauth/code/success',
  MANUAL_REDIRECT_URL: 'https://staging.clawd.code/oauth/code/callback',
  CLIENT_ID: 'clawd-code-cli-staging',
  OAUTH_FILE_SUFFIX: '-staging-oauth',
}

// Local dev configuration
function getLocalOauthConfig(): OauthConfig {
  const api = process.env.LOCAL_OAUTH_API_BASE?.replace(/\/$/, '') ?? 'http://localhost:8000'
  const apps = process.env.LOCAL_OAUTH_APPS_BASE?.replace(/\/$/, '') ?? 'http://localhost:4000'
  return {
    BASE_API_URL: api,
    AUTHORIZE_URL: `${apps}/oauth/authorize`,
    TOKEN_URL: `${api}/v1/oauth/token`,
    SUCCESS_URL: `${apps}/oauth/code/success`,
    MANUAL_REDIRECT_URL: `${apps}/oauth/code/callback`,
    CLIENT_ID: 'clawd-code-cli-local',
    OAUTH_FILE_SUFFIX: '-local-oauth',
  }
}

// Default to prod config, override with test/staging if enabled
export function getOauthConfig(): OauthConfig {
  switch (getOauthConfigType()) {
    case 'local':
      return getLocalOauthConfig()
    case 'staging':
      return STAGING_OAUTH_CONFIG
    case 'prod':
    default:
      return PROD_OAUTH_CONFIG
  }
}