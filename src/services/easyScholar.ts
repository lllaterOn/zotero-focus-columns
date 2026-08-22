import { extractEasyScholarRank } from "../domain/publication";
import { validateEasyScholarEndpoint } from "../settings";
import type { RankRecord } from "../types";

export type EasyScholarErrorKind =
  | "missing-key"
  | "invalid-endpoint"
  | "invalid-key"
  | "rate-limited"
  | "http-client"
  | "http-server"
  | "timeout"
  | "network"
  | "invalid-response"
  | "business"
  | "cache";

function errorMessage(kind: EasyScholarErrorKind, code?: number): string {
  switch (kind) {
    case "missing-key": return "EasyScholar key is missing";
    case "invalid-endpoint": return "EasyScholar endpoint is invalid";
    case "invalid-key": return code
      ? `EasyScholar key is invalid (${code})`
      : "EasyScholar key is invalid";
    case "rate-limited": return "EasyScholar rate limit was reached";
    case "http-client": return `EasyScholar returned HTTP ${code || 400}`;
    case "http-server": return `EasyScholar returned HTTP ${code || 500}`;
    case "timeout": return "EasyScholar request timed out";
    case "network": return "EasyScholar request failed";
    case "invalid-response": return "EasyScholar returned an invalid response";
    case "business": return code
      ? `EasyScholar returned business error ${code}`
      : "EasyScholar returned a business error";
    case "cache": return "Publication cache could not be updated";
  }
}

export class EasyScholarError extends Error {
  constructor(
    readonly kind: EasyScholarErrorKind,
    readonly retryable: boolean,
    readonly code?: number
  ) {
    super(errorMessage(kind, code));
    this.name = "EasyScholarError";
  }
}

function businessError(code: number): EasyScholarError {
  if (code === 40002 || code === 40005) {
    return new EasyScholarError("invalid-key", false, code);
  }
  return new EasyScholarError("business", false, code);
}

export class EasyScholarClient {
  constructor(
    private readonly getSecretKey: () => string,
    private readonly getEndpoint: () => string
  ) {}

  hasKey(): boolean {
    return Boolean(this.getSecretKey().trim());
  }

  async fetch(publication: string): Promise<RankRecord> {
    const secretKey = this.getSecretKey().trim();
    if (!secretKey) throw new EasyScholarError("missing-key", false);
    const endpoint = this.getEndpoint().trim();
    const validationError = validateEasyScholarEndpoint(endpoint);
    if (validationError) throw new EasyScholarError("invalid-endpoint", false);

    const url = new URL(endpoint);
    url.searchParams.set("secretKey", secretKey);
    url.searchParams.set("publicationName", publication);
    const controller = new AbortController();
    let timedOut = false;
    const timeoutID = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20_000);
    try {
      const response = await fetch(url.href, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal
      });
      if (!response.ok) {
        if (response.status === 429) {
          throw new EasyScholarError("rate-limited", true, response.status);
        }
        throw new EasyScholarError(
          response.status >= 500 ? "http-server" : "http-client",
          response.status >= 500,
          response.status
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      }
      catch {
        throw new EasyScholarError("invalid-response", false);
      }
      if (!payload || typeof payload !== "object") {
        throw new EasyScholarError("invalid-response", false);
      }
      const root = payload as Record<string, unknown>;
      if ((typeof root.code !== "number" && typeof root.code !== "string")
        || String(root.code).trim() === "") {
        throw new EasyScholarError("invalid-response", false);
      }
      const code = Number(root.code);
      if (!Number.isFinite(code)) {
        throw new EasyScholarError("invalid-response", false);
      }
      if (code !== 200) {
        throw businessError(code);
      }
      if (root.data !== null && root.data !== undefined && typeof root.data !== "object") {
        throw new EasyScholarError("invalid-response", false);
      }
      return extractEasyScholarRank(payload);
    }
    catch (error) {
      if (error instanceof EasyScholarError) throw error;
      throw new EasyScholarError(timedOut ? "timeout" : "network", true);
    }
    finally {
      clearTimeout(timeoutID);
    }
  }
}
