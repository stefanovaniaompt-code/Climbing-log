import fs from 'node:fs'
import path from 'node:path'

const roots = [
  'src',
  'scripts',
  'migration',
  'public',
  'supabase',
  '.github',
]

const extensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.html',
  '.md',
  '.yml',
  '.yaml',
  '.sql',
  '.txt',
  '.webmanifest',
])

const excludedDirectories = new Set([
  'node_modules',
  'dist',
  '.git',
  'coverage',
])

const suspiciousCodePoints = new Set([
  0x00c3,
  0x00c2,
  0x00e2,
  0x00ce,
  0xfffd,
])

function collectFiles(target, files) {
  if (!fs.existsSync(target)) return

  const stat = fs.statSync(target)

  if (stat.isFile()) {
    if (extensions.has(path.extname(target).toLowerCase())) {
      files.push(target)
    }
    return
  }

  if (!stat.isDirectory()) return

  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue
    collectFiles(path.join(target, entry.name), files)
  }
}

const files = []

for (const root of roots) {
  collectFiles(root, files)
}

for (const entry of fs.readdirSync('.')) {
  const fullPath = path.join('.', entry)

  if (
    fs.statSync(fullPath).isFile() &&
    extensions.has(path.extname(entry).toLowerCase())
  ) {
    files.push(fullPath)
  }
}

const problems = []

for (const file of [...new Set(files)].sort()) {
  const buffer = fs.readFileSync(file)

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    problems.push(`${file}: UTF-8 BOM detected`)
  }

  const text = buffer.toString('utf8')

  for (let index = 0; index < text.length; index += 1) {
    const codePoint = text.codePointAt(index)

    if (!suspiciousCodePoints.has(codePoint)) continue

    const line =
      text.slice(0, index).split('\n').length

    problems.push(
      `${file}:${line}: suspicious encoding character U+${codePoint
        .toString(16)
        .toUpperCase()
        .padStart(4, '0')}`
    )

    break
  }
}

if (problems.length > 0) {
  console.error('Encoding check failed:')
  for (const problem of problems) {
    console.error(`- ${problem}`)
  }
  process.exit(1)
}

console.log(`Encoding check passed (${files.length} text files scanned).`)
