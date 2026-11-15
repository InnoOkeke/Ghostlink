import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { compile } from 'tailwindcss';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function collectUiCandidates(dir: string): string[] {
  const tokens = new Set<string>();
  const stack = [dir];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (/\.(tsx|ts|html)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const parts = content.split(/[\s"'`<>{}();,]+/);
        for (const part of parts) {
          if (part) {
            tokens.add(part);
          }
        }
      }
    }
  }

  return Array.from(tokens);
}

function tailwindV4(): Plugin {
  const uiDir = path.resolve(__dirname, 'src', 'ui');
  const tailwindEntry = path.resolve(__dirname, 'node_modules', 'tailwindcss', 'index.css');

  return {
    name: 'ghostlink-tailwind-v4',
    enforce: 'pre',
    async transform(code, id) {
      const cleanId = id.split('?')[0];
      if (!cleanId.endsWith('styles.css')) {
        return null;
      }

      const compiler = await compile(code, {
        base: path.dirname(cleanId),
        from: cleanId,
        loadStylesheet: async (sheetId, base) => {
          const resolved =
            sheetId === 'tailwindcss'
              ? tailwindEntry
              : path.resolve(base, sheetId);
          return {
            path: resolved,
            base: path.dirname(resolved),
            content: fs.readFileSync(resolved, 'utf-8')
          };
        }
      });

      const candidates = collectUiCandidates(uiDir);
      const compiledCss = compiler.build(candidates);
      return { code: compiledCss, map: null };
    }
  };
}

export default defineConfig({
  root: 'src/ui',
  plugins: [tailwindV4(), react()],
  build: { outDir: '../../dist/ui', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } }
});
