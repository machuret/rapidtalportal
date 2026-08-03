/**
 * Centralized API client with auth, retries, and error handling
 * Enterprise-grade fetch wrapper for all API calls
 */

import { toast } from "sonner";
import { errorMessage } from "@/lib/error-message";

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiRequestClass = "read" | "mutation" | "ai" | "extended_ai" | "background";

export const API_REQUEST_TIMEOUTS: Record<ApiRequestClass, number> = {
  read: 20_000,
  mutation: 30_000,
  ai: 75_000,
  extended_ai: 190_000,
  background: 310_000,
};

export interface RequestConfig extends RequestInit {
  retries?: number;
  showErrorToast?: boolean;
  /** Named operation budget. Prefer this over a one-off timeout. */
  requestClass?: ApiRequestClass;
  /** Explicit total deadline across all attempts, for exceptional endpoints. */
  timeoutMs?: number;
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

const EXTENDED_AI_ROUTES = [
  "/api/content/topics/generate",
  "/api/content/competitors/intelligence",
  "/api/content/voice-evaluations",
  "/api/content/style-analysis",
  "/api/content/generate",
  "/api/content/quick-draft",
  "/api/content/rewrite",
  "/api/content/adapt",
  "/api/brain/opportunities",
  "/api/vault/linkedin",
  "/api/company-dna/scrape",
  "/api/kb/generate",
  "/api/admin/library/index",
];
const AI_ROUTES = [
  "/api/vault/ask",
  "/api/vault/expand",
  "/api/vault/refresh-dossier",
  "/api/brain/onboard",
  "/api/brain/memory/distill",
  "/api/vault/crawl-site/advance",
  "/api/sops/generate",
  "/api/sops/suggestions/produce",
];
const BACKGROUND_ROUTES = ["/api/vault/index-batch"];

export function apiRequestClassFor(url: string, method: string): ApiRequestClass {
  const path = url.split("?")[0];
  if (method === "GET" || method === "HEAD") return "read";
  if (BACKGROUND_ROUTES.some((route) => path === route)) return "background";
  if (EXTENDED_AI_ROUTES.some((route) => path === route)) return "extended_ai";
  if (/^\/api\/vault\/[^/]+\/reprocess$/u.test(path)
    || /^\/api\/admin\/library\/[^/]+\/action$/u.test(path)) return "extended_ai";
  if (path.startsWith("/api/tools/") || AI_ROUTES.some((route) => path === route)) return "ai";
  return "mutation";
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function apiClient<T>(
  endpoint: string,
  config: RequestConfig = {}
): Promise<T> {
  const {
    retries = MAX_RETRIES,
    showErrorToast = true,
    idempotent,
    requestClass,
    timeoutMs,
    ...fetchConfig
  } = config;

  // Only auto-retry requests that are safe to repeat. GET/HEAD are always safe;
  // a write (POST/PATCH/DELETE) is retried only when the caller explicitly marks
  // the endpoint idempotent, otherwise a single network blip after the server
  // already committed would create a duplicate record.
  const method = (fetchConfig.method ?? "GET").toUpperCase();
  const canRetry = idempotent ?? (method === "GET" || method === "HEAD");
  const maxAttempts = canRetry ? Math.max(1, retries) : 1;

  // Normalise to exactly one "/api" prefix. Call sites are inconsistent — most
  // pass "/kb/generate" or "sops", a few pass "/api/admin/users" — but every
  // route lives under /api. Without this, leading-slash paths like "/kb/generate"
  // were fetched verbatim and 404'd (or hit a page route), silently breaking
  // most mutations across the app.
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = path === "/api" || path.startsWith("/api/") ? path : `/api${path}`;
  const resolvedClass = requestClass ?? apiRequestClassFor(url, method);
  const resolvedTimeoutMs = timeoutMs ?? API_REQUEST_TIMEOUTS[resolvedClass];
  
  const defaultHeaders: HeadersInit = {
    "Content-Type": "application/json",
  };
  
  let lastError: Error | null = null;
  const deadline = new AbortController();
  let didTimeout = false;
  const deadlineTimer = setTimeout(() => {
    didTimeout = true;
    deadline.abort();
  }, resolvedTimeoutMs);
  const callerSignal = fetchConfig.signal;
  const abortFromCaller = () => deadline.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const signal = deadline.signal;
  
  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          ...fetchConfig,
          signal,
          headers: {
            ...defaultHeaders,
            ...fetchConfig.headers,
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new ApiError(
            errorMessage(errorData, `Request failed with status ${response.status}`),
            response.status,
            typeof errorData?.code === "string" ? errorData.code : "UNKNOWN_ERROR",
            errorData && typeof errorData === "object" ? errorData : {},
          );
        }

        // Handle empty responses (DELETE, etc.)
        if (response.status === 204) {
          return undefined as T;
        }

        return await response.json() as T;
      } catch (error) {
        if (didTimeout) {
          lastError = new ApiError(
            "This request is taking longer than expected. Please try again.",
            408,
            "REQUEST_TIMEOUT",
          );
          break;
        }
        if (callerSignal?.aborted) {
          lastError = error instanceof Error ? error : new DOMException("Aborted", "AbortError");
          break;
        }
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry client errors (4xx) except 429 — but DO fall through to
        // the shared toast+throw below. Throwing here directly made every
        // actionable 409/422 silent (callers were told "the client surfaces it").
        if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) {
          if (error.statusCode !== 429) break;
        }

        // Last attempt failed
        if (attempt === maxAttempts - 1) break;

        // Exponential backoff
        await sleep(RETRY_DELAY * Math.pow(2, attempt));
      }
    }
  } finally {
    clearTimeout(deadlineTimer);
    callerSignal?.removeEventListener("abort", abortFromCaller);
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
