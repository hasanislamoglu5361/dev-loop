const BASE_URL = '/api';

interface ApiError extends Error {
  status?: number;
}

function createApiError(message: string, status?: number): ApiError {
  const error = new Error(message) as ApiError;
  error.name = 'ApiError';
  error.status = status;
  return error;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      message = body.message || body.error || message;
    } catch {
      // Response may not be JSON-parseable (e.g., HTML error page)
    }
    throw createApiError(message, response.status);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }
  return undefined as T;
}

export interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

function buildUrl(path: string, params?: FetchOptions['params']): string {
  const url = new URL(`${BASE_URL}${path}`, globalThis.location?.origin ?? 'http://localhost');
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      url.searchParams.append(key, String(value));
    }
  }
  return globalThis.location ? `${url.pathname}${url.search}` : url.toString();
}

export async function apiGet<T>(path: string, options?: FetchOptions): Promise<T> {
  const url = buildUrl(path, options?.params);
  return handleResponse<T>(await fetch(url, { ...options, method: 'GET' }));
}

export async function apiPost<T>(path: string, data?: unknown, options?: FetchOptions): Promise<T> {
  const url = buildUrl(path, options?.params);
  return handleResponse<T>(await fetch(url, {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: data ? JSON.stringify(data) : undefined,
  }));
}

export async function apiPut<T>(path: string, data?: unknown, options?: FetchOptions): Promise<T> {
  const url = buildUrl(path, options?.params);
  return handleResponse<T>(await fetch(url, {
    ...options,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: data ? JSON.stringify(data) : undefined,
  }));
}

export async function apiDelete<T>(path: string, options?: FetchOptions): Promise<T> {
  const url = buildUrl(path, options?.params);
  return handleResponse<T>(await fetch(url, { ...options, method: 'DELETE' }));
}

// Dashboard API types
export interface ApiDashboardMetrics {
  activeLoops: number;
  successRate: number;
  costUsd: number;
}

export interface ApiRecentLoop {
  id: string;
  feature?: string;
  status?: string;
}

export interface ApiDashboardData {
  status: string;
  metrics: ApiDashboardMetrics;
  recentLoops: ApiRecentLoop[];
  anomaly?: string;
}

// API client methods
export const api = {
  getDashboard: () => apiGet<ApiDashboardData>('/dashboard'),
  getLoops: (params?: { limit?: number; offset?: number }) =>
    apiGet<{ loops: ApiRecentLoop[]; total: number }>('/loops', { params }),
  runLoop: () => apiPost<{ action: string; accepted: boolean }>('/loop-control/run'),
  verify: () => apiPost<{ action: string; accepted: boolean }>('/loop-control/verify'),
  build: () => apiPost<{ action: string; accepted: boolean }>('/loop-control/build'),
};

export default api;
