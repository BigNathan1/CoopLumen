/**
 * Typed fetch wrapper for the CoopLumen backend API.
 *
 * Every backend route replies with the same envelope:
 *
 * ```json
 * { "data": <payload>, "error": <string | { code, message } | null>, "meta": { ... } }
 * ```
 *
 * This module centralises the three things every caller would otherwise repeat:
 *
 * - **Base URL** - resolved once from `NEXT_PUBLIC_API_URL` (defaults to
 *   `http://localhost:4000`) so callers pass paths such as `/api/v1/communities`.
 * - **Auth header injection** - a pluggable token provider means components and
 *   hooks never touch storage or wallet state to build an `Authorization` header.
 * - **Error handling** - non-2xx responses, malformed bodies, network failures
 *   and timeouts all surface as a single {@link ApiError} with a stable `code`,
 *   so UI code has exactly one error shape to render.
 */

/** Default backend origin used when `NEXT_PUBLIC_API_URL` is not configured. */
export const DEFAULT_BASE_URL = 'http://localhost:4000';

/** Default per-request timeout in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** Field-level validation failure, as returned in `meta.errors` by the backend. */
export interface ApiFieldError {
  path: string;
  message: string;
}

/** The envelope every CoopLumen API route responds with. */
export interface ApiEnvelope<T> {
  data: T;
  error?: string | { code?: string; message?: string } | null;
  meta?: Record<string, unknown>;
}

/** Stable error codes produced by this client for failures without an HTTP status. */
export const ApiErrorCode = {
  NETWORK: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  ABORTED: 'ABORTED',
  MALFORMED_RESPONSE: 'MALFORMED_RESPONSE',
  HTTP_ERROR: 'HTTP_ERROR',
} as const;

