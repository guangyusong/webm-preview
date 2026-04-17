import { mkdir } from 'node:fs/promises';
import { build, context as createContext } from 'esbuild';

const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
  external: ['vscode'],
  target: 'es2022'
};

const builds = [
  {
    name: 'node extension',
    options: {
      ...shared,
      entryPoints: ['src/extension.ts'],
      outfile: 'dist/node/extension.js',
      platform: 'node',
      format: 'cjs'
    }
  },
  {
    name: 'web extension',
    options: {
      ...shared,
      entryPoints: ['src/extension.web.ts'],
      outfile: 'dist/web/extension.js',
      platform: 'browser',
      format: 'cjs'
    }
  },
  {
    name: 'webview',
    options: {
      ...shared,
      entryPoints: ['src/webview/player.ts'],
      outfile: 'dist/webview/player.js',
      platform: 'browser',
      format: 'iife',
      globalName: 'WebmPlayer'
    }
  },
  {
    name: 'shared compatibility',
    options: {
      ...shared,
      entryPoints: ['src/shared/compatibility.ts'],
      outfile: 'dist/shared/compatibility.js',
      platform: 'node',
      format: 'cjs'
    }
  }
];

await Promise.all([
  mkdir('dist/node', { recursive: true }),
  mkdir('dist/web', { recursive: true }),
  mkdir('dist/webview', { recursive: true }),
  mkdir('dist/shared', { recursive: true })
]);

if (watch) {
  const contexts = [];

  for (const buildConfig of builds) {
    const ctx = await createContext(buildConfig.options);
    await ctx.watch();
    contexts.push(ctx);
  }

  console.log(`watching ${contexts.length} build targets`);
} else {
  await Promise.all(builds.map((buildConfig) => build(buildConfig.options)));
}
