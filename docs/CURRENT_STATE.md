# Climbing Coach V2 — stato corrente

Audit eseguito il 13 settembre 2026; il 14 settembre è stato autorizzato il
rilascio e l'hardening database è stato applicato alla produzione canonica.

## Versioni verificate

- Repository locale: branch `v2-finalization`, HEAD
  `40f1db0ff7582d21d2bb2f0ec182cd7a33354e8e` (`v2.0.0`).
- `origin/main`, `origin/v2-finalization` e il tag locale `v2.0.0` puntavano allo
  stesso commit nell'ultimo stato remoto disponibile al checkout.
- PWA live: `version.json` dichiara esattamente lo stesso commit `40f1db0...`.
- Produzione Supabase: `Climbing coach` / `xkymrvalnydxeamrajqs`, stato
  `ACTIVE_HEALTHY`, PostgreSQL 17, regione `eu-west-1`.
- Edge Function `invite-athlete`: `ACTIVE`, versione 6, `verify_jwt=false`; il
  corpo esegue comunque `auth.getUser(token)` prima di ogni operazione.

`AGENTS.md` era già presente ma non tracciato; è stato letto e preservato senza
modifiche.

## Riallineamento repository–produzione

La cronologia di produzione contiene, oltre alle migrazioni già versionate:

| Versione | Nome |
|---|---|
| `20260912123630` | `fix_existing_athlete_reinvite` |
| `20260912123823` | `qualify_existing_athlete_reinvite` |
| `20260912123853` | `use_named_conflict_for_existing_athlete_reinvite` |
| `20260912124035` | `scope_invited_athlete_context_with_rls` |
| `20260913062021` | `reuse_pending_managed_athlete_invites` |

Il repository conteneva già
`20260912074513_fix_invited_athlete_onboarding_flow.sql`, ma non le cinque
migrazioni sopra. Poiché il connettore espone la cronologia e lo stato effettivo,
non il testo originale di ciascun file applicato, è stata ricostruita una sola
migrazione forward da `pg_get_functiondef` e `pg_policies`:

- `supabase/migrations/20260913161938_realign_invitation_state.sql`.

La migrazione riproduce le definizioni effettive di contesto invito, onboarding
invitato, riuso della scheda pendente e policy di aggiornamento. Non contiene la
riparazione dati una tantum dell'incidente né identificativi reali. È solo locale:
la produzione possiede già lo stesso comportamento e non deve riceverla di nuovo
durante questo incarico.

Il sorgente locale della Edge Function differiva dalla versione 6 perché
accettava anche relazioni non attive. È stato allineato alla produzione: ora
richiede esplicitamente `relationship.status === "active"` e usa lo stesso
messaggio 403.

## Verifica dell'incidente del 13 settembre

Per l'email coinvolta esistono ancora tre schede storiche, due non rivendicate.
Non sono state cancellate o fuse. L'unico invito pendente punta però a una scheda
con relazione coach–atleta attiva: il disallineamento che provocava il 409 non è
più presente. Sul target dell'invito risultano preservate anche sessioni test del
coach. La funzione `create_managed_athlete` in produzione seleziona prima la
scheda non rivendicata dell'invito pendente e restituisce lo stesso ID; quindi una
creazione ripetuta non incrementa il conteggio.

Non è stata eseguita una nuova prova mutante in produzione.

## Stato dei flussi

- Accesso, sessione, recupero password e cambio password temporanea: presenti.
- Creazione manuale atleta con email facoltativa: presente via RPC.
- Invito nuovo utente e reinvito account esistente: presenti nella Edge Function
  v6 con callback `/Climbing-log/auth/callback`.
- Onboarding invitato e riconciliazione Auth/scheda: presenti nello schema live.
- Programma coach e visualizzazione atleta: presenti e collegate al backend V1.
- Test manuali, remoti e Tindeq: presenti con persistenza e test unitari.
- La nuova batteria Tindeq Live espone 11 protocolli clinici indipendenti per
  presa e lato. Ogni test usa una vista dedicata con curva live e valori in kg.
- Endurance e Repeaters usano esclusivamente la MVC completata nella stessa
  sessione, presa e lato: target 60%, tolleranza ±5%. L'Endurance si arresta
  dopo più di 3 secondi consecutivi fuori zona; Repeaters usa timer 7:3 e due
  segnali sonori distinti.
- La RFD primaria è espressa in kg/s dal reale onset al picco; onset, picco,
  tempo al picco, metriche storiche e curva grezza in Newton restano salvati.
- Il salvataggio ufficiale attende la persistenza del tentativo provvisorio,
  evitando la precedente concorrenza che poteva bloccare “Conferma test”.
- Le sessioni Tindeq non concluse vengono conservate localmente per
  coach–atleta e ripristinate al rientro nell'app.
- I test ancora pendenti possono essere rimossi dalla batteria live. Nello
  storico il coach può inoltre eliminare un singolo test Tindeq, inclusi i suoi
  tentativi e la curva, senza cancellare l'intera sessione.
- Peak Force / MVC materializza e presenta il risultato soltanto in kg; la
  misura tecnica in Newton resta disponibile nell'acquisizione grezza ma non
  genera più un secondo grafico. Repeaters 7:3 salva come risultato principale
  il numero di ripetizioni effettivamente svolte.
- I parametri tecnici interni della sessione Tindeq non vengono più mostrati nei
  box dei grafici né usati per separare serie storiche equivalenti.
- Timer, outbox e aggiornamenti PWA: presenti con persistenza locale e policy di
  aggiornamento sicuro.
- Il runner atleta usa un solo componente timer, sempre contenuto nella card del
  singolo esercizio. Gli esercizi a ripetizioni espongono il recupero tra serie;
  quelli isometrici guidano lavoro, pausa tra ripetizioni, alternanza DX/SX se
  prevista e recupero lungo soltanto al termine della serie.
