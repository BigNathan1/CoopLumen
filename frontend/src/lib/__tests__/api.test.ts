/**
 * @jest-environment node
 */
import {
  ApiError,
  ApiErrorCode,
  api,
  configureApi,
  getBaseUrl,
  isApiError,
  requestRaw,
  resetApiConfig,
  setAuthToken,
  setAuthTokenProvider,
  setUnauthorizedHandler,
  swrFetcher,
  AUTH_COOKIE_NAME,
  CSRF_HEADER_NAME,
  readCookie,
  setCsrfToken,
} from '../api';

const BASE_URL = 'https://api.cooplumen.test';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

/** The mocked global fetch, typed so assertions can read the call arguments. */
const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();

/** Queues a fresh JSON response for every call (a Response body is single-use). */
function mockJson(body: unknown, init: ResponseInit = {}): void {
  fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(body, init)));
}

/** Reads the `RequestInit` the client passed to `fetch` on a given call. */
function requestInit(call = 0): RequestInit {
  return fetchMock.mock.calls[call][1] as RequestInit;
}

/** Reads the request URL the client built on a given call. */
function requestUrl(call = 0): string {
  return String(fetchMock.mock.calls[call][0]);
}

/** Reads a single outgoing header on a given call. */
function requestHeader(name: string, call = 0): string | null {
  return new Headers(requestInit(call).headers).get(name);
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  resetApiConfig();
  configureApi({ baseUrl: BASE_URL });
});

afterEach(() => {
  resetApiConfig();
});

describe('getBaseUrl', () => {
  it('falls back to the local backend when nothing is configured', () => {
    resetApiConfig();
    const previous = process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;

    expect(getBaseUrl()).toBe('http://localhost:4000');

    if (previous !== undefined) process.env.NEXT_PUBLIC_API_URL = previous;
  });

  it('reads NEXT_PUBLIC_API_URL when no override is configured', () => {
    resetApiConfig();
    const previous = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = 'https://env.cooplumen.test/';

    expect(getBaseUrl()).toBe('https://env.cooplumen.test');

    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = previous;
    }
  });

  it('strips trailing slashes from the configured base URL', () => {
    configureApi({ baseUrl: 'https://api.cooplumen.test///' });
    expect(getBaseUrl()).toBe(BASE_URL);
  });
});

describe('URL building', () => {
  it('prefixes relative paths with the base URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));
    await api.get('/api/v1/communities');
    expect(requestUrl()).toBe(`${BASE_URL}/api/v1/communities`);
  });

  it('adds a leading slash when the caller omits one', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));
    await api.get('api/v1/communities');
    expect(requestUrl()).toBe(`${BASE_URL}/api/v1/communities`);
  });

  it('leaves absolute URLs untouched', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: null }));
    await api.get('https://horizon-testnet.stellar.org/fee_stats');
    expect(requestUrl()).toBe('https://horizon-testnet.stellar.org/fee_stats');
  });

  it('serialises query parameters and drops nullish entries', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));
    await api.get('/api/v1/communities', {
      query: { page: 2, search: 'eco dao', archived: false, cursor: null, sort: undefined },
    });

    const url = new URL(requestUrl());
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('search')).toBe('eco dao');
    expect(url.searchParams.get('archived')).toBe('false');
    expect(url.searchParams.has('cursor')).toBe(false);
    expect(url.searchParams.has('sort')).toBe(false);
  });

  it('repeats array query parameters', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));
    await api.get('/api/v1/communities', { query: { role: ['admin', 'member'] } });
    expect(new URL(requestUrl()).searchParams.getAll('role')).toEqual(['admin', 'member']);
  });

  it('appends to an existing query string instead of replacing it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));
    await api.get('/api/v1/communities?page=1', { query: { limit: 10 } });
    expect(requestUrl()).toBe(`${BASE_URL}/api/v1/communities?page=1&limit=10`);
  });
});

