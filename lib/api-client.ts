/**
 * Centralized API client with auth, retries, and error handling
 * Enterprise-grade fetch wrapper for all API calls
 */

import { toast } from "sonner";

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestConfig extends RequestInit {
  retries?: number;
  showErrorToast?: boolean;
  /**
   * Allow automatic retries for a non-GET request. Off by default: retrying a
   * POST/PATCH/DELETE that failed with a network error or 5xx is unsafe — the
   * server may have already processed it, so a retry can duplicate the write
   * (a second task, a second credential, a double charge). Set this only for
   * endpoints that are genuinely idempotent.
   */
  idempotent?: boolean;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function apiClient<T>(
  endpoint: string,
  config: RequestConfig = {}
): Promise<T> {
  const { retries = MAX_RETRIES, showErrorToast = true, idempotent, ...fetchConfig } = config;

  // Only auto-retry requests that are safe to repeat. GET/HEAD are always safe;
  // a write (POST/PATCH/DELETE) is retried only when the caller explicitly marks
  // the endpoint idempotent, otherwise a single network blip after the server
  // already committed would create a duplicate record.
  const method = (fetchConfig.method ?? "GET").toUpperCase();
  const canRetry = idempotent ?? (method === "GET" || method === "HEAD");
  const maxAttempts = canRetry ? retries : 1;

  // Normalise to exactly one "/api" prefix. Call sites are inconsistent — most
  // pass "/kb/generate" or "sops", a few pass "/api/admin/users" — but every
  // route lives under /api. Without this, leading-slash paths like "/kb/generate"
  // were fetched verbatim and 404'd (or hit a page route), silently breaking
  // most mutations across the app.
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = path === "/api" || path.startsWith("/api/") ? path : `/api${path}`;
  
  const defaultHeaders: HeadersInit = {
    "Content-Type": "application/json",
  };
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...fetchConfig,
        headers: {
          ...defaultHeaders,
          ...fetchConfig.headers,
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(
          errorData.error || `Request failed with status ${response.status}`,
          response.status,
          errorData.code || "UNKNOWN_ERROR"
        );
      }
      
      // Handle empty responses (DELETE, etc.)
      if (response.status === 204) {
        return undefined as T;
      }
      
      return await response.json() as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) {
        if (error.statusCode !== 429) throw error;
      }
      
      // Last attempt failed
      if (attempt === maxAttempts - 1) break;
      
      // Exponential backoff
      await sleep(RETRY_DELAY * Math.pow(2, attempt));
    }
  }
  
  if (showErrorToast) {
    toast.error(lastError?.message || "Network error. Please try again.");
  }
  
  throw lastError;
}

// Convenience methods
export const api = {
  get: <T>(endpoint: string, config?: RequestConfig) =>
    apiClient<T>(endpoint, { ...config, method: "GET" }),
    
  post: <T>(endpoint: string, body: unknown, config?: RequestConfig) =>
    apiClient<T>(endpoint, {
      ...config,
      method: "POST",
      body: JSON.stringify(body),
    }),
    
  patch: <T>(endpoint: string, body: unknown, config?: RequestConfig) =>
    apiClient<T>(endpoint, {
      ...config,
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  put: <T>(endpoint: string, body: unknown, config?: RequestConfig) =>
    apiClient<T>(endpoint, {
      ...config,
      method: "PUT",
      body: JSON.stringify(body),
    }),
    
  delete: <T>(endpoint: string, body?: unknown, config?: RequestConfig) =>
    apiClient<T>(endpoint, {
      ...config,
      method: "DELETE",
      body: body ? JSON.stringify(body) : undefined,
    }),
};
