import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const output = resolve(root, 'native-web');
const assets = ['index.html', 'styles.css', 'manifest.webmanifest', 'service-worker.js', 'icons', 'src'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(assets.map((asset) => cp(resolve(root, asset), resolve(output, asset), { recursive: true })));
