import {
  ExtensionMessage,
  PlayerBootstrap,
  PlayerState,
  WebviewMessage
} from '../shared/contracts';

interface VsCodeApi<TState> {
  getState(): TState | undefined;
  setState(state: TState): TState;
  postMessage(message: WebviewMessage): void;
}

declare function acquireVsCodeApi<TState>(): VsCodeApi<TState>;

const vscode = acquireVsCodeApi<PlayerState>();
const settings = readSettings();
const savedState = settings.restorePlaybackState ? vscode.getState() ?? {} : {};

const body = document.body;
const shell = mustElement<HTMLElement>('player-shell');
const loadingIndicator = mustElement<HTMLElement>('loading-indicator');
const loadingMessage = mustElement<HTMLElement>('loading-message');
const errorMessage = mustElement<HTMLElement>('error-message');
const errorCopy = mustElement<HTMLElement>('error-copy');
const retryButton = mustElement<HTMLButtonElement>('retry-button');
const openExternalButton = mustElement<HTMLButtonElement>('open-external-button');
const compatibilityFrame = mustElement<HTMLIFrameElement>('compatibility-frame');

const video = document.createElement('video');
video.className = settings.preferContainFit ? 'player player-contain' : 'player player-cover';
video.controls = true;
video.playsInline = true;
video.preload = 'metadata';
video.loop = savedState.loop ?? settings.defaultLoop;
video.muted = savedState.muted ?? settings.defaultMuted;
video.volume = clampUnit(savedState.volume) ?? 1;
video.playbackRate = clampPlaybackRate(savedState.playbackRate) ?? 1;
video.hidden = true;
shell.prepend(video);

let metadataLoaded = false;
let requestedCompatibilityPreview = false;
let currentSourceKind: 'original' | 'compatibility' = 'original';
let currentCompatibilityMode: 'none' | 'iframe' = 'none';

retryButton.addEventListener('click', () => {
  requestedCompatibilityPreview = false;
  assignSource(settings.sourceUri, 'original');
});

openExternalButton.addEventListener('click', () => {
  vscode.postMessage({
    type: 'openExternal'
  });
});

type CompatibilityFrameEvent = {
  source?: string;
  type?: string;
  message?: string;
  duration?: unknown;
};

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = event.data as ExtensionMessage | CompatibilityFrameEvent;
  if (!message) {
    return;
  }

  if ('source' in message && message.source === 'webm-player-compat') {
    handleCompatibilityFrameMessage(message);
    return;
  }

  switch (message.type) {
    case 'compatibilityPreviewPending':
      setLoadingState('Preparing a compatibility preview…');
      return;
    case 'compatibilityPreviewReady':
      if ('frameUri' in message && typeof message.frameUri === 'string') {
        activateCompatibilityFrame(message.frameUri);
        return;
      }

      if ('sourceUri' in message && typeof message.sourceUri === 'string') {
        assignSource(message.sourceUri, 'compatibility');
      }
      return;
    case 'compatibilityPreviewUnavailable':
      showError(typeof message.message === 'string' ? message.message : 'Compatibility preview unavailable.');
      return;
  }
});

video.addEventListener('loadedmetadata', () => {
  metadataLoaded = true;
  restoreCurrentTime();
  postTelemetry('loadedmetadata', {
    sourceKind: currentSourceKind,
    width: video.videoWidth,
    height: video.videoHeight,
    duration: sanitizeNumber(video.duration)
  });
  persistState();
});

video.addEventListener('canplay', () => {
  renderReadyState();
  postTelemetry('canplay', {
    sourceKind: currentSourceKind
  });
});

video.addEventListener('timeupdate', () => {
  persistState();
});

video.addEventListener('pause', () => {
  persistState();
});

video.addEventListener('ratechange', () => {
  persistState();
});

video.addEventListener('volumechange', () => {
  persistState();
});

video.addEventListener('error', () => {
  const message = describeMediaError(video.error);
  postTelemetry('error', {
    sourceKind: currentSourceKind,
    code: video.error?.code,
    message
  });

  if (
    currentSourceKind === 'original' &&
    settings.compatibilityMode === 'automatic' &&
    !requestedCompatibilityPreview
  ) {
    requestedCompatibilityPreview = true;
    setLoadingState('Direct playback failed. Preparing a compatibility preview…');
    vscode.postMessage({
      type: 'requestCompatibilityPreview',
      errorCode: video.error?.code,
      message
    });
    return;
  }

  showError(message);
});

window.addEventListener('beforeunload', () => {
  persistState();
});

postTelemetry('scriptLoaded', {
  compatibilityMode: settings.compatibilityMode,
  canPlayWebm: video.canPlayType('video/webm') || 'no',
  canPlayVp8: video.canPlayType('video/webm; codecs="vp8"') || 'no',
  canPlayMp4: video.canPlayType('video/mp4') || 'no',
  canPlayH264: video.canPlayType('video/mp4; codecs="avc1.42E01E"') || 'no'
});

assignSource(settings.sourceUri, 'original');

