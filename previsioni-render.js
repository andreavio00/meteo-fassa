/* ============================================================
   PREVISIONI-RENDER.JS
   Legge la struttura dati da previsioni-data.js e la disegna.
   Pagina unica: striscia "prossime ore" fissa in alto + 7 righe
   giorno (oggi + 6 successivi) con accordion inline — click su una
   riga apre sotto di sé le chip orarie (oggi/domani) o di fascia
   (gli altri 5 giorni); click su una chip apre il modal di
   confronto tra i 3 modelli.
   ============================================================ */

const ICON_PATH = "icons/";

/* ============================================================
   PREFERENZE UTENTE — modello principale + campi opzionali nel
   dettaglio orario. Salvate in localStorage (funziona normalmente
   su GitHub Pages, a differenza degli ambienti sandbox di sviluppo).
   ============================================================ */
const CHIAVE_PREFERENZE = "lagunalive-previsioni-preferenze";
const MAX_CAMPI_OPZIONALI = 4;

// Weathercode/icona, temperatura e pioggia restano sempre visibili
// (hanno uno slot dedicato in ogni card); questi sono i soli togglabili.
const CAMPI_OPZIONALI_DISPONIBILI = [
    { id: "percepita", label: "Temperatura percepita", icona: "🥵", unita: "°", arrotonda: true },
    { id: "umidita", label: "Umidità", icona: "💧", unita: "%" },
    { id: "vento", label: "Vento (solo se ≥40 km/h)", icona: "💨", unita: "km/h", speciale: "vento" },
    { id: "pressione", label: "Pressione", icona: "🔽", unita: "hPa", arrotonda: true },
    { id: "cin", label: "Inibizione convettiva (CIN)", icona: "🧊", unita: " J/kg" },
    { id: "neve", label: "Neve", icona: "❄️", unita: "cm" },
    { id: "marea", label: "Marea (stimata)", icona: "🌊", unita: "cm" }
];

const PREFERENZE_DEFAULT = {
    modelloPrincipale: "auto",
    campiOpzionali: ["percepita", "umidita", "vento"]
};

function caricaPreferenze() {
    try {
        const salvate = localStorage.getItem(CHIAVE_PREFERENZE);
        if (!salvate) return { ...PREFERENZE_DEFAULT };
        const parse = JSON.parse(salvate);
        return {
            modelloPrincipale: parse.modelloPrincipale || PREFERENZE_DEFAULT.modelloPrincipale,
            campiOpzionali: Array.isArray(parse.campiOpzionali)
                ? parse.campiOpzionali.slice(0, MAX_CAMPI_OPZIONALI)
                : [...PREFERENZE_DEFAULT.campiOpzionali]
        };
    } catch (e) {
        console.warn("Preferenze non leggibili, uso i valori di default:", e);
        return { ...PREFERENZE_DEFAULT };
    }
}

function salvaPreferenze(pref) {
    try {
        localStorage.setItem(CHIAVE_PREFERENZE, JSON.stringify(pref));
    } catch (e) {
        console.warn("Impossibile salvare le preferenze:", e);
    }
}

let preferenze = caricaPreferenze();

const ICONE = {
    sun: "sole.png",
    sun_notte: "luna.png",
    partly: "poco_nuvoloso.png",
    partly_notte: "poco_nuvoloso_notte.png",
    cloud: "nuvoloso.png",
    rain: "pioggia.png",
    storm: "temporale.png",
    snow: "neve.png",
    fog: "nebbia.png"
};

/* Ore rappresentative per le fasce, quando non abbiamo un'ora precisa
   (es. riepilogo giorno o card fascia) ma serve decidere sole/luna */
const ORA_RAPPRESENTATIVA_FASCIA = { notte: 3, mattina: 9, pomeriggio: 15, sera: 21 };

function fileIcona(categoria, notte) {
    if (categoria === "sun") return notte ? ICONE.sun_notte : ICONE.sun;
    if (categoria === "partly") return notte ? ICONE.partly_notte : ICONE.partly;
    return ICONE[categoria] || ICONE.cloud;
}

/* contesto: "chiaro" (riga in alto, sfondo chiaro, serve contrasto)
   oppure "scuro" (righe sotto, sfondo blu scuro, contrasto già ok).
   ora: 0-23, usata per scegliere sole/luna e poco-nuvoloso giorno/notte. */
function iconaPer(categoria, contesto = "scuro", ora = 12) {
    const notte = ora < 7 || ora >= 20;
    const file = fileIcona(categoria, notte);

    if (contesto === "chiaro") {
        return `<img src="${ICON_PATH}${file}" width="40" alt="${categoria || ''}">`;
    }

    return `<img src="${ICON_PATH}${file}" width="40" alt="${categoria || ''}">`;
}

/* ============================================================
   VENTO — mostrato solo se forte (soglia decisa in chat: 40 km/h),
   con nome bora/scirocco quando la direzione rientra nei settori.
   ============================================================ */
function direzioneNome(gradi) {
    if (gradi === null || gradi === undefined) return "";
    if (gradi >= 30 && gradi <= 90) return "Bora";
    if (gradi >= 110 && gradi <= 160) return "Scirocco";
    const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    return dirs[Math.round(gradi / 45) % 8];
}

function ventoTesto(vento, direzione) {
    if (vento === null || vento === undefined || vento < 40) return null;
    return `💨 ${Math.round(vento)}km/h ${direzioneNome(direzione)}`.trim();
}

/* ============================================================
   CAMPI OPZIONALI — disegna solo quelli scelti nel pannello
   impostazioni, nell'ordine dell'elenco disponibile (non
   nell'ordine di selezione, per coerenza visiva tra le card).
   ============================================================ */
function renderCampoOpzionale(campoDef, modello) {
    if (!modello) return "";
    if (campoDef.speciale === "vento") {
        const txt = ventoTesto(modello.vento, modello.direzioneVento);
        return txt ? `<div>${txt}</div>` : "";
    }
    const v = modello[campoDef.id];
    if (v === null || v === undefined) return `<div>${campoDef.icona} —</div>`;
    const valore = campoDef.arrotonda ? Math.round(v) : v;
    return `<div>${campoDef.icona} ${valore}${campoDef.unita}</div>`;
}

function renderCampiOpzionali(modello) {
    return CAMPI_OPZIONALI_DISPONIBILI
        .filter(c => preferenze.campiOpzionali.includes(c.id))
        .map(c => renderCampoOpzionale(c, modello))
        .join("");
}

/* ============================================================
   DESCRIZIONE TESTUALE DEL METEO — frase breve sotto il nome del
   giorno, derivata dalla categoria (weathercode) già calcolata.
   ============================================================ */
const CATEGORIA_TESTO = {
    sun: "Sereno",
    partly: "Poco nuvoloso",
    cloud: "Nuvoloso",
    rain: "Pioggia",
    storm: "Temporale",
    snow: "Neve",
    fog: "Nebbia"
};
function categoriaTesto(categoria) {
    return CATEGORIA_TESTO[categoria] || "—";
}

/* ============================================================
   TAG ALLARME — pillola colorata sotto la descrizione meteo
   (non più badge circolari a destra). Per temporale e nebbia
   aggiunge anche il momento della giornata (fascia in cui scatta
   l'allarme), altrimenti "Temporale" da solo non dice se è in
   corso adesso o atteso stasera.
   ============================================================ */
function momentoAllarme(fasceGiorno, campo) {
    if (!fasceGiorno) return "";
    const fasce = fasceGiorno.filter(f => f.allarmi && f.allarmi[campo]).map(f => f.label);
    return fasce.length ? " · " + fasce.join(", ") : "";
}
/* Piccolo indicativo sulle chip fascia/ora: l'allarme temporale è
   calcolato su TUTTI e 3 i modelli (per prudenza), ma la chip mostra
   solo i dati del modello prioritario. Se quello prioritario da solo
   non lo racconterebbe (es. ARPAE sereno mentre Seamless prevede
   temporale), questo simbolo avvisa comunque, senza invadere la card:
   il dettaglio "chi lo dice" si vede aprendo il confronto. */
function badgeAvviso(allarmi) {
    if (!allarmi || !allarmi.temporaleForte) return "";
    return `<span class="prvs-chip-avviso" title="Almeno un modello prevede temporale forte in questo intervallo">⚡</span>`;
}

