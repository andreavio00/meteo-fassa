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
trip-config.js
escursioni.html
escursioni.css
escursioni.js
```

In sintesi:

- `app.js` contiene la logica principale della pagina
- `stations-ui.js` aggiunge cache locale e gestione specifica della card di Pozza
- `stations-ui.css` contiene lo stile aggiuntivo delle stazioni, soprattutto Pozza
- `forecast-ui.js` e `forecast-ui.css` rifiniscono la visualizzazione delle previsioni senza appesantire ulteriormente `app.js`

---

## 6. Meteo per le escursioni

La home non carica più osservazioni e previsioni in quota al proprio interno.
Mostra invece quattro accessi colorati, uno per zona, che aprono direttamente
la pagina dedicata `escursioni.html`. In questo modo l'apertura delle previsioni
di Pozza non allunga anche la sezione delle escursioni nella stessa pagina.

Nella pagina dedicata osservazioni e previsioni restano distinte e arrivano
esclusivamente dai due Aggregator normalizzati:

- stazioni osservate: `https://gite-meteo-aggregator.andrea-vio.workers.dev/`
- previsioni: `https://gite-previsioni-aggregator.andrea-vio.workers.dev/`

Le quattro zone sono Catinaccio, Sella e Sassolungo, Marmolada e Val San
Nicolò, Moena e Latemar. Colore e simbolo rendono riconoscibile la zona anche
su uno schermo piccolo.

La configurazione condivisa si trova in `trip-config.js`. Il frontend usa gli
endpoint `/zone/...` già configurati nei Worker e non mantiene un secondo
elenco completo delle associazioni. Conserva soltanto due esclusioni di
presentazione, senza eliminare le stazioni dall'Aggregator:

- `fassa:coldeirossi` non viene mostrata nella zona Sella e Sassolungo
- `predazzo:passofeudo` non viene mostrata nella zona Moena e Latemar

La stazione MeteoTrentino `trentino:campitello` viene presentata direttamente
dal Worker come **Val Duron – Malga do Col d’Aura**.

Ogni zona mostra quattro stazioni osservate. I punti previsionali disponibili
restano invece quelli effettivamente forniti dall'Aggregator: 4 per Catinaccio,
4 per Sella e Sassolungo, 6 per Marmolada e Val San Nicolò e 3 per Moena e
Latemar. Per usare bene lo spazio viene visualizzata una sola fascia alla volta,
selezionabile tra `08–11`, `11–14`, `14–17` e `17–20`, per i primi tre giorni
disponibili. Il tocco su una scheda apre i dati di dettaglio.

Il frontend preserva i valori `null`, distingue pioggia istantanea e accumulo e
segnala i dati osservati più vecchi di 60 minuti quando è disponibile il
timestamp della misura.

L'Aggregator delle stazioni espone inoltre `sourceUrl`, collegamento alla
pagina pubblica della fonte. Nel dettaglio di ogni stazione il frontend mostra
il pulsante **Apri il sito della fonte**, come già avviene per le stazioni della
home di Pozza.

Sopra **Condizioni osservate**, la dicitura **Dati raccolti alle HH:MM** usa
esclusivamente `generated_at` dell'Aggregator delle stazioni. Indica quando il
dataset delle stazioni è stato raccolto, non l'ora dell'Aggregator delle
previsioni né necessariamente quella dell'ultima misura: la freschezza di ogni
sensore continua a essere indicata nella rispettiva scheda. La riga di stato
separata compare soltanto se una sorgente non è disponibile o se viene mostrata
la copia locale salvata dopo un aggiornamento non riuscito.

Per rendere più stabile il passaggio tra home e pagina escursioni, gli ultimi
JSON validi vengono conservati nel `localStorage` per un massimo di 6 ore e
mostrati subito mentre parte l'aggiornamento. Le richieste della pagina
escursioni hanno un timeout di 30 secondi. Il prototipo locale usa riferimenti
agli asset senza query string e tenta automaticamente un solo ricaricamento se
il piccolo server Android non consegna i fogli di stile al primo accesso.

Esiste inoltre una protezione temporanea per i codici che l'Aggregator delle
previsioni restituisce come `unknown`: il frontend consulta `source_code` solo
in questo caso. Per esempio il codice Meteo.report `C` viene correttamente
mostrato come **Parzialmente nuvoloso**. La soluzione definitiva resta
completare la tabella di normalizzazione nel Worker, così questa conoscenza non
rimane nel frontend.

Nelle schede previsionali la pioggia debole usa ora un leggero richiamo azzurro.
Il rosso è riservato a condizioni più importanti (severità almeno 90, almeno
5 mm in tre ore oppure raffiche di almeno 70 km/h).

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

## 8. Stato del progetto – 11 settembre 2026

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
- home compatta con quattro stazioni scorrevoli su mobile
- card amatoriale di Pozza più piccola e arrotondata, per darle un peso visivo secondario
- pagina escursioni separata con quattro zone
- testata escursioni compatta con accessi evidenti a Pozza Live e alle previsioni 08–20
- stazioni in quota lette dagli endpoint di zona dell'Aggregator
- previsioni escursioni limitate alle fasce 08–20

### Prossimi sviluppi

- resa e leggibilità su telefoni di dimensioni diverse
- eventuali ulteriori esclusioni o riordini di stazioni e punti previsionali
- service worker, manifest e icone per rendere il sito installabile come web app
- pagina per richiedere la previsione di una località scelta dall'utente e consultare insieme tutte le stazioni
- pulizia progressiva del vecchio codice escursioni rimasto in `app.js`

---

## 9. Repository

Frontend / GitHub Pages:

`https://github.com/andreavio00/meteo-fassa`

Cloudflare Workers:

`https://github.com/andreavio00/meteo-fassa-workers`

Il README deve essere considerato il riepilogo dell'architettura corrente del progetto e va aggiornato quando cambiano Worker, endpoint o struttura dei dati.
