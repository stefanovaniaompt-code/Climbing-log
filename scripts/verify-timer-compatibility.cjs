/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS loader exercises the TypeScript modules in memory. */
// Low-memory smoke checks of the actual TypeScript modules, with no new dependencies.
// Uses the repository's existing TypeScript compiler only to transpile selected files.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const cache = new Map()
function load(relativePath) {
  const file = path.resolve(__dirname, '..', relativePath)
  if (cache.has(file)) return cache.get(file).exports
  const source = fs.readFileSync(file, 'utf8')
  const code = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = { exports: {} }
  cache.set(file, loaded)
  const localRequire = specifier => {
    if (!specifier.startsWith('.')) return require(specifier)
    return load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), `${specifier}.ts`)))
  }
  new Function('module', 'exports', 'require', code)(loaded, loaded.exports, localRequire)
  return loaded.exports
}

const timer = load('src/prescriptions/timerConfiguration.ts')
const runner = load('src/session/sessionRunner.ts')
const audio = load('src/session/timerAudio.ts')
const makeExercise = (name, prescription, restSeconds = null, instructions = null) => ({
  id: 'synthetic', order: 1, name, prescription, restSeconds, instructions,
  calculationContext: {}, targetRpeMin: null, targetRpeMax: null, progress: null,
})

const open = makeExercise('Open Hand iso Grip', { sets: 5, reps: 1, seconds: 14, timer: { execution_mode: 'single_hand', work_seconds: 10, repetitions: 1, set_rest_seconds: 120 } })
assert.deepEqual(runner.createExerciseTimerState(open).sequence.slice(0, 4).map(step => step.kind), ['work', 'hand_change', 'work', 'set_rest'])
assert.equal(runner.getExerciseTimerConfig(open).workSeconds, 14)
const dual = makeExercise('Bloccaggio a 90 poi a 120', { sets: 4, reps: 4 }, 120)
const dualSequence = runner.createExerciseTimerState(dual).sequence
assert.deepEqual(dualSequence.slice(0, 3).map(step => [step.kind, step.durationSeconds]), [['work', 3], ['work', 3], ['interval_rest', 5]])
assert.equal(audio.timerAudioCueForTransition(
  { ...runner.createExerciseTimerState(dual), running: true },
  { ...runner.createExerciseTimerState(dual), running: true, sequenceIndex: 1, remaining: 3 },
), 'work')

const cases = [
  ['Bloccaggi 5" a 90° su manopole', { sets: 4, reps: 6, seconds: 5 }, 60, 'guided'],
  ['Bloccaggi 5" a 90° su sbarra', { sets: 4, reps: 6, seconds: 5 }, 60, 'guided'],
  ['Bloccaggi a 90° su sbarra', { sets: 4, reps: 6, seconds: 6 }, 60, 'guided'],
  ['Half Crimp Iso Grip al Trave', { sets: 4, reps: 4, seconds: 6 }, 60, 'guided'],
  ['Half Crimp Iso grip Trave', { sets: 4, reps: 4, seconds: 6 }, 60, 'guided'],
  ['Plank', { sets: 1, reps: 4, seconds: 45 }, 60, 'guided'],
  ['Campus Board / Power Progression', { sets: 4, seconds: 20 }, 90, 'guided'],
  ['Campus Board / Power Progression', { sets: 4, dose: '4 ripetizioni (2 per braccio)' }, 90, 'recovery_only'],
  ['Anaerobic Capacity', { sets: 4 }, 360, 'recovery_only'],
  ['Anaerobic Capacity', { sets: 4 }, null, 'none'],
  ['Wall Crawl', { sets: 4 }, 120, 'none'],
  ['Intentional Block Lifting', { sets: 5 }, 180, 'recovery_only'],
  ['Trazioni', { sets: 4 }, 60, 'recovery_only'],
  ['Panca piana', { sets: 4 }, null, 'recovery_only'],
  ['Dip', { sets: 4 }, null, 'recovery_only'],
  ['Rematore', { sets: 3 }, null, 'recovery_only'],
  ['Push up', { sets: 3 }, null, 'recovery_only'],
  ['Archer Push Up', { sets: 3 }, null, 'recovery_only'],
  ['Hanging Leg Raises', { sets: 3 }, null, 'recovery_only'],
  ['Rotazione esterna: gomito su ginocchio', { sets: 3 }, null, 'recovery_only'],
  ['Y pancia in giù', { sets: 3 }, null, 'recovery_only'],
  ['Pancia in giù W + spinte in alto', { sets: 3 }, null, 'recovery_only'],
  ['4x4 Forza', { sets: 4 }, 240, 'recovery_only'],
  ['4x4 strength builder', { sets: 4 }, 240, 'recovery_only'],
  ['Pan Gullich', { sets: 4 }, 90, 'recovery_only'],
  ['Piramidale di forza', { dose: '4-2-1-1-2-4 blocchi' }, 240, 'recovery_only'],
  ['Bloccaggio con sbarra livello occhi spostamento dx - sin', { sets: 6 }, 90, 'recovery_only'],
  ['Scalata libera', { sets: 3 }, null, 'none'],
  ['Scalata libera in falesia', { sets: 3 }, 120, 'none'],
]
for (const [name, prescription, restSeconds, expected] of cases) {
  const item = makeExercise(name, prescription, restSeconds)
  const mode = timer.resolveExerciseTimerValues(name, prescription, restSeconds).mode
  assert.equal(mode, expected, `classification: ${name}`)
  if (expected === 'none') assert.equal(runner.createExerciseTimerState(item), null)
  else assert.equal(runner.getExerciseTimerConfig(item)?.mode, expected, `runtime: ${name}`)
}
assert.equal(runner.getExerciseTimerConfig(makeExercise('Panca piana', { sets: 4, reps: 5 })).setRestSeconds, 60)
assert.equal(runner.createExerciseTimerState(makeExercise('Piramidale di forza', { dose: '4-2-1-1-2-4 blocchi' }, 240)).sequence.filter(step => step.kind === 'set_rest').length, 5)
assert.equal(runner.getExerciseTimerConfig(makeExercise('Wall Crawl', { sets: 4, timer: { mode: 'guided' }, reps: 2, seconds: 5 }, 120)).mode, 'guided')
const running = { ...runner.createExerciseTimerState(dual), running: true }
assert.equal(runner.restoreExerciseTimerSnapshot({ state: running, savedAt: 1000 }, 4000)?.sequenceIndex, 1)
assert.equal(runner.restoreExerciseTimerSnapshot({ state: { ...running, running: false }, savedAt: 1000 }, 4000)?.remaining, 3)
const recovery = makeExercise('Panca piana', { sets: 4, reps: 5 })
const resting = runner.confirmExerciseTimerSet(runner.createExerciseTimerState(recovery))
assert.equal(runner.restoreExerciseTimerSnapshot({ state: resting, savedAt: 1000 }, 31000)?.remaining, 30)
console.log(`${cases.length} categorie/varianti e 10 controlli di sequenza/ripristino superati`)
