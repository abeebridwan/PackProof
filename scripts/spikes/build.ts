import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {headerHtml} from '../../src/client/navigation.js';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['scripts/spikes/phone.ts'], outfile: 'dist/phone.js', bundle: true, platform: 'browser', format: 'esm', target: 'es2022', metafile: true }).then(async result => {
  const { writeFile } = await import('node:fs/promises');
  await writeFile('dist/bundle-inputs.json', JSON.stringify(Object.keys(result.metafile.inputs), null, 2));
});
const icon='data:image/svg+xml;base64,'+(await readFile('public/icon.svg')).toString('base64');
const html=(await readFile('scripts/spikes/phone.html','utf8')).replace('<!-- PACKPROOF_HEADER -->',headerHtml('/tools',icon)).replace('/* PACKPROOF_HEADER_STYLE */',await readFile('src/client/navigation.css','utf8'));
await writeFile('dist/index.html',html);
console.log('Built PackProof device-check assets. Captures stay local; no offline viewer installed.');
