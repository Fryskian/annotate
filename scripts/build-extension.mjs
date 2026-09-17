import { cp, copyFile, mkdir, readFile, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = new URL('extension/', root);
const output = new URL('dist/extension/', root);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
await copyFile(new URL('annotate.js', root), new URL('annotate.js', output));

const manifest = JSON.parse(await readFile(new URL('manifest.json', output), 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Extension manifest must use Manifest V3');
console.log('Built dist/extension/');
