import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRef = process.argv[2]
if (!/^[a-z0-9]{20}$/.test(projectRef ?? '')) {
  throw new Error('Uso: node scripts/snapshot-supabase-project.mjs <project-ref>')
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const privateRoot = resolve(projectRoot, 'migration', 'private')
const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const snapshotRoot = resolve(privateRoot, `${projectRef}-${timestamp}`)
if (!snapshotRoot.startsWith(`${privateRoot}${sep}`)) throw new Error('Percorso snapshot non valido.')

const cli = resolve(projectRoot, 'node_modules', 'supabase', 'dist', 'supabase.js')
const cliArgs = ['db', 'query', '--linked', '--project-ref', projectRef, '--output-format', 'json', '--agent', 'no']

function query(sql) {
  const raw = execFileSync(process.execPath, [cli, ...cliArgs, sql], {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  })
  return JSON.parse(raw)
}

function assertIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`Identificatore SQL non valido: ${value}`)
  return `"${value}"`
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

const schemas = ['auth', 'public', 'storage']
const schemaList = schemas.map(value => `'${value}'`).join(',')
const tables = query(`
  select table_schema, table_name
  from information_schema.tables
  where table_schema in (${schemaList}) and table_type = 'BASE TABLE'
  order by table_schema, table_name;
`)

const catalog = {
  columns: query(`
    select table_schema, table_name, ordinal_position, column_name, data_type, udt_name,
           is_nullable, column_default
    from information_schema.columns
    where table_schema in (${schemaList})
    order by table_schema, table_name, ordinal_position;
  `),
  constraints: query(`
    select n.nspname as schema_name, c.relname as table_name, con.conname as constraint_name,
           con.contype as constraint_type, pg_get_constraintdef(con.oid, true) as definition
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in (${schemaList})
    order by n.nspname, c.relname, con.conname;
  `),
  indexes: query(`
    select schemaname as schema_name, tablename as table_name, indexname as index_name, indexdef as definition
    from pg_indexes
    where schemaname in (${schemaList})
    order by schemaname, tablename, indexname;
  `),
  policies: query(`
    select schemaname as schema_name, tablename as table_name, policyname as policy_name,
           permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname in (${schemaList})
    order by schemaname, tablename, policyname;
  `),
  functions: query(`
    select n.nspname as schema_name, p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as arguments,
           pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in (${schemaList})
    order by n.nspname, p.proname, arguments;
  `),
  triggers: query(`
    select n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name,
           pg_get_triggerdef(t.oid, true) as definition
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname in (${schemaList})
    order by n.nspname, c.relname, t.tgname;
  `),
}

await mkdir(resolve(snapshotRoot, 'data'), { recursive: true })
const tableManifest = []

for (const table of tables) {
  const schemaName = assertIdentifier(table.table_schema)
  const tableName = assertIdentifier(table.table_name)
  const rows = query(`select to_jsonb(source_row) as row from ${schemaName}.${tableName} source_row order by to_jsonb(source_row)::text;`)
    .map(item => item.row)
  const serialized = `${JSON.stringify(rows, null, 2)}\n`
  const relativePath = `data/${table.table_schema}.${table.table_name}.json`
  await writeFile(resolve(snapshotRoot, relativePath), serialized, { encoding: 'utf8', flag: 'wx' })
  tableManifest.push({
    schema: table.table_schema,
    table: table.table_name,
    rowCount: rows.length,
    sha256: sha256(serialized),
    file: relativePath,
  })
}

const catalogSerialized = `${JSON.stringify(catalog, null, 2)}\n`
await writeFile(resolve(snapshotRoot, 'catalog.json'), catalogSerialized, { encoding: 'utf8', flag: 'wx' })

const repeatedCounts = query(`
  select table_schema, table_name,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint as row_count
  from information_schema.tables
  where table_schema in (${schemaList}) and table_type = 'BASE TABLE'
  order by table_schema, table_name;
`)
const repeatedCountMap = new Map(repeatedCounts.map(row => [`${row.table_schema}.${row.table_name}`, Number(row.row_count)]))
const consistencyErrors = tableManifest
  .filter(entry => repeatedCountMap.get(`${entry.schema}.${entry.table}`) !== entry.rowCount)
  .map(entry => `${entry.schema}.${entry.table}: esportati ${entry.rowCount}, conteggio finale ${repeatedCountMap.get(`${entry.schema}.${entry.table}`)}`)

const storageObjects = tableManifest.find(entry => entry.schema === 'storage' && entry.table === 'objects')?.rowCount ?? 0
const manifestCore = {
  format: 'climbing-coach-supabase-json-snapshot-v1',
  projectRef,
  capturedAt: new Date().toISOString(),
  schemas,
  tables: tableManifest,
  catalog: { file: 'catalog.json', sha256: sha256(catalogSerialized) },
  consistency: { valid: consistencyErrors.length === 0, errors: consistencyErrors },
  storage: {
    objectMetadataRows: storageObjects,
    payloadExportRequired: storageObjects > 0,
  },
}
const manifestChecksum = sha256(JSON.stringify(manifestCore))
const manifest = { ...manifestCore, manifestSha256: manifestChecksum }
await writeFile(resolve(snapshotRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })

for (const entry of tableManifest) {
  const content = await readFile(resolve(snapshotRoot, entry.file), 'utf8')
  if (sha256(content) !== entry.sha256) throw new Error(`Checksum non valido dopo la scrittura: ${entry.file}`)
}

const totalRows = tableManifest.reduce((sum, entry) => sum + entry.rowCount, 0)
console.log(JSON.stringify({
  snapshotDirectory: snapshotRoot,
  tables: tableManifest.length,
  rows: totalRows,
  consistencyValid: consistencyErrors.length === 0,
  storageObjects,
  manifestSha256: manifestChecksum,
}, null, 2))

if (consistencyErrors.length > 0 || storageObjects > 0) process.exitCode = 2

