import { App, TFile } from "obsidian";
import type { AuthenticatedMicroblogSettings } from "./settings";
import { uploadMedia } from "./micropub";

export interface ExtractedPost {
  title?: string;
  content: string;
  categories: string[];
  isShort: boolean;
  syndicateTo: string[];
}

export interface PublishResult {
  url: string;
  lastPublished?: string;
  lastUpdated?: string;
}

export async function extractPost(
  app: App,
  file: TFile,
  settings: AuthenticatedMicroblogSettings
): Promise<ExtractedPost> {
  const raw = await app.vault.read(file);
  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};

  let body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "");

  body = await processImages(app, file, body, settings);

  body = body.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  body = body.replace(/\[\[([^\]]+)\]\]/g, "$1");

  const title: string | undefined =
    typeof fm.title === "string" && fm.title.trim() ? fm.title.trim() : undefined;

  const categories: string[] = Array.isArray(fm.categories)
    ? fm.categories.map(String)
    : typeof fm.categories === "string"
      ? [fm.categories]
      : [];

  const trimmed = body.trim();
  const isShort = trimmed.length < settings.shortPostThreshold;

  const syndicateTo: string[] = [];
  if (fm.mastodon === true && settings.mastodonTargetUid) {
    syndicateTo.push(settings.mastodonTargetUid);
  }

  return {
    title,
    content: trimmed,
    categories,
    isShort,
    syndicateTo
  };
}

async function processImages(
  app: App,
  file: TFile,
  body: string,
  settings: AuthenticatedMicroblogSettings
): Promise<string> {
  const fm: unknown = app.metadataCache.getFileCache(file)?.frontmatter;
  const media = isRecord(fm) ? fm.microblog_media : undefined;
  const cached = isStringRecord(media) ? { ...media } : {};
  const updated: Record<string, string> = { ...cached };

  const wikiPattern = /!\[\[([^\]]+?)\]\]/g;
  for (const match of [...body.matchAll(wikiPattern)]) {
    const [full, inner] = match;
    const [path, alias] = inner.split("|");
    if (!isImagePath(path)) continue;
    const url = await ensureUploaded(app, file, path, updated, settings);
    if (url) {
      const alt = (alias ?? "").trim();
      body = body.split(full).join(`![${alt}](${url})`);
    }
  }

  const mdPattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  for (const match of [...body.matchAll(mdPattern)]) {
    const [full, alt, src] = match;
    if (/^https?:\/\//i.test(src)) continue;
    if (!isImagePath(src)) continue;
    const url = await ensureUploaded(app, file, decodeURI(src), updated, settings);
    if (url) {
      body = body.split(full).join(`![${alt}](${url})`);
    }
  }

  if (JSON.stringify(updated) !== JSON.stringify(cached)) {
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
      (frontmatter as Record<string, unknown>).microblog_media = updated;
    });
  }

  return body;
}

async function ensureUploaded(
  app: App,
  noteFile: TFile,
  path: string,
  cache: Record<string, string>,
  settings: AuthenticatedMicroblogSettings
): Promise<string | null> {
  if (cache[path]) return cache[path];
  const tfile = app.metadataCache.getFirstLinkpathDest(path, noteFile.path);
  if (!tfile) {
    console.warn(`microblog-publisher: image not found in vault: ${path}`);
    return null;
  }
  const data = await app.vault.readBinary(tfile);
  const url = await uploadMedia(settings, data, tfile.name);
  cache[path] = url;
  return url;
}

function isImagePath(p: string): boolean {
  return /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(p);
}

export async function writePublishedFrontmatter(
  app: App,
  file: TFile,
  result: PublishResult
): Promise<void> {
  await app.fileManager.processFrontMatter(file, (fm) => {
    const frontmatter = fm as Record<string, unknown>;
    frontmatter.microblog_url = result.url;
    if (result.lastPublished) frontmatter.microblog_published = result.lastPublished;
    if (result.lastUpdated) frontmatter.microblog_updated = result.lastUpdated;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}
