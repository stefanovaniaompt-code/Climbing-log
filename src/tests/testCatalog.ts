export type MeasurementSource = 'manual' | 'tindeq'
export type TestSide = 'left' | 'right' | 'bilateral' | null
export type TestProtocolKey = 'finger_mvc_20mm' | 'finger_endurance_60mvc' | 'repeaters_7_3' | 'pullup_1rm' | 'pullup_max' | 'pullup_endurance_60' | 'pushup_max' | 'side_plank' | 'peak_force' | 'rfd' | 'endurance' | 'repeaters' | 'critical_force' | 'workout' | 'custom_session' | 'free_measurement'

export type MetricDefinition = { key: string; label: string; unit: string; dimension: 'force' | 'relative_force' | 'time' | 'count' | 'impulse' | 'rate' | 'load' | 'percent'; primary?: boolean }
export type TestDefinition = {
  key: TestProtocolKey
  name: string
  version: string
  sources: MeasurementSource[]
  primaryMetricKey: string | null
  higherIsBetter: boolean
  sideApplicable: boolean
  gripApplicable: boolean
  metrics: MetricDefinition[]
}

const metric = (key: string, label: string, unit: string, dimension: MetricDefinition['dimension'], primary = false): MetricDefinition => ({ key, label, unit, dimension, primary })

