import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EasyScholarClient, EasyScholarError } from "../src/services/easyScholar";

function client(): EasyScholarClient {
  return new EasyScholarClient(
    () => "test-key",
    () => "https://easyscholar.cc/open/getPublicationRank"
  );
}

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body)
  } as unknown as Response;
}

describe("EasyScholarClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses fetch with a cancellable signal and extracts successful rank data", async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      code: 200,
      data: { officialRank: { all: { sci: "Q1" } } }
    }));

    await expect(client().fetch("Nature")).resolves.toEqual({ sci: "Q1" });

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("publicationName=Nature");
    expect(options).toMatchObject({
      method: "GET",
      cache: "no-store",
      credentials: "omit"
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("treats a successful response without rank fields as empty data", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ code: 200, data: null }));

    await expect(client().fetch("Unknown Journal")).resolves.toEqual({});
  });

  it("reports an invalid key as a non-retryable business error", async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      code: 40002,
      msg: "Key error",
      data: null
    }));

    await expect(client().fetch("Nature")).rejects.toMatchObject({
      name: "EasyScholarError",
      kind: "invalid-key",
      retryable: false,
      code: 40002
    });
  });

  it.each([
    { data: null },
    { code: null, data: null },
    { code: "", data: null }
  ])("rejects malformed successful responses instead of treating them as empty", async payload => {
    vi.mocked(fetch).mockResolvedValue(response(payload));

    await expect(client().fetch("Nature")).rejects.toMatchObject({
      kind: "invalid-response",
      retryable: false
    });
  });

  it("aborts and reports a retryable timeout after 20 seconds", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));

    const request = client().fetch("Nature");
    const rejection = expect(request).rejects.toEqual(expect.objectContaining({
      kind: "timeout",
      retryable: true
    }) satisfies Partial<EasyScholarError>);

    await vi.advanceTimersByTimeAsync(20_000);
    await rejection;
  });
});
