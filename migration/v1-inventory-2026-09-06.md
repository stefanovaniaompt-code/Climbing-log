# Inventario V1 — baseline aggiornata 2026-09-06 20:15 UTC

Inventario ottenuto con query di sola lettura sul catalogo e con soli conteggi aggregati. Nessun contenuto personale è stato esportato in questo file. Il workspace Supabase principale resta collegato a V2-dev; un workspace CLI separato e la configurazione locale del frontend sono collegati alla V1 per l’evoluzione in-place.

## Conteggi baseline

| Entità | Record |
|---|---:|
| Auth users | 4 |
| profiles | 4 |
| coach_athletes | 3 |
| athlete_invitations | 2 |
| programs | 2 |
| training_weeks | 24 |
| sessions | 30 |
| session_exercises | 128 |
| exercise_library | 14 |
| session_logs | 5 |
| exercise_logs | 24 |
| test_library | 8 |
| test_plans | 1 |
| test_plan_items | 6 |
| test_sessions | 2 |
| test_results | 7 |
| test_history (view) | 7 |
| Storage buckets | 1 |
| Storage objects | 0 |

Anche se gli utenti attivi dichiarati sono due, la sorgente contiene quattro account Auth. La regola conservativa è migrare tutti e quattro; eventuali account di test potranno essere esclusi solo con una decisione esplicita e registrata.

## Struttura rilevante per la fase 5

- `programs`: atleta, coach, nome, obiettivo, stato, date.
- `training_weeks`: programma, numero settimana, blocco, fase, data iniziale, stato e note.
- `sessions`: settimana, ordine, giorno pianificato, titolo, obiettivo, durata e note coach.
- `session_exercises`: sessione, esercizio opzionale, ordine, nome, prescrizione e contesto di calcolo JSON, RPE target, recupero e istruzioni.
- `session_logs` e `exercise_logs`: esecuzione reale, stato, tempi, RPE, note e payload `actual` JSON.

Le relazioni cloud esistenti sono tutte coperte da foreign key. Le cancellazioni sono prevalentemente `CASCADE`; il riferimento da una sessione all’esercizio di libreria è `SET NULL`, così lo storico mantiene il nome e la prescrizione incorporati.

## Sicurezza e Storage

- RLS è attiva su tutte le 15 tabelle pubbliche; `profiles` ha 2 policy, le altre ne hanno 4.
- `test_history` è una vista derivata, non una tabella da migrare come sorgente autonoma.
- Il bucket esiste ma al momento dello snapshot non contiene oggetti. Questo dato va ricontrollato nel backup finale perché può cambiare prima del cutover.

## Uso nella riconciliazione

Questi conteggi sono una baseline, non il backup finale. Al freeze della V1 verranno rigenerati nello stesso istante del dump e confrontati con staging e V2. Ogni differenza deve essere spiegata da una regola di trasformazione esplicita; nessun record può sparire silenziosamente.

La prima fotografia della giornata conteneva 4 `session_logs` e 21 `exercise_logs`. Prima dell’implementazione del runner sono arrivati legittimamente 1 nuovo log sessione e 3 log esercizio dalla V1. Il nuovo snapshot privato include queste aggiunte, contiene 430 righe complessive su 46 tabelle ed è coerente.