export const TEST_CATALOG: TestDefinition[] = [
  { key: 'finger_mvc_20mm', name: 'Forza massimale dita 20 mm', version: '1.0', sources: ['manual', 'tindeq'], primaryMetricKey: 'peak_nkg', higherIsBetter: true, sideApplicable: true, gripApplicable: true, metrics: [metric('peak_nkg', 'Picco relativo', 'N/kg', 'relative_force', true), metric('peak_n', 'Picco', 'N', 'force'), metric('peak_kgf', 'Picco', 'kgf', 'load'), metric('peak_percent_bw', 'Picco BW', '%BW', 'percent'), metric('rfd_200', 'RFD 200 ms', 'N/s', 'rate'), metric('time_to_peak', 'Tempo al picco', 'ms', 'time'), metric('asymmetry', 'Asimmetria', '%', 'percent')] },
  { key: 'finger_endurance_60mvc', name: 'Endurance continua dita 60% MVC', version: '1.0', sources: ['manual', 'tindeq'], primaryMetricKey: 'time_to_failure', higherIsBetter: true, sideApplicable: true, gripApplicable: true, metrics: [metric('time_to_failure', 'Tempo al cedimento', 's', 'time', true), metric('impulse', 'Impulso', 'N·s', 'impulse'), metric('mean_force', 'Forza media', 'N', 'force'), metric('target_force', 'Target', 'N', 'force'), metric('time_in_target', 'Tempo nel target', '%', 'percent'), metric('force_decay', 'Calo forza', 'N/s', 'rate')] },
  { key: 'repeaters_7_3', name: 'Repeaters 7:3', version: '1.0', sources: ['manual', 'tindeq'], primaryMetricKey: 'valid_repetitions', higherIsBetter: true, sideApplicable: true, gripApplicable: true, metrics: [metric('valid_repetitions', 'Ripetizioni valide', 'rep', 'count', true), metric('mean_force', 'Forza media', 'N', 'force'), metric('peak_n', 'Picco', 'N', 'force'), metric('total_impulse', 'Impulso totale', 'N·s', 'impulse'), metric('contraction_time', 'Tempo contrazione', 's', 'time'), metric('force_decay', 'Calo forza', '%', 'percent'), metric('reps_in_target', 'Rep nel target', '%', 'percent')] },
  { key: 'pullup_1rm', name: 'Massimale trazione', version: '1.0', sources: ['manual'], primaryMetricKey: 'one_rm_percent_bw', higherIsBetter: true, sideApplicable: false, gripApplicable: true, metrics: [metric('one_rm_percent_bw', '1RM relativo BW', '%BW', 'percent', true), metric('external_load', 'Carico esterno', 'kg', 'load'), metric('total_load', 'Carico totale', 'kg', 'load')] },
  { key: 'pullup_max', name: 'Massimo numero trazioni', version: '1.0', sources: ['manual'], primaryMetricKey: 'complete_reps', higherIsBetter: true, sideApplicable: false, gripApplicable: true, metrics: [metric('complete_reps', 'Ripetizioni complete', 'rep', 'count', true)] },
  { key: 'pullup_endurance_60', name: 'Resistenza trazioni 60%', version: '1.0', sources: ['manual'], primaryMetricKey: 'complete_reps', higherIsBetter: true, sideApplicable: false, gripApplicable: true, metrics: [metric('complete_reps', 'Ripetizioni complete', 'rep', 'count', true), metric('load', 'Carico', 'kg', 'load'), metric('one_rm_percent', '% 1RM', '%', 'percent'), metric('duration', 'Durata', 's', 'time')] },
  { key: 'pushup_max', name: 'Massimo piegamenti', version: '1.0', sources: ['manual'], primaryMetricKey: 'complete_reps', higherIsBetter: true, sideApplicable: false, gripApplicable: false, metrics: [metric('complete_reps', 'Ripetizioni complete', 'rep', 'count', true), metric('duration', 'Durata', 's', 'time')] },
  { key: 'side_plank', name: 'Plank laterale DX/SX', version: '1.0', sources: ['manual'], primaryMetricKey: 'duration', higherIsBetter: true, sideApplicable: true, gripApplicable: false, metrics: [metric('duration', 'Durata', 's', 'time', true), metric('asymmetry', 'Asimmetria', '%', 'percent')] },
  { key: 'peak_force', name: 'Peak Force / MVC', version: '1.0', sources: ['tindeq'], primaryMetricKey: 'peak_nkg', higherIsBetter: true, sideApplicable: true, gripApplicable: true, metrics: [metric('peak_nkg', 'Picco relativo', 'N/kg', 'relative_force', true), metric('peak_n', 'Picco', 'N', 'force'), metric('rfd_200', 'RFD 200 ms', 'N/s', 'rate'), metric('time_to_peak', 'Tempo al picco', 'ms', 'time')] },
  { key: 'rfd', name: 'RFD', version: '1.0', sources: ['tindeq'], primaryMetricKey: 'rfd_selected', higherIsBetter: true, sideApplicable: true, gripApplicable: true, metrics: [metric('rfd_selected', 'RFD finestra scelta', 'N/s', 'rate', true), ...[50, 100, 150, 200, 250].map(window => metric(`rfd_${window}`, `RFD ${window} ms`, 'N/s', 'rate')), metric('peak_n', 'Picco', 'N', 'force'), metric('time_to_peak', 'Tempo al picco', 'ms', 'time')] },
  { key: 'endurance', name: 'Endurance', version: '1.0', sources: ['tindeq'], primaryMetricKey: 'time_to_failure', higherIsBetter: true, sideApplicable: true, gripApplicable: true, metrics: [metric('time_to_failure', 'Tempo al cedimento', 's', 'time', true), metric('mean_force', 'Forza media', 'N', 'force'), metric('impulse', 'Impulso', 'N·s', 'impulse'), metric('time_in_target', 'Tempo nel target', '%', 'percent'), metric('fatigue_slope', 'Pendenza fatica', 'N/s', 'rate')] },
  { key: 'repeaters', name: 'Repeaters', version: '1.0', sources: ['tindeq'], primaryMetricKey: 'valid_repetitions', higherIsBetter: true, sideApplicable: true, gripApplicable: true, metrics: [metric('valid_repetitions', 'Ripetizioni valide', 'rep', 'count', true), metric('total_impulse', 'Impulso totale', 'N·s', 'impulse'), metric('reps_in_target', 'Rep nel target', '%', 'percent')] },
  { key: 'critical_force', name: 'Critical Force', version: '1.0', sources: ['tindeq'], primaryMetricKey: 'critical_force', higherIsBetter: true, sideApplicable: true, gripApplicable: true, metrics: [metric('critical_force', 'Critical Force', 'N', 'force', true), metric('w_prime', 'W′', 'N·s', 'impulse'), metric('impulse_above_cf', 'Impulso sopra CF', 'N·s', 'impulse')] },
  { key: 'workout', name: 'Workout', version: '1.0', sources: ['tindeq'], primaryMetricKey: null, higherIsBetter: true, sideApplicable: true, gripApplicable: true, metrics: [] },
  { key: 'custom_session', name: 'Custom Session', version: '1.0', sources: ['manual', 'tindeq'], primaryMetricKey: null, higherIsBetter: true, sideApplicable: true, gripApplicable: true, metrics: [] },
  { key: 'free_measurement', name: 'Misurazione libera', version: '1.0', sources: ['tindeq'], primaryMetricKey: null, higherIsBetter: true, sideApplicable: true, gripApplicable: true, metrics: [metric('peak_n', 'Picco', 'N', 'force'), metric('mean_force', 'Forza media', 'N', 'force'), metric('impulse', 'Impulso', 'N·s', 'impulse'), metric('duration', 'Durata', 's', 'time')] },
]

export const getTestDefinition = (key: string) => TEST_CATALOG.find(test => test.key === key)
export const compatibleMetrics = (dimension: MetricDefinition['dimension']) => TEST_CATALOG.flatMap(test => test.metrics.filter(item => item.dimension === dimension).map(item => ({ test, metric: item })))
