import { describe, it, expect, vi, beforeEach } from "vitest";

// Replace the "obsidian" module with a controllable requestUrl mock.
const requestUrl = vi.fn();
vi.mock("obsidian", () => ({
  requestUrl: (...args: unknown[]) => requestUrl(...args),
  Notice: class {}
}));

import {
  isSecureEndpoint,
  publishPost,
  updatePost,
  uploadMedia,
  fetchSyndicationTargets
} from "../src/micropub";
import type { AuthenticatedMicroblogSettings } from "../src/settings";
import type { ExtractedPost } from "../src/note";

const settings: AuthenticatedMicroblogSettings = {
  tokenSecretId: "id",
  micropubEndpoint: "https://micro.blog/micropub",
  mediaEndpoint: "https://micro.blog/micropub/media",
  blogUrl: "",
  shortPostThreshold: 280,
  mastodonTargetUid: "",
  token: "secret-token"
};

const post: ExtractedPost = {
  content: "hello world",
  categories: [],
  isShort: true,
  syndicateTo: []
};

beforeEach(() => {
  requestUrl.mockReset();
});

describe("isSecureEndpoint (Finding 1: HTTPS enforcement)", () => {
  it("accepts https:// URLs", () => {
    expect(isSecureEndpoint("https://micro.blog/micropub")).toBe(true);
  });

  it("rejects http:// URLs", () => {
    expect(isSecureEndpoint("http://micro.blog/micropub")).toBe(false);
  });

  it("rejects empty and non-URL values", () => {
    expect(isSecureEndpoint("")).toBe(false);
    expect(isSecureEndpoint("micro.blog")).toBe(false);
    expect(isSecureEndpoint("ftp://micro.blog")).toBe(false);
  });

  it("does not treat a host containing 'https' substring as secure", () => {
    expect(isSecureEndpoint("http://https.example.com")).toBe(false);
  });
});

