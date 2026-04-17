import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { mkdir, readdir, rename, rm, stat as statFile, utimes } from 'node:fs/promises';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  CompatibilityMode,
  ExtensionMessage,
  FitMode,
  PlayerBootstrap,
  WebviewMessage
} from './shared/contracts';
import { buildCompatibilityTranscodeArgs } from './shared/compatibility';
import { getPlayerWebviewHtml } from './shared/playerWebviewHtml';

const VIEW_TYPE = 'webmPreview.preview';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('WebM Preview');
  output.appendLine(`activate ${context.extension.id}@${context.extension.packageJSON.version}`);
  context.subscriptions.push(output);

  const compatibilityCache = new CompatibilityPreviewCache(context, output);
  const mediaServer = new MediaServer(output);
  void compatibilityCache.pruneToConfiguredLimit();
  context.subscriptions.push(mediaServer);
  context.subscriptions.push(compatibilityCache);

  context.subscriptions.push(
    vscode.commands.registerCommand('webmPreview.clearCompatibilityCache', async () => {
      const removedFiles = await compatibilityCache.clear();
      void vscode.window.showInformationMessage(
        removedFiles === 1
          ? 'WebM Preview cleared 1 compatibility preview.'
          : `WebM Preview cleared ${removedFiles} compatibility previews.`
      );
    })
  );

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      VIEW_TYPE,
      new WebmPlayerProvider(context, output, compatibilityCache, mediaServer),
      {
        supportsMultipleEditorsPerDocument: true,
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );
}

class WebmPlayerProvider implements vscode.CustomReadonlyEditorProvider<WebmDocument> {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
    private readonly compatibilityCache: CompatibilityPreviewCache,
    private readonly mediaServer: MediaServer
  ) {}

  openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): WebmDocument {
    return new WebmDocument(uri);
  }

  async resolveCustomEditor(
    document: WebmDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this.output.appendLine(`resolve ${document.uri.toString()}`);

    const configuration = getConfiguration(document.uri);
    const compatibilityFrameOrigin = await this.mediaServer.getExternalOrigin();
    const state: EditorSessionState = {
      compatibilityPreviewUri: undefined,
      compatibilityPlayerSession: undefined,
      disposed: false,
      previewPromise: undefined
    };

    const applyWebviewOptions = (): void => {
      webviewPanel.webview.options = {
        enableScripts: true,
        localResourceRoots: getLocalResourceRoots(
          this.context.extensionUri,
          document.uri,
          this.compatibilityCache.rootUri,
          state.compatibilityPreviewUri
        )
      };
    };

    applyWebviewOptions();

    webviewPanel.onDidDispose(() => {
      state.disposed = true;
      state.compatibilityPlayerSession?.dispose();
      state.compatibilityPlayerSession = undefined;
    });

    webviewPanel.webview.onDidReceiveMessage((message: WebviewMessage) => {
      void this.handleWebviewMessage(message, document, webviewPanel, configuration, state, applyWebviewOptions);
    });

    webviewPanel.webview.html = getPlayerWebviewHtml({
      title: basenameOfUri(document.uri),
      cspSource: webviewPanel.webview.cspSource,
      styleUri: webviewPanel.webview
        .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'player.css'))
        .toString(),
      scriptUri: webviewPanel.webview
        .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'player.js'))
        .toString(),
      bootstrap: buildBootstrap(document.uri, webviewPanel.webview, configuration),
      frameSourceOrigin: compatibilityFrameOrigin
    });
  }

  private async handleWebviewMessage(
    message: WebviewMessage,
    document: WebmDocument,
    webviewPanel: vscode.WebviewPanel,
    configuration: PlayerConfig,
    state: EditorSessionState,
    applyWebviewOptions: () => void
  ): Promise<void> {
    switch (message.type) {
      case 'telemetry':
        this.output.appendLine(`telemetry ${message.event} ${safeJson(message.data ?? {})}`);
        return;
      case 'openExternal':
        await vscode.env.openExternal(document.uri);
        return;
      case 'requestCompatibilityPreview':
        if (configuration.compatibilityMode === 'none') {
          await postToWebview(webviewPanel.webview, {
            type: 'compatibilityPreviewUnavailable',
            message: 'Direct playback failed, and compatibility preview generation is disabled.'
          });
          return;
        }

        if (!state.previewPromise) {
          this.output.appendLine(
            `compatibilityPreviewRequested ${document.uri.toString()} ${safeJson({
              errorCode: message.errorCode,
              message: message.message
            })}`
          );

          state.previewPromise = this.compatibilityCache.ensurePreview(document.uri);
        }

        await postToWebview(webviewPanel.webview, {
          type: 'compatibilityPreviewPending'
        });

        try {
          const previewUri = await state.previewPromise;
          if (state.disposed) {
            return;
          }

          state.compatibilityPreviewUri = previewUri;
          applyWebviewOptions();

          if (!state.compatibilityPlayerSession) {
            state.compatibilityPlayerSession = await this.mediaServer.createPlayerSession(
              document.uri,
              previewUri,
              configuration
            );
          }

          await postToWebview(webviewPanel.webview, {
            type: 'compatibilityPreviewReady',
            frameUri: state.compatibilityPlayerSession.externalPlayerUri
          });
        } catch (error) {
          this.output.appendLine(`compatibilityPreviewFailed ${formatUnknownError(error)}`);
          await postToWebview(webviewPanel.webview, {
            type: 'compatibilityPreviewUnavailable',
            message: `Direct playback failed, and the compatibility preview could not be prepared: ${formatUnknownError(
              error
            )}`
          });
        }
        return;
    }
  }
}

class WebmDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}

  dispose(): void {}
}

type PlayerConfig = {
  restorePlaybackState: boolean;
  defaultMuted: boolean;
  loop: boolean;
  fitMode: FitMode;
  compatibilityMode: CompatibilityMode;
};

type EditorSessionState = {
  compatibilityPreviewUri: vscode.Uri | undefined;
  compatibilityPlayerSession: ServedPlayerSession | undefined;
  disposed: boolean;
  previewPromise: Promise<vscode.Uri> | undefined;
};

class CompatibilityPreviewCache implements vscode.Disposable {
  readonly rootUri: vscode.Uri;
  private readonly inFlight = new Map<string, Promise<vscode.Uri>>();

  constructor(
    context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel
  ) {
    this.rootUri = vscode.Uri.joinPath(context.globalStorageUri, 'compatibility-previews');
  }

  async ensurePreview(resource: vscode.Uri): Promise<vscode.Uri> {
    if (resource.scheme !== 'file') {
      throw new Error('Compatibility previews are currently only available for local files.');
    }

    await mkdir(this.rootUri.fsPath, {
      recursive: true
    });

    const resourceStats = await statFile(resource.fsPath);
    const cacheKey = createHash('sha256')
      .update(resource.fsPath)
      .update('\0')
      .update(String(resourceStats.size))
      .update('\0')
      .update(String(resourceStats.mtimeMs))
      .digest('hex');

    const previewUri = vscode.Uri.joinPath(this.rootUri, `${cacheKey}.mp4`);

    try {
      await statFile(previewUri.fsPath);
      const now = new Date();
      await utimes(previewUri.fsPath, now, now);
      this.output.appendLine(`compatibilityPreviewCacheHit ${previewUri.fsPath}`);
      return previewUri;
    } catch {
      // Continue and build it.
    }

    const existing = this.inFlight.get(cacheKey);
    if (existing) {
      return existing;
    }

    const buildPromise = this.buildPreview(resource, previewUri).finally(() => {
      this.inFlight.delete(cacheKey);
    });

    this.inFlight.set(cacheKey, buildPromise);
    return buildPromise;
  }

  private async buildPreview(resource: vscode.Uri, previewUri: vscode.Uri): Promise<vscode.Uri> {
    const temporaryUri = vscode.Uri.joinPath(
      this.rootUri,
      `${path.basename(previewUri.fsPath, '.mp4')}.building.mp4`
    );

    this.output.appendLine(
      `compatibilityPreviewBuildStart ${resource.fsPath} -> ${previewUri.fsPath}`
    );
    await transcodeToMp4(resource.fsPath, temporaryUri.fsPath);

    try {
      await rename(temporaryUri.fsPath, previewUri.fsPath);
    } catch (error) {
      try {
        await statFile(previewUri.fsPath);
      } catch {
        throw error;
      }
    }

    this.output.appendLine(`compatibilityPreviewBuildReady ${previewUri.fsPath}`);
    await this.pruneToConfiguredLimit();
    return previewUri;
  }

