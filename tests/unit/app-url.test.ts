import { afterEach, describe, expect, it, vi } from "vitest";
import { appUrl } from "@/lib/app-url";

afterEach(() => vi.unstubAllEnvs());

describe("appUrl", () => {
  it("defaults to localhost outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "");
    expect(appUrl()).toBe("http://localhost:3000");
  });
  it("throws when unset in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "");
    expect(() => appUrl()).toThrow(/APP_URL/);
  });
  it("rejects non-https in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "http://example.com");
    expect(() => appUrl()).toThrow(/https/);
  });
  it("trims the trailing slash", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://relay.example.com/");
    expect(appUrl()).toBe("https://relay.example.com");
  });
});
