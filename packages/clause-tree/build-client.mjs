/** 把页面脚本（src/client）打包成 dist/assets/diagram.js，并把样式、页面模板拷到 dist/assets/。 */
import { cpSync } from 'node:fs';
import { build } from 'esbuild';

await build({
  entryPoints: ['src/client/main.ts'],
  outfile: 'dist/assets/diagram.js',
  bundle: true,
  format: 'iife',
  target: 'es2022',
  loader: { '.html': 'text' },
  logLevel: 'warning',
});
cpSync('src/assets', 'dist/assets', { recursive: true });
