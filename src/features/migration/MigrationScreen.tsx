import { useState, type ChangeEvent } from 'react'
import { Check, FileCheck2, Layers3, MoreHorizontal, Save, ShieldCheck, Upload } from 'lucide-react'
import { inspectLegacyFile, type ImportReport } from '../../legacyInspector'
import { Metric, Panel, ScreenHeader, Tag } from '../../shared/ui'

export function MigrationScreen() {
  const [report, setReport] = useState<ImportReport | null>(null)
  const [checking, setChecking] = useState(false)
  const inspectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setChecking(true)
    setReport(await inspectLegacyFile(file))
    setChecking(false)
  }
  const stages = [
    { icon: Save, label: 'Snapshot', copy: '46 tabelle · 430 righe · checksum', state: 'Verificato' },
    { icon: ShieldCheck, label: 'Inventario', copy: 'Relazioni, RLS, log e test mappati', state: 'Completo' },
    { icon: Layers3, label: 'Evolvi V1', copy: 'Upgrade additivo sul database esistente', state: 'Autorizzato' },
    { icon: Check, label: 'Riconcilia', copy: 'Conteggi e checksum dopo ogni passaggio', state: 'Bloccante' },
  ]
  return (
    <div className="screen">
      <ScreenHeader eyebrow="CONTINUITÀ DATI / UPGRADE IN-PLACE" title="La V1 diventa V2 senza perdere la memoria." text="Possiamo modificare direttamente la V1. Ogni passaggio parte dallo snapshot, resta additivo e si chiude confrontando atleti, allenamenti eseguiti, esercizi e test." action={<Tag tone="success">Snapshot verificato</Tag>} />
      <div className="migration-pipeline">
        {stages.map((stage, index) => { const Icon = stage.icon; return <div className="pipeline-stage" key={stage.label}><span className="pipeline-stage__index">0{index + 1}</span><Icon size={23} /><b>{stage.label}</b><p>{stage.copy}</p><Tag tone={index < 2 ? 'success' : index === 2 ? 'purple' : 'signal'}>{stage.state}</Tag></div> })}
      </div>
      <Panel className="import-panel" title="Prova un backup V1" index="00" action={<Tag tone={report?.valid ? 'success' : 'neutral'}>{checking ? 'Controllo…' : report?.valid ? 'Valido' : 'Solo lettura'}</Tag>}>
        <div className="import-zone">
          <div className="import-zone__copy"><Upload size={24} /><div><b>Seleziona l’export JSON della V1</b><p>Il file viene analizzato su questo dispositivo. Nessun dato viene caricato o salvato.</p></div></div>
          <label className="button button--signal import-button"><input type="file" accept="application/json,.json" onChange={inspectFile} />{checking ? 'Analisi…' : 'Scegli file'}</label>
        </div>
        {report && <div className={`import-result ${report.valid ? 'is-valid' : 'is-error'}`}>
          <div className="import-result__head"><FileCheck2 size={20} /><div><b>{report.fileName}</b><span>V{report.version} · checksum {report.checksum?.slice(0, 12) ?? 'non disponibile'}…</span></div><Tag tone={report.valid ? 'success' : 'warning'}>{report.valid ? 'Struttura valida' : 'Da correggere'}</Tag></div>
          <div className="import-counts">{Object.entries(report.counts).map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
          {[...report.errors, ...report.warnings].map(message => <p className="import-message" key={message}>{message}</p>)}
          <div className="zero-write"><ShieldCheck size={15} /> Scritture eseguite: {report.writesPerformed}</div>
        </div>}
      </Panel>
      <div className="grid grid--2-1">
        <Panel title="Copertura V1" index="01">
          <div className="coverage-grid"><Metric label="Tabelle public" value="15" /><Metric label="Account Auth" value="04" /><Metric label="Righe snapshot" value="430" /><Metric label="Oggetti Storage" value="00" /></div>
          <div className="mapping-list">
            {['Profili e relazioni coach/atleta', 'Programmi, settimane, sessioni ed esercizi', 'Log sessione e log esercizio', 'Test, risultati e video', 'Backup locale stefano-climbing-log-v1'].map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, '0')}</span><b>{item}</b><Check size={16} /></div>)}
          </div>
        </Panel>
        <Panel title="Gate di cutover" index="02">
          <div className="gate-score"><span>READINESS</span><strong>05<small>/06</small></strong></div>
          <ul className="check-list"><li><Check size={15} /> Snapshot cloud con checksum</li><li><Check size={15} /> Cronologia migration V1 acquisita</li><li><Check size={15} /> Mapping entità e FK verificato</li><li><Check size={15} /> Frontend collegato con chiave pubblicabile</li><li><Check size={15} /> Upgrade in-place autorizzato</li><li className="pending"><MoreHorizontal size={15} /> Export localStorage dei dispositivi</li></ul>
        </Panel>
      </div>
      <Panel title="Mappa di trasformazione" index="03">
        <div className="migration-table"><div><b>Sorgente V1</b><b>Staging</b><b>Destinazione V2</b><b>Regola</b></div>{[
          ['profiles', 'snapshot auth/public', 'profiles', 'ID atleta invariato'],
          ['session_logs', 'snapshot + checksum', 'session_logs', 'allenamenti svolti intatti'],
          ['exercise_logs.actual', 'snapshot JSONB', 'exercise_logs.actual', 'payload e precisione invariati'],
          ['test_results', 'snapshot + vista storico', 'test_results', 'protocollo, lato e setup intatti'],
          ['localStorage V1', 'export per dispositivo', 'import idempotente', 'nessuna pulizia prima dell’import'],
        ].map(row => <div key={row[0]}>{row.map(cell => <span key={cell}>{cell}</span>)}</div>)}</div>
      </Panel>
      <div className="safety-note"><ShieldCheck size={22} /><div><b>Regola non negoziabile</b><p>La V1 si può evolvere e può restare offline durante i lavori. Non si cancellano né si sovrascrivono dati atleta, allenamenti svolti, log esercizi o storico test senza snapshot, verifica e riconciliazione.</p></div></div>
    </div>
  )
}
