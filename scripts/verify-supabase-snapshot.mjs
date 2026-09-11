import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const privateRoot = resolve(projectRoot, 'migration', 'private')
const requestedPath = process.argv[2]

if (!requestedPath) {
  throw new Error('Uso: node scripts/verify-supabase-snapshot.mjs <cartella-snapshot>')
}

const snapshotRoot = resolve(projectRoot, requestedPath)
if (!snapshotRoot.startsWith(`${privateRoot}${sep}`)) {
  throw new Error('La cartella snapshot deve trovarsi sotto migration/private/.')
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function resolveSnapshotFile(relativePath) {
  const absolutePath = resolve(snapshotRoot, relativePath)
  if (!absolutePath.startsWith(`${snapshotRoot}${sep}`)) {
    throw new Error(`Percorso non valido nel manifest: ${relativePath}`)
  }
  return absolutePath
}

const manifestPath = resolveSnapshotFile('manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
if (manifest.format !== 'climbing-coach-supabase-json-snapshot-v1') {
  throw new Error(`Formato snapshot non supportato: ${manifest.format ?? 'assente'}`)
}

const { manifestSha256, ...manifestCore } = manifest
const errors = []
if (sha256(JSON.stringify(manifestCore)) !== manifestSha256) {
  errors.push('checksum del manifest non valido')
}
if (!manifest.consistency?.valid) {
  errors.push('lo snapshot era incoerente al momento della cattura')
}
if (manifest.storage?.payloadExportRequired) {
  errors.push('lo snapshot richiede anche l’esportazione dei payload Storage')
}

let totalRows = 0
for (const entry of manifest.tables ?? []) {
  const content = await readFile(resolveSnapshotFile(entry.file), 'utf8')
  if (sha256(content) !== entry.sha256) {
    errors.push(`checksum non valido: ${entry.schema}.${entry.table}`)
    continue
  }
  const rows = JSON.parse(content)
  if (!Array.isArray(rows) || rows.length !== entry.rowCount) {
    errors.push(`conteggio non valido: ${entry.schema}.${entry.table}`)
    continue
  }
  totalRows += rows.length
}

const catalogContent = await readFile(resolveSnapshotFile(manifest.catalog.file), 'utf8')
if (sha256(catalogContent) !== manifest.catalog.sha256) {
  errors.push('checksum del catalogo non valido')
}

console.log(JSON.stringify({
  valid: errors.length === 0,
  projectRef: manifest.projectRef,
  capturedAt: manifest.capturedAt,
  tables: manifest.tables?.length ?? 0,
  rows: totalRows,
  storageObjects: manifest.storage?.objectMetadataRows ?? null,
  errors,
}, null, 2))

if (errors.length > 0) process.exitCode = 2
