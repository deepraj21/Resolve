import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

fs.mkdirSync(path.join(root, 'public/css'), { recursive: true });
const sdCss = path.join(root, 'node_modules/streamdown/styles.css');
const outCss = path.join(root, 'public/css/streamdown.css');
if (fs.existsSync(sdCss)) {
  fs.copyFileSync(sdCss, outCss);
}

await esbuild.build({
  entryPoints: [path.join(root, 'public/js/ai-stream-entry.jsx')],
  bundle: true,
  outfile: path.join(root, 'public/js/ai-stream.bundle.js'),
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  jsxImportSource: 'react',
  loader: { '.jsx': 'jsx' },
  minify: true,
});

console.log('Built public/js/ai-stream.bundle.js');
