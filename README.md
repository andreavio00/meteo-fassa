# meteo-fassa

Sito statico che mostra i dati meteo in tempo reale della Val di Fassa,
pensato per GitHub Pages.

## Fonti dati

- **Stazioni ufficiali** (Moena, Canazei, Passo Costalunga, Campitello,
  Pian Fedaia): dati letti direttamente nel browser dall'API pubblica di
  `dati.meteotrentino.it` (nessuna configurazione necessaria).
- **Vigo di Fassa** e **Pozza di Fassa (Monzon)**: queste due fonti
  (Dolomiti Meteo / Meteo Project, e MeteoNetwork) non offrono un'API
  JSON pubblica e gratuita utilizzabile direttamente dal browser.
  I loro dati vengono quindi scaricati periodicamente da un **workflow
  GitHub Actions** (`.github/workflows/update-extra-stations.yml`), che
  esegue lo script `scripts/fetch_extra_stations.py` e salva il
  risultato in `data/extra-stations.json`. Il sito legge questo file
  esattamente come le altre stazioni.

## Attivare l'aggiornamento automatico

Perché il workflow possa fare il commit del file JSON aggiornato, serve
dare i permessi di scrittura al token di GitHub Actions:

1. Nel repository su GitHub vai su **Settings → Actions → General**.
2. In fondo, in **Workflow permissions**, seleziona
   **"Read and write permissions"**.
3. Salva.

Il workflow gira automaticamente ogni 15 minuti. Puoi anche lanciarlo a
mano dalla tab **Actions** del repository (pulsante **"Run workflow"**
sul workflow "Aggiorna dati Vigo e Pozza di Fassa").

## Se i dati di Vigo/Pozza non compaiono

Lo script fa "screen scraping" (legge il testo della pagina pubblica),
non usa un'API dedicata, quindi è sensibile a eventuali cambi di
struttura delle due pagine sorgente, o a stazioni temporaneamente
offline. Se una card mostra "-" al posto dei valori:

1. Vai nella tab **Actions** del repository e apri l'ultima esecuzione
   del workflow.
2. Guarda il log dello step "Esegui lo scraper": se compare un
   messaggio "ATTENZIONE: non ho trovato...", vuol dire che il testo
   cercato non è più presente nella pagina nel formato atteso.
3. In quel caso bisogna aggiornare le espressioni regolari in
   `scripts/fetch_extra_stations.py` (funzioni `parse_vigo` e
   `parse_pozza`).

La quota di Pozza di Fassa (Monzon) nello script è una stima
(1600 m): se conosci il valore esatto della stazione, correggila nel
file `scripts/fetch_extra_stations.py`.
