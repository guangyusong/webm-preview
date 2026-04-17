export type FitMode = 'contain' | 'cover';

export type CompatibilityMode = 'none' | 'automatic';

export interface PlayerBootstrap {
  fileName: string;
  sourceUri: string;
  preferContainFit: boolean;
  restorePlaybackState: boolean;
  defaultMuted: boolean;
  defaultLoop: boolean;
  compatibilityMode: CompatibilityMode;
}

export interface PlayerState {
  currentTime?: number;
  volume?: number;
  muted?: boolean;
  playbackRate?: number;
  loop?: boolean;
}

export type WebviewMessage =
  | {
      type: 'telemetry';
      event: string;
      data?: Record<string, unknown>;
    }
  | {
      type: 'requestCompatibilityPreview';
      errorCode?: number;
      message?: string;
    }
  | {
      type: 'openExternal';
    };

export type ExtensionMessage =
  | {
      type: 'compatibilityPreviewPending';
    }
  | {
      type: 'compatibilityPreviewReady';
      sourceUri?: string;
      frameUri?: string;
    }
  | {
      type: 'compatibilityPreviewUnavailable';
      message: string;
    };
