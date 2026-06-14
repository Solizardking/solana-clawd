/**
 * Common API response types used throughout the application
 */

/**
 * Base API response interface
 * All API responses should extend this interface
 */
export interface ApiResponse {
  success: boolean;
  error?: string;
}

/**
 * Generic data response with typed payload
 */
export interface DataResponse<T> extends ApiResponse {
  data: T;
}

/**
 * Error response with message
 */
export interface ErrorResponse extends ApiResponse {
  success: false;
  error: string;
}

/**
 * Pagination metadata for paginated responses
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * Paginated response with generic item type
 */
export interface PaginatedResponse<T> extends ApiResponse {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * XAI API specific response types
 */

/**
 * Chat completion response
 */
export interface ChatCompletionResponse extends ApiResponse {
  response: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Vision analysis response
 */
export interface VisionAnalysisResponse extends ApiResponse {
  analysis: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * JSON generation response
 */
export interface JsonGenerationResponse extends ApiResponse {
  data: Record<string, any>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}