function tagAllarmi(allarmi, mareaMassima = null, fasceGiorno = null) {
    if (!allarmi) return "";
    const pezzi = [];
    if (allarmi.temporaleForte) {
        pezzi.push(`<span class="prvs-tag-allarme prvs-tag-temporale">Temporale forte${momentoAllarme(fasceGiorno, "temporaleForte")}</span>`);
    }
    if (allarmi.nebbiaPersistente) {
        pezzi.push(`<span class="prvs-tag-allarme prvs-tag-nebbia">Nebbia persistente${momentoAllarme(fasceGiorno, "nebbiaPersistente")}</span>`);
    }
    if (allarmi.acquaAlta) {
        const testo = mareaMassima !== null ? `Acqua alta · ${mareaMassima}cm` : "Acqua alta";
        pezzi.push(`<span class="prvs-tag-allarme prvs-tag-acqua-alta">${testo}</span>`);
    }
    return pezzi.join("");
}

/* ============================================================
   BARRA PIOGGIA — sostituisce il semplice testo "☂️ Xmm" nella
   riga giorno: stesso linguaggio visivo dell'idrometro marea.
   ============================================================ */
function coloreMm(mm) {
    if (mm === null || mm === undefined) return "rgba(16,38,43,0.15)";
    if (mm >= 8) return "var(--nizioleto)";
    if (mm >= 2) return "var(--sole)";
    if (mm > 0)  return "var(--acqua)";
    return "rgba(16,38,43,0.15)";
}
function pioggiaBar(mm, scalaMax = 12) {
    const valore = mm !== null && mm !== undefined ? mm : 0;
    const pct = Math.min(100, Math.round((valore / scalaMax) * 100));
    const mmVisualizzato = mm !== null && mm !== undefined ? Math.round(mm * 10) / 10 : null;
    return `<div class="prvs-pioggia">
        <span>☂️</span>
        <div class="prvs-pioggia-track"><div class="prvs-pioggia-fill" style="width:${pct}%; background:${coloreMm(mm)}"></div></div>
        <span class="prvs-pioggia-mm">${mmVisualizzato !== null ? mmVisualizzato + "mm" : "—"}</span>
    </div>`;
}

/* ============================================================
   CONCORDANZA TRA MODELLI — 3 pallini (temp/pioggia/vento),
   calcolo delegato a previsioni-data.js (soglie centralizzate lì).
   ============================================================ */
function rigaConcordanza(m1, m2) {
    const c = PrevisioniData.calcolaConcordanza(m1, m2);
    if (!c.temp && !c.pioggia && !c.vento) return "";
    const seg = (livello, etichetta) => `<div class="prvs-concordanza-seg ${livello ? "prvs-livello-" + livello : "assente"}" title="${etichetta}"></div>`;
    return `<div class="prvs-concordanza">
        <div class="prvs-concordanza-bar">
            ${seg(c.temp, "Accordo temperatura")}
            ${seg(c.pioggia, "Accordo pioggia")}
            ${seg(c.vento, "Accordo vento")}
        </div>
        <div class="prvs-concordanza-legenda"><span>T</span><span>mm</span><span>vento</span></div>
    </div>`;
}

/* Stato della vista esplosa. null = vista normale. */
let stato = {
    giornoAperto: null
};

let previsioniCache = null;

/* ============================================================
   FASCIA 1 — Situazione attuale
   Solo il dato osservato (Cavanis): il "previsto oggi" è stato
   spostato nella home di LagunaLive (index.html), che ora mostra
   la propria anteprima usando previsioni-data.js direttamente.
   ============================================================ */
function renderAttualeOsservato(dati) {
    const el = document.getElementById("prvs-attuale-osservato");
    el.classList.remove("prvs-attuale-caricamento");

    if (!dati) {
        el.textContent = "Situazione attuale non disponibile";
        return;
    }

    const ora = dati.timestamp ? Osservazioni.formatTime(dati.timestamp) : null;

    el.innerHTML = `Situazione attuale${ora ? ` (${ora})` : ""} ` +
        `<span class="term">🌡️</span> ${dati.temperature.toFixed(1)}° ` +
        `💧 ${dati.humidity.toFixed(0)}%`;
}

async function caricaSituazioneAttuale() {
    try {
        const cavanis = await Osservazioni.loadCavanis();

        renderAttualeOsservato({
            timestamp: cavanis.timestamp,
            temperature: cavanis.temperature,
            humidity: cavanis.humidity
        });

    } catch (errore) {
        console.error("Errore nel caricamento della situazione attuale:", errore);
        renderAttualeOsservato(null);
    }
}

/* ============================================================
   PAGINA — striscia ore FISSA (non cambia mai) + 7 righe giorno
   (oggi + 6 successivi) con accordion inline: click su una riga
   apre sotto di sé le chip orarie (oggi/domani) o di fascia (gli
   altri 5 giorni); click su una chip apre il modal di confronto.
   ============================================================ */
function renderPagina(previsioni) {
    // --- Striscia "Prossime ore": sempre le stesse 10 ore, mai sostituita ---
    const scroll = document.getElementById("prvs-oggi-scroll");
    scroll.innerHTML = "";

    for (const ora of previsioni.prossimeOre) {
        const cella = document.createElement("div");
        cella.className = "prvs-oraria-cell";
        cella.innerHTML = `
            <div class="prvs-ora-testo">${String(ora.ora).padStart(2, "0")}:00</div>
            <div class="prvs-oraria-icona">${iconaPer(ora.categoria, "chiaro", ora.ora)}</div>
            <div class="prvs-ora-temp num"><span class="term">🌡️</span>${ora.temp !== null ? Math.round(ora.temp) + "°" : "—"}</div>
            ${pioggiaBar(ora.precip)}
            <div class="prvs-ora-sky">${categoriaTesto(ora.categoria)}</div>
        `;
        scroll.appendChild(cella);
    }

    // --- 7 righe giorno: oggi + 6 successivi ---
    const contenitore = document.getElementById("prvs-fascia-giorni");
    contenitore.innerHTML = "";

    const giorni = previsioni.riepilogoGiorni.slice(0, 7);
    for (const [idx, giorno] of giorni.entries()) {
        const item = creaVoceGiorno(previsioni, giorno, idx);
        contenitore.appendChild(item);
    }

    // Se un giorno era aperto (es. dopo un cambio di impostazioni), riaprilo
    if (stato.giornoAperto) {
        const giorno = giorni.find(g => g.data === stato.giornoAperto);
        const item = contenitore.querySelector(`[data-data="${stato.giornoAperto}"]`);
        if (giorno && item) apriGiorno(previsioni, giorno, item);
    }

    renderMarea(previsioni);
}

/* ============================================================
   MAREA — idrometro con le soglie ufficiali del Centro Maree
   Venezia (sostenuta 80cm, molto sostenuta 110cm, eccezionale
   140cm). Se il worker/proxy marea fallisce, mareaPrevisioni è
   semplicemente vuoto: mostriamo un avviso, mai un errore JS.
   ============================================================ */
const SOGLIE_MAREA = [80, 110, 140];
const SCALA_MAREA = 180;

function coloreMarea(cm) {
    if (cm >= 140) return "var(--nizioleto-soft)";
    if (cm >= 110) return "var(--sole-soft)";
    if (cm >= 80)  return "var(--acqua-soft)";
    return "var(--bricola-soft)";
}

function renderMarea(previsioni) {
    const cont = document.getElementById("prvs-fascia-marea");
    const adesso = Date.now();
    const picchi = (previsioni.mareaPrevisioni || [])
        .filter(m => new Date(m.datetime).getTime() >= adesso)
        .slice(0, 6);

    if (picchi.length === 0) {
        cont.innerHTML = `<span class="prvs-caricamento">Dati marea non disponibili al momento.</span>`;
        return;
    }

    cont.innerHTML = picchi.map(m => {
        const pct = Math.min(100, Math.round((m.valore / SCALA_MAREA) * 100));
        const soglie = SOGLIE_MAREA.map(s =>
            `<div class="prvs-gauge-soglia" data-cm="${s}" style="left:${(s / SCALA_MAREA) * 100}%"></div>`
        ).join("");
        const giornoDiverso = m.data !== previsioni.oggiStr;
        const etichettaGiorno = giornoDiverso ? ` · ${PrevisioniData.formattaDataBreve(m.data)}` : "";
        return `
            <div class="prvs-marea-riga">
                <div class="prvs-marea-top">
                    <span>
                        <span class="prvs-marea-ora num">${m.ora}${etichettaGiorno}</span>
                        <span class="prvs-marea-tipo">${m.tipo === "max" ? "Massimo" : "Minimo"}</span>
                    </span>
                    <span class="prvs-marea-cm num" style="color:${coloreMarea(m.valore)}">${m.valore}cm</span>
                </div>
                <div class="prvs-gauge">
                    <div class="prvs-gauge-fill" style="width:${pct}%; background:${coloreMarea(m.valore)}"></div>
                    ${soglie}
                </div>
            </div>
        `;
    }).join("") + `<div class="prvs-gauge-legenda"><span>0 cm</span><span>${SCALA_MAREA} cm</span></div>`;
}

function creaVoceGiorno(previsioni, giorno, idx) {
    const item = document.createElement("div");
    item.className = "prvs-giorno-item";
    item.dataset.data = giorno.data;

    const riga = document.createElement("div");
    riga.className = "prvs-giorno-card";
    riga.innerHTML = `
        <div class="prvs-giorno-icona">${iconaPer(giorno.sintesi.categoria, "chiaro", 12)}</div>
        <div class="prvs-giorno-testo">
            <div class="prvs-giorno-label">${giorno.label}<span class="prvs-chevron">⌄</span></div>
            <div class="prvs-giorno-sky">${categoriaTesto(giorno.sintesi.categoria)}</div>
            ${tagAllarmi(giorno.allarmi, giorno.mareaMassima, giorno.fasceGiorno)}
        </div>
        <div class="prvs-giorno-dati">
            <div class="prvs-giorno-temp">
                <span class="max num"><span class="term">🌡️</span>${giorno.sintesi.max !== null ? Math.round(giorno.sintesi.max) + "°" : "—"}</span>
                <span class="min num">${giorno.sintesi.min !== null ? Math.round(giorno.sintesi.min) + "°" : "—"}</span>
            </div>
            ${pioggiaBar(giorno.sintesi.pioggiaTotale)}
        </div>
    `;
    riga.addEventListener("click", () => toggleGiorno(previsioni, giorno, item));

    const espansione = document.createElement("div");
    espansione.className = "prvs-giorno-espansione";

    item.appendChild(riga);
    item.appendChild(espansione);
    return item;
}

function toggleGiorno(previsioni, giorno, item) {
    const giaAperto = item.classList.contains("aperto");

    document.querySelectorAll(".prvs-giorno-item.aperto").forEach(el => {
        el.classList.remove("aperto");
        const esp = el.querySelector(".prvs-giorno-espansione");
        if (esp) esp.innerHTML = "";
    });
    stato.giornoAperto = null;

    if (!giaAperto) apriGiorno(previsioni, giorno, item);
}

/* Oggi e domani (indice 0-1): primo livello fasce → tap su una fascia
   espande sotto le ore di quella fascia (nessun confronto a livello
   fascia) → tap su un'ora apre il confronto. Dal 3° giorno in poi
   (indice 2+, oltre l'orizzonte ARPAE delle 72h): un solo livello,
   fasce → tap apre subito il confronto (nessuna vista oraria). */
