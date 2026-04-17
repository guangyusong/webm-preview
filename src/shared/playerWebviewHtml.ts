import { PlayerBootstrap } from './contracts';

export function getPlayerWebviewHtml(options: {
  title: string;
  cspSource: string;
  styleUri: string;
  scriptUri: string;
  bootstrap: PlayerBootstrap;
  frameSourceOrigin?: string;
}): string {
  const settings = escapeHtmlAttribute(JSON.stringify(options.bootstrap));
  const frameSource = options.frameSourceOrigin ? options.frameSourceOrigin : "'none'";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; media-src ${options.cspSource}; img-src ${options.cspSource}; frame-src ${frameSource}; style-src ${options.cspSource}; script-src ${options.cspSource};"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(options.title)}</title>
    <link rel="stylesheet" href="${escapeHtmlAttribute(options.styleUri)}" />
  </head>
  <body class="loading">
    <main id="player-shell" class="player-shell" aria-label="${escapeHtmlAttribute(options.title)}">
      <iframe
        id="compatibility-frame"
        class="compatibility-frame"
        title="${escapeHtmlAttribute(options.title)} compatibility preview"
        allow="autoplay; fullscreen; picture-in-picture"
        referrerpolicy="no-referrer"
        hidden
      ></iframe>
      <div id="loading-indicator" class="loading-indicator" aria-hidden="true"></div>
      <p id="loading-message" class="loading-message">Loading preview…</p>
      <div id="error-message" class="loading-error" role="alert" hidden>
        <p id="error-copy">This VS Code webview could not open the video source.</p>
        <div class="error-actions">
          <button id="retry-button" type="button">Retry</button>
          <button id="open-external-button" type="button">Open Externally</button>
        </div>
      </div>
    </main>
    <div id="settings" data-settings="${settings}" hidden></div>
    <script type="module" src="${escapeHtmlAttribute(options.scriptUri)}"></script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value);
}
