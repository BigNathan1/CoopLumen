import { createServer, request, type IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';

/** Where the gateway forwards each kind of request. */
export interface GatewayOptions {
  /** Port the gateway listens on. */
  port: number;
  /** Origin of the Next.js frontend. */
  appUrl: string;
  /** Origin of the backend API. */
  apiUrl: string;
}

/** A running gateway. */
export interface Gateway {
  /** Origin the browser should use for every request. */
  url: string;
  /** Stops the gateway and releases the port. */
  close: () => Promise<void>;
}

/** Requests under `/api` belong to the backend; everything else is the app. */
function isApiRequest(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

/**
 * Serves the frontend app and the backend API from a single origin.
 *
 * A browser hands a response to the page only when the response comes from
 * the page's own origin, or when the server explicitly opts into credentialed
 * cross-origin requests. The app and the API run on different ports, so a
 * suite that loads the page from one and calls the other from the other never
 * sees any data — the browser drops the response before the app can read it.
 *
 * The gateway removes that constraint for the suite: the page, its assets and
 * the API all live under one origin, the same shape a deployment gets when it
 * sits behind a reverse proxy. The upstream services are untouched, and the
 * suite still exercises the real frontend against the real backend.
 */
export async function startGateway(options: GatewayOptions): Promise<Gateway> {
  const appTarget = new URL(options.appUrl);
  const apiTarget = new URL(options.apiUrl);

  const server = createServer((req, res) => {
    const requestPath = req.url ?? '/';
    const pathname = new URL(requestPath, 'http://gateway').pathname;
    const target = isApiRequest(pathname) ? apiTarget : appTarget;

    const upstream = request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        method: req.method,
        path: requestPath,
        headers: { ...req.headers, host: target.host },
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      }
    );

    upstream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      }
      res.end('The E2E gateway could not reach the upstream service.');
    });

    req.pipe(upstream);
  });

  // The dev server opens a websocket for hot reload. The suite does not need
  // it, and an upgrade nobody answers would keep the socket open forever.
  server.on('upgrade', (_req: IncomingMessage, socket: Socket) => socket.destroy());

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.listen(options.port, '127.0.0.1', () => {
      server.off('error', onError);
      resolve();
    });
  });

  return {
    url: `http://127.0.0.1:${options.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