interface ApiErrorOptions {
  status?: number;
  code?: string;
  details?: ApiFieldError[];
  meta?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * The single error type thrown by every request helper in this module.
 *
 * `status` is the HTTP status code, or `0` when the request never produced a
 * response (network failure, timeout, caller abort).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiFieldError[];
  readonly meta?: Record<string, unknown>;
  readonly cause?: unknown;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status ?? 0;
    this.code = options.code ?? ApiErrorCode.HTTP_ERROR;
    this.details = options.details ?? [];
    this.meta = options.meta;
    this.cause = options.cause;
    // Keeps `instanceof ApiError` working when compiled down to ES5 classes.
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /** True when the failure is a 4xx the caller could fix by changing its input. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  /** True when the server failed or was unreachable, so a retry may succeed. */
  get isServerError(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

/** Narrows an unknown caught value to {@link ApiError}. */
export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Supplies the bearer token for outgoing requests. May be async. */
export type AuthTokenProvider = () =>
  | string
  | null
  | undefined
  | Promise<string | null | undefined>;

interface ApiConfig {
  baseUrl?: string;
  timeoutMs?: number;
  getAuthToken?: AuthTokenProvider;
}

const config: ApiConfig = {};

/**
 * Overrides client defaults. Call once during app bootstrap; every field is
 * optional and only the provided fields are replaced.
 */
export function configureApi(next: ApiConfig): void {
  Object.assign(config, next);
}

/** Resets every override applied by {@link configureApi}. Intended for tests. */
export function resetApiConfig(): void {
  delete config.baseUrl;
  delete config.timeoutMs;
  delete config.getAuthToken;
}

/**
 * Registers the source of the `Authorization` bearer token. Pass a function so
 * the token is read at request time rather than captured once at startup.
 */
export function setAuthTokenProvider(provider: AuthTokenProvider | null): void {
  config.getAuthToken = provider ?? undefined;
}

/** Convenience wrapper over {@link setAuthTokenProvider} for a static token. */
export function setAuthToken(token: string | null): void {
  setAuthTokenProvider(token === null ? null : () => token);
}

/** The origin every relative path is resolved against. */
export function getBaseUrl(): string {
  const raw = config.baseUrl ?? process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_BASE_URL;
  return raw.replace(/\/+$/, '');
}

/** Values accepted as query-string parameters. Nullish entries are dropped. */
export type QueryValue = string | number | boolean | null | undefined | Array<string | number>;

export interface RequestOptions extends Omit<RequestInit, 'body' | 'method'> {
  /** Query parameters appended to the path. Nullish values are omitted. */
  query?: Record<string, QueryValue>;
  /** Request payload. Plain objects are JSON-encoded automatically. */
  body?: unknown;
  /** Abort the request after this many milliseconds. `0` disables the timeout. */
  timeoutMs?: number;
  /** Set to `false` to send the request without an `Authorization` header. */
  auth?: boolean;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const isAbsolute = /^https?:\/\//i.test(path);
  const base = isAbsolute ? path : `${getBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;

  if (!query) return base;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, String(entry)));
    } else {
      params.append(key, String(value));
    }
  }

  const search = params.toString();
  if (!search) return base;
  return `${base}${base.includes('?') ? '&' : '?'}${search}`;
}

/** True for payloads that should be JSON-encoded rather than passed through. */
function isJsonSerialisable(body: unknown): boolean {
  if (body === null || body === undefined) return false;
  if (typeof body === 'string') return false;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return false;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return false;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return false;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return false;
  return true;
}

async function buildHeaders(
  init: HeadersInit | undefined,
  jsonBody: boolean,
  auth: boolean
): Promise<Headers> {
  const headers = new Headers(init);
  headers.set('Accept', 'application/json');
  if (jsonBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (auth && !headers.has('Authorization') && config.getAuthToken) {
    const token = await config.getAuthToken();
    if (token) {
      // A caller-supplied scheme ("Bearer x", "Basic y") is passed through as-is.
      headers.set('Authorization', /^\S+\s/.test(token) ? token : `Bearer ${token}`);
    }
  }

  return headers;
}

/** Extracts `meta.errors` when the backend reports field-level validation issues. */
function readFieldErrors(meta: unknown): ApiFieldError[] {
  if (typeof meta !== 'object' || meta === null) return [];
  const errors = (meta as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];

  return errors.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const candidate = entry as Partial<ApiFieldError>;
    if (typeof candidate.message !== 'string') return [];
    return [{ path: String(candidate.path ?? ''), message: candidate.message }];
  });
}

function readErrorMessage(error: ApiEnvelope<unknown>['error'], fallback: string): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (typeof error === 'object' && error !== null && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

function readErrorCode(error: ApiEnvelope<unknown>['error'], status: number): string {
  if (typeof error === 'object' && error !== null && typeof error.code === 'string') {
    return error.code;
  }
  return `HTTP_${status}`;
}

function statusFallbackMessage(response: Response): string {
  const suffix = response.statusText ? ` ${response.statusText}` : '';
  return `Request failed with status ${response.status}${suffix}`;
}

/** Reads and parses the response body, tolerating empty and 204/205 responses. */
async function readEnvelope(response: Response): Promise<ApiEnvelope<unknown> | null> {
  if (response.status === 204 || response.status === 205) return null;

  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as ApiEnvelope<unknown>;
  } catch {
    throw new ApiError(
      response.ok
        ? 'The server returned a response that was not valid JSON.'
        : statusFallbackMessage(response),
      { status: response.status, code: ApiErrorCode.MALFORMED_RESPONSE }
    );
  }
}

/**
 * Performs a request and returns the full response envelope, so callers that
 * need pagination `meta` do not have to make a second request.
 *
 * @throws {ApiError} for non-2xx responses, malformed bodies, network failures,
 *   caller aborts and timeouts.
 */
export async function requestRaw<T>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {}
): Promise<ApiEnvelope<T>> {
  const { query, body, timeoutMs, auth = true, headers: headerInit, signal, ...rest } = options;

  const jsonBody = isJsonSerialisable(body);
  const headers = await buildHeaders(headerInit, jsonBody, auth);
  const timeout = timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  if (signal) {
    if (signal.aborted) {
      throw new ApiError('The request was cancelled.', { code: ApiErrorCode.ABORTED });
    }
    signal.addEventListener('abort', abortFromCaller, { once: true });
  }

  if (timeout > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...rest,
      method,
      headers,
      body: jsonBody ? JSON.stringify(body) : (body as BodyInit | null | undefined),
      signal: controller.signal,
    });
  } catch (err) {
    if (timedOut) {
      throw new ApiError(`The request timed out after ${timeout}ms.`, {
        code: ApiErrorCode.TIMEOUT,
        cause: err,
      });
    }
    if (controller.signal.aborted) {
      throw new ApiError('The request was cancelled.', { code: ApiErrorCode.ABORTED, cause: err });
    }
    throw new ApiError('Unable to reach the CoopLumen API. Check your connection and try again.', {
      code: ApiErrorCode.NETWORK,
      cause: err,
    });
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }

  const envelope = await readEnvelope(response);

  if (!response.ok) {
    throw new ApiError(readErrorMessage(envelope?.error, statusFallbackMessage(response)), {
      status: response.status,
      code: readErrorCode(envelope?.error, response.status),
      details: readFieldErrors(envelope?.meta),
      meta: envelope?.meta,
    });
  }

  return (envelope ?? { data: undefined as T }) as ApiEnvelope<T>;
}

/** Performs a request and unwraps `data` from the response envelope. */
export async function request<T>(
  method: HttpMethod,
  path: string,
  options?: RequestOptions
): Promise<T> {
  const envelope = await requestRaw<T>(method, path, options);
  return envelope.data;
}

/** Typed helpers for the verbs the backend exposes. */
export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
  raw: requestRaw,
  request,
};

/**
 * SWR-compatible fetcher that unwraps the envelope and throws {@link ApiError}.
 *
 * ```ts
 * useSWR<Community[]>('/api/v1/communities', swrFetcher);
 * ```
 */
export function swrFetcher<T>(path: string): Promise<T> {
  return api.get<T>(path);
}
