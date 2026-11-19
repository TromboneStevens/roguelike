// Minimal Node HTTP static file server for the built client in dist/client.
//
// No external dependencies: it uses only node:http / node:fs / node:path. It serves
// index.html, bundle.js, its sourcemap, and any static assets copied from public/,
// mapping "/" to index.html. Requests are resolved strictly inside the client
// directory so a crafted path (e.g. "/../../etc/passwd" or an encoded variant) cannot
// escape it. The created server is returned un-listened so index.ts can attach the
// WebSocket server to the same instance before binding a port.

import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Extension -> Content-Type. Unknown extensions fall back to octet-stream. */
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * Default client directory. When this module is bundled to dist/server/index.js the
 * built client lives at dist/client, i.e. ../client relative to this file.
 */
export function defaultClientDir(): string {
  return resolve(fileURLToPath(import.meta.url), "..", "..", "client");
}

/**
 * Resolve a request URL path to an absolute file path inside `clientDir`, or null if
 * the request tries to escape the directory. Keeps the traversal guard in one place.
 */
export function resolveStaticPath(clientDir: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  } catch {
    return null; // malformed percent-encoding
  }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const target = normalize(join(clientDir, relative));
  // Confine to clientDir: either the dir itself or a child under a path separator.
  if (target !== clientDir && !target.startsWith(clientDir + sep)) {
    return null;
  }
  return target;
}

/** Content-Type for a resolved file path. */
export function contentTypeFor(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Create (but do not start) an HTTP server that serves static files from `clientDir`.
 * The caller attaches a WebSocket server and calls listen().
 */
export function createStaticServer(clientDir: string = defaultClientDir()): Server {
  return createServer(async (req, res) => {
    // Only GET/HEAD make sense for static serving.
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" }).end("Method Not Allowed");
      return;
    }

    const target = resolveStaticPath(clientDir, req.url ?? "/");
    if (target === null) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }).end("Forbidden");
      return;
    }

    try {
      const body = await readFile(target);
      res.writeHead(200, { "Content-Type": contentTypeFor(target) });
      if (req.method === "HEAD") {
        res.end();
      } else {
        res.end(body);
      }
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not Found");
    }
  });
}
