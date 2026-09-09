# Meteo Fassa

Sito statico per GitHub Pages dedicato al meteo della Val di Fassa.

Pagina pubblica:

`https://andreavio00.github.io/meteo-fassa/`

Il progetto è attualmente organizzato in tre aree principali:

1. **Pozza Live / stazioni di riferimento**
2. **Previsioni per San Giovanni di Fassa**
3. **Meteo per le escursioni**, ancora da completare e razionalizzare

---

## 1. Stazioni di riferimento

Il frontend legge i dati da un unico Cloudflare Worker:

`https://meteopozza-stazioni.andrea-vio.workers.dev/`

Il Worker restituisce un JSON unico contenente le stazioni principali.

### Vigo di Fassa

- quota visualizzata: **1382 m**
- sorgente: **Vigo Meteo / MeteoProject**
- è la stazione principale della pagina e viene mostrata come card grande di riferimento

### Monzon – Pozza di Fassa

- quota visualizzata: **1520 m**
- sorgente: **MeteoNetwork**
- viene usata come confronto per Pozza, essendo più in quota

### Moena

- quota visualizzata: **1221 m**
- sorgente: **Moena Meteo**
- rappresenta il confronto con la parte più bassa della valle

### Pozza di Fassa – FassaWEB

Sorgente:

`https://www.fassaweb.net/it-it/meteoestrade/datirilevatiapozzadifassa.aspx`

Questa non è una stazione ufficiale: FassaWEB specifica che il rilevamento è di tipo **amatoriale**.

Il Worker legge direttamente la pagina HTML ed estrae tramite regex:

- temperatura attuale
- temperatura minima e massima
- orari di minima e massima
- umidità relativa
- pressione assoluta
- variazione della pressione nelle 3 ore
- orario di aggiornamento

Nel frontend Pozza viene quindi mostrata con una card più piccola, bordo rosso e dicitura **“Stazione amatoriale · dati non ufficiali”**, per distinguerla chiaramente dalle altre stazioni.

Per vedere direttamente l'HTML ricevuto dal Worker:

`https://meteopozza-stazioni.andrea-vio.workers.dev/?raw=pozza`

---

## 2. Worker delle stazioni

Il codice dei Worker è nel repository separato:

`https://github.com/andreavio00/meteo-fassa-workers`

Cartella:

```text
meteopozza-stazioni/
├── wrangler.jsonc
├── meteopozza-stazioni.js
└── meteopozza-stazioni-v2.js
```

Il file attualmente pubblicato da Cloudflare è:

```text
meteopozza-stazioni-v2.js
```

`meteopozza-stazioni.js` contiene la logica originaria di Vigo, Monzon e Moena.

`meteopozza-stazioni-v2.js` la riutilizza e aggiunge:

- Pozza/FassaWEB
- fetch paralleli delle sorgenti
- timeout dedicato
- cache edge Cloudflare breve
- eventuale supporto a `METEO_CACHE` se viene configurato un binding KV

La cache edge serve soprattutto a evitare di interrogare nuovamente tutte le sorgenti quando più utenti aprono la pagina a breve distanza.

---

## 3. Cache frontend delle stazioni

Il file:

```text
stations-ui.js
```

intercetta le richieste verso il Worker delle stazioni e conserva l'ultimo JSON valido nel `localStorage` del browser.

Questo permette di mostrare gli ultimi dati disponibili mentre il nuovo aggiornamento è in corso e offre una protezione di base contro errori temporanei di rete.

La chiave usata attualmente è:

```text
meteo-fassa-main-stations-v2
```

Durata massima prevista del dato locale: circa **6 ore**.

---

## 4. Previsioni

Le previsioni per Pozza/San Giovanni di Fassa arrivano da un Worker separato:

`https://meteopozza-previsioni.andrea-vio.workers.dev/`

Il Worker usa come sorgente **meteo.report** e normalizza la risposta in un JSON più semplice per il frontend.

