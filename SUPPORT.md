# Support

If playback fails, include these details in a bug report:

- VS Code version
- Operating system
- Whether the failure happened on direct playback or after the compatibility fallback started
- The latest `WebM Preview` output log lines
- Whether `ffmpeg` is installed and available on `PATH`

If the media is private, do not attach it. This extension does not require private user recordings for reproduction:

- run `npm test` to generate the public smoke-test fixtures
- report whether those fixtures open correctly
- if possible, include `ffprobe` stream info instead of the original file

Desktop fallback notes:

- Compatibility previews are generated locally with `ffmpeg`
- Generated previews are cached locally
- `WebM Preview: Clear Compatibility Cache` removes those cached files
