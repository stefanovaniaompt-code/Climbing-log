import fs from 'node:fs'
import path from 'node:path'

const root =
  path.resolve('src')

const extensions =
  new Set([
    '.ts',
    '.tsx',
  ])

function walk(directory) {
  return fs
    .readdirSync(
      directory,
      {
        withFileTypes: true,
      },
    )
    .flatMap(entry => {
      const full =
        path.join(
          directory,
          entry.name,
        )

      if (
        entry.isDirectory()
      ) {
        return walk(full)
      }

      if (
        extensions.has(
          path.extname(
            entry.name,
          ),
        )
      ) {
        return [full]
      }

      return []
    })
}

const forbiddenPatterns = [
  '\\bL account\\b',
  '\\bl account\\b',
  '\\bdell account\\b',
  '\\bnell account\\b',

  '\\bL app\\b',
  '\\bl app\\b',
  '\\bdell app\\b',
  '\\bnell app\\b',
  '\\ball app\\b',

  '\\bL atleta\\b',
  '\\bl atleta\\b',
  '\\bdell atleta\\b',
  '\\ball atleta\\b',

  '\\bL email\\b',
  '\\bl email\\b',
  '\\bdell email\\b',
  '\\ball email\\b',

  '\\bL invito\\b',
  '\\bl invito\\b',
  '\\bdell invito\\b',

  '\\bL indirizzo\\b',
  '\\bl indirizzo\\b',
  '\\bdell indirizzo\\b',
  '\\ball indirizzo\\b',

  '\\bL accesso\\b',
  '\\bl accesso\\b',
  '\\bdell accesso\\b',
  '\\ball accesso\\b',

  '\\bun altra\\b',

  '\\bpuo\\b',
  '\\bpiu\\b',
  '\\bfinche\\b',
  '\\bperche\\b',
  '\\bdovra\\b',
  '\\bverra\\b',
  '\\bgia\\b',
  '\\bcosi\\b',
].map(
  source =>
    new RegExp(source),
)

/*
 * Mojibake markers.
 * Written only with Unicode escapes so this source file
 * remains ASCII-safe even when created from PowerShell.
 */
const badFragments = [
  '\u00c3',
  '\u00e2\u20ac',
  '\ufffd',
]

const findings = []

for (
  const file
  of walk(root)
) {
  const source =
    fs.readFileSync(
      file,
      'utf8',
    )

  const lines =
    source.split(/\r?\n/)

  lines.forEach(
    (
      line,
      index,
    ) => {
      const badPattern =
        forbiddenPatterns.some(
          pattern =>
            pattern.test(line),
        )

      const badEncoding =
        badFragments.some(
          fragment =>
            line.includes(
              fragment,
            ),
        )

      if (
        badPattern ||
        badEncoding
      ) {
        findings.push({
          file:
            path.relative(
              process.cwd(),
              file,
            ),

          line:
            index + 1,

          text:
            line.trim(),
        })
      }
    },
  )
}

if (
  findings.length
) {
  console.error('')
  console.error(
    'Possibili refusi UI trovati:',
  )
  console.error('')

  for (
    const finding
    of findings
  ) {
    console.error(
      `${finding.file}:${finding.line}`,
    )

    console.error(
      `  ${finding.text}`,
    )
  }

  console.error('')
  process.exit(1)
}

console.log(
  'UI copy check: OK',
)
