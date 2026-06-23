// Minimal mock of the Obsidian API surface used by src/micropub.ts.
// Tests override `requestUrl` per-case via vi.mocked(...).

export interface RequestUrlParam {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer;
  throw?: boolean;
}

export interface RequestUrlResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
  json: unknown;
}

export const requestUrl = async (
  _param: RequestUrlParam
): Promise<RequestUrlResponse> => {
  throw new Error("requestUrl not mocked in this test");
};

// Stubs so importing modules that reference these symbols does not crash.
export class Notice {
  constructor(_message: string, _timeout?: number) {}
}
export class PluginSettingTab {}
export class Setting {}
export class SecretComponent {}
export class App {}
export class Plugin {}
export class TFile {}
export class MarkdownView {}