function assignSource(sourceUri: string, sourceKind: 'original' | 'compatibility'): void {
  currentSourceKind = sourceKind;
  currentCompatibilityMode = 'none';
  metadataLoaded = false;
  errorMessage.hidden = true;
  errorCopy.textContent = '';
  setLoadingState(
    sourceKind === 'compatibility' ? 'Loading compatibility preview…' : 'Loading preview…'
  );

  video.pause();
  video.removeAttribute('src');
  video.load();
  video.src = sourceUri;
  video.hidden = true;
  compatibilityFrame.hidden = true;
  compatibilityFrame.removeAttribute('src');
  video.load();

  postTelemetry('sourceAssigned', {
    sourceKind,
    sourceUri
  });
}

function renderReadyState(): void {
  body.classList.remove('loading', 'error');
  body.classList.add('ready');
  loadingIndicator.hidden = true;
  loadingMessage.hidden = true;
  errorMessage.hidden = true;
  video.hidden = false;
  compatibilityFrame.hidden = true;
}

function setLoadingState(message: string): void {
  body.classList.remove('ready', 'error');
  body.classList.add('loading');
  loadingIndicator.hidden = false;
  loadingMessage.hidden = false;
  loadingMessage.textContent = message;
  errorMessage.hidden = true;
  video.hidden = true;
  compatibilityFrame.hidden = true;
}

function showError(message: string): void {
  currentCompatibilityMode = 'none';
  body.classList.remove('ready', 'loading');
  body.classList.add('error');
  loadingIndicator.hidden = true;
  loadingMessage.hidden = true;
  video.hidden = true;
  compatibilityFrame.hidden = true;
  errorCopy.textContent = message;
  errorMessage.hidden = false;
}

function activateCompatibilityFrame(frameUri: string): void {
  currentSourceKind = 'compatibility';
  currentCompatibilityMode = 'iframe';
  metadataLoaded = false;
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.hidden = true;
  setLoadingState('Loading compatibility preview…');
  compatibilityFrame.src = frameUri;
  compatibilityFrame.hidden = false;

  postTelemetry('compatibilityFrameAssigned', {
    frameUri
  });
}

function handleCompatibilityFrameMessage(message: CompatibilityFrameEvent): void {
  switch (message.type) {
    case 'frame-ready':
      postTelemetry('compatibilityFrameReady');
      return;
    case 'loadedmetadata':
    case 'canplay':
    case 'playing':
      body.classList.remove('loading', 'error');
      body.classList.add('ready');
      loadingIndicator.hidden = true;
      loadingMessage.hidden = true;
      errorMessage.hidden = true;
      video.hidden = true;
      compatibilityFrame.hidden = false;
      postTelemetry(`compatibility-${message.type}`, {
        duration:
          typeof message.duration === 'number' && Number.isFinite(message.duration)
            ? message.duration
            : undefined
      });
      return;
    case 'error':
      showError(message.message ?? 'The compatibility preview could not be opened.');
      postTelemetry('compatibility-error', {
        message: message.message
      });
      return;
  }
}

function restoreCurrentTime(): void {
  if (!metadataLoaded) {
    return;
  }

  const currentTime = clampNonNegative(savedState.currentTime);
  if (currentTime === undefined || currentTime === 0 || !Number.isFinite(video.duration)) {
    return;
  }

  const maxSeekableTime = Math.max(0, video.duration - 0.25);
  video.currentTime = Math.min(currentTime, maxSeekableTime);
}

function persistState(): void {
  if (!settings.restorePlaybackState) {
    return;
  }

  vscode.setState({
    currentTime: clampNonNegative(video.currentTime),
    volume: clampUnit(video.volume) ?? 1,
    muted: video.muted,
    playbackRate: clampPlaybackRate(video.playbackRate) ?? 1,
    loop: video.loop
  });
}

function describeMediaError(error: MediaError | null): string {
  if (!error) {
    return 'Chromium could not play this file in the VS Code webview.';
  }

  switch (error.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'Playback was aborted before the file finished loading.';
    case MediaError.MEDIA_ERR_NETWORK:
      return 'VS Code could not finish loading the file contents for playback.';
    case MediaError.MEDIA_ERR_DECODE:
      return 'The file loaded, but Chromium failed while decoding the video stream.';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'This VS Code webview could not open the video source.';
    default:
      return 'Chromium reported an unknown playback failure.';
  }
}

function readSettings(): PlayerBootstrap {
  const element = mustElement<HTMLElement>('settings');
  const raw = element.getAttribute('data-settings');
  if (!raw) {
    throw new Error('Missing player settings');
  }

  return JSON.parse(raw) as PlayerBootstrap;
}

function mustElement<TElement extends HTMLElement>(id: string): TElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element as TElement;
}

function postTelemetry(event: string, data?: Record<string, unknown>): void {
  vscode.postMessage({
    type: 'telemetry',
    event,
    data
  });
}

function clampUnit(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(1, Math.max(0, value));
}

function clampNonNegative(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, value);
}

function clampPlaybackRate(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(16, Math.max(0.25, value));
}

function sanitizeNumber(value: number): number | undefined {
  return Number.isFinite(value) ? value : undefined;
}
