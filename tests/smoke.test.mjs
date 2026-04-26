import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = path.join(repoRoot, 'tests', 'fixtures');

await execFileAsync('node', ['scripts/generate-fixtures.mjs'], {
  cwd: repoRoot
});

const { buildCompatibilityTranscodeArgs } = await import('../dist/shared/compatibility.js');

test('video-only fixture is WebM with VP8 video and no audio', async () => {
  const fixturePath = path.join(fixturesDir, 'direct-basic.webm');
  assert.ok(existsSync(fixturePath), 'direct fixture missing');

  const probe = await ffprobeJson(fixturePath);
  const videoStreams = probe.streams.filter((stream) => stream.codec_type === 'video');
  const audioStreams = probe.streams.filter((stream) => stream.codec_type === 'audio');

  assert.equal(videoStreams.length, 1);
  assert.equal(videoStreams[0].codec_name, 'vp8');
  assert.equal(audioStreams.length, 0);
});

test('audio fixture is WebM with VP8 video and Opus audio', async () => {
  const fixturePath = path.join(fixturesDir, 'audio-basic.webm');
  assert.ok(existsSync(fixturePath), 'audio fixture missing');

  const probe = await ffprobeJson(fixturePath);
  const videoStreams = probe.streams.filter((stream) => stream.codec_type === 'video');
  const audioStreams = probe.streams.filter((stream) => stream.codec_type === 'audio');

  assert.equal(videoStreams.length, 1);
  assert.equal(videoStreams[0].codec_name, 'vp8');
  assert.equal(audioStreams.length, 1);
  assert.equal(audioStreams[0].codec_name, 'opus');
});

test('compatibility fallback transcodes to H.264 video with MP3 audio', async () => {
  const fixturePath = path.join(fixturesDir, 'audio-basic.webm');
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'webm-preview-smoke-'));
  const outputPath = path.join(tempDir, 'compat.mp4');

  await execFileAsync('ffmpeg', buildCompatibilityTranscodeArgs(fixturePath, outputPath), {
    cwd: repoRoot
  });

  const probe = await ffprobeJson(outputPath);
  const videoStreams = probe.streams.filter((stream) => stream.codec_type === 'video');
  const audioStreams = probe.streams.filter((stream) => stream.codec_type === 'audio');

  assert.equal(videoStreams.length, 1);
  assert.equal(videoStreams[0].codec_name, 'h264');
  assert.equal(audioStreams.length, 1);
  assert.equal(audioStreams[0].codec_name, 'mp3');
});

test('compatibility fallback handles video-only WebM files', async () => {
  const fixturePath = path.join(fixturesDir, 'direct-basic.webm');
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'webm-preview-smoke-'));
  const outputPath = path.join(tempDir, 'compat-video-only.mp4');

  await execFileAsync('ffmpeg', buildCompatibilityTranscodeArgs(fixturePath, outputPath), {
    cwd: repoRoot
  });

  const probe = await ffprobeJson(outputPath);
  const videoStreams = probe.streams.filter((stream) => stream.codec_type === 'video');
  const audioStreams = probe.streams.filter((stream) => stream.codec_type === 'audio');

  assert.equal(videoStreams.length, 1);
  assert.equal(videoStreams[0].codec_name, 'h264');
  assert.equal(audioStreams.length, 0);
});

test('publication metadata and icon assets exist', () => {
  const requiredFiles = [
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    'SUPPORT.md',
    'assets/icon.png'
  ];

  for (const relativePath of requiredFiles) {
    const absolutePath = path.join(repoRoot, relativePath);
    assert.ok(existsSync(absolutePath), `missing ${relativePath}`);
    assert.ok(statSync(absolutePath).size > 0, `${relativePath} is empty`);
  }
});

test('publication metadata prefers the workspace extension host', () => {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

  assert.deepEqual(packageJson.extensionKind, ['workspace', 'ui']);
});

async function ffprobeJson(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-print_format',
    'json',
    filePath
  ]);
  return JSON.parse(stdout);
}
