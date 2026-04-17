import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const marketplaceDir = path.join(repoRoot, 'assets', 'marketplace');
const demoDir = path.join(repoRoot, 'assets', 'demo');

await mkdir(marketplaceDir, { recursive: true });
await mkdir(demoDir, { recursive: true });

const assets = [
  {
    name: 'hero',
    svg: buildHeroSvg()
  },
  {
    name: 'direct-playback',
    svg: buildDirectPlaybackSvg()
  },
  {
    name: 'compatibility-fallback',
    svg: buildCompatibilityFallbackSvg()
  }
];

for (const asset of assets) {
  const svgPath = path.join(marketplaceDir, `${asset.name}.svg`);
  const pngPath = path.join(marketplaceDir, `${asset.name}.png`);
  await writeFile(svgPath, asset.svg, 'utf8');
  await execFileAsync('magick', [svgPath, pngPath]);
}

const demoVideoPath = path.join(demoDir, 'aurora-sample.webm');
const demoPosterPath = path.join(demoDir, 'aurora-poster.png');

await execFileAsync('ffmpeg', [
  '-y',
  '-hide_banner',
  '-loglevel',
  'error',
  '-f',
  'lavfi',
  '-i',
  'mandelbrot=size=1280x720:rate=30',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:sample_rate=48000',
  '-t',
  '5',
  '-c:v',
  'libvpx',
  '-crf',
  '12',
  '-b:v',
  '0',
  '-c:a',
  'libopus',
  '-b:a',
  '96k',
  '-shortest',
  demoVideoPath
]);

await execFileAsync('ffmpeg', [
  '-y',
  '-hide_banner',
  '-loglevel',
  'error',
  '-ss',
  '1.0',
  '-i',
  demoVideoPath,
  '-frames:v',
  '1',
  demoPosterPath
]);

console.log(`generated promo assets in ${marketplaceDir}`);
console.log(`generated demo assets in ${demoDir}`);

function buildHeroSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1600" height="900" viewBox="0 0 1600 900" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="140" y1="80" x2="1420" y2="820" gradientUnits="userSpaceOnUse">
      <stop stop-color="#07111E"/>
      <stop offset="1" stop-color="#131A27"/>
    </linearGradient>
    <linearGradient id="video" x1="420" y1="182" x2="1160" y2="688" gradientUnits="userSpaceOnUse">
      <stop stop-color="#D34B6A"/>
      <stop offset="0.45" stop-color="#E18831"/>
      <stop offset="1" stop-color="#165CB4"/>
    </linearGradient>
    <linearGradient id="badge" x1="0" y1="0" x2="300" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F16285"/>
      <stop offset="1" stop-color="#F7983D"/>
    </linearGradient>
    <filter id="shadow" x="160" y="52" width="1280" height="796" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="22" stdDeviation="28" flood-color="#03070D" flood-opacity="0.42"/>
    </filter>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <circle cx="1320" cy="110" r="220" fill="#FFB470" fill-opacity="0.08"/>
  <circle cx="240" cy="810" r="260" fill="#F15D83" fill-opacity="0.08"/>
  <g filter="url(#shadow)">
    <rect x="182" y="84" width="1236" height="732" rx="26" fill="#0D1118"/>
    <rect x="182" y="84" width="1236" height="52" rx="26" fill="#141B25"/>
    <rect x="182" y="110" width="1236" height="706" rx="0" fill="#0D1118"/>
    <circle cx="216" cy="110" r="7" fill="#EC6A5F"/>
    <circle cx="238" cy="110" r="7" fill="#F5BF4F"/>
    <circle cx="260" cy="110" r="7" fill="#62C655"/>
    <rect x="206" y="152" width="84" height="638" fill="#121924"/>
    <rect x="308" y="152" width="114" height="42" rx="14" fill="#1A2130"/>
    <circle cx="332" cy="173" r="11" fill="#F16285"/>
    <path d="M328 167.5L338 173L328 178.5V167.5Z" fill="#0D1118"/>
    <text x="352" y="179" fill="#E6E9EF" font-family="Helvetica Neue, Arial, sans-serif" font-size="22" font-weight="700">aurora-sample.webm</text>
    <rect x="308" y="216" width="1086" height="548" rx="22" fill="#06080D"/>
    <rect x="338" y="182" width="210" height="42" rx="21" fill="url(#badge)"/>
    <text x="366" y="209" fill="#090B10" font-family="Helvetica Neue, Arial, sans-serif" font-size="19" font-weight="800">Direct playback first</text>
    <rect x="342" y="246" width="1018" height="430" rx="18" fill="url(#video)"/>
    <circle cx="1062" cy="354" r="118" fill="#FFD8A8" fill-opacity="0.42"/>
    <circle cx="1170" cy="526" r="92" fill="#FFFFFF" fill-opacity="0.18"/>
    <circle cx="570" cy="414" r="164" fill="#170E2E" fill-opacity="0.42"/>
    <path d="M530 372C578 350 640 358 672 406C706 456 698 524 654 566C610 608 540 608 490 572C440 536 420 454 450 408C468 380 498 372 530 372Z" fill="#0B0E17" fill-opacity="0.38"/>
    <circle cx="852" cy="468" r="60" fill="#F2F4F8" fill-opacity="0.88"/>
    <path d="M832 435L896 468L832 501V435Z" fill="#D1476C"/>
    <rect x="342" y="696" width="1018" height="52" rx="14" fill="#111723"/>
    <rect x="388" y="720" width="498" height="8" rx="4" fill="#253144"/>
    <rect x="388" y="720" width="232" height="8" rx="4" fill="#F06A84"/>
    <circle cx="620" cy="724" r="10" fill="#FFD3A4"/>
    <circle cx="360" cy="722" r="12" fill="#F5F7FB"/>
    <path d="M355 715L369 722L355 729V715Z" fill="#131823"/>
    <text x="918" y="728" fill="#C7CDD8" font-family="Helvetica Neue, Arial, sans-serif" font-size="18" font-weight="600">Works outside the workspace</text>
    <rect x="970" y="174" width="352" height="46" rx="23" fill="#1B2433"/>
    <text x="995" y="203" fill="#E8ECF3" font-family="Helvetica Neue, Arial, sans-serif" font-size="19" font-weight="700">Fallback only when WebM fails</text>
  </g>
  <text x="182" y="56" fill="#F7F9FC" font-family="Helvetica Neue, Arial, sans-serif" font-size="56" font-weight="800">WebM Preview</text>
  <text x="182" y="812" fill="#D1D7E2" font-family="Helvetica Neue, Arial, sans-serif" font-size="26" font-weight="500">Focused VS Code preview for .webm files, with direct playback first</text>
  <text x="182" y="848" fill="#D1D7E2" font-family="Helvetica Neue, Arial, sans-serif" font-size="26" font-weight="500">and a local compatibility fallback only when needed.</text>
</svg>`;
}

function buildDirectPlaybackSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1600" height="900" viewBox="0 0 1600 900" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1600" y2="900" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0B1320"/>
      <stop offset="1" stop-color="#171E2B"/>
    </linearGradient>
    <linearGradient id="frame" x1="380" y1="168" x2="1210" y2="714" gradientUnits="userSpaceOnUse">
      <stop stop-color="#3C92FF"/>
      <stop offset="0.5" stop-color="#1B7E73"/>
      <stop offset="1" stop-color="#0E203F"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <rect x="120" y="96" width="1360" height="708" rx="28" fill="#0E121A"/>
  <rect x="120" y="96" width="1360" height="58" rx="28" fill="#151D27"/>
  <rect x="156" y="118" width="220" height="18" rx="9" fill="#273244"/>
  <rect x="154" y="184" width="1292" height="564" rx="24" fill="#070A10"/>
  <rect x="190" y="214" width="1220" height="474" rx="18" fill="url(#frame)"/>
  <circle cx="1114" cy="344" r="126" fill="#70C4FF" fill-opacity="0.34"/>
  <circle cx="494" cy="520" r="182" fill="#162A4B" fill-opacity="0.74"/>
  <path d="M760 454C760 355 840 276 938 276C1037 276 1118 355 1118 454C1118 553 1037 634 938 634C840 634 760 553 760 454Z" fill="#E9F2FF" fill-opacity="0.88"/>
  <path d="M900 397L1010 454L900 511V397Z" fill="#103A6C"/>
  <rect x="190" y="710" width="1220" height="18" rx="9" fill="#1A2230"/>
  <rect x="190" y="710" width="474" height="18" rx="9" fill="#4EA0FF"/>
  <circle cx="664" cy="719" r="13" fill="#DDEEFF"/>
  <rect x="120" y="42" width="220" height="42" rx="21" fill="#F16285"/>
  <text x="148" y="69" fill="#090B10" font-family="Helvetica Neue, Arial, sans-serif" font-size="22" font-weight="800">Direct playback</text>
  <rect x="1126" y="126" width="286" height="34" rx="17" fill="#1B2535"/>
  <text x="1152" y="148" fill="#EAF1FA" font-family="Helvetica Neue, Arial, sans-serif" font-size="16" font-weight="700">State restored: time, mute, rate, loop</text>
  <text x="120" y="846" fill="#D5DCE8" font-family="Helvetica Neue, Arial, sans-serif" font-size="28" font-weight="500">Files opened from outside the workspace still resolve correctly through localResourceRoots.</text>
</svg>`;
}

function buildCompatibilityFallbackSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1600" height="900" viewBox="0 0 1600 900" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1600" y2="900" gradientUnits="userSpaceOnUse">
      <stop stop-color="#10131A"/>
      <stop offset="1" stop-color="#1A2231"/>
    </linearGradient>
    <linearGradient id="video" x1="360" y1="194" x2="1120" y2="660" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1B2030"/>
      <stop offset="1" stop-color="#0A0D14"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <rect x="136" y="104" width="1328" height="692" rx="28" fill="#0E121A"/>
  <rect x="136" y="104" width="1328" height="58" rx="28" fill="#161E28"/>
  <rect x="174" y="196" width="850" height="516" rx="24" fill="url(#video)"/>
  <circle cx="598" cy="418" r="156" fill="#F06A84" fill-opacity="0.24"/>
  <circle cx="728" cy="480" r="172" fill="#F7A64A" fill-opacity="0.18"/>
  <circle cx="870" cy="366" r="140" fill="#4DA1FF" fill-opacity="0.18"/>
  <rect x="224" y="618" width="742" height="44" rx="14" fill="#131927"/>
  <text x="250" y="646" fill="#F3F7FD" font-family="Helvetica Neue, Arial, sans-serif" font-size="21" font-weight="700">Preparing compatibility preview...</text>
  <rect x="1058" y="196" width="368" height="516" rx="24" fill="#111823"/>
  <text x="1088" y="246" fill="#F6F9FD" font-family="Menlo, Monaco, monospace" font-size="22" font-weight="700">WebM Preview log</text>
  <text x="1088" y="300" fill="#C3CBD8" font-family="Menlo, Monaco, monospace" font-size="18">resolve file:///demo/aurora.webm</text>
  <text x="1088" y="340" fill="#C3CBD8" font-family="Menlo, Monaco, monospace" font-size="18">compatibilityPreviewRequested</text>
  <text x="1088" y="380" fill="#C3CBD8" font-family="Menlo, Monaco, monospace" font-size="18">compatibilityPreviewBuildStart</text>
  <text x="1088" y="420" fill="#F6AA4C" font-family="Menlo, Monaco, monospace" font-size="18">respond 206 ... bytes=0-65535</text>
  <text x="1088" y="460" fill="#8EE0AA" font-family="Menlo, Monaco, monospace" font-size="18">compatibilityPlayerReady</text>
  <text x="1088" y="500" fill="#C3CBD8" font-family="Menlo, Monaco, monospace" font-size="18">compatibility-canplay</text>
  <text x="1088" y="540" fill="#C3CBD8" font-family="Menlo, Monaco, monospace" font-size="18">compatibility-playing</text>
  <rect x="1088" y="608" width="296" height="38" rx="19" fill="#1B2535"/>
  <text x="1115" y="633" fill="#E8EEF8" font-family="Helvetica Neue, Arial, sans-serif" font-size="18" font-weight="700">Cache limit and clear command</text>
  <rect x="136" y="50" width="364" height="42" rx="21" fill="#F6A64A"/>
  <text x="163" y="77" fill="#11151D" font-family="Helvetica Neue, Arial, sans-serif" font-size="22" font-weight="800">Compatibility fallback</text>
  <text x="136" y="846" fill="#D5DCE8" font-family="Helvetica Neue, Arial, sans-serif" font-size="28" font-weight="500">Fallback is local-only, cached, and only used after a real direct-playback failure.</text>
</svg>`;
}
