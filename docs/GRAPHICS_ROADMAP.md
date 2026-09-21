# Climbing Coach V2 — roadmap grafica

Roadmap avviata il 14 settembre 2026, dopo la stabilizzazione dei problemi
funzionali prioritari. L'obiettivo è migliorare leggibilità e coerenza senza
alterare i flussi di allenamento e test già validati.

## Fase 0 — baseline stabile (completata localmente)

- workout della settimana accoppiato direttamente alla propria barra e label;
- pagina di esecuzione dedicata per ogni test Tindeq;
- curva live comune a tutti i protocolli;
- fascia target endurance calcolata da MVC e percentuale, con tolleranza ±5%;
- conferma test autosufficiente e ripristino delle sessioni provvisorie.

## Iterazione 1 — leggibilità atleta (completata localmente)

- ripuliti titoli, stati di caricamento e descrizioni troppo tecniche;
- corretto l'accostamento tra numero settimana e nome programma su smartphone;
- trasformate le sessioni settimanali in card compatte con giorno, stato e titolo
  sempre associati allo stesso indicatore;
- tradotto lo stato della settimana e resa evidente quella corrente;
- mantenuti viola/prugna, senape, fondo caldo, geometrie nette e dettagli mono
  ispirati a Nothing OS.

## Fase 1 — fondamenta visuali

- consolidare colori, spaziature, tipografia, raggi, ombre e stati interattivi in
  design token documentati;
- definire componenti unici per card, toolbar, selettori, feedback, empty state e
  azioni fisse mobile;
- introdurre una scala responsive esplicita per desktop coach e smartphone
  atleta;
- eliminare regole CSS duplicate e selettori dipendenti dalla posizione nel DOM.

**Uscita:** inventario componenti, token condivisi e nessuna regressione alle
viste esistenti.

## Fase 2 — esperienza atleta

- ridisegnare home, blocchi, settimane e workout con una gerarchia più chiara;
- rendere stato, giorno, durata e azione primaria leggibili senza abbreviazioni
  ambigue;
- uniformare runner, timer, recuperi, note e completamento sessione;
- verificare touch target, contrasto e leggibilità sui formati smartphone reali.

**Uscita:** l'atleta identifica in pochi secondi settimana corrente, prossimo
workout e stato delle sessioni.

## Fase 3 — esperienza Tindeq per protocollo

- mantenere uno scheletro comune (connessione, setup, countdown, acquisizione,
  review, conferma) con contenuti specifici per protocollo;
- aggiungere timer/durata guidata dove previsti dal test;
- specializzare grafico, zone, indicatori e metriche per MVC, endurance,
  repeaters, RFD e misurazione libera;
- aggiungere segnali visivi e sonori configurabili per ingresso/uscita dal target;
- progettare confronto tentativi e scelta del risultato ufficiale.

**Uscita:** ogni protocollo comunica chiaramente cosa fare, cosa sta misurando e
quando il tentativo è valido.

## Iterazione 2 — runner sessione atleta (completata localmente)

- timer con cifre leggibili a distanza, integrato nella card del singolo esercizio;
- fase corrente, serie e ripetizione visibili durante tutto l'esercizio;
- segnali audio forti e distinti per countdown, lavoro, recupero e fine;
- vibrazione sui cambi di fase compatibili e controllo audio sempre raggiungibile;
- timer compatto ingrandito prima dell'avvio e resa smartphone verificata.

## Fase 4 — accessibilità e qualità percepita

- contrasto WCAG, focus visibile, navigazione tastiera e annunci screen reader;
- preferenza `reduced-motion` e animazioni usate solo come feedback;
- stati offline, errore, sincronizzazione e recupero presentati in modo uniforme;
- revisione testi e terminologia italiana con Monica e almeno un atleta.

## Fase 5 — verifica e rilascio

- screenshot regression test sulle viste chiave desktop/mobile;
- test browser end-to-end dei percorsi atleta e Tindeq con device simulato;
- sessione di prova su Android/iOS con Progressor reale;
- rilascio progressivo con checklist e possibilità di rollback.

## Ordine consigliato

1. Design token e componenti base.
2. Home/settimana atleta.
3. Sistema grafici Tindeq e protocollo endurance.
4. Altri protocolli Tindeq.
5. Accessibilità, visual regression ed E2E.

Ogni fase deve chiudersi con `pnpm check`, verifica visuale sui breakpoint
mobile/desktop e prova del flusso interessato prima di passare alla successiva.
