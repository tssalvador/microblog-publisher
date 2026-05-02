import { requestUrl } from "obsidian";
import type { AuthenticatedMicroblogSettings } from "./settings";
import type { ExtractedPost, PublishResult } from "./note";

interface MicropubPayload {
  type: string[];
  properties: Record<string, unknown[]>;
}

export async function publishPost(
  settings: AuthenticatedMicroblogSettings,
  post: ExtractedPost,
  status: "published" | "draft"
): Promise<PublishResult> {
  const payload: MicropubPayload = {
    type: ["h-entry"],
    properties: {
      content: [post.content]
    }
  };
  if (post.title) payload.properties.name = [post.title];
  if (post.categories.length) payload.properties.category = post.categories;
  payload.properties["mp-syndicate-to"] = post.syndicateTo.length ? post.syndicateTo : [""];
  if (settings.blogUrl) payload.properties["mp-destination"] = [settings.blogUrl];
  if (status === "draft") payload.properties["post-status"] = ["draft"];

  const res = await requestUrl({
    url: settings.micropubEndpoint,
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    throw: false
  });

  if (res.status >= 400) {
    throw new Error(`Micropub publish ${res.status}: ${res.text}`);
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
  const deleteProperties: string[] = [];

  if (post.title) replace.name = [post.title];
  else deleteProperties.push("name");

  if (post.categories.length) replace.category = post.categories;
  else deleteProperties.push("category");

  const body: {
    action: "update";
    url: string;
    replace: Record<string, unknown[]>;
    delete?: string[];
  } = { action: "update", url, replace };
  if (deleteProperties.length) body.delete = deleteProperties;

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
    throw new Error(`Micropub update ${res.status}: ${res.text}`);
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
    throw new Error(`Media upload ${res.status}: ${res.text}`);
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
    throw new Error(`Syndication query ${res.status}: ${res.text}`);
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