function apriGiorno(previsioni, giorno, item) {
    item.classList.add("aperto");
    stato.giornoAperto = giorno.data;

    const idx = previsioni.riepilogoGiorni.findIndex(g => g.data === giorno.data);
    const usaOre = idx <= 1;
    const espansione = item.querySelector(".prvs-giorno-espansione");

    const scroll = document.createElement("div");
    scroll.className = "prvs-slot-scroll";
    espansione.appendChild(scroll);

    const scrollOre = document.createElement("div");
    espansione.appendChild(scrollOre);

    const dettaglio = document.createElement("div");
    espansione.appendChild(dettaglio);

    const selezionaConfronto = (chip, contenitoreChip, titolo, arpae, ecmwf, seamless) => {
        contenitoreChip.querySelectorAll(".prvs-slot-chip").forEach(c => c.classList.remove("selezionata"));
        chip.classList.add("selezionata");
        const confrontoA = arpae || ecmwf;
        const confrontoB = arpae ? ecmwf : seamless;
        mostraConfrontoInline(dettaglio, titolo, arpae, ecmwf, seamless, confrontoA, confrontoB);
    };

    const creaChipOra = (oraDett) => {
        const arpae = oraDett.modelli.arpae || null;
        const ecmwf = oraDett.modelli.ecmwf || null;
        const seamless = oraDett.modelli.icon || null;
        const rappresentativo = arpae || ecmwf;
        const chip = document.createElement("div");
        chip.className = "prvs-slot-chip";
        chip.innerHTML = `
            <div class="prvs-slot-h">${String(oraDett.ora).padStart(2, "0")}:00${badgeAvviso(oraDett.allarmi)}</div>
            ${iconaPer(oraDett.sintesi ? oraDett.sintesi.categoria : null, "chiaro", oraDett.ora)}
            <div class="prvs-slot-t num">${rappresentativo ? rappresentativo.temp + "°" : "—"}</div>
            <div class="prvs-slot-mm">☂️ ${rappresentativo ? (rappresentativo.precip ?? 0) + "mm" : "—"}</div>
            <div class="prvs-slot-extra">${renderCampiOpzionali({ ...rappresentativo, marea: oraDett.marea })}</div>
        `;
        chip.addEventListener("click", () =>
            selezionaConfronto(chip, scrollOre, `Ore ${String(oraDett.ora).padStart(2, "0")}:00`, arpae, ecmwf, seamless)
        );
        return chip;
    };

    // Per oggi, le fasce già interamente trascorse (es. "Notte" o
    // "Mattina" se sono le 14:00) non vengono nemmeno mostrate come
    // chip di primo livello — non solo filtrate le ore al loro interno.
    let fasceDaMostrare = giorno.fasceGiorno;
    if (giorno.data === previsioni.oggiStr) {
        const oraCorrente = new Date().getHours();
        fasceDaMostrare = fasceDaMostrare.filter(f => {
            const range = PrevisioniData.FASCE_ORARIE.find(r => r.id === f.fascia);
            return range.oreFine > oraCorrente;
        });
    }

    for (const fascia of fasceDaMostrare) {
        const arpae = fascia.modelli.arpae || null;
        const ecmwf = fascia.modelli.ecmwf || null;
        const seamless = fascia.modelli.icon || null;
        const rappresentativo = arpae || ecmwf;
        const oraRappresentativa = ORA_RAPPRESENTATIVA_FASCIA[fascia.fascia];
        const chip = document.createElement("div");
        chip.className = "prvs-slot-chip";
        chip.innerHTML = `
            <div class="prvs-slot-h">${fascia.label}${badgeAvviso(fascia.allarmi)}</div>
            ${iconaPer(fascia.sintesi ? fascia.sintesi.categoria : null, "chiaro", oraRappresentativa)}
            <div class="prvs-slot-t num">${rappresentativo ? rappresentativo.temp + "°" : "—"}</div>
            <div class="prvs-slot-mm">☂️ ${rappresentativo ? (rappresentativo.precip ?? 0) + "mm" : "—"}</div>
            <div class="prvs-slot-extra">${renderCampiOpzionali(rappresentativo)}</div>
        `;

        if (usaOre) {
            chip.addEventListener("click", () => {
                scroll.querySelectorAll(".prvs-slot-chip").forEach(c => c.classList.remove("selezionata"));
                chip.classList.add("selezionata");
                dettaglio.innerHTML = "";

                const range = PrevisioniData.FASCE_ORARIE.find(f => f.id === fascia.fascia);
                let oreFascia = giorno.oreDettaglio.filter(o => o.ora >= range.oreInizio && o.ora < range.oreFine);
                if (giorno.data === previsioni.oggiStr) {
                    const oraCorrente = new Date().getHours();
                    oreFascia = oreFascia.filter(o => o.ora >= oraCorrente);
                }
                scrollOre.className = "prvs-slot-scroll";
                scrollOre.innerHTML = "";
                if (oreFascia.length === 0) {
                    scrollOre.innerHTML = `<div class="prvs-caricamento" style="padding:4px 2px;">Nessun'ora residua in questa fascia.</div>`;
                } else {
                    for (const oraDett of oreFascia) scrollOre.appendChild(creaChipOra(oraDett));
                }
            });
        } else {
            chip.addEventListener("click", () => selezionaConfronto(chip, scroll, fascia.label, arpae, ecmwf, seamless));
        }
        scroll.appendChild(chip);
    }
}