describe('CSRF header injection', () => {
  it('echoes the stored CSRF token on state-changing requests', async () => {
    mockJson({ data: {} });
    setCsrfToken('csrf-123');

    await api.post('/api/v1/communities', { name: 'EcoDAO' });
    await api.put('/api/v1/communities/1', { name: 'EcoDAO' });
    await api.delete('/api/v1/communities/1');

    expect(requestHeader(CSRF_HEADER_NAME, 0)).toBe('csrf-123');
    expect(requestHeader(CSRF_HEADER_NAME, 1)).toBe('csrf-123');
    expect(requestHeader(CSRF_HEADER_NAME, 2)).toBe('csrf-123');
  });

  it('leaves reads without a CSRF header', async () => {
    mockJson({ data: [] });
    setCsrfToken('csrf-123');

    await api.get('/api/v1/communities');

    expect(requestHeader(CSRF_HEADER_NAME)).toBeNull();
  });

  it('sends no CSRF header when no token was issued', async () => {
    mockJson({ data: {} });

    await api.post('/api/v1/communities', { name: 'EcoDAO' });

    expect(requestHeader(CSRF_HEADER_NAME)).toBeNull();
  });

  it('forgets the token when cleared', async () => {
    mockJson({ data: {} });
    setCsrfToken('csrf-123');
    setCsrfToken(null);

    await api.post('/api/v1/communities', { name: 'EcoDAO' });

    expect(requestHeader(CSRF_HEADER_NAME)).toBeNull();
  });
});

describe('auth header injection', () => {
  it('sends no Authorization header when no provider is registered', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: null }));
    await api.get('/api/v1/communities');
    expect(requestHeader('Authorization')).toBeNull();
  });

  it('injects a bearer token from a static token', async () => {
    setAuthToken('abc123');
    fetchMock.mockResolvedValue(jsonResponse({ data: null }));
    await api.get('/api/v1/communities');
    expect(requestHeader('Authorization')).toBe('Bearer abc123');
  });

  it('awaits an async token provider on every request', async () => {
    const provider = jest.fn().mockResolvedValue('async-token');
    setAuthTokenProvider(provider);
    mockJson({ data: null });

    await api.get('/api/v1/communities');
    await api.get('/api/v1/communities');

    expect(provider).toHaveBeenCalledTimes(2);
    expect(requestHeader('Authorization', 1)).toBe('Bearer async-token');
  });

  it('passes through a token that already carries a scheme', async () => {
    setAuthToken('Bearer already-prefixed');
    fetchMock.mockResolvedValue(jsonResponse({ data: null }));
    await api.get('/api/v1/communities');
    expect(requestHeader('Authorization')).toBe('Bearer already-prefixed');
  });

  it('omits the header when the provider resolves to null', async () => {
    setAuthTokenProvider(() => null);
    fetchMock.mockResolvedValue(jsonResponse({ data: null }));
    await api.get('/api/v1/communities');
    expect(requestHeader('Authorization')).toBeNull();
  });

  it('skips injection when auth is disabled for the request', async () => {
    setAuthToken('abc123');
    fetchMock.mockResolvedValue(jsonResponse({ data: null }));
    await api.get('/api/v1/health', { auth: false });
    expect(requestHeader('Authorization')).toBeNull();
  });

  it('does not overwrite an explicit Authorization header', async () => {
    setAuthToken('abc123');
    fetchMock.mockResolvedValue(jsonResponse({ data: null }));
    await api.get('/api/v1/communities', { headers: { Authorization: 'Basic custom' } });
    expect(requestHeader('Authorization')).toBe('Basic custom');
  });

  it('clears the provider when the token is set to null', async () => {
    setAuthToken('abc123');
    setAuthToken(null);
    fetchMock.mockResolvedValue(jsonResponse({ data: null }));
    await api.get('/api/v1/communities');
    expect(requestHeader('Authorization')).toBeNull();
  });

  it('injects JWT from cooplumen_session cookie when no provider is configured', async () => {
    (global as unknown as { document?: { cookie: string } }).document = {
      cookie: `${AUTH_COOKIE_NAME}=jwt-cookie-token; other_cookie=xyz`,
    };
    fetchMock.mockResolvedValue(jsonResponse({ data: null }));

    await api.get('/api/v1/communities');
    expect(requestHeader('Authorization')).toBe('Bearer jwt-cookie-token');

    delete (global as unknown as { document?: { cookie: string } }).document;
  });

  it('sets credentials to include by default for session cookie transit', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: null }));
    await api.get('/api/v1/communities');
    expect(requestInit().credentials).toBe('include');
  });

  it('readCookie helper correctly parses cookies and handles special characters', () => {
    const cookieHeader = 'theme=dark; cooplumen_session=my%2Etoken%2Ehere; lang=en';
    expect(readCookie('cooplumen_session', cookieHeader)).toBe('my.token.here');
    expect(readCookie('theme', cookieHeader)).toBe('dark');
    expect(readCookie('nonexistent', cookieHeader)).toBeNull();
    expect(readCookie('cooplumen_session', null)).toBeNull();
  });
});

