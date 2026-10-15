"use strict";

const { createServer } = require("node:http");
const { randomBytes, randomUUID } = require("node:crypto");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT) || 3000;
const allowedOrigins = new Set(
  process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
    : [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`],
);
const BYTES_PER_MB = 1024 * 1024;
const MAX_SESSION_BYTES = 1000 * BYTES_PER_MB;
const MAX_CHUNK_BYTES = BYTES_PER_MB;
const RANDOM_CHUNK_BYTES = 64 * 1024;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const sessions = new Map();

function sendJson(response, statusCode, data) {
  const body = Buffer.from(JSON.stringify(data));
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function handleCors(request, response) {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    sendJson(response, 403, { error: "This website is not allowed to use the transfer server." });
    return false;
  }

  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-Id");
    response.setHeader("Access-Control-Expose-Headers", "Content-Length");
    response.setHeader("Access-Control-Max-Age", "600");
    response.setHeader("Vary", "Origin");
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return false;
  }
  return true;
}

function getSession(request, mode, bytes) {
  const id = request.headers["x-session-id"];
  const session = sessions.get(id);

  if (!session) {
    return { error: { status: 401, message: "Session not found. Start a new transfer." } };
  }
  if (session.mode !== mode) {
    return { error: { status: 400, message: "This session is configured for a different transfer direction." } };
  }
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_CHUNK_BYTES) {
    return { error: { status: 400, message: "Each transfer request must be between 1 byte and 1 MiB." } };
  }
  if (session.usedBytes + bytes > session.limitBytes) {
    return { error: { status: 409, message: "The session data limit has been reached." } };
  }

  session.usedBytes += bytes;
  session.activeRequests += 1;
  session.lastActivity = Date.now();
  return { session };
}

async function* randomData(bytes) {
  for (let remaining = bytes; remaining > 0;) {
    const size = Math.min(remaining, RANDOM_CHUNK_BYTES);
    yield randomBytes(size);
    remaining -= size;
  }
}

async function readJson(request) {
  const chunks = [];
  let length = 0;

  for await (const chunk of request) {
    length += chunk.length;
    if (length > 1024) {
      throw Object.assign(new Error("Request body is too large."), { status: 413 });
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    const html = await readFile(join(__dirname, "index.html"));
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": html.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(html);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/session") {
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      sendJson(response, 400, { error: "Request body must contain a session limit and direction." });
      return;
    }
    const limitBytes = body.limitBytes;
    const mode = body.mode;

    if (!Number.isSafeInteger(limitBytes) || limitBytes < 1 || limitBytes > MAX_SESSION_BYTES) {
      sendJson(response, 400, { error: "Session limit must be between 1 byte and 1,000 MiB." });
      return;
    }
    if (mode !== "download" && mode !== "upload") {
      sendJson(response, 400, { error: "Choose either download or upload." });
      return;
    }

    const id = randomUUID();
    sessions.set(id, {
      mode,
      limitBytes,
      usedBytes: 0,
      activeRequests: 0,
      lastActivity: Date.now(),
    });
    sendJson(response, 201, { id, maxChunkBytes: MAX_CHUNK_BYTES });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/download") {
    const bytes = Number(url.searchParams.get("bytes"));
    const result = getSession(request, "download", bytes);
    if (result.error) {
      sendJson(response, result.error.status, { error: result.error.message });
      return;
    }

    response.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": bytes,
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    });
    try {
      await pipeline(Readable.from(randomData(bytes)), response);
    } finally {
      result.session.activeRequests -= 1;
      result.session.lastActivity = Date.now();
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/upload") {
    const bytes = Number(url.searchParams.get("bytes"));
    const contentLength = Number(request.headers["content-length"]);
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_CHUNK_BYTES) {
      sendJson(response, 400, { error: "Each transfer request must be between 1 byte and 1 MiB." });
      request.resume();
      return;
    }
    if (!Number.isSafeInteger(contentLength) || contentLength !== bytes) {
      sendJson(response, 411, { error: "Upload Content-Length must match the requested byte count." });
      request.resume();
      return;
    }

    const result = getSession(request, "upload", bytes);
    if (result.error) {
      sendJson(response, result.error.status, { error: result.error.message });
      request.resume();
      return;
    }

    let receivedBytes = 0;
    try {
      for await (const chunk of request) {
        receivedBytes += chunk.length;
        if (receivedBytes > bytes) {
          sendJson(response, 413, { error: "Upload exceeded its declared size." });
          request.destroy();
          return;
        }
      }
      if (receivedBytes !== bytes) {
        sendJson(response, 400, { error: "Upload ended before all declared bytes arrived." });
        return;
      }
      result.session.lastActivity = Date.now();
      sendJson(response, 200, { receivedBytes });
    } finally {
      result.session.activeRequests -= 1;
      result.session.lastActivity = Date.now();
    }
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "API route not found." });
    return;
  }

  sendJson(response, 404, { error: "Not found." });
}

const server = createServer((request, response) => {
  if (!handleCors(request, response)) return;
  handleRequest(request, response).catch((error) => {
    if (response.headersSent || response.destroyed) {
      response.destroy();
      return;
    }
    sendJson(response, error.status || 500, {
      error: error.status ? error.message : "The server could not complete the request.",
    });
  });
});

const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - SESSION_IDLE_MS;
  for (const [id, session] of sessions) {
    if (session.activeRequests === 0 && session.lastActivity < cutoff) {
      sessions.delete(id);
    }
  }
}, 60_000);
cleanupTimer.unref();

server.listen(PORT, HOST, () => {
  console.log(`Data Waster listening on http://${HOST}:${PORT}`);
});

server.on("error", (error) => {
  console.error("Data Waster server failed to start:", error.message);
  process.exitCode = 1;
});