/* ============================================================
   CONFRONTO TRA MODELLI — pannello inline sotto le chip
   selezionate (non più un modal a pagina intera).
   ============================================================ */

/* Formatta un valore per la tabella: "n.d." se il modello manca del
   tutto o se il campo specifico è null/undefined — mai un errore JS
   anche quando un modello (tipicamente ARPAE oltre il 3° giorno) non
   è disponibile per quella voce. */
function formattaValore(modello, campo, unita, arrotonda = false) {
    if (!modello) return "n.d.";
    const v = modello[campo];
    if (v === null || v === undefined) return "n.d.";
    return (arrotonda ? Math.round(v) : v) + unita;
}

/* Direzione vento in testo (Bora/Scirocco/punto cardinale), "n.d." se
   il modello manca o non ha il dato — stessa funzione già usata per
   il campo opzionale "vento" nelle chip. */
function formattaDirezione(modello) {
    if (!modello) return "n.d.";
    const g = modello.direzioneVento;
    if (g === null || g === undefined) return "n.d.";
    return direzioneNome(g) || `${Math.round(g)}°`;
}

/* Cella "Rischio temporale forte": evidenziata in rosso quando è
   proprio QUEL modello a generare l'allarme (weathercode≥95 e
   cape>800 in quell'ora/fascia) — così, se l'allarme in cima alla
   scheda non si vede nei dati del modello prioritario, qui si capisce
   subito quale modello lo sta prevedendo. */
function cellaTemporale(modello) {
    if (!modello) return `<td>n.d.</td>`;
    return modello.temporaleForte
        ? `<td class="prvs-cella-allarme">⚡ Sì</td>`
        : `<td>—</td>`;
}

function mostraConfrontoInline(container, titolo, arpae, ecmwf, seamless, confrontoA, confrontoB) {
    // Colonne dinamiche: se un modello manca del tutto per questa ora/
    // fascia (tipicamente ARPAE oltre le 72h), la sua colonna viene
    // tolta invece di restare piena di "n.d." — l'intestazione (tag
    // sopra la tabella) già diceva "solo 2 modelli", ora lo dice anche
    // la tabella.
    const colonne = [
        { label: "ARPAE", modello: arpae },
        { label: "ECMWF", modello: ecmwf },
        { label: "Seamless", modello: seamless }
    ].filter(c => c.modello);

    const riga = (etichetta, campo, unita, arrotonda = false) => `
        <tr>
            <td>${etichetta}</td>
            ${colonne.map(c => `<td>${formattaValore(c.modello, campo, unita, arrotonda)}</td>`).join("")}
        </tr>
    `;
    const rigaTemporale = `
        <tr>
            <td>Rischio temporale forte</td>
            ${colonne.map(c => cellaTemporale(c.modello)).join("")}
        </tr>
    `;
    const rigaDirezione = `
        <tr>
            <td>Direz. vento</td>
            ${colonne.map(c => `<td>${formattaDirezione(c.modello)}</td>`).join("")}
        </tr>
    `;
    const tagModelli = colonne.map(c => c.label).join(" · ");
    container.innerHTML = `
        <div class="prvs-slot-dettaglio">
            <div class="prvs-slot-dettaglio-head">
                <span class="prvs-slot-dettaglio-title">Confronto — ${titolo}</span>
                <span class="prvs-slot-dettaglio-tag">${tagModelli}</span>
            </div>
            <table class="prvs-table-oraria">
                <thead>
                    <tr>
                        <th>Voce</th>
                        ${colonne.map(c => `<th>${c.label}</th>`).join("")}
                    </tr>
                </thead>
                <tbody>
                    ${riga("Temperatura", "temp", "°")}
                    ${riga("Percepita", "percepita", "°")}
                    ${riga("Umidità", "umidita", "%")}
                    ${riga("Pioggia", "precip", "mm")}
                    ${riga("Vento", "vento", "km/h", true)}
                    ${rigaDirezione}
                    ${riga("Pressione", "pressione", "hPa", true)}
                    ${riga("CIN", "cin", " J/kg")}
                    ${riga("Neve", "neve", "cm")}
                    ${rigaTemporale}
                </tbody>
            </table>
            ${rigaConcordanza(confrontoA, confrontoB)}
        </div>
    `;
}

