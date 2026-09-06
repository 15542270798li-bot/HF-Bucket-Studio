import type { Express, Request, Response } from "express";
import { Readable } from "node:stream";
import { createContext } from "./_core/context";
import { getBucketFileUrl, getHuggingFaceToken } from "./huggingface";

const passthroughHeaders = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

async function requireAuthenticated(req: Request, res: Response) {
  const context = await createContext({ req, res } as never);
  if (!context.user) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  return true;
}

export function registerMediaRoutes(app: Express) {
  app.all("/api/media", async (req, res) => {
    if (!(await requireAuthenticated(req, res))) return;

    const bucketId = typeof req.query.bucket === "string" ? req.query.bucket : "";
    const path = typeof req.query.path === "string" ? req.query.path : "";
    const download = req.query.download === "1" || req.query.download === "true";

    try {
      const upstream = await fetch(getBucketFileUrl(bucketId, path), {
        method: req.method === "HEAD" ? "HEAD" : "GET",
        headers: {
          Authorization: `Bearer ${getHuggingFaceToken()}`,
          ...(typeof req.headers.range === "string" ? { Range: req.headers.range } : {}),
          ...(typeof req.headers["if-none-match"] === "string"
            ? { "If-None-Match": req.headers["if-none-match"] }
            : {}),
        },
        redirect: "follow",
      });

      res.status(upstream.status);
      for (const header of passthroughHeaders) {
        const value = upstream.headers.get(header);
        if (value) res.setHeader(header, value);
      }
      res.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=60");
      res.setHeader(
        "Content-Disposition",
        `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(path.split("/").pop() || "download")}`
      );

      if (req.method === "HEAD" || !upstream.body) {
        res.end();
        return;
      }

      Readable.fromWeb(upstream.body as never).pipe(res);
    } catch (error) {
      if (!res.headersSent) {
        res.status(400).json({ error: error instanceof Error ? error.message : "Unable to proxy media" });
      } else {
        res.end();
      }
    }
  });
}
