import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const execFileAsync = promisify(execFile)
const root = fileURLToPath(new URL('.', import.meta.url))
const src = path.join(root, 'src')

async function buildCss() {
  await execFileAsync(process.execPath, [path.join(root, 'scripts/build-css.mjs')], { cwd: root })
}

export default defineConfig({
  plugins: [
    {
      name: 'compile-tailwind',
      async buildStart() {
        await buildCss()
      },
      configureServer(server) {
        const rebuild = async () => {
          await buildCss()
          const id = path.join(src, 'app.css')
          const mod = server.moduleGraph.getModuleById(id)
          if (mod) void server.reloadModule(mod)
        }
        server.watcher.add(path.join(src, 'styles.css'))
        server.watcher.on('change', file => {
          if (file.endsWith('.tsx') || file.endsWith('styles.css')) void rebuild()
        })
      },
    },
    react(),
  ],
  resolve: { alias: [{ find: /^@\//, replacement: `${src}/` }] },
})
