import { describe, it, expect, vi, beforeEach } from "vitest";
import { mailinatorProvider } from "../../providers/mailinator";

// This replaces the real fetch with a fake one
// No real API calls are made — zero cost, zero internet needed
vi.stubGlobal("fetch", vi.fn());

describe("mailinatorProvider", () => {

  // Reset the fake fetch before each test
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ✅ Test 1 — basic structure
  it("returns correct domain", () => {
    const provider = mailinatorProvider();
    expect(provider.domain).toBe("mailinator.com");
  });

  // ✅ Test 2 — happy path, email arrives and OTP extracted
  it("extracts email body successfully", async () => {
    const fetchMock = vi.fn()
      // first fetch call → inbox list
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          msgs: [{ id: "msg-abc-123", subject: "Your OTP Code" }],
        }),
      })
      // second fetch call → full message content
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          parts: [{ body: "Your verification code is 847291. It expires in 10 minutes." }],
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const provider = mailinatorProvider();
    const result = await provider.extractContent({
      email: "testuser@mailinator.com",
      prompt: "get the 6 digit verification code",
    });

    // result should contain the OTP
    expect(result).toContain("847291");
    
    // fetch should have been called exactly twice
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // ✅ Test 3 — works with API key in headers
  it("sends API key in headers when provided", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          msgs: [{ id: "msg-456", subject: "Reset Password" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          parts: [{ body: "Click here to reset your password: https://example.com/reset/abc" }],
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const provider = mailinatorProvider({ apiKey: "my-test-api-key" });
    await provider.extractContent({
      email: "testuser@mailinator.com",
      prompt: "get the reset link",
    });

    // check first call had Authorization header
    const firstCallHeaders = fetchMock.mock.calls[0][1].headers;
    expect(firstCallHeaders).toEqual({
      Authorization: "Bearer my-test-api-key",
    });
  });

  // ✅ Test 4 — no API key means no Authorization header
  it("sends no headers when no API key provided", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          msgs: [{ id: "msg-789" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          parts: [{ body: "Welcome! Your code is 123456" }],
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const provider = mailinatorProvider(); // no API key
    await provider.extractContent({
      email: "test@mailinator.com",
      prompt: "get the code",
    });

    const firstCallHeaders = fetchMock.mock.calls[0][1].headers;
    expect(firstCallHeaders).toEqual({});
  });

  // ✅ Test 5 — inbox is empty
  it("throws when inbox has no emails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ msgs: [] }),  // empty inbox
    }));

    const provider = mailinatorProvider();

    await expect(
      provider.extractContent({
        email: "nobody@mailinator.com",
        prompt: "get the code",
      })
    ).rejects.toThrow("No emails found for nobody@mailinator.com");
  });

  // ✅ Test 6 — API returns error
  it("throws when inbox API call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,  // too many requests
    }));

    const provider = mailinatorProvider();

    await expect(
      provider.extractContent({
        email: "test@mailinator.com",
        prompt: "get the code",
      })
    ).rejects.toThrow("HTTP 429");
  });

  // ✅ Test 7 — email body is empty
  it("throws when email body is empty", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          msgs: [{ id: "msg-empty" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          parts: [{ body: "" }],  // empty body
        }),
      })
    );

    const provider = mailinatorProvider();

    await expect(
      provider.extractContent({
        email: "test@mailinator.com",
        prompt: "get the code",
      })
    ).rejects.toThrow("Email body is empty");
  });

});