- CI frontend: gate completo su ogni push e pull request.
- CI database: ricostruisce lo snapshot produttivo isolato e vi applica
  automaticamente ogni migrazione canonica successiva al baseline.

## Verifiche locali del riallineamento

- Test migrazione mirati: 3/3 superati.
- Test mirati gestione atleti, onboarding e routing: 10/10 superati.
- Gate generale `pnpm check`: superato il 15 settembre 2026.
  - encoding: 401 file controllati;
  - copy check, ESLint e TypeScript: superati;
  - Vitest: 43 file, 201 test superati;
  - test Node/migrazioni: 40 test superati;
  - build Vite produzione: completata, 1.719 moduli trasformati.
- Gate generale `pnpm check`: superato il 22 settembre 2026 dopo le correzioni
  Tindeq live.
  - encoding: 403 file controllati;
  - copy check, ESLint e TypeScript: superati;
  - Vitest: 44 file, 209 test superati;
  - test Node/migrazioni: 40 test superati;
  - build Vite produzione: completata, 1.720 moduli trasformati.
- Gate generale `pnpm check`: superato il 22 settembre 2026 dopo
  l'unificazione dei timer atleta.
  - encoding: 403 file controllati;
  - copy check, ESLint e TypeScript: superati;
  - Vitest: 44 file, 211 test superati;
  - test Node/migrazioni: 40 test superati;
  - build Vite produzione: completata, 1.720 moduli trasformati.
- Confronto Edge Function: il file locale coincide riga per riga con la versione
  6 distribuita.

Non sono stati eseguiti `pnpm db:test` o smoke test remoti: il primo richiede uno
stack Docker locale non avviato; i secondi creano e cancellano fixture e non sono
appropriati sulla produzione canonica durante un audit in sola lettura.

## Problemi noti classificati

### Priorità alta

| Riscontro | Stato | Evidenza/Impatto |
|---|---|---|
| Policy atleta in `test_library` e `test_plan_items` confrontano `athlete_id` con `auth.uid()` invece di `private.current_athlete_id()` | **corretto e applicato** | La migrazione `20260913165149_harden_database_access.sql` usa l'identità atleta applicativa; la definizione è stata verificata in produzione. |
| RPC remote `SECURITY DEFINER` eseguibili da `anon` | **corretto e applicato** | `PUBLIC` e `anon` sono revocati, mentre `authenticated` e `service_role` sono preservati; i tre controlli `has_function_privilege` restituiscono `false` per `anon`. |
| Privilegi anonimi eccessivi | **corretto e applicato** | Tutti i privilegi `anon` sulle sei tabelle private rilevate sono stati revocati; la verifica in produzione restituisce zero grant residui. |
| Il job database CI non include le ultime correzioni inviti | **corretto nel repository** | `scripts/stage-ci-migrations.mjs` inserisce nel baseline isolato tutte le migrazioni canoniche più recenti prima del reset. |

### Priorità media

| Riscontro | Stato | Evidenza/Impatto |
|---|---|---|
| Perdita del messaggio reale su risposta Edge non-2xx | **confermato** | `inviteAthlete` usa `error.message` di `functions.invoke` senza leggere il body JSON del backend. |
| Logger centralizzato assente | **confermato** | Solo `console.error`/errori locali; nessun contesto diagnostico comune. |
| Error Boundary globale assente | **confermato** | `main.tsx` monta direttamente provider/router; errori React non gestiti possono lasciare schermata vuota. |
| Nessun test browser end-to-end | **confermato** | Nessuna configurazione Playwright/Cypress o suite E2E nel repository. |
| Protezioni di `main` | **da approfondire** | Il workflow pubblica automaticamente da `main`; le branch protection non sono versionate né verificabili dal checkout. |

### Priorità bassa / debito strutturale

| Riscontro | Stato | Evidenza/Impatto |
|---|---|---|
| File con dimensioni e responsabilità eccessive | **confermato** | `App.tsx` 1.525 righe, `styles.css` 1.690, `LiveTindeqPanel.tsx` 1.949, `RemoteTestPanel.tsx` 1.585. |
| Ambiguità di `src/tests` | **confermato** | Contiene sia dominio/UI dei test atleta sia file automatici `*.test.ts`. |
| Più cartelle simili a fonti migrazione | **confermato, chiarito** | Canonica: `supabase/migrations`; le altre sono baseline CI e archivio storico V1. |

## File locali aggiunti o aggiornati

- `docs/PROJECT_CONTEXT.md`
- `docs/CURRENT_STATE.md`
- `docs/GRAPHICS_ROADMAP.md`
- `supabase/migrations/20260913161938_realign_invitation_state.sql`
- `supabase/migrations/20260913165149_harden_database_access.sql`
- `migration/invitation-reconciliation.test.mjs`
- `migration/database-access-hardening.test.mjs`
- `scripts/stage-ci-migrations.mjs`
- `.github/workflows/ci.yml`
- `supabase/functions/invite-athlete/index.ts`
- `src/dashboard/AthleteHomeScreen.tsx`
- `src/styles.css`
- `src/tests/LiveTindeqPanel.tsx`
- `src/tests/LiveForceChart.tsx`
- `src/tests/liveForceChartModel.ts` e relativo test
- `src/tests/liveTestDraftStorage.ts` e relativo test
- `src/tests/liveTestRuntime.ts`, factory e relativo test

La migrazione `harden_database_access` è stata applicata e verificata sulla
produzione Supabase canonica. Il rilascio frontend è tracciato dalla successiva
cronologia Git e dal workflow GitHub Pages.
