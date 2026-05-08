import { MarkdownView, Notice, Plugin, TFile } from "obsidian";
import {
  AuthenticatedMicroblogSettings,
  DEFAULT_SETTINGS,
  MICROBLOG_TOKEN_SECRET_ID,
  MicroblogSettings,
  MicroblogSettingTab
} from "./settings";
import { publishPost, updatePost } from "./micropub";
import { extractPost, writePublishedFrontmatter } from "./note";

export default class MicroblogPublisher extends Plugin {
  settings!: MicroblogSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MicroblogSettingTab(this.app, this));

    this.addCommand({
      id: "publish",
      name: "Publish to micro.blog",
      checkCallback: (checking) => this.runPublish(checking, "published")
    });

    this.addCommand({
      id: "publish-draft",
      name: "Save as draft on micro.blog",
      checkCallback: (checking) => this.runPublish(checking, "draft")
    });

    this.addCommand({
      id: "update",
      name: "Update published post on micro.blog",
      checkCallback: (checking) => this.runUpdate(checking)
    });
  }

  async loadSettings() {
    const loadedData = await this.loadData();
    const loaded = isRecord(loadedData) ? loadedData : {};
    const legacyToken = typeof loaded?.token === "string" ? loaded.token.trim() : "";
    const settings = { ...loaded };
    delete settings.token;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, settings);

    if (legacyToken && !this.getToken()) {
      this.setToken(legacyToken);
    }

    if ("token" in loaded) {
      await this.saveSettings();
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getToken(): string | null {
    return this.app.secretStorage.getSecret(MICROBLOG_TOKEN_SECRET_ID);
  }

  setToken(token: string): void {
    this.app.secretStorage.setSecret(MICROBLOG_TOKEN_SECRET_ID, token);
  }

  private getAuthenticatedSettings(): AuthenticatedMicroblogSettings | null {
    const token = this.getToken();
    return token ? { ...this.settings, token } : null;
  }

  private getActiveFile(): TFile | null {
    return this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
  }

  private runPublish(checking: boolean, status: "published" | "draft"): boolean {
    const file = this.getActiveFile();
    if (!file) return false;
    if (checking) return true;
    void this.publish(file, status);
    return true;
  }

  private runUpdate(checking: boolean): boolean {
    const file = this.getActiveFile();
    if (!file) return false;
    const url = this.app.metadataCache.getFileCache(file)?.frontmatter?.microblog_url;
    if (!url) return false;
    if (checking) return true;
    void this.update(file);
    return true;
  }

  private async publish(file: TFile, status: "published" | "draft") {
    const settings = this.getAuthenticatedSettings();
    if (!settings) {
      new Notice("Set your micro.blog app token in settings first.");
      return;
    }
    try {
      new Notice(`Publishing ${file.basename}…`);
      const post = await extractPost(this.app, file, settings);
      const result = await publishPost(settings, post, status);
      await writePublishedFrontmatter(this.app, file, result);
      new Notice(status === "draft" ? `Draft saved: ${result.url}` : `Published: ${result.url}`);
    } catch (err) {
      console.error("microblog-publisher publish error", err);
      new Notice(`Publish failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async update(file: TFile) {
    const settings = this.getAuthenticatedSettings();
    if (!settings) {
      new Notice("Set your micro.blog app token in settings first.");
      return;
    }
    const url = this.app.metadataCache.getFileCache(file)?.frontmatter?.microblog_url;
    if (typeof url !== "string") {
      new Notice("This note has no Micro.blog url in frontmatter.");
      return;
    }
    try {
      new Notice(`Updating ${file.basename}…`);
      const post = await extractPost(this.app, file, settings);
      await updatePost(settings, url, post);
      await writePublishedFrontmatter(this.app, file, {
        url,
        lastUpdated: new Date().toISOString()
      });
      new Notice(`Updated: ${url}`);
    } catch (err) {
      console.error("microblog-publisher update error", err);
      new Notice(`Update failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
