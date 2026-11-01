import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { loadConfig } from '@wp-agent/config';
import { AuditLogger } from '@wp-agent/audit';
import { ModelAdapter } from '@wp-agent/model-adapters';
import { WordPressClient } from '@wp-agent/wp-client';
import { CoreRequest, CoreResponse, handleRequest } from '@wp-agent/api-core';

/**
 * The endpoint logic itself lives in `@wp-agent/api-core` so that the exact
 * same behaviour can run behind this Node server (local development) and
 * inside Next.js route handlers on Vercel (hosted). This file is only the
 * Node HTTP adapter plus the process entry point.
 */
export * from '@wp-agent/api-core';

export interface AppServerContext {
  server: Server;
  auditLogger: AuditLogger;
  port: number;
  host: string;
}

/** Hard cap on buffered request bodies for the standalone server (defence in depth). */
const MAX_BUFFERED_BODY_BYTES = 1_048_576;

function readAll(req: IncomingMessage, maxBytes = MAX_BUFFERED_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytesRead = 0;

    req.on('data', (chunk: Buffer) => {
      bytesRead += chunk.length;
      if (bytesRead > maxBytes) {
        reject(new Error(`Request body exceeds maximum size of ${maxBytes} bytes.`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', (err) => reject(err));
  });
}

/**
 * Adapts an `IncomingMessage` to the transport-neutral request contract used by
 * the core handler. The body is read lazily and memoised so that the endpoint
 * logic keeps its original "read once" semantics.
 */
export function toCoreRequest(req: IncomingMessage): CoreRequest {
  let bodyPromise: Promise<string> | null = null;

  return {
    url: req.url,
    method: req.method,
    headers: req.headers as Record<string, string | string[] | undefined>,
    socket: { remoteAddress: req.socket.remoteAddress ?? undefined },
    bodyText: () => {
      bodyPromise ??= readAll(req);
      return bodyPromise;
    },
    onClose: (cb: () => void) => {
      req.on('close', cb);
    },
  };
}

/** Adapts a `ServerResponse` to the transport-neutral response contract. */
export function toCoreResponse(res: ServerResponse): CoreResponse {
  return {
    get writableEnded() {
      return res.writableEnded;
    },
    writeHead(status: number, headers?: Record<string, string>) {
      res.writeHead(status, headers);
    },
    write(chunk: string) {
      res.write(chunk);
    },
    end(chunk?: string) {
      res.end(chunk);
    },
  };
}

/**
 * Builds and returns the HTTP server instance.
 */
export function buildServer(
  auditLogger = new AuditLogger(),
  customAdapter?: ModelAdapter,
  customWpClient?: WordPressClient
): Server {
  return createServer((req, res) => {
    void handleRequest(
      toCoreRequest(req),
      toCoreResponse(res),
      auditLogger,
      customAdapter,
      customWpClient
    ).catch((err: unknown) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(
        JSON.stringify({ error: 'INTERNAL_ERROR', message: (err as Error).message })
      );
    });
  });
}

/**
 * Starts the server on the configured port, binding strictly to 127.0.0.1 (localhost).
 */
export function startServer(
  customPort?: number,
  customAdapter?: ModelAdapter,
  customWpClient?: WordPressClient
): Promise<AppServerContext> {
  const config = loadConfig();
  const port = customPort ?? config.port;
  const host = '127.0.0.1'; // Strictly localhost: never bind to 0.0.0.0 or public interfaces
  const auditLogger = new AuditLogger();
  const server = buildServer(auditLogger, customAdapter, customWpClient);

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      resolve({ server, auditLogger, port, host });
    });
  });
}

// Self-start if invoked directly via node
if (process.argv[1]?.endsWith('index.js')) {
  startServer().then(({ port, host }) => {
    // eslint-disable-next-line no-console
    console.log(`KPH SitePilot API listening on http://${host}:${port}`);
  });
}
