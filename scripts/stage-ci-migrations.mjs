import {
  copyFileSync,
  mkdirSync,
  readdirSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationPattern = /^(\d{14})_.+\.sql$/

function listMigrations(directory) {
  return readdirSync(directory)
    .filter((name) => migrationPattern.test(name))
    .sort()
}

export function stageCiMigrations({ sourceDirectory, targetDirectory }) {
  mkdirSync(targetDirectory, { recursive: true })

  const targetMigrations = listMigrations(targetDirectory)
  const latestBaselineVersion = targetMigrations
    .map((name) => name.match(migrationPattern)[1])
    .at(-1) ?? '00000000000000'

  const staged = listMigrations(sourceDirectory).filter((name) => {
    return name.match(migrationPattern)[1] > latestBaselineVersion
  })

  for (const name of staged) {
    copyFileSync(
      resolve(sourceDirectory, name),
      resolve(targetDirectory, name),
    )
  }

  return { latestBaselineVersion, staged }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
const modulePath = resolve(fileURLToPath(import.meta.url))

if (invokedPath === modulePath) {
  const repositoryRoot = resolve(dirname(modulePath), '..')
  const result = stageCiMigrations({
    sourceDirectory: resolve(repositoryRoot, 'supabase', 'migrations'),
    targetDirectory: resolve(
      repositoryRoot,
      'migration',
      'ci-baseline',
      'supabase',
      'migrations',
    ),
  })

  console.log(
    result.staged.length > 0
      ? `Staged canonical migrations after ${result.latestBaselineVersion}: ${result.staged.join(', ')}`
      : `No canonical migrations found after ${result.latestBaselineVersion}.`,
  )
}