  async clear(): Promise<number> {
    const files = await this.listCacheFiles();
    await Promise.all(
      files.map((entry) =>
        rm(path.join(this.rootUri.fsPath, entry.name), {
          force: true
        })
      )
    );
    return files.length;
  }

  async pruneToConfiguredLimit(): Promise<void> {
    const maxBytes = getCompatibilityCacheMaxBytes();
    if (maxBytes <= 0) {
      return;
    }

    const files = await this.listCacheFiles();
    let totalBytes = files.reduce((sum, entry) => sum + entry.size, 0);
    if (totalBytes <= maxBytes) {
      return;
    }

    const sorted = [...files].sort((left, right) => left.mtimeMs - right.mtimeMs);
    for (const entry of sorted) {
      await rm(path.join(this.rootUri.fsPath, entry.name), {
        force: true
      });
      totalBytes -= entry.size;
      this.output.appendLine(`compatibilityPreviewPruned ${entry.name}`);
      if (totalBytes <= maxBytes) {
        break;
      }
    }
  }

  dispose(): void {
    this.inFlight.clear();
  }

  private async listCacheFiles(): Promise<Array<{ name: string; size: number; mtimeMs: number }>> {
    try {
      await mkdir(this.rootUri.fsPath, {
        recursive: true
      });
      const entries = await readdir(this.rootUri.fsPath, {
        withFileTypes: true
      });
      const files = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp4'))
          .map(async (entry) => {
            const fullPath = path.join(this.rootUri.fsPath, entry.name);
            const stats = await statFile(fullPath);
            return {
              name: entry.name,
              size: stats.size,
              mtimeMs: stats.mtimeMs
            };
          })
      );
      return files;
    } catch {
      return [];
    }
  }
}

type ServerSession = {
  source: vscode.Uri;
  sourceFileName: string;
  asset: vscode.Uri;
  config: PlayerConfig;
};

type ServedPlayerSession = {
  externalPlayerUri: string;
  dispose: () => void;
};

class MediaServer implements vscode.Disposable {
  private server: http.Server | undefined;
  private startupPromise: Promise<void> | undefined;
  private port: number | undefined;
  private externalOriginPromise: Promise<string> | undefined;
  private readonly sessions = new Map<string, ServerSession>();

  constructor(private readonly output: vscode.OutputChannel) {}

  async createPlayerSession(
    source: vscode.Uri,
    previewUri: vscode.Uri,
    config: PlayerConfig
  ): Promise<ServedPlayerSession> {
    await this.ensureStarted();

    const token = randomUUID();
    this.sessions.set(token, {
      source,
      sourceFileName: basenameOfUri(source) || 'video.webm',
      asset: previewUri,
      config
    });

    const playerUri = vscode.Uri.parse(`http://127.0.0.1:${this.port}/player/${token}/index.html`);
    const externalPlayerUri = (await vscode.env.asExternalUri(playerUri)).toString(true);
    this.output.appendLine(
      `compatibilityPlayerReady ${source.toString()} -> asset=${previewUri.toString()} player=${externalPlayerUri}`
    );

    let disposed = false;

    return {
      externalPlayerUri,
      dispose: () => {
        if (disposed) {
          return;
        }

        disposed = true;
        this.sessions.delete(token);
      }
    };
  }

  async getExternalOrigin(): Promise<string> {
    if (this.externalOriginPromise) {
      return this.externalOriginPromise;
    }

    this.externalOriginPromise = (async () => {
      await this.ensureStarted();
      const forwarded = await vscode.env.asExternalUri(
        vscode.Uri.parse(`http://127.0.0.1:${this.port}/`)
      );
      return new URL(forwarded.toString(true)).origin;
    })();

    return this.externalOriginPromise;
  }

  dispose(): void {
    this.sessions.clear();
    this.startupPromise = undefined;
    this.externalOriginPromise = undefined;

    if (this.server) {
      this.server.close();
      this.server = undefined;
      this.port = undefined;
    }
  }

