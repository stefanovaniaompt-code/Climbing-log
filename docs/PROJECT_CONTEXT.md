# Climbing Coach V2 — contesto di progetto

Ultimo riallineamento: 13 settembre 2026.

## Prodotto e ambienti

Climbing Coach V2 è una singola applicazione React 19 + TypeScript + Vite 7,
installabile come PWA e impacchettata anche con Capacitor per Android e iOS. Il
coach la usa soprattutto da desktop; l'atleta soprattutto da smartphone.

- Repository: `stefanovaniaompt-code/Climbing-log`.
- Frontend produzione: GitHub Pages, percorso `/Climbing-log/`.
- Deploy: push su `main` tramite `.github/workflows/deploy-v2-production.yml`.
- Supabase produzione: `Climbing coach`, ref `xkymrvalnydxeamrajqs`, regione
  `eu-west-1`.
- Supabase sviluppo separato: `Climbing Coach V2 Dev`, ref
  `vrjoypwdpaxjmjjkxomg`. Non è produzione.
- Backend frontend di produzione: `VITE_BACKEND_SCHEMA=legacy-v1`.

Il browser riceve solo URL e chiave pubblicabile. Le credenziali amministrative
sono confinate alla Edge Function o agli script server-side esplicitamente
autorizzati.

## Principi permanenti di interfaccia

- mantenere il linguaggio visivo ispirato a Nothing OS e la palette esistente
  viola/prugna, senape e fondo caldo;
- usare lo stesso componente e lo stesso comportamento per funzioni equivalenti;
- privilegiare leggibilità, pulizia e utilizzo su smartphone, soprattutto nelle
  schermate atleta;
- mostrare solo testi funzionali: niente etichette promozionali, metatestuali o
  formulazioni che facciano percepire contenuti generati automaticamente;
- non introdurre interpretazioni grafiche o funzionali ambigue senza prima
  verificarle con il responsabile del prodotto.

## Architettura applicativa

`src/main.tsx` registra il gestore aggiornamenti PWA e monta `AppRoot` dentro
`AuthProvider` e `BrowserRouter`. `AppRoot` gestisce accesso, recupero password,
onboarding, cambio della password temporanea e instradamento per capacità. Dopo
l'accesso, `App.tsx` coordina le aree coach e atleta.

Il codice è organizzato per dominio:

- `src/auth`: sessione Supabase, password, magic link e recupero;
- `src/onboarding`: caricamento profilo e completamento atleta invitato;
- `src/coach`: dashboard, schede atleta, inviti e relazioni;
- `src/builder`: programmi, settimane, sessioni, esercizi e target da test;
- `src/dashboard`: programma e sessioni visibili all'atleta;
- `src/session`: runner, timer, autosalvataggio e completamento sessione;
- `src/tests`: dominio dei test atleta, manuale/remoto/Tindeq, risultati e trend;
- `src/tindeq`: protocollo e trasporti Web Bluetooth/Capacitor;
- `src/pwa` e `src/outbox.ts`: aggiornamenti sicuri e sincronizzazione offline.

I repository di dominio parlano con Supabase. La modalità demo è esplicita e non
persistente quando le variabili cloud non sono configurate.

## Identità, atleti e inviti

`auth.users`/`profiles` rappresentano l'account; `athletes` rappresenta la scheda
sportiva. Il collegamento è `athletes.user_id`; la relazione con il coach è in
`coach_athletes`. Questa separazione consente di creare programmi e test prima
che l'atleta abbia un account.

Il flusso canonico è:

1. `create_managed_athlete` crea o riusa una scheda non rivendicata del coach;
2. programmi, test plan e test session fanno riferimento a quella scheda;
3. la Edge Function `invite-athlete` autentica il chiamante, verifica che sia
   coach e che la relazione richiesta sia `active`, registra/aggiorna l'invito e
   invia invite o magic link;
4. Auth crea o recupera l'identità e il trigger collega l'account;
5. `get_invited_athlete_onboarding_context` recupera il nome dell'invito entro
   RLS;
6. `complete_invited_athlete_onboarding` completa il profilo, riconcilia la
   scheda Auth con quella invitata e preserva i dati del coach;
7. reinviti e creazioni ripetute con la stessa email normalizzata riusano la
   scheda pendente invece di crearne una nuova.

Coach e atleta sono capacità combinabili. L'accesso alle due aree deriva da
profilo, identità atleta e relazioni, non da metadati modificabili dal client.

## Programmi, sessioni e test

Il coach prepara programmi in bozza e li pubblica per un atleta attivo. La home
atleta carica il programma pubblicato, la settimana e le sessioni autorizzate.
Il runner conserva la sessione selezionata e lo stato del timer nel dispositivo;
il timer ricostruisce il tempo trascorso dopo background o refresh.

Le scritture di esercizi e tentativi Tindeq non inviate sono accodate in
IndexedDB con chiavi idempotenti e vengono ritentate su login, ritorno online o
richiesta esplicita. Gli errori di autorizzazione o validazione non vengono
trattati come offline.

I test supportano inserimento manuale, assegnazione remota e acquisizione Tindeq
live. Tentativi, risultati selezionati, storico e target derivati sono conservati
separatamente. Le misure ufficiali derivano solo da tentativi validi/selezionati
o da item remoti completati.

## PWA e persistenza locale

Il service worker usa strategia cache-first solo per asset versionati e
network-first per navigazione/versione. `version.json` contiene il build ID. Il
gestore aggiornamenti controlla avvio, focus, ritorno online e intervalli di 15
minuti; un aggiornamento aspetta quando una schermata registra un blocco per
lavoro non salvato.

`localStorage` conserva per utente area, vista, atleta, programma, settimana,
sessione e snapshot del timer. `sessionStorage` conserva soltanto lo stato breve
di recupero password e il tentativo di aggiornamento PWA. IndexedDB contiene
l'outbox.

## Database e migrazioni

La cartella canonica per ogni nuova migrazione è `supabase/migrations`.

- `migration/ci-baseline/supabase/migrations` è una ricostruzione/snapshot dello
  schema produttivo usata dal job database della CI; non è la fonte per nuove
  migrazioni.
- `migration/v1-upgrade/supabase/migrations` conserva la sequenza storica di
  upgrade V1; non riceve nuove modifiche.
- `SUPABASE_V2_6.sql` è un artefatto storico e non è una sorgente operativa.

Le migrazioni sono forward-only. Le riparazioni una tantum dei dati reali non
devono essere trasformate in SQL con UUID o dati personali hard-coded.

## Test e rilascio

`pnpm check` è il gate generale: encoding, copy check, ESLint, TypeScript, test
Vitest/Node e build. I test database della CI ricostruiscono lo schema dal
baseline isolato; prima del reset, `scripts/stage-ci-migrations.mjs` vi copia
ogni migrazione canonica con versione successiva a quella del baseline.
`pnpm db:test` richiede Docker e uno stack Supabase locale.
`pnpm test:remote:onboarding` è uno smoke test distruttivo solo su un progetto
Supabase di sviluppo esplicitamente collegato; non va eseguito in produzione.

Il deploy GitHub Pages parte automaticamente da `main`, esegue `pnpm check`,
compila con il ref Supabase di produzione e pubblica `dist`. Non esistono nel
repository test browser end-to-end.
