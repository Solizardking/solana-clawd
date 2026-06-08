/**
 * services barrel — runtime ecosystem, Gemini AI, and x402 payment protocol.
 */
export { getAgentIndex, getSolanaAiInferenceClient, ecosystemHealthCheck } from './ecosystem.js';
export type { InferRequest, InferResponse } from './gemini/index.js';
export { X402_HEADERS, USDC_ADDRESSES } from './x402/index.js';
export type { PaymentRequirement, PaymentPayload } from './x402/types.js';