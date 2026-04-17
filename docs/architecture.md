# Architecture Notes

## Product goal

Open `.webm` files in VS Code with a player that feels native to the editor, works for files inside or outside the workspace, and degrades honestly when the runtime cannot decode the media directly.

## Core decision

Use a `CustomReadonlyEditorProvider`.

Why:

- Binary media should not be forced through a text document model.
- The extension does not own save, backup, or undo semantics.
- Read-only custom editors match how users expect media previews to behave inside the editor grid.

## Playback strategy

The extension now uses a two-stage model:

1. Direct playback first.
2. Compatibility preview only after direct playback fails.

Direct playback is the intended architecture. The webview loads the original resource using `webview.asWebviewUri(...)`, and the extension explicitly adds the opened file’s directory to `localResourceRoots` when needed. This is important for files such as `~/Downloads/test.webm` that are outside the active workspace.

The compatibility preview is a desktop-only fallback. When enabled, the extension can generate a cached H.264 + MP3 preview with `ffmpeg` after a real media error. This keeps the common path simple while still providing a recovery path for runtimes where WebM playback in VS Code is unreliable.

## Runtime model

There are three separate concerns:

1. Extension host registration and fallback orchestration.
2. Webview rendering and state persistence.
3. Chromium media decoding.

The extension host does not run a localhost media server in the normal path. It registers the editor, configures local resource access, and only steps in when the webview reports a playback failure and asks for a compatibility preview.

When the fallback is needed, the extension serves the generated MP4 through a small loopback player page inside an iframe. That is deliberately isolated to the failure path, because direct MP4 playback through the same resource-loading path was not reliable across VS Code runtimes during testing.

## Remote and web support

The extension still produces both `main` and `browser` bundles.

- Desktop Node entry: direct playback plus optional compatibility preview generation.
- Browser entry: direct playback only.

This keeps the extension honest about environment limits. Browser-hosted VS Code cannot spawn executables, so preview generation is intentionally not part of that runtime.

## Security posture

The webview uses a strict CSP and only enables the capabilities it actually needs:

- `default-src 'none'`
- extension-scoped `media-src`
- extension-scoped `style-src`
- extension-scoped `script-src`
- exact forwarded loopback origin in `frame-src` only when the compatibility iframe is available

The direct path avoids a localhost transport entirely, which reduces complexity and aligns with VS Code’s guidance to prefer `asWebviewUri(...)` and message passing over local web servers when possible.

## State model

Playback state is stored with the webview state API rather than `localStorage`.

The extension restores:

- Current time
- Volume
- Mute
- Playback rate
- Loop

It does not auto-resume playback.

## Error handling

The extension should never imply that “WebM” guarantees playback inside every VS Code runtime.

The container may be valid while one of these still fails:

- Video codec support
- Audio codec support
- Combined stream support in the shipped Chromium runtime
- Resource loading policy inside the webview host

The player reports direct playback failures clearly, and only then attempts the compatibility path when configured to do so.

## What not to do

Avoid these traps:

- Do not make transcoding the default open path.
- Do not require `ffmpeg` for every user on every successful open.
- Do not assume files outside the workspace are readable from a webview without `localResourceRoots`.
- Do not hide a decoder failure behind a blank surface.
- Do not claim full browser-host parity when the browser runtime cannot spawn fallback tools.

## Release readiness

The current release posture is "preview, but shippable":

- direct playback is the intended first path
- compatibility fallback is explicit, cached, and desktop-only
- the cache has a size limit and a clear command
- smoke tests generate their own non-private fixtures

## Recommended next phase

The next meaningful upgrades are:

1. Add editor toolbar commands for fit mode and replay.
2. Add a metadata panel for codec and duration details.
3. Add real extension-host integration tests for custom-editor open behavior.
4. Explore a remote-safe compatibility strategy that does not require local `ffmpeg`.
