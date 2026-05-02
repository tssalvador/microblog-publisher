import { requestUrl } from "obsidian";
import type { AuthenticatedMicroblogSettings } from "./settings";
import type { ExtractedPost, PublishResult } from "./note";

export async function publishPost(
  settings: AuthenticatedMicroblogSettings,
  post: ExtractedPost,
  status: "published" | "draft"
): Promise<PublishResult> {
  const payload = new URLSearchParams();
  payload.set("h", "entry");
  payload.set("content", post.content);
  if (post.title) payload.set("name", post.title);
  for (const category of post.categories) payload.append("category[]", category);
  for (const target of post.syndicateTo.length ? post.syndicateTo : [""]) {
    payload.append("mp-syndicate-to[]", target);
  }
  if (settings.blogUrl) payload.set("mp-destination", settings.blogUrl);
  if (status === "draft") payload.set("post-status", "draft");

  const res = await requestUrl({
    url: settings.micropubEndpoint,
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.token}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload.toString(),
    throw: false
  });

  if (res.status >= 400) {
    throw new Error(`Micropub publish ${res.status}: ${responseErrorText(res.text)}`);
  }

  const url = locationFromHeaders(res.headers);
  if (!url) throw new Error("Micropub did not return a Location header.");

  return { url, lastPublished: new Date().toISOString() };
}

export async function updatePost(
  settings: AuthenticatedMicroblogSettings,
  url: string,
  post: ExtractedPost
): Promise<void> {
  const replace: Record<string, unknown[]> = {
    content: [post.content]
  };

  if (post.title) replace.name = [post.title];
  if (post.categories.length) replace.category = post.categories;

  const body = { action: "update", url, replace };

  const res = await requestUrl({
    url: settings.micropubEndpoint,
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    throw: false
  });

  if (res.status >= 400) {
    throw new Error(`Micropub update ${res.status}: ${responseErrorText(res.text)}`);
  }
}

export async function uploadMedia(
  settings: AuthenticatedMicroblogSettings,
  data: ArrayBuffer,
  filename: string
): Promise<string> {
  const boundary = "----microblog" + Math.random().toString(36).slice(2);
  const mime = guessMime(filename);

  const head = new TextEncoder().encode(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${escapeQuotedString(filename)}"\r\n` +
      `Content-Type: ${mime}\r\n\r\n`
  );
  const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
  const fileBytes = new Uint8Array(data);
  const out = new Uint8Array(head.length + fileBytes.length + tail.length);
  out.set(head, 0);
  out.set(fileBytes, head.length);
  out.set(tail, head.length + fileBytes.length);

  const res = await requestUrl({
    url: settings.mediaEndpoint,
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`
    },
    body: out.buffer,
    throw: false
  });

  if (res.status >= 400) {
    throw new Error(`Media upload ${res.status}: ${responseErrorText(res.text)}`);
  }

  const url = locationFromHeaders(res.headers);
  if (!url) throw new Error("Media endpoint did not return a Location header.");
  return url;
}

export interface SyndicationTarget {
  uid: string;
  name: string;
}

export async function fetchSyndicationTargets(
  settings: AuthenticatedMicroblogSettings
): Promise<SyndicationTarget[]> {
  const url = `${settings.micropubEndpoint}?q=syndicate-to`;
  const res = await requestUrl({
    url,
    method: "GET",
    headers: { Authorization: `Bearer ${settings.token}` },
    throw: false
  });
  if (res.status >= 400) {
    throw new Error(`Syndication query ${res.status}: ${responseErrorText(res.text)}`);
  }
  const json = res.json as { "syndicate-to"?: SyndicationTarget[] };
  return json["syndicate-to"] ?? [];
}

function locationFromHeaders(headers: Record<string, string>): string | null {
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === "location") return headers[k];
  }
  return null;
}

function guessMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "heic": return "image/heic";
    case "heif": return "image/heif";
    default: return "application/octet-stream";
  }
}

function escapeQuotedString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r|\n/g, " ");
}

function responseErrorText(text: string): string {
  const stripped = text
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (stripped || text || "No error details returned.").slice(0, 300);
}
