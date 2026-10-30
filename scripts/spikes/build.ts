import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['scripts/spikes/phone.ts'], outfile: 'dist/phone.js', bundle: true, platform: 'browser', format: 'esm', target: 'es2022', metafile: true }).then(async result => {
  const { writeFile } = await import('node:fs/promises');
  await writeFile('dist/bundle-inputs.json', JSON.stringify(Object.keys(result.metafile.inputs), null, 2));
});
await copyFile('scripts/spikes/phone.html', 'dist/index.html');
console.log('Built P0 phone probe. No application or offline viewer implemented.');
