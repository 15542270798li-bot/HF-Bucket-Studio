import express from "express";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ACCESS_PASSWORD = "v2-test-password";
process.env.ACCESS_COOKIE_SECRET = "v2-test-secret";

const { registerAccessRoutes } = await import("./accessAuth");

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerAccessRoutes(app);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to start auth test server");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

describe("password access", () => {
  it("rejects an incorrect password and accepts the configured password", async () => {
    const wrong = await fetch(`${baseUrl}/api/access/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "wrong" }) });
    expect(wrong.status).toBe(401);

    const login = await fetch(`${baseUrl}/api/access/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "v2-test-password" }) });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie");
    expect(cookie).toContain("hf_bucket_access=");

    const session = await fetch(`${baseUrl}/api/access/session`, { headers: { cookie: cookie?.split(";")[0] ?? "" } });
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toEqual({ authenticated: true });
  });
});
