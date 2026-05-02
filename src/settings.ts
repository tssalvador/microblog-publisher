import { App, Notice, PluginSettingTab, SecretComponent, Setting } from "obsidian";
import { fetchSyndicationTargets } from "./micropub";
import type MicroblogPublisher from "./main";

export interface MicroblogSettings {
  micropubEndpoint: string;
  mediaEndpoint: string;
  blogUrl: string;
  shortPostThreshold: number;
  mastodonTargetUid: string;
}

export interface AuthenticatedMicroblogSettings extends MicroblogSettings {
  token: string;
}

export const MICROBLOG_TOKEN_SECRET_ID = "microblog-publisher-token";

export const DEFAULT_SETTINGS: MicroblogSettings = {
  micropubEndpoint: "https://micro.blog/micropub",
  mediaEndpoint: "https://micro.blog/micropub/media",
  blogUrl: "",
  shortPostThreshold: 280,
  mastodonTargetUid: ""
};

export class MicroblogSettingTab extends PluginSettingTab {
  plugin: MicroblogPublisher;

  constructor(app: App, plugin: MicroblogPublisher) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const tokenSetting = new Setting(containerEl)
      .setName("App token")
      .setDesc(
        "Generate at micro.blog/account/apps. Stored using Obsidian's secret storage."
      );

    new SecretComponent(this.app, tokenSetting.controlEl)
      .setValue(this.plugin.getToken() ?? "")
      .onChange((value) => {
        this.plugin.setToken(value.trim());
      });

    new Setting(containerEl)
      .setName("Blog URL")
      .setDesc("Your Micro.blog site URL. Sent as the Micropub destination for accounts with multiple blogs.")
      .addText((text) =>
        text.setValue(this.plugin.settings.blogUrl).onChange(async (value) => {
          this.plugin.settings.blogUrl = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Micropub endpoint")
      .setDesc("Default works for micro.blog. Only change if you know why.")
      .addText((text) =>
        text.setValue(this.plugin.settings.micropubEndpoint).onChange(async (value) => {
          this.plugin.settings.micropubEndpoint = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Media endpoint")
      .setDesc("Where images are uploaded.")
      .addText((text) =>
        text.setValue(this.plugin.settings.mediaEndpoint).onChange(async (value) => {
          this.plugin.settings.mediaEndpoint = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Short post threshold (characters)")
      .setDesc("Posts shorter than this with no explicit title are sent without a title.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.shortPostThreshold)).onChange(async (value) => {
          const n = parseInt(value, 10);
          if (!isNaN(n) && n > 0) {
            this.plugin.settings.shortPostThreshold = n;
            await this.plugin.saveSettings();
          }
        })
      );

    new Setting(containerEl)
      .setName("Cross-posting")
      .setHeading();

    new Setting(containerEl)
      .setName("Mastodon syndication UID")
      .setDesc(
        "The UID micro.blog uses for your Mastodon account. Posts cross-post only when frontmatter sets `mastodon: true`."
      )
      .addText((text) =>
        text
          .setPlaceholder("https://...")
          .setValue(this.plugin.settings.mastodonTargetUid)
          .onChange(async (value) => {
            this.plugin.settings.mastodonTargetUid = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Fetch syndication targets")
      .setDesc("Asks micro.blog which destinations are configured. Copy the Mastodon UID into the field above.")
      .addButton((btn) =>
        btn.setButtonText("Fetch").onClick(async () => {
          const token = this.plugin.getToken();
          if (!token) {
            new Notice("Set your app token first.");
            return;
          }
          try {
            const targets = await fetchSyndicationTargets({
              ...this.plugin.settings,
              token
            });
            if (!targets.length) {
              new Notice("No syndication targets configured on micro.blog.");
              return;
            }
            const summary = targets.map((t) => `${t.name}: ${t.uid}`).join("\n");
            new Notice(`Syndication targets:\n${summary}`, 30000);
          } catch (err) {
            console.error(err);
            new Notice(`Fetch failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        })
      );
  }
}
