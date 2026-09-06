import { describe, expect, it } from "vitest";

describe("Hugging Face credentials", () => {
  it("authenticates against the lightweight whoami endpoint", async () => {
    const token = process.env.HF_ACCESS_TOKEN;
    expect(token, "HF_ACCESS_TOKEN must be configured for this test").toBeTruthy();

    const response = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.ok, `Hugging Face responded with ${response.status}`).toBe(true);
    const body = (await response.json()) as { name?: string; auth?: { type?: string } };
    expect(body.name || body.auth?.type).toBeTruthy();
  }, 15_000);
});
