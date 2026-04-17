import { mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const fixturesDir = path.resolve('tests/fixtures');

await mkdir(fixturesDir, {
  recursive: true
});

await generateVideoOnlyFixture(path.join(fixturesDir, 'direct-basic.webm'));
await generateAudioFixture(path.join(fixturesDir, 'audio-basic.webm'));

console.log(`generated fixtures in ${fixturesDir}`);

async function generateVideoOnlyFixture(outputPath) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=320x180:rate=25',
    '-t',
    '2',
    '-c:v',
    'libvpx',
    '-crf',
    '12',
    '-b:v',
    '0',
    '-an',
    outputPath
  ]);
}

async function generateAudioFixture(outputPath) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=320x180:rate=25',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=660:sample_rate=48000',
    '-t',
    '2',
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
    outputPath
  ]);
}