describe("uploadMedia boundary (Finding 2: crypto.randomUUID)", () => {
  it("uses a UUID-based multipart boundary", async () => {
    requestUrl.mockResolvedValue({
      status: 201,
      headers: { Location: "https://micro.blog/uploads/1.png" },
      text: "",
      json: {}
    });

    await uploadMedia(settings, new TextEncoder().encode("img").buffer, "a.png");

    const call = requestUrl.mock.calls[0][0];
    const contentType: string = call.headers["Content-Type"];
    const boundary = contentType.replace("multipart/form-data; boundary=", "");

    // Boundary must embed a v4-style UUID (8-4-4-4-12 hex), proving randomUUID use.
    expect(boundary).toMatch(
      /^----microblog[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("produces a unique boundary on each call", async () => {
    requestUrl.mockResolvedValue({
      status: 201,
      headers: { Location: "https://micro.blog/uploads/1.png" },
      text: "",
      json: {}
    });

    const buf = new TextEncoder().encode("img").buffer;
    await uploadMedia(settings, buf, "a.png");
    await uploadMedia(settings, buf, "b.png");

    const b1 = requestUrl.mock.calls[0][0].headers["Content-Type"];
    const b2 = requestUrl.mock.calls[1][0].headers["Content-Type"];
    expect(b1).not.toEqual(b2);
  });

  it("blocks upload to non-HTTPS media endpoint", async () => {
    const httpSettings = { ...settings, mediaEndpoint: "http://micro.blog/micropub/media" };
    const buf = new TextEncoder().encode("img").buffer;
    await expect(uploadMedia(httpSettings, buf, "a.png")).rejects.toThrow(
      /Media upload blocked.*https/
    );
    expect(requestUrl).not.toHaveBeenCalled();
  });
});

describe("HTTPS enforcement inside network helpers (token-leak prevention)", () => {
  const httpSettings = { ...settings, micropubEndpoint: "http://micro.blog/micropub" };

  it("publishPost throws and makes no request on non-HTTPS endpoint", async () => {
    await expect(publishPost(httpSettings, post, "published")).rejects.toThrow(
      /Publish blocked.*https/
    );
    expect(requestUrl).not.toHaveBeenCalled();
  });

  it("updatePost throws and makes no request on non-HTTPS endpoint", async () => {
    await expect(updatePost(httpSettings, "https://micro.blog/p/1", post)).rejects.toThrow(
      /Update blocked.*https/
    );
    expect(requestUrl).not.toHaveBeenCalled();
  });

  it("fetchSyndicationTargets throws and makes no request on non-HTTPS endpoint", async () => {
    await expect(fetchSyndicationTargets(httpSettings)).rejects.toThrow(
      /Syndication query blocked.*https/
    );
    expect(requestUrl).not.toHaveBeenCalled();
  });
});

describe("responseErrorText (Finding 3: truncate before stripping)", () => {
  it("bounds the user-facing message to 300 chars on a huge hostile body", async () => {
    const hugeBody = "<p>" + "A".repeat(500_000) + "</p>";
    requestUrl.mockResolvedValue({
      status: 500,
      headers: {},
      text: hugeBody,
      json: {}
    });

    await expect(publishPost(settings, post, "published")).rejects.toThrow(
      /Micropub publish 500:/
    );

    // The thrown message = prefix + stripped text (<=300). Confirm it stays small,
    // which is only possible if the body was truncated before regex stripping.
    try {
      await publishPost(settings, post, "published");
    } catch (err) {
      const message = (err as Error).message;
      expect(message.length).toBeLessThan(360);
    }
  });

  it("strips HTML tags from the error body", async () => {
    requestUrl.mockResolvedValue({
      status: 403,
      headers: {},
      text: "<html><body><h1>Forbidden</h1></body></html>",
      json: {}
    });

    await expect(publishPost(settings, post, "published")).rejects.toThrow(
      /Forbidden/
    );
    await expect(publishPost(settings, post, "published")).rejects.not.toThrow(
      /<h1>/
    );
  });

  it("completes stripping quickly on a large body (no ReDoS / unbounded work)", async () => {
    const hugeBody = "<div>" + "x".repeat(1_000_000) + "</div>";
    requestUrl.mockResolvedValue({
      status: 500,
      headers: {},
      text: hugeBody,
      json: {}
    });

    const start = Date.now();
    await publishPost(settings, post, "published").catch(() => undefined);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe("token handling (regression guard)", () => {
  it("sends the token only in the Authorization header, never in the body", async () => {
    requestUrl.mockResolvedValue({
      status: 201,
      headers: { Location: "https://micro.blog/p/1" },
      text: "",
      json: {}
    });

    await publishPost(settings, post, "published");

    const call = requestUrl.mock.calls[0][0];
    expect(call.headers.Authorization).toBe("Bearer secret-token");
    expect(String(call.body)).not.toContain("secret-token");
    expect(call.url).not.toContain("secret-token");
  });

  it("fetchSyndicationTargets keeps the token out of the URL", async () => {
    requestUrl.mockResolvedValue({
      status: 200,
      headers: {},
      text: "",
      json: { "syndicate-to": [] }
    });

    await fetchSyndicationTargets(settings);

    const call = requestUrl.mock.calls[0][0];
    expect(call.url).not.toContain("secret-token");
    expect(call.headers.Authorization).toBe("Bearer secret-token");
  });
});

describe("fetchSyndicationTargets response validation (Finding 5)", () => {
  it("returns well-formed targets unchanged", async () => {
    requestUrl.mockResolvedValue({
      status: 200,
      headers: {},
      text: "",
      json: {
        "syndicate-to": [
          { uid: "mastodon", name: "Mastodon" },
          { uid: "bluesky", name: "Bluesky" }
        ]
      }
    });

    const targets = await fetchSyndicationTargets(settings);
    expect(targets).toEqual([
      { uid: "mastodon", name: "Mastodon" },
      { uid: "bluesky", name: "Bluesky" }
    ]);
  });

  it("returns [] when syndicate-to is missing", async () => {
    requestUrl.mockResolvedValue({ status: 200, headers: {}, text: "", json: {} });
    expect(await fetchSyndicationTargets(settings)).toEqual([]);
  });

  it("returns [] when syndicate-to is not an array", async () => {
    requestUrl.mockResolvedValue({
      status: 200,
      headers: {},
      text: "",
      json: { "syndicate-to": "not-an-array" }
    });
    expect(await fetchSyndicationTargets(settings)).toEqual([]);
  });

  it("returns [] when the whole body is not an object", async () => {
    requestUrl.mockResolvedValue({ status: 200, headers: {}, text: "", json: null });
    expect(await fetchSyndicationTargets(settings)).toEqual([]);
  });

  it("filters out malformed entries missing string uid/name", async () => {
    requestUrl.mockResolvedValue({
      status: 200,
      headers: {},
      text: "",
      json: {
        "syndicate-to": [
          { uid: "ok", name: "Good" },
          { uid: 123, name: "BadUid" },
          { name: "MissingUid" },
          "garbage",
          null
        ]
      }
    });

    const targets = await fetchSyndicationTargets(settings);
    expect(targets).toEqual([{ uid: "ok", name: "Good" }]);
  });
});
