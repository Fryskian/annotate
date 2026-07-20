import { cp, copyFile, mkdir, readFile, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('dist/wordpress/annotate-review/', root);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL('wordpress/', root), output, { recursive: true });
await copyFile(new URL('annotate.js', root), new URL('annotate.js', output));
await copyFile(new URL('LICENSE', root), new URL('LICENSE', output));

const plugin = await readFile(new URL('annotate-review.php', output), 'utf8');
if (!/Plugin Name:\s*Annotate Review/.test(plugin)) throw new Error('WordPress plugin header is missing');
console.log('Built dist/wordpress/annotate-review/');