/* ============================================================
   PANNELLO IMPOSTAZIONI — modello principale + campi opzionali
   ============================================================ */
const modalImpostazioni = document.getElementById("prvs-modal-impostazioni");

const MODELLI_SCELTA = [
    { id: "auto", label: "Automatico (ARPAE → ECMWF → Seamless)" },
    { id: "arpae", label: "ARPAE (locale)" },
    { id: "ecmwf", label: "ECMWF (globale)" },
    { id: "icon", label: "ICON Seamless (DWD)" }
];

function costruisciSceltaModello() {
    const cont = document.getElementById("prvs-scelta-modello");
    cont.innerHTML = MODELLI_SCELTA.map(m => `
        <label class="prvs-opzione-riga">
            <input type="radio" name="prvs-modello" value="${m.id}" ${preferenze.modelloPrincipale === m.id ? "checked" : ""}>
            ${m.label}
        </label>
    `).join("");
}

function costruisciSceltaCampi() {
    const cont = document.getElementById("prvs-scelta-campi");
    cont.innerHTML = CAMPI_OPZIONALI_DISPONIBILI.map(c => `
        <label class="prvs-opzione-riga">
            <input type="checkbox" class="prvs-check-campo" value="${c.id}" ${preferenze.campiOpzionali.includes(c.id) ? "checked" : ""}>
            ${c.icona} ${c.label}
        </label>
    `).join("");
    aggiornaLimiteCampi();
    cont.querySelectorAll(".prvs-check-campo").forEach(chk => {
        chk.addEventListener("change", aggiornaLimiteCampi);
    });
}

// Disabilita le caselle non selezionate quando si raggiunge il limite,
// così l'utente capisce visivamente perché non riesce a spuntarne altre
function aggiornaLimiteCampi() {
    const checks = [...document.querySelectorAll(".prvs-check-campo")];
    const selezionati = checks.filter(c => c.checked).length;
    checks.forEach(c => {
        if (!c.checked) c.disabled = selezionati >= MAX_CAMPI_OPZIONALI;
    });
}

document.getElementById("prvs-btn-impostazioni").addEventListener("click", () => {
    costruisciSceltaModello();
    costruisciSceltaCampi();
    modalImpostazioni.style.display = "flex";
});

document.getElementById("prvs-impostazioni-close").addEventListener("click", () => {
    modalImpostazioni.style.display = "none";
});
modalImpostazioni.onclick = e => { if (e.target === modalImpostazioni) modalImpostazioni.style.display = "none"; };

document.getElementById("prvs-btn-salva-impostazioni").addEventListener("click", () => {
    const modelloScelto = document.querySelector('input[name="prvs-modello"]:checked')?.value || "auto";
    const campiScelti = [...document.querySelectorAll(".prvs-check-campo:checked")].map(c => c.value);
    const modelloCambiato = modelloScelto !== preferenze.modelloPrincipale;

    preferenze = { modelloPrincipale: modelloScelto, campiOpzionali: campiScelti };
    salvaPreferenze(preferenze);
    modalImpostazioni.style.display = "none";

    if (modelloCambiato) {
        PrevisioniData.impostaPreferenzaModello(preferenze.modelloPrincipale);
    }

    // Sia che sia cambiato il modello sia i campi: nessuna nuova chiamata
    // di rete, tutti e 3 i modelli sono già scaricati. Ricalcoliamo solo
    // la sintesi (istantaneo) e ridisegniamo la vista corrente.
    if (previsioniCache) {
        previsioniCache = PrevisioniData.ricalcolaPrevisioni() || previsioniCache;
        renderPagina(previsioniCache);
    }
});

/* ============================================================
   INIT
   ============================================================ */
async function init() {
    caricaSituazioneAttuale();
    PrevisioniData.impostaPreferenzaModello(preferenze.modelloPrincipale);
    try {
        previsioniCache = await PrevisioniData.ottieniPrevisioni();
        renderPagina(previsioniCache);
    } catch (errore) {
        console.error("Errore nel caricamento delle previsioni:", errore);
        document.getElementById("prvs-oggi-scroll").innerHTML =
            `<span class="prvs-caricamento">Errore nel caricamento. Riprova più tardi.</span>`;
    }
}

init();