Repository Worker:

```text
meteopozza-previsioni/
├── wrangler.jsonc
└── meteopozza-previsioni.js
```

Il JSON contiene:

- località
- data di generazione
- intervallo temporale della sorgente
- numero di giorni disponibili
- minima e massima giornaliera
- codice meteo
- precipitazione prevista
- probabilità di precipitazione
- vento, raffiche e direzione
- previsioni a intervalli di 3 ore

La sorgente fornisce attualmente **6 giorni** di previsione.

Gli intervalli sono generalmente:

```text
02 · 05 · 08 · 11 · 14 · 17 · 20 · 23
```

Nel frontend vengono mostrati come fasce inclusive, per esempio:

- `11–13`
- `14–16`
- `17–19`

La visualizzazione è rifinita da:

```text
forecast-ui.js
forecast-ui.css
```

che gestiscono la card di anteprima, le giornate, le fasce triorarie e una lieve evidenziazione dei temporali.

---

## 5. Struttura frontend attuale

File principali:

```text
index.html
style.css
app.js
stations-ui.css
stations-ui.js
forecast-ui.css
forecast-ui.js
```

In sintesi:

- `app.js` contiene la logica principale della pagina
- `stations-ui.js` aggiunge cache locale e gestione specifica della card di Pozza
- `stations-ui.css` contiene lo stile aggiuntivo delle stazioni, soprattutto Pozza
- `forecast-ui.js` e `forecast-ui.css` rifiniscono la visualizzazione delle previsioni senza appesantire ulteriormente `app.js`

---

## 6. Meteo per le escursioni

Nel frontend esiste già una sezione **“Meteo per una gita”** e `app.js` punta attualmente al Worker:

`https://gitemeteofassa.andrea-vio.workers.dev/`

Questa parte è però ancora **da consolidare**.

L'obiettivo è avere anche per le escursioni una struttura chiara analoga a Pozza Live:

- un file/endpoint unico per i dati attuali delle stazioni
- un file/endpoint unico per le previsioni delle località di interesse
- frontend che usa questi dati senza interrogare direttamente molte sorgenti diverse

Le stazioni e le località di montagna raccolte finora saranno quindi riordinate in una fase successiva.

---

## 7. Architettura desiderata

L'idea generale del progetto è mantenere il frontend leggero:

```text
SORGENTI ESTERNE
      ↓
CLOUDFLARE WORKERS
      ↓
JSON NORMALIZZATI
      ↓
GITHUB PAGES / frontend
```

Il browser non deve conoscere la struttura particolare di ogni sorgente meteo.

Sono i Worker a occuparsi di:

- scaricare le pagine/API originali
- interpretare HTML o JSON differenti
- uniformare nomi e unità di misura
- gestire timeout e cache
- restituire al sito una struttura semplice e stabile

---

## 8. Stato del progetto – 9 settembre 2026

### Funzionante

- layout principale Pozza Live
- Vigo di Fassa
- Monzon
- Moena
- Pozza/FassaWEB
- temperatura e umidità Pozza
- distinzione grafica della stazione amatoriale
- Worker unico delle stazioni principali
- cache edge del Worker
- cache locale browser
- previsioni San Giovanni di Fassa da meteo.report
- interfaccia previsioni giornaliere e triorarie

### Da completare

- consolidamento definitivo della sezione **escursioni**
- definizione del formato finale dei dati delle stazioni in quota
- definizione del formato finale delle previsioni per le gite
- eventuale ampliamento delle località
- pulizia progressiva del vecchio codice rimasto in `app.js`

---

## 9. Repository

Frontend / GitHub Pages:

`https://github.com/andreavio00/meteo-fassa`

Cloudflare Workers:

`https://github.com/andreavio00/meteo-fassa-workers`

Il README deve essere considerato il riepilogo dell'architettura corrente del progetto e va aggiornato quando cambiano Worker, endpoint o struttura dei dati.