  private async ensureStarted(): Promise<void> {
    if (this.startupPromise) {
      return this.startupPromise;
    }

    this.startupPromise = new Promise<void>((resolve, reject) => {
      const server = http.createServer((request, response) => {
        void this.handleRequest(request, response);
      });

      server.on('error', (error) => {
        this.output.appendLine(`serverError ${formatUnknownError(error)}`);
      });

      server.once('error', (error) => {
        reject(error);
      });

      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo | null;
        if (!address) {
          reject(new Error('Loopback media server did not expose a listening address.'));
          return;
        }

        this.server = server;
        this.port = address.port;
        this.output.appendLine(`serverReady {"port":${this.port}}`);
        resolve();
      });
    });

    return this.startupPromise;
  }

  private async handleRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse
  ): Promise<void> {
    try {
      this.output.appendLine(
        `request ${request.method ?? 'UNKNOWN'} ${request.url ?? '/'}${
          request.headers.range ? ` range=${request.headers.range}` : ''
        }`
      );

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, {
          Allow: 'GET, HEAD'
        });
        response.end();
        return;
      }

      const url = new URL(request.url ?? '/', 'http://localhost');
      const route = parseRoute(url.pathname);
      if (!route) {
        response.writeHead(404);
        response.end();
        return;
      }

      const session = this.sessions.get(route.token);
      if (!session) {
        this.output.appendLine(`requestMiss ${route.token}`);
        response.writeHead(404);
        response.end();
        return;
      }

      if (route.kind === 'player') {
        const html = buildCompatibilityPlayerPage(route.token, session);
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Length': Buffer.byteLength(html),
          'Content-Type': 'text/html; charset=utf-8'
        });

        if (request.method === 'HEAD') {
          response.end();
          return;
        }

        response.end(html);
        return;
      }

      await this.serveMediaFile(session.asset, request, response);
    } catch (error) {
      this.output.appendLine(`requestError ${formatUnknownError(error)}`);
      if (!response.headersSent) {
        response.writeHead(500, {
          'Content-Type': 'text/plain; charset=utf-8'
        });
      }
      response.end('Internal Server Error');
    }
  }

  private async serveMediaFile(
    resource: vscode.Uri,
    request: http.IncomingMessage,
    response: http.ServerResponse
  ): Promise<void> {
    const fileStats = await statFile(resource.fsPath);
    const byteRange = parseRangeHeader(request.headers.range, fileStats.size);

    if (byteRange === 'invalid') {
      this.output.appendLine(`respond 416 ${resource.toString()}`);
      response.writeHead(416, {
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes */${fileStats.size}`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      });
      response.end();
      return;
    }

    const headers: Record<string, string | number> = {
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Content-Type': 'video/mp4',
      'X-Content-Type-Options': 'nosniff'
    };

    if (byteRange) {
      this.output.appendLine(
        `respond 206 ${resource.toString()} bytes=${byteRange.start}-${byteRange.end}/${fileStats.size}`
      );
      headers['Content-Length'] = byteRange.end - byteRange.start + 1;
      headers['Content-Range'] = `bytes ${byteRange.start}-${byteRange.end}/${fileStats.size}`;
      response.writeHead(206, headers);
    } else {
      this.output.appendLine(
        `respond 200 ${resource.toString()} bytes=0-${fileStats.size - 1}/${fileStats.size}`
      );
      headers['Content-Length'] = fileStats.size;
      response.writeHead(200, headers);
    }

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    const stream = fs.createReadStream(resource.fsPath, byteRange ?? undefined);
    stream.on('error', (error) => {
      this.output.appendLine(`streamError ${formatUnknownError(error)}`);
      response.destroy(error);
    });
    stream.pipe(response);
  }
}

type ParsedRoute =
  | {
      kind: 'player';
      token: string;
    }
  | {
      kind: 'media';
      token: string;
    };

type ByteRange = {
  start: number;
  end: number;
};

async function transcodeToMp4(inputPath: string, outputPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(
      'ffmpeg',
      buildCompatibilityTranscodeArgs(inputPath, outputPath),
      {
        stdio: ['ignore', 'ignore', 'pipe']
      }
    );

    let stderr = '';

    ffmpeg.on('error', (error) => {
      reject(new Error(`ffmpeg launch failed: ${formatUnknownError(error)}`));
    });

    ffmpeg.stderr.on('data', (chunk: Buffer | string) => {
      stderr = trimTail(`${stderr}${chunk.toString()}`, 4000);
    });

    ffmpeg.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const detail = stderr ? `: ${stderr.trim()}` : '';
      reject(
        new Error(
          `ffmpeg exited with ${signal ? `signal ${signal}` : `code ${String(code)}`}${detail}`
        )
      );
    });
  });
}

function buildBootstrap(
  resource: vscode.Uri,
  webview: vscode.Webview,
  configuration: PlayerConfig
): PlayerBootstrap {
  return {
    fileName: basenameOfUri(resource),
    sourceUri: webview.asWebviewUri(resource).toString(),
    preferContainFit: configuration.fitMode === 'contain',
    restorePlaybackState: configuration.restorePlaybackState,
    defaultMuted: configuration.defaultMuted,
    defaultLoop: configuration.loop,
    compatibilityMode: configuration.compatibilityMode
  };
}

function getLocalResourceRoots(
  extensionUri: vscode.Uri,
  resource: vscode.Uri,
  cacheRootUri: vscode.Uri,
  compatibilityPreviewUri: vscode.Uri | undefined
): vscode.Uri[] {
  const roots = [
    vscode.Uri.joinPath(extensionUri, 'media'),
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview')
  ];

  if (resource.scheme === 'file') {
    roots.push(directoryOf(resource));
  }

  if (cacheRootUri.scheme === 'file') {
    roots.push(cacheRootUri);
  }

  if (compatibilityPreviewUri?.scheme === 'file') {
    roots.push(directoryOf(compatibilityPreviewUri));
  }

  return dedupeUris(roots);
}

function dedupeUris(uris: vscode.Uri[]): vscode.Uri[] {
  const seen = new Set<string>();
  const result: vscode.Uri[] = [];

  for (const uri of uris) {
    const key = uri.toString();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(uri);
  }

  return result;
}

function directoryOf(uri: vscode.Uri): vscode.Uri {
  const lastSlash = uri.path.lastIndexOf('/');
  if (lastSlash <= 0) {
    return uri.with({
      path: '/'
    });
  }

  return uri.with({
    path: uri.path.slice(0, lastSlash)
  });
}

function parseRoute(pathname: string): ParsedRoute | undefined {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length < 2) {
    return undefined;
  }

  if (parts[0] === 'player') {
    return {
      kind: 'player',
      token: parts[1]
    };
  }

  if (parts[0] === 'media') {
    return {
      kind: 'media',
      token: parts[1]
    };
  }

  return undefined;
}

function buildCompatibilityPlayerPage(token: string, session: ServerSession): string {
  const fitClass = session.config.fitMode === 'cover' ? 'player-cover' : 'player-contain';
  const videoPath = `/media/${token}/${encodeURIComponent(path.basename(session.asset.fsPath))}`;
  const storageKey = `webm-preview:${session.source.toString()}:compat`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(session.sourceFileName)}</title>
    <style>
      :root { color-scheme: dark; }
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        background: #0c0d0f;
        color: #d5d7db;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      }
      body {
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .frame {
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      video {
        width: 100%;
        height: 100%;
        background: #000;
        outline: none;
      }
      .player-contain { object-fit: contain; }
      .player-cover { object-fit: cover; }
      .message {
        position: absolute;
        inset: auto 24px 24px;
        max-width: min(36rem, calc(100% - 48px));
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(12, 13, 15, 0.88);
        border: 1px solid rgba(255,255,255,0.12);
        color: #d5d7db;
        font-size: 13px;
        pointer-events: none;
      }
      .message[hidden] { display: none; }
    </style>
  </head>
  <body>
    <div class="frame">
      <video id="player" class="${fitClass}" controls playsinline preload="metadata" ${
        session.config.defaultMuted ? 'muted' : ''
      } ${session.config.loop ? 'loop' : ''}>
        <source src="${videoPath}" type="video/mp4" />
      </video>
      <div id="message" class="message">Loading compatibility preview…</div>
    </div>
    <script>
      const player = document.getElementById('player');
      const message = document.getElementById('message');
      const storageKey = ${JSON.stringify(storageKey)};
      const restorePlaybackState = ${JSON.stringify(session.config.restorePlaybackState)};

      const notify = (type, detail = {}) => {
        try {
          window.parent.postMessage({ source: 'webm-player-compat', type, ...detail }, '*');
        } catch {}
      };

      const hideMessage = () => {
        message.hidden = true;
      };

      const showMessage = (text) => {
        message.textContent = text;
        message.hidden = false;
      };

      if (restorePlaybackState) {
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const state = JSON.parse(raw);
            if (typeof state.currentTime === 'number' && Number.isFinite(state.currentTime)) {
              player.addEventListener('loadedmetadata', () => {
                const maxTime = Math.max(0, player.duration - 0.25);
                player.currentTime = Math.min(state.currentTime, maxTime);
              }, { once: true });
            }
            if (typeof state.muted === 'boolean') {
              player.muted = state.muted;
            }
            if (typeof state.volume === 'number' && Number.isFinite(state.volume)) {
              player.volume = Math.max(0, Math.min(1, state.volume));
            }
            if (typeof state.playbackRate === 'number' && Number.isFinite(state.playbackRate)) {
              player.playbackRate = Math.max(0.25, Math.min(16, state.playbackRate));
            }
          }
        } catch {}
      }

      const persistState = () => {
        if (!restorePlaybackState) {
          return;
        }
        try {
          localStorage.setItem(storageKey, JSON.stringify({
            currentTime: player.currentTime,
            muted: player.muted,
            volume: player.volume,
            playbackRate: player.playbackRate
          }));
        } catch {}
      };

      notify('frame-ready');

      player.addEventListener('loadedmetadata', () => {
        hideMessage();
        notify('loadedmetadata', { duration: player.duration });
      });
      player.addEventListener('canplay', () => {
        hideMessage();
        notify('canplay');
      });
      player.addEventListener('playing', () => {
        hideMessage();
        notify('playing');
      });
      player.addEventListener('timeupdate', persistState);
      player.addEventListener('pause', persistState);
      player.addEventListener('ratechange', persistState);
      player.addEventListener('volumechange', persistState);
      window.addEventListener('beforeunload', persistState);

      player.addEventListener('error', () => {
        const error = player.error;
        const code = error ? error.code : 'unknown';
        const text = 'The compatibility preview could not open the video source (code ' + code + ').';
        showMessage(text);
        notify('error', { code, message: text });
      });
    </script>
  </body>
</html>`;
}

function parseRangeHeader(
  value: string | undefined,
  totalLength: number
): ByteRange | 'invalid' | undefined {
  if (!value) {
    return undefined;
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match) {
    return 'invalid';
  }

  const [, startText, endText] = match;
  if (!startText && !endText) {
    return 'invalid';
  }

  let start: number;
  let end: number;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return 'invalid';
    }

    start = Math.max(0, totalLength - suffixLength);
    end = totalLength - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : totalLength - 1;
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= totalLength
  ) {
    return 'invalid';
  }

  return {
    start,
    end: Math.min(end, totalLength - 1)
  };
}

function getConfiguration(resource: vscode.Uri): PlayerConfig {
  const config = vscode.workspace.getConfiguration('webmPreview', resource);
  const fitMode = config.get<FitMode>('fitMode', 'contain');

  return {
    restorePlaybackState: config.get<boolean>('restorePlaybackState', true),
    defaultMuted: config.get<boolean>('defaultMuted', false),
    loop: config.get<boolean>('loop', false),
    fitMode: fitMode === 'cover' ? 'cover' : 'contain',
    compatibilityMode:
      config.get<boolean>('compatibilityFallback', true) === false ? 'none' : 'automatic'
  };
}

function getCompatibilityCacheMaxBytes(
  config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('webmPreview')
): number {
  const maxMb = config.get<number>('maxCompatibilityCacheMb', 256);
  if (!Number.isFinite(maxMb) || maxMb <= 0) {
    return 0;
  }

  return Math.round(maxMb * 1024 * 1024);
}

async function postToWebview(
  webview: vscode.Webview,
  message: ExtensionMessage
): Promise<void> {
  await webview.postMessage(message);
}

function basenameOfUri(uri: vscode.Uri): string {
  const lastSlash = uri.path.lastIndexOf('/');
  return lastSlash >= 0 ? uri.path.slice(lastSlash + 1) : uri.path;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function trimTail(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(value.length - maxLength);
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
