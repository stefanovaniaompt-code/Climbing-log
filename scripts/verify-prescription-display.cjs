/* eslint-disable @typescript-eslint/no-require-imports -- Lightweight Node check of existing TypeScript modules. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const cache = new Map()
function load(relativePath) {
  const file = path.resolve(__dirname, '..', relativePath)
  if (cache.has(file)) return cache.get(file).exports
  const source = fs.readFileSync(file, 'utf8')
  const code = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const loaded = { exports: {} }
  cache.set(file, loaded)
  const localRequire = specifier => {
    if (!specifier.startsWith('.')) return require(specifier)
    const base = path.resolve(path.dirname(file), specifier)
    const target = fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`
    return load(path.relative(path.resolve(__dirname, '..'), target))
  }
  new Function('module', 'exports', 'require', code)(loaded, loaded.exports, localRequire)
  return loaded.exports
}

const runner = load('src/session/sessionRunner.ts')
const builder = load('src/builder/programBuilder.ts')
const { SessionExerciseCard } = load('src/session/SessionExerciseCard.tsx')
const { createElement } = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const exercise = prescription => ({ id: 'synthetic', order: 1, name: 'Progressione', prescription, calculationContext: {}, targetRpeMin: null, targetRpeMax: null, restSeconds: 120, instructions: null, progress: null })
const builderExercise = prescription => ({ id: 'synthetic', sessionId: 'synthetic', exerciseId: null, order: 1, name: 'Progressione', prescription, targetRpeMin: null, targetRpeMax: null, restSeconds: 120, instructions: null })

const structured = { sets: 2, reps: 6, steps: [{ label: 'Set 1', loadKg: 20 }, { label: 'Set 2', loadKg: 25 }] }
assert.deepEqual(runner.getVariableSeries(exercise(structured)), ['20 kg × 6 rep', '25 kg × 6 rep'])
assert.match(builder.prescriptionSummary(builderExercise(structured)), /20 kg × 6 rep.*25 kg × 6 rep/)
assert.equal(runner.getExerciseLoadLabel(exercise(structured)), 'Carichi variabili')

const legacyRows = { sets: 2, dose: '20 kg × 8 · 25 kg × 5', steps: [{ label: 'Set 1', loadKg: 20 }, { label: 'Set 2', loadKg: 25 }] }
assert.deepEqual(runner.getVariableSeries(exercise(legacyRows)), ['20 kg × 8 rep', '25 kg × 5 rep'])
assert.match(builder.prescriptionSummary(builderExercise({ sets: 2, dose: '20 kg × 8 · 25 kg × 5' })), /20 kg × 8 rep.*25 kg × 5 rep/)
assert.equal(runner.getExerciseLoadLabel(exercise({ sets: 2, dose: '20 kg × 8 · 25 kg × 5' })), 'Carichi variabili')

const fiveRows = { sets: 5, steps: [20, 25, 30, 35, 42].map((loadKg, index) => ({ label: `Set ${index + 1}`, loadKg, reps: [10, 8, 6, 4, 3][index] })) }
const fiveRowsBefore = JSON.stringify(fiveRows)
assert.equal(runner.getVariableSeries(exercise(fiveRows))[4], '42 kg × 3 rep')
assert.equal(runner.getExerciseLoadLabel(exercise(fiveRows)), 'Carichi variabili')
assert.equal(JSON.stringify(fiveRows), fiveRowsBefore)
assert.equal(runner.getVariableSeries({ ...exercise(fiveRows), calculationContext: { test_target: { set_targets: [20, 25, 30, 35, 40].map((calculated_target, index) => ({ set_number: index + 1, percentage: 80, calculated_target, target_unit: 'kg' })) } } })[4], '42 kg · 3 rep')
assert.equal(runner.getExerciseLoadLabel({ ...exercise({ sets: 2 }), calculationContext: { test_target: { set_targets: [{ set_number: 1, percentage: 80, calculated_target: 20, target_unit: 'kg' }] } } }), 'Carichi da test')
assert.equal(runner.getExerciseLoadLabel(exercise({ sets: 2, load_type: 'bodyweight', steps: [{ reps: 5, loadKg: null }, { reps: 5, loadKg: null }] })), 'Corpo libero')
const html = renderToStaticMarkup(createElement(SessionExerciseCard, {
  exercise: exercise(structured), coachNotes: null, canEdit: false, isNext: true, timerState: null,
  exerciseInput: { rpe: '', notes: '' }, exerciseSaveState: 'idle', soundEnabled: false,
  onToggleTimer() {}, onConfirmSet() {}, onResetTimer() {}, onAdjustTimer() {}, onSkipTimerPhase() {},
  onUpdateExerciseInput() {}, onRecordExercise() {}, onToggleSound() {},
}))
assert.match(html, /20 kg × 6 rep/)
assert.match(html, /25 kg × 6 rep/)
assert.match(html, /Carichi variabili/)
assert.doesNotMatch(html, /Corpo libero/)
console.log('Controlli di parser, formatter e rendering reale della scheda atleta superati senza Vite')
