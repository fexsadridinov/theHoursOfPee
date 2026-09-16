import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const src = path.join(root, 'src')
const from = path.join(src, 'styles.css')
const out = path.join(src, 'app.css')
const pnpm = path.join(root, 'node_modules/.pnpm')

function resolveTw(pkg) {
  const dir = fs.readdirSync(pnpm).find(name => name.startsWith(`${pkg.replace('/', '+')}@`))
  if (!dir) throw new Error(`Could not find ${pkg}`)
  return path.join(pnpm, dir, 'node_modules', pkg)
}

const { compile } = await import(pathToFileURL(path.join(resolveTw('@tailwindcss/node'), 'dist/index.mjs')).href)
const { Scanner } = await import(pathToFileURL(path.join(resolveTw('@tailwindcss/oxide'), 'index.js')).href)

export async function buildCss() {
  const css = fs.readFileSync(from, 'utf8')
  const compiler = await compile(css, { base: src, from, onDependency() {} })
  const scanner = new Scanner({ sources: [{ base: src, pattern: '**/*.{ts,tsx}', negated: false }] })
  const built = compiler.build(scanner.scan())
  fs.writeFileSync(out, `/* generated from styles.css — do not edit */\n${built}`)
  return out
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log('wrote', await buildCss())
}
