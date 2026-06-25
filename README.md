# Micro.blog Publisher

Publish the active Obsidian note to Micro.blog with Micropub. The plugin supports published posts, Micro.blog drafts, image uploads, categories, Mastodon cross-posting when explicitly requested, and updating a previously published post.

## Install for Development

> **Requires Node.js 20 or newer.** The lint and test toolchain (ESLint, `eslint-plugin-obsidianmd`, and the TypeScript-ESLint stack) depends on APIs introduced in Node 20.11. An `.nvmrc` is included — run `nvm use` to select the right version.

1. Use a development vault, not your main vault.
2. Place this folder at `.obsidian/plugins/microblog-publisher` in that vault.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the development build:

   ```bash
   npm run dev
   ```

5. In Obsidian, enable community plugins and turn on **Micro.blog Publisher**.

## Settings

- **App token**: Create a token at `https://micro.blog/account/apps`. The token is stored with Obsidian secret storage, not in the plugin settings JSON.
- **Blog URL**: The Micro.blog site URL to use as the Micropub destination. This matters for accounts with more than one blog.
- **Micropub endpoint**: Defaults to `https://micro.blog/micropub`.
- **Media endpoint**: Defaults to `https://micro.blog/micropub/media`.
- **Mastodon syndication UID**: Use **Fetch syndication targets** to find the UID, then set `mastodon: true` in a note's frontmatter when you want that post cross-posted.

By default, publishes send a blank `mp-syndicate-to` value so Micro.blog does not cross-post to every configured service. Cross-posting happens only when a note opts in with frontmatter and a matching syndication UID is configured.

## Disclosures

- Requires a Micro.blog account and app token.
- Sends post content, categories, selected frontmatter-derived publishing metadata, and embedded local images to Micro.blog when you run a publish or update command.
- Makes network requests only to the configured Micropub and media endpoints.
- Does not include telemetry, ads, or analytics.

## Note Frontmatter

```yaml
---
title: Optional title
categories:
  - notes
mastodon: true
---
```

After a successful publish, the plugin writes:

```yaml
microblog_url: https://example.com/post-url
microblog_published: 2026-05-01T12:00:00.000Z
microblog_media:
  image.png: https://micro.blog/photos/...
```

Use **Update published post on micro.blog** to update a note that already has `microblog_url`.

## Build

Run the production build before release:

```bash
npm run build
```

Run a release package build:

```bash
npm run package
```

The package script writes safe distributable files to `dist/microblog-publisher/`: `main.js`, `manifest.json`, and `versions.json`. Do not publish `data.json`, `node_modules`, or local `.obsidian` state.

## Community Plugin Checklist

- `README.md` describes the plugin and how to use it.
- `LICENSE` is included.
- `manifest.json` has a unique id and semantic version.
- `versions.json` maps plugin versions to minimum Obsidian versions.
- GitHub releases should attach `main.js`, `manifest.json`, and `versions.json`.
