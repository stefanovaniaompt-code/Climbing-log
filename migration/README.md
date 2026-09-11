# Migrazione Climbing Coach V1 → V2

Questa cartella governa l’evoluzione in-place della V1 verso V2. La V1 può essere collegata e modificata, ma ogni intervento parte da uno snapshot verificato e deve preservare dati atleta, allenamenti svolti, log esercizi e storico test. Il validatore del backup locale `stefano-climbing-log-v1` resta obbligatorio prima di rimuovere qualsiasi codice legacy.

## Strategia

1. Congelare una fotografia: export JSON locale, dump delle tabelle V1 e manifesto dei file in `test-videos`.
2. Validare formato, tipi, riferimenti e duplicati. Ogni scarto deve diventare un errore esplicito, mai una perdita silenziosa.
3. Trasformare in staging con identificatori legacy deterministici. Ripetere lo stesso import deve produrre lo stesso risultato.
4. Applicare upgrade additivi alla V1 in batch piccoli e transazioni brevi, riutilizzando gli ID esistenti.
5. Riconciliare conteggi, checksum, record orfani e campioni funzionali per atleta/programma/test.
6. Eseguire cutover solo con tutti i gate verdi. È accettato un periodo di indisponibilità della V1, ma snapshot e rollback restano obbligatori fino alla riconciliazione finale.

## Uso del dry-run locale

```bash
npm run migration:dry-run
npm test
```

Il comando stampa solo riepilogo, errori, avvisi e checksum. `writesPerformed` è sempre `0`.

## Mapping prioritario

| Sorgente V1 | Staging | Destinazione V2 proposta | Garanzia |
|---|---|---|---|
| `settings` | `athlete_settings` | metriche/impostazioni atleta | precisione originale |
| `weeks[]` | `legacy_training_week` | `training_weeks` | ordine e note preservati |
| `weeks[].ex.*` | `legacy_exercise_log` | `exercise_logs` + set | chiave esercizio + indice set |
| `weeks[].routes[]` | `legacy_route_log` | `climbing_logs` | payload originale conservato |
| tabelle cloud programmi/sessioni | tabelle staging omonime | modello V2 approvato | `legacy_id`, FK e conteggi |
| `test_results` | `legacy_test_result` | risultati normalizzati | protocollo e lato obbligatori |
| `test-videos` | `media_manifest` | media V2 | path, size e checksum |

## Gate prima del cutover

- backup ripristinabile verificato;
- zero errori bloccanti nel validatore;
- conteggi sorgente/staging/destinazione uguali per entità;
- zero FK orfane;
- checksum dei media uguali;
- prova completa con export reale anonimizzato;
- RLS, privilegi e indici verificati nel nuovo schema;
- rollback provato e tempo massimo documentato.

## Decisioni ancora da approvare

- regola di fusione quando lo stesso allenamento esiste sia localmente sia nel cloud;
- durata massima della finestra di manutenzione e della finestra di rollback;
- conservazione o archiviazione dei payload legacy dopo la riconciliazione.

## Decisioni acquisite

- V2-dev resta un banco prova separato; la destinazione di pubblicazione è l’evoluzione in-place del progetto V1.
- La relazione workspace/coach/atleta delle fondamenta è approvata e collaudata sul progetto dev.
- La V1 può essere collegata e modificata. La continuità del servizio non è un vincolo durante il cutover; la continuità e la verificabilità dei dati lo sono.
- L’inventario V1 di catalogo e conteggi è versionato in `v1-inventory-2026-09-06.md`.
