import * as vscode from 'vscode';
import { CompatibilityMode, FitMode, PlayerBootstrap, WebviewMessage } from './shared/contracts';
import { getPlayerWebviewHtml } from './shared/playerWebviewHtml';

const VIEW_TYPE = 'webmPreview.preview';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('WebM Preview');
  output.appendLine(`activate ${context.extension.id}@${context.extension.packageJSON.version} (web)`);
  context.subscriptions.push(output);

  context.subscriptions.push(
    vscode.commands.registerCommand('webmPreview.clearCompatibilityCache', async () => {
      void vscode.window.showInformationMessage(
        'WebM Preview only caches compatibility previews in desktop VS Code.'
      );
    })
  );

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, new WebOnlyProvider(context, output), {
      supportsMultipleEditorsPerDocument: true,
      webviewOptions: {
        retainContextWhenHidden: true
      }
    })
  );
}

class WebOnlyProvider implements vscode.CustomReadonlyEditorProvider<WebmDocument> {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel
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

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: getLocalResourceRoots(this.context.extensionUri, document.uri)
    };

    webviewPanel.webview.onDidReceiveMessage((message: WebviewMessage) => {
      if (message.type === 'telemetry') {
        this.output.appendLine(`telemetry ${message.event} ${safeJson(message.data ?? {})}`);
        return;
      }

      if (message.type === 'openExternal') {
        void vscode.env.openExternal(document.uri);
        return;
      }

      if (message.type === 'requestCompatibilityPreview') {
        void webviewPanel.webview.postMessage({
          type: 'compatibilityPreviewUnavailable',
          message:
            'This environment only supports direct playback. Compatibility preview generation requires desktop VS Code.'
        });
      }
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
      bootstrap: buildBootstrap(document.uri, webviewPanel.webview, getConfiguration(document.uri))
    });
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

function getLocalResourceRoots(extensionUri: vscode.Uri, resource: vscode.Uri): vscode.Uri[] {
  const roots = [
    vscode.Uri.joinPath(extensionUri, 'media'),
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview')
  ];

  if (resource.scheme === 'file') {
    roots.push(directoryOf(resource));
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

function getConfiguration(resource: vscode.Uri): PlayerConfig {
  const config = vscode.workspace.getConfiguration('webmPreview', resource);
  const fitMode = config.get<FitMode>('fitMode', 'contain');

  return {
    restorePlaybackState: config.get<boolean>('restorePlaybackState', true),
    defaultMuted: config.get<boolean>('defaultMuted', false),
    loop: config.get<boolean>('loop', false),
    fitMode: fitMode === 'cover' ? 'cover' : 'contain',
    compatibilityMode: 'none'
  };
}

function basenameOfUri(uri: vscode.Uri): string {
  const lastSlash = uri.path.lastIndexOf('/');
  return lastSlash >= 0 ? uri.path.slice(lastSlash + 1) : uri.path;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
