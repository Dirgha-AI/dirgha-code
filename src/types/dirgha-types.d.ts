declare module '@dirgha/types' {
  export interface DirghaConfig {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  }
  export type ModelId = string;
  export type UserId = string;
  export interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
  }
}

declare module '@dirgha/types' {
  export const API_RATE_LIMITS: Record<string, { requests: number; window: number }>;
}
