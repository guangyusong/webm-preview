# Publishing Notes

WebM Preview does not need a separate website.

A public GitHub repository is the right minimum:

- it gives `package.json` a real `repository` URL
- it provides a public issue tracker for `bugs`
- it lets Marketplace README images resolve over `https`
- it gives the VSIX and source a stable public home

## Suggested public metadata

Once the repository exists, add these fields to `package.json`:

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/<you>/webm-preview.git"
  },
  "homepage": "https://github.com/<you>/webm-preview#readme",
  "bugs": {
    "url": "https://github.com/<you>/webm-preview/issues"
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

1. Create a public GitHub repo and push this folder.
2. Add `repository`, `homepage`, and `bugs` fields.
3. Decide whether to keep `"preview": true` for the first Marketplace release.
4. Reference the promo PNGs from the README using the GitHub-backed `https` URLs.
5. Run `npm run build`, `npm test`, and `npm run package:vsix`.
6. Publish with `vsce publish` using your Marketplace publisher token.
