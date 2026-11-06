// RootFree server: serves the built app and keeps the tree in SQLite.
//
//   GET  /api/tree     the whole tree: { people: { id: {...} }, relationships: [...] }
//   POST /api/changes  apply a batch of changes (see db.ts)
//   GET  /api/health   for the container health check
//
// Environment: PORT (default 3000), DB_PATH (default data/rootfree.db),
// PUBLIC_DIR (default dist, the output of `npm run build`).

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openDatabase, ValidationError, type TreeDatabase } from "./db.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Photos travel inside person records as data URLs, so allow large bodies.
const MAX_BODY_BYTES = 25 * 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface RunningServer {
  server: Server;
  port: number;
  close(): Promise<void>;
}

export async function startServer({
  port = 3000,
  dbPath = join(ROOT, "data", "rootfree.db"),
  publicDir = join(ROOT, "dist"),
}: { port?: number; dbPath?: string; publicDir?: string } = {}): Promise<RunningServer> {
  if (dbPath !== ":memory:") await mkdir(dirname(dbPath), { recursive: true });
  const db = openDatabase(dbPath);
  const root = resolve(publicDir);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname.startsWith("/api/")) await handleApi(req, res, url.pathname, db);
      else await serveStatic(req, res, url.pathname, root);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : e instanceof ValidationError ? 400 : 500;
      if (status === 500) console.error(e);
      const message = status === 500 ? "Internal error" : (e as Error).message;
      if (!res.headersSent) sendJson(res, status, { error: message });
      else res.destroy();
    }
  });

  await new Promise<void>((ok) => server.listen(port, ok));
  const address = server.address();
  return {
    server,
    port: typeof address === "object" && address ? address.port : port,
    close: () =>
      new Promise<void>((ok) => {
        server.close(() => {
          db.close();
          ok();
        });
        server.closeAllConnections();
      }),
  };
}

async function handleApi(req: IncomingMessage, res: ServerResponse, path: string, db: TreeDatabase): Promise<void> {
  if (path === "/api/health" && req.method === "GET") return sendJson(res, 200, { ok: true });
  if (path === "/api/tree" && req.method === "GET") return sendJson(res, 200, db.getTree());
  if (path === "/api/changes" && req.method === "POST") {
    const text = await readBody(req);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new HttpError(400, "Body must be JSON");
    }
    db.applyChanges(body);
    return sendJson(res, 200, { ok: true });
  }
  throw new HttpError(404, "Not found");
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string, root: string): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "Method not allowed");
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, "Bad path");
  }
  if (rel.endsWith("/")) rel += "index.html";
  const file = resolve(root, "." + rel);
  if (!file.startsWith(root + sep)) throw new HttpError(404, "Not found");
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) throw new HttpError(404, "Not found");

  const headers = {
    "Content-Type": CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "Last-Modified": info.mtime.toUTCString(),
    // Always revalidate, so a new deploy shows up on the next load.
    "Cache-Control": "no-cache",
  };
  const since = req.headers["if-modified-since"];
  if (since && Date.parse(since) >= Math.floor(info.mtime.getTime() / 1000) * 1000) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  const body = await readFile(file);
  res.writeHead(200, { ...headers, "Content-Length": body.length });
  res.end(req.method === "HEAD" ? undefined : body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      // Past the limit, keep reading but drop the data, then answer 413.
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on("end", () =>
      size > MAX_BODY_BYTES
        ? fail(new HttpError(413, "Request too large"))
        : ok(Buffer.concat(chunks).toString("utf8")),
    );
    req.on("error", fail);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

// Run directly: node server/server.ts
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const app = await startServer({
    port: Number(process.env.PORT) || 3000,
    dbPath: process.env.DB_PATH ? resolve(process.env.DB_PATH) : undefined,
    publicDir: process.env.PUBLIC_DIR ? resolve(process.env.PUBLIC_DIR) : undefined,
  });
  console.log(`RootFree listening on http://localhost:${app.port}`);
  const stop = async () => {
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
