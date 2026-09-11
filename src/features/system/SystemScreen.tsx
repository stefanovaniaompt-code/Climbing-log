import { MoreHorizontal, Mountain, Sparkles } from 'lucide-react'
import { Metric, Panel, ScreenHeader, Tag } from '../../shared/ui'

const palette = [
  { name: 'Purple 900', value: '#2C103A', usage: 'Testo brand' },
  { name: 'Purple 700', value: '#55206F', usage: 'Primario' },
  { name: 'Purple 100', value: '#E9DFF0', usage: 'Superfici attive' },
  { name: 'Mustard 500', value: '#D6AA24', usage: 'Segnale / CTA' },
  { name: 'Ink', value: '#19171B', usage: 'Testo' },
  { name: 'Canvas', value: '#F4F1EA', usage: 'Sfondo' },
  { name: 'Success', value: '#176B4D', usage: 'Completato' },
  { name: 'Error', value: '#A33131', usage: 'Errore' },
]

export function SystemScreen() {
  return (
    <div className="screen">
      <ScreenHeader
        eyebrow="CC / UI SYSTEM 0.1"
        title="Allenamento leggibile. Decisioni rapide."
        text="Una direzione originale, industriale e data-first: moduli netti, tipografia geometrica, gerarchie forti e colore usato come segnale operativo."
        action={<button className="button button--primary"><Sparkles size={16} /> Direzione A</button>}
      />

      <div className="metric-grid">
        <Metric label="Carico settimana" value="184" unit=" u" delta="+8,4%" />
        <Metric label="Sessioni" value="02" unit="/03" />
        <Metric label="Prontezza" value="81" unit="%" signal />
      </div>

      <div className="grid grid--2-1">
        <Panel title="Tesi visiva" index="01">
          <div className="manifesto">
            <div className="manifesto__mark"><Mountain size={34} strokeWidth={1.5} /></div>
            <div>
              <h2>Vertical instrument panel</h2>
              <p>La pagina si comporta come un pannello tecnico per la performance: ogni blocco ha un compito, ogni numero ha una gerarchia, ogni accento indica cosa richiede attenzione.</p>
            </div>
          </div>
          <div className="principle-list">
            {[
              ['MODULAR', 'Rettangoli, bordi sottili, raggi minimi'],
              ['DATA FIRST', 'Numero grande, etichetta breve, contesto vicino'],
              ['TASK FIRST', 'Un’azione primaria evidente per schermata'],
              ['QUIET MOTION', 'Transizioni brevi, nessuna coreografia decorativa'],
            ].map(([key, value], index) => (
              <div className="principle" key={key}><b>0{index + 1}</b><span>{key}</span><p>{value}</p></div>
            ))}
          </div>
        </Panel>

        <Panel title="Tipografia" index="02">
          <div className="type-sample type-sample--display">48.2<span> KG</span></div>
          <div className="type-sample type-sample--title">Block lift / 20 mm</div>
          <p className="body-sample">Space Grotesk per navigazione e contenuti. IBM Plex Mono per numeri, tempi, carichi e micro-label tecniche.</p>
          <div className="mono-sample">SESSION_03 / RPE_7.5 / 00:42</div>
        </Panel>
      </div>

      <Panel title="Palette operativa" index="03" action={<Tag tone="success">AA verificato</Tag>}>
        <div className="swatch-grid">
          {palette.map((color) => (
            <div className="swatch" key={color.name}>
              <div className="swatch__color" style={{ background: color.value }} />
              <div><b>{color.name}</b><code>{color.value}</code><small>{color.usage}</small></div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid--2">
        <Panel title="Componenti fondamentali" index="04">
          <div className="component-row">
            <button className="button button--primary">Salva programma</button>
            <button className="button button--signal">Avvia sessione</button>
            <button className="button button--secondary">Annulla</button>
            <button className="icon-button" aria-label="Altre opzioni"><MoreHorizontal size={18} /></button>
          </div>
          <div className="form-row">
            <label><span>Carico</span><div className="input-shell"><input defaultValue="32.5" /><em>kg</em></div></label>
            <label><span>RPE</span><div className="rpe-scale">{[6, 7, 8, 9, 10].map(v => <button className={v === 8 ? 'active' : ''} key={v}>{v}</button>)}</div></label>
          </div>
          <div className="component-row"><Tag>Bozza</Tag><Tag tone="purple">In corso</Tag><Tag tone="success">Salvato</Tag><Tag tone="warning">Da rivedere</Tag></div>
        </Panel>

        <Panel title="Stati di sistema" index="05">
          <div className="state-list">
            <div><span className="status-dot status-dot--sync" /><b>Sincronizzazione</b><small>3 modifiche in coda</small></div>
            <div><span className="status-dot status-dot--ok" /><b>Salvato</b><small>Ora, su questo dispositivo</small></div>
            <div><span className="status-dot status-dot--warn" /><b>Offline</b><small>I dati restano disponibili</small></div>
          </div>
          <div className="skeleton-stack" aria-label="Esempio caricamento"><span /><span /><span /></div>
        </Panel>
      </div>
    </div>
  )
}