describe('request bodies', () => {
  it('JSON-encodes plain objects and sets Content-Type', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: 'uuid-1' } }, { status: 201 }));

    const created = await api.post<{ id: string }>('/api/v1/communities', { name: 'EcoDAO' });

    expect(created).toEqual({ id: 'uuid-1' });
    expect(requestInit().method).toBe('POST');
    expect(requestInit().body).toBe('{"name":"EcoDAO"}');
    expect(requestHeader('Content-Type')).toBe('application/json');
  });

  it('passes FormData through untouched so the browser sets the boundary', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: null }));
    const form = new FormData();
    form.append('avatar', 'blob');

    await api.post('/api/v1/communities/uuid-1/avatar', form);

    expect(requestInit().body).toBe(form);
    expect(requestHeader('Content-Type')).toBeNull();
  });

  it('sends no body and no Content-Type for GET requests', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));
    await api.get('/api/v1/communities');
    expect(requestInit().body).toBeUndefined();
    expect(requestHeader('Content-Type')).toBeNull();
  });

  it('supports every verb helper', async () => {
    mockJson({ data: null });

    await api.put('/api/v1/communities/uuid-1', { name: 'A' });
    await api.patch('/api/v1/communities/uuid-1', { name: 'B' });
    await api.delete('/api/v1/communities/uuid-1');

    expect(requestInit(0).method).toBe('PUT');
    expect(requestInit(1).method).toBe('PATCH');
    expect(requestInit(2).method).toBe('DELETE');
  });
});

describe('response handling', () => {
  it('unwraps data from the envelope', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: 'uuid-1' }], error: null }));
    await expect(api.get('/api/v1/communities')).resolves.toEqual([{ id: 'uuid-1' }]);
  });

  it('exposes meta through requestRaw for paginated endpoints', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [], meta: { page: 1, total: 0 } }));
    const envelope = await requestRaw('GET', '/api/v1/communities');
    expect(envelope.meta).toEqual({ page: 1, total: 0 });
  });

  it('resolves to undefined for a 204 response', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.delete('/api/v1/communities/uuid-1')).resolves.toBeUndefined();
  });

  it('resolves to undefined for an empty 200 body', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    await expect(api.get('/api/v1/communities')).resolves.toBeUndefined();
  });

  it('throws MALFORMED_RESPONSE when a 200 body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>oops</html>', { status: 200 }));

    await expect(api.get('/api/v1/communities')).rejects.toMatchObject({
      code: ApiErrorCode.MALFORMED_RESPONSE,
      status: 200,
    });
  });
});

