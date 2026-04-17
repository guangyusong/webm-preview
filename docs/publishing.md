# Publishing Notes

WebM Preview does not need a separate website.

A public GitHub repository is the right minimum:

- it gives `package.json` a real `repository` URL
- it provides a public issue tracker for `bugs`
- it lets Marketplace README images resolve over `https`
- it gives the VSIX and source a stable public home

## Current public metadata

This repository is now public at:

- `https://github.com/guangyusong/webm-preview`

The extension manifest already includes:

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/guangyusong/webm-preview.git"
  },
  "homepage": "https://github.com/guangyusong/webm-preview#readme",
  "bugs": {
    "url": "https://github.com/guangyusong/webm-preview/issues"
  }
}
```

## Promo assets

This repo includes reproducible promo assets:

- `assets/marketplace/hero.png`
- `assets/marketplace/direct-playback.png`
- `assets/marketplace/compatibility-fallback.png`
- `assets/demo/aurora-sample.webm`
- `assets/demo/aurora-poster.png`

Generate or refresh them with:

```bash
npm run assets:promo
```

## Final publish checklist

1. Decide whether to keep `"preview": true` for the first Marketplace release.
2. Run `npm run build`, `npm test`, and `npm run package:vsix`.
3. Publish with `vsce publish` using your Marketplace publisher token.
