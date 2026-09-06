import crypto from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { ENV } from "./_core/env";

export const ACCESS_COOKIE_NAME = "hf_bucket_access";
const ACCESS_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

type AccessPrincipal = {
  id: 0;
  openId: "password-access";
  name: string;
  email: null;
  loginMethod: "password";
  role: "admin";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

export const ACCESS_PRINCIPAL: AccessPrincipal = {
  id: 0,
  openId: "password-access",
  name: "HF Bucket Studio",
  email: null,
  loginMethod: "password",
  role: "admin",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  lastSignedIn: new Date(),
};

function getConfiguredPassword() {
  return ENV.accessPassword;
}

function getSigningSecret() {
  return ENV.accessCookieSecret || "hf-bucket-studio-local-secret";
}

function digest(value: string) {
  return crypto.createHmac("sha256", getSigningSecret()).update(value).digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createSession() {
  const expiresAt = Date.now() + ACCESS_MAX_AGE_MS;
  const payload = String(expiresAt);
  return `${payload}.${digest(payload)}`;
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map(pair => pair.trim().split("=")).filter(([key, value]) => key && value).map(([key, ...value]) => [key, decodeURIComponent(value.join("="))]));
}

export function isAccessGranted(req: Request) {
  const token = parseCookies(req.headers.cookie)[ACCESS_COOKIE_NAME] || "";
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature || Number(expiresAt) < Date.now()) return false;
  return safeEqual(signature, digest(expiresAt));
}

export function requireAccess(req: Request, res: Response, next: NextFunction) {
  if (isAccessGranted(req)) return next();
  res.status(401).json({ error: "Access password required" });
}

export function registerAccessRoutes(app: Express) {
  app.get("/api/access/session", (req, res) => {
    if (isAccessGranted(req)) {
      res.json({ authenticated: true });
      return;
    }
    res.status(401).json({ authenticated: false });
  });

  app.post("/api/access/login", (req, res) => {
    const configuredPassword = getConfiguredPassword();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!configuredPassword) {
      res.status(503).json({ error: "ACCESS_PASSWORD is not configured on the server" });
      return;
    }
    if (!safeEqual(password, configuredPassword)) {
      res.status(401).json({ error: "Incorrect access password" });
      return;
    }
    res.cookie(ACCESS_COOKIE_NAME, createSession(), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_MAX_AGE_MS,
    });
    res.json({ authenticated: true });
  });

  app.post("/api/access/logout", (_req, res) => {
    res.clearCookie(ACCESS_COOKIE_NAME, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
    res.json({ authenticated: false });
  });
}