describe('error handling', () => {
  it('throws ApiError with the message from a string error field', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: null, error: 'Community not found' }, { status: 404 })
    );

    const error = await api.get('/api/v1/communities/missing').catch((e: unknown) => e);

    expect(isApiError(error)).toBe(true);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('Community not found');
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).code).toBe('HTTP_404');
    expect((error as ApiError).isClientError).toBe(true);
    expect((error as ApiError).isServerError).toBe(false);
  });

  it('reads code and message from a structured error field', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          data: null,
          error: { code: 'COMMUNITY_NAME_EXISTS', message: 'A community with this name exists.' },
        },
        { status: 409 }
      )
    );

    const error = (await api.post('/api/v1/communities', {}).catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe('COMMUNITY_NAME_EXISTS');
    expect(error.message).toBe('A community with this name exists.');
    expect(error.status).toBe(409);
  });

  it('collects field errors from meta.errors on a 400', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          data: null,
          error: 'Validation failed',
          meta: { errors: [{ path: 'name', message: 'Too short' }, { message: 'no path' }, null] },
        },
        { status: 400 }
      )
    );

    const error = (await api.post('/api/v1/communities', {}).catch((e: unknown) => e)) as ApiError;

    expect(error.details).toEqual([
      { path: 'name', message: 'Too short' },
      { path: '', message: 'no path' },
    ]);
  });

  it('falls back to the status line when the body carries no error field', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 502, statusText: 'Bad Gateway' }));

    const error = (await api.get('/api/v1/communities').catch((e: unknown) => e)) as ApiError;

    expect(error.message).toBe('Request failed with status 502 Bad Gateway');
    expect(error.isServerError).toBe(true);
  });

  it('maps a fetch rejection to a NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = (await api.get('/api/v1/communities').catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe(ApiErrorCode.NETWORK);
    expect(error.status).toBe(0);
    expect(error.isServerError).toBe(true);
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  it('is catchable as a plain Error and keeps its name', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const error = (await api.get('/api/v1/communities').catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
  });
});

describe('timeouts and cancellation', () => {
  it('aborts the request and throws TIMEOUT once the deadline passes', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );

    const pending = api.get('/api/v1/communities', { timeoutMs: 100 });
    const assertion = expect(pending).rejects.toMatchObject({ code: ApiErrorCode.TIMEOUT });

    await jest.advanceTimersByTimeAsync(100);
    await assertion;

    jest.useRealTimers();
  });

  it('rejects immediately when the caller signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      api.get('/api/v1/communities', { signal: controller.signal })
    ).rejects.toMatchObject({ code: ApiErrorCode.ABORTED });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates a caller abort as ABORTED', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );

    const pending = api.get('/api/v1/communities', { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: ApiErrorCode.ABORTED });
  });
});

describe('swrFetcher', () => {
  it('unwraps data so it can be passed straight to useSWR', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: 'uuid-1' }] }));
    await expect(swrFetcher('/api/v1/communities')).resolves.toEqual([{ id: 'uuid-1' }]);
  });

  it('rejects with an ApiError so SWR exposes a typed error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: null, error: 'nope' }, { status: 500 }));
    await expect(swrFetcher('/api/v1/communities')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('setUnauthorizedHandler', () => {
  it('invokes the handler when receiving a 401 Unauthorized response', async () => {
    const handler = jest.fn();
    setUnauthorizedHandler(handler);

    fetchMock.mockResolvedValue(
      jsonResponse({ data: null, error: 'Authentication required' }, { status: 401 })
    );

    await expect(api.get('/api/v1/protected')).rejects.toMatchObject({
      status: 401,
      name: 'ApiError',
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not invoke the handler for non-401 errors or successful requests', async () => {
    const handler = jest.fn();
    setUnauthorizedHandler(handler);

    // 200 OK
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: 'ok' }, { status: 200 }));
    await api.get('/api/v1/public');
    expect(handler).not.toHaveBeenCalled();

    // 400 Bad Request
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'bad' }, { status: 400 }));
    await expect(api.get('/api/v1/public')).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();

    // 403 Forbidden
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'forbidden' }, { status: 403 }));
    await expect(api.get('/api/v1/public')).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();

    // 500 Internal Error
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'error' }, { status: 500 }));
    await expect(api.get('/api/v1/public')).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('clears the handler when resetApiConfig is called', async () => {
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    resetApiConfig();

    fetchMock.mockResolvedValue(
      jsonResponse({ data: null, error: 'Authentication required' }, { status: 401 })
    );

    await expect(api.get('/api/v1/protected')).rejects.toMatchObject({ status: 401 });
    expect(handler).not.toHaveBeenCalled();
  });
});
