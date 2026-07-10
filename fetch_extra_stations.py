#!/usr/bin/env python3
"""
Scarica i dati di temperatura, umidita' e vento per le stazioni di
Vigo di Fassa (Meteo Project / Dolomiti Meteo) e Pozza di Fassa - Monzon
(MeteoNetwork), e li salva in data/extra-stations.json nello stesso
formato usato dalle card generate da app.js per le stazioni ufficiali
di meteotrentino.it.

Pensato per essere eseguito da un workflow GitHub Actions ogni N minuti.

NOTA IMPORTANTE:
Questo script fa "screen scraping" di pagine HTML pubbliche pensate per
essere lette da un browser, non di una API dedicata (nessuna delle due
fonti ne offre una gratuita e senza autenticazione). Se le pagine
cambiano struttura in futuro, le espressioni regolari qui sotto
potrebbero smettere di funzionare: in tal caso lo script logga un
warning e scrive comunque il JSON con i valori non trovati impostati a
null, così il sito continua a funzionare (la card mostrerà "-").
"""

import json
import re
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

ROME_TZ = ZoneInfo("Europe/Rome")

TIMEOUT = 20
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; meteo-fassa-bot/1.0; "
                  "+https://github.com/) fetch_extra_stations.py"
}

# Direzioni del vento in italiano (8 e 16 punti), usate per riconoscere
# il testo della direzione così come mostrato dalle pagine sorgente.
WIND_DIRS = (
    "NNE|NNO|ENE|ESE|SSE|SSO|OSO|ONO|"  # 16 punti, piu' specifiche prima
    "NE|NO|SE|SO|N|E|S|O"               # 8 punti
)

# Le pagine sorgente usano le sigle italiane; il sito invece mostra le
# sigle inglesi (coerenti con la funzione direction() in app.js), quindi
# le convertiamo qui per uniformita' tra tutte le card.
ITA_TO_EN_DIR = {
    "N": "N", "NNE": "NNE", "NE": "NE", "ENE": "ENE",
    "E": "E", "ESE": "ESE", "SE": "SE", "SSE": "SSE",
    "S": "S", "SSO": "SSW", "SO": "SW", "OSO": "WSW",
    "O": "W", "ONO": "WNW", "NO": "NW", "NNO": "NNW",
}


def kmh_to_ms(kmh):
    return round(kmh / 3.6, 1) if kmh is not None else None


def ita_dir_to_en(raw):
    if raw is None:
        return None
    return ITA_TO_EN_DIR.get(raw.upper(), raw)


def clean_number(raw):
    """'12,3' -> 12.3 ; '-' o None -> None"""
    if raw is None:
        return None
    raw = raw.strip().replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def first_match(patterns, text, flags=re.IGNORECASE):
    for pattern in patterns:
        m = re.search(pattern, text, flags)
        if m:
            return m.group(1)
    return None


def fetch_text(url):
    resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    # rimuove script/style per non intercettare numeri nel codice JS
    for tag in soup(["script", "style"]):
        tag.decompose()
    return soup.get_text(separator=" ", strip=True), resp.text


def parse_vigo():
    """Stazione di Vigo di Fassa - Meteo Project (dati usati anche da
    dolomitimeteo.com)."""
    url = "https://stazioni.meteoproject.it/dati/vigodifassa/tabella-vuota.php"
    text, raw_html = fetch_text(url)

    temp = clean_number(first_match([
        r"Temperatura[^0-9\-]{0,15}(-?\d+[.,]?\d*)\s*°?C",
        r"Temp\.?[^0-9\-]{0,10}(-?\d+[.,]?\d*)\s*°"
    ], text))

    humidity = clean_number(first_match([
        r"Umidit[àa][^0-9]{0,15}(\d+[.,]?\d*)\s*%"
    ], text))

    # Sul widget di Vigo velocita' e direzione compaiono appaiate, es.
    # "16.1 Km/h NNW", quindi le catturiamo insieme invece di cercarle
    # vicino alla parola "Vento" (che nel testo puo' essere lontana).
    wind_match = re.search(
        r"(\d+[.,]?\d*)\s*Km/h\s*([NSEWO]{1,3})\b",
        text, re.IGNORECASE
    )
    wind = clean_number(wind_match.group(1)) if wind_match else None
    wind_dir = wind_match.group(2).upper() if wind_match else None

    ok = temp is not None
    if not ok:
        print("[vigo] ATTENZIONE: non ho trovato la temperatura, "
              "controlla la struttura della pagina.", file=sys.stderr)

    return {
        "name": "Vigo di Fassa",
        "quota": "1400 m",
        "source_url": "https://www.dolomitimeteo.com/stazione-meteo-vigo/",
        "temp": temp,
        "humidity": humidity,
        "wind": kmh_to_ms(wind),
        "windDir": ita_dir_to_en(wind_dir),
        "updated": datetime.now(ROME_TZ).isoformat(),
        "ok": ok,
    }


def parse_pozza():
    """Stazione di Pozza di Fassa - Monzon (MeteoNetwork, pagina pubblica)."""
    url = ("https://www.meteonetwork.eu/it/weather-station/"
           "trn314-stazione-meteorologica-di-monzon")
    text, raw_html = fetch_text(url)

    temp = clean_number(first_match([
        r"Temperatura[^0-9\-]{0,15}(-?\d+[.,]?\d*)\s*°?C"
    ], text))

    humidity = clean_number(first_match([
        r"Umidit[àa][^0-9]{0,15}(\d+[.,]?\d*)\s*%"
    ], text))

    wind = clean_number(first_match([
        r"Vel\.?\s*media[^0-9]{0,15}(\d+[.,]?\d*)\s*km/h",
        r"Vento[^0-9]{0,20}(\d+[.,]?\d*)\s*km/h"
    ], text))

    wind_dir = first_match([
        rf"Direzione[^A-Z]{{0,15}}\b({WIND_DIRS})\b",
        rf"Vento[^A-Z]{{0,25}}\b({WIND_DIRS})\b"
    ], text, flags=0)

    ok = temp is not None
    if not ok:
        print("[pozza] ATTENZIONE: non ho trovato la temperatura, "
              "controlla la struttura della pagina (la stazione "
              "potrebbe anche essere offline).", file=sys.stderr)

    return {
        "name": "Pozza di Fassa (Monzon)",
        "quota": "1520 m",
        "source_url": url,
        "temp": temp,
        "humidity": humidity,
        "wind": kmh_to_ms(wind),
        "windDir": ita_dir_to_en(wind_dir),
        "updated": datetime.now(ROME_TZ).isoformat(),
        "ok": ok,
    }


def main():
    stations = {}

    try:
        stations["vigo"] = parse_vigo()
    except Exception as exc:
        print(f"[vigo] ERRORE durante il fetch: {exc}", file=sys.stderr)
        stations["vigo"] = {
            "name": "Vigo di Fassa", "quota": "1400 m",
            "temp": None, "humidity": None, "wind": None, "windDir": None,
            "updated": datetime.now(ROME_TZ).isoformat(), "ok": False,
        }

    try:
        stations["pozza"] = parse_pozza()
    except Exception as exc:
        print(f"[pozza] ERRORE durante il fetch: {exc}", file=sys.stderr)
        stations["pozza"] = {
            "name": "Pozza di Fassa (Monzon)", "quota": "1520 m",
            "temp": None, "humidity": None, "wind": None, "windDir": None,
            "updated": datetime.now(ROME_TZ).isoformat(), "ok": False,
        }

    with open("data/extra-stations.json", "w", encoding="utf-8") as f:
        json.dump(stations, f, ensure_ascii=False, indent=2)

    print(json.dumps(stations, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
