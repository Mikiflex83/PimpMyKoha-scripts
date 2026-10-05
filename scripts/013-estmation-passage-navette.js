/*
 Nom du fichier: 013-estmation-passage-navette.js
 Dépendances: aucune
 Date de dernière modification: 2026-02-21
 Auteur: Michael Mundet
 Description: Estime le prochain passage de la navette pour les exemplaires selon le site et ajoute une colonne 'Prochain passage navette'.
*/

(function(){
    document.addEventListener('DOMContentLoaded', function(){
        (function(){})('013-estmation-passage-navette: loaded');

if (window.location.pathname.includes("moremember.pl") || window.location.pathname.includes("circulation.pl")) {
    // schedule can be overridden by window.NAVETTE_SCHEDULE (object)
    const DEFAULT_JOURS_PASSAGE = {
        "Mardi": {
            "Matin": ["DRAGUIGNAN", "FIGANIERES", "BARGEMON", "CALLAS", "LA MOTTE", "DRAGUIGNAN"],
            "Après-midi": ["DRAGUIGNAN", "LE MUY", "VIDAUBAN", "LORGUES", "SALERNES", "FLAYOSC", "DRAGUIGNAN"]
        },
        "Mercredi": {
            "Matin": ["DRAGUIGNAN", "AMPUS", "MONTFERRAT", "COMPS-SUR-ARTUBY", "CLAVIERS", "DRAGUIGNAN"]
        },
        "Vendredi": {
            "Matin": ["DRAGUIGNAN", "LE MUY", "VIDAUBAN", "LORGUES", "SALERNES", "FLAYOSC", "DRAGUIGNAN"],
            "Après-midi": ["DRAGUIGNAN", "FIGANIERES", "BARGEMON", "CALLAS", "LA MOTTE", "DRAGUIGNAN"]
        }
    };

    const JOURS_PASSAGE = window.NAVETTE_SCHEDULE || DEFAULT_JOURS_PASSAGE;

    // return {date: Date, jour: 'Mardi', periode: 'Matin'} or null
    function calculerProchaineDateNavette(site) {
        if (!site) return null;
        site = site.trim().toUpperCase();
        const now = new Date();

        // skip week 52 by ISO week
        const semaineActuelle = getISOWeekNumber(now);
        if (semaineActuelle === 52) return null;

        // find matching jour & periode
        let matchJour = null;
        let matchPeriode = null;
        for (const jour in JOURS_PASSAGE) {
            for (const periode in JOURS_PASSAGE[jour]) {
                const arr = JOURS_PASSAGE[jour][periode].map(s => s.toUpperCase());
                if (arr.includes(site)) {
                    matchJour = jour;
                    matchPeriode = periode;
                    break;
                }
            }
            if (matchJour) break;
        }
        if (!matchJour) return null;

        // compute next date for the weekday of matchJour
        const targetWeekday = getJourSemaine(matchJour); // 0..6
        let candidate = new Date(now.getTime());

        // if today is before target weekday, move forward; if same day, consider period and hour
        const todayWeekday = candidate.getDay();
        if (todayWeekday !== targetWeekday) {
            // advance day by day until match
            let daysToAdd = (targetWeekday - todayWeekday + 7) % 7;
            if (daysToAdd === 0) daysToAdd = 7;
            candidate.setDate(candidate.getDate() + daysToAdd);
        } else {
            // same weekday: check period cutoff
            const hour = candidate.getHours();
            if (matchPeriode === 'Matin' && hour >= 12) {
                candidate.setDate(candidate.getDate() + 7);
            } else if (matchPeriode === 'Après-midi' && hour >= 18) {
                candidate.setDate(candidate.getDate() + 7);
            }
        }

        // if candidate is Thursday (4), skip to next day (business rule preserved)
        if (candidate.getDay() === 4) candidate.setDate(candidate.getDate() + 1);

        return { date: candidate, jour: matchJour, periode: matchPeriode };
    }

    // Fonction pour obtenir l'indice du jour de la semaine (0 = Dimanche, 1 = Lundi, ..., 6 = Samedi)
    function getJourSemaine(jour) {
        const joursSemaine = {
            "dimanche": 0,
            "lundi": 1,
            "mardi": 2,
            "mercredi": 3,
            "jeudi": 4,
            "vendredi": 5,
            "samedi": 6
        };
        return joursSemaine[(jour || '').toLowerCase()] || 0;
    }

    // Fonction pour obtenir la semaine de l'année
    // ISO week number
    function getISOWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        // Set to nearest Thursday: current date + 4 - current day number
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
        return weekNo;
    }

    // Fonction pour calculer le nombre de jours entre aujourd'hui et la date donnée
    // days difference using UTC day boundaries
    function dateOnlyUTC(d) {
        return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    }
    function calculerNombreDeJours(dateArrivee) {
        if (!(dateArrivee instanceof Date) || isNaN(dateArrivee)) return NaN;
        const aujourd = new Date();
        const diff = dateOnlyUTC(dateArrivee) - dateOnlyUTC(aujourd);
        return Math.ceil(diff / (1000 * 3600 * 24));
    }

    // Fonction pour ajouter l'en-tête de la colonne et la colonne avec la prochaine date de navette
    function detectColumnIndices() {
        const headerRow = document.querySelector('#holds-table thead tr');
        const headers = headerRow ? Array.from(headerRow.querySelectorAll('th')).map(th => (th.textContent || '').trim().toLowerCase()) : [];
        const idx = nameFragments => {
            for (let i = 0; i < headers.length; i++) {
                const h = headers[i];
                if (!h) continue;
                for (const frag of nameFragments) {
                    if (h.includes(frag)) return i;
                }
            }
            return -1;
        };
        return {
            borrowed: idx(['emprunt', 'emprunté']) >= 0 ? idx(['emprunt', 'emprunté']) : 8,
            site: idx(['site', 'localisation', 'location', 'info', 'emprunté à']) >= 0 ? idx(['site', 'localisation', 'location', 'info', 'emprunté à']) : 5,
            status: idx(['statut', 'status', 'etat', 'état', 'prêté', 'state']) >= 0 ? idx(['statut', 'status', 'etat', 'état', 'prêté', 'state']) : 10
        };
    }

    function ajouterColonneDateNavette() {
        const table = document.querySelector('#holds-table');
        if (!table) return;
        const enTete = table.querySelector('thead tr');
        if (enTete && !enTete.querySelector('th.prochaine-date-navette')) {
            const nouvelleCellule = document.createElement('th');
            nouvelleCellule.classList.add('prochaine-date-navette');
            nouvelleCellule.textContent = 'Prochain passage navette';
            nouvelleCell.style.textAlign = 'center';
            nouvelleCell.style.backgroundColor = 'white';
            nouvelleCell.style.fontWeight = 'bold';
            nouvelleCell.style.border = '1px solid #ddd';
            enTete.appendChild(nouvelleCellule);
        }

        const cols = detectColumnIndices();
        const lignes = table.querySelectorAll('tbody tr');
        lignes.forEach((ligne) => {
            if (ligne.dataset.navetteAdded === 'true') return; // idempotence per row

            const celluleStatut = ligne.cells[cols.status];
            const celluleSite = ligne.cells[cols.site];

            if (!celluleStatut || !celluleSite) {
                ligne.dataset.navetteAdded = 'true';
                return;
            }

            const statutText = (celluleStatut.textContent || '').trim().toLowerCase();
            if (!statutText || statutText.includes('exemplaire en attente') || statutText.includes('en attente')) {
                ligne.dataset.navetteAdded = 'true';
                return;
            }

            // create cell only if not already present
            const nouvelleCellule = document.createElement('td');
            nouvelleCellule.style.textAlign = 'center';
            nouvelleCellule.style.padding = '8px';

            const site = (celluleSite.textContent || '').trim();
            const info = calculerProchaineDateNavette(site);
            if (!info || !info.date) {
                nouvelleCellule.innerHTML = "Date d'arrivée estimée : <br/>N/A";
            } else {
                const nombreDeJours = calculerNombreDeJours(info.date);
                const prefixe = "Date d'arrivée estimée : <br/>";
                const peri = info.periode ? ` (${info.periode})` : '';
                const suffixe = Number.isFinite(nombreDeJours) ? `dans ${nombreDeJours} jours` : '';
                nouvelleCellule.innerHTML = `${prefixe}${info.date.toLocaleDateString('fr-FR')}${peri} <br/>${suffixe}`;
                nouvelleCellule.title = `Jour: ${info.jour}${peri} — ${info.date.toLocaleString('fr-FR')}`;
            }

            ligne.appendChild(nouvelleCellule);
            ligne.dataset.navetteAdded = 'true';
        });
    }

    // Remplacer le timer par une attente non‑bloquante de l'apparition des lignes du tableau
    function waitForSelector(selector, timeout = 3000) {
        return new Promise((resolve, reject) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);
            const obs = new MutationObserver(() => {
                const found = document.querySelector(selector);
                if (found) { obs.disconnect(); resolve(found); }
            });
            obs.observe(document.documentElement, { childList: true, subtree: true });
            setTimeout(() => { obs.disconnect(); reject(new Error('timeout')); }, timeout);
        });
    }

    const holdsTab = document.getElementById('holds-tab');
    function observeHoldsTable() {
        const tableBody = document.querySelector('#holds-table tbody');
        if (!tableBody) return;
        // run once immediately
        ajouterColonneDateNavette();
        // create a scoped MutationObserver to watch for changes inside the tbody
        const mo = new MutationObserver(() => {
            // when rows change, try to add column data for new rows
            ajouterColonneDateNavette();
        });
        mo.observe(tableBody, { childList: true, subtree: true });
        // store observer to disconnect later if needed
        tableBody._navetteObserver = mo;
    }

    if (holdsTab) {
        holdsTab.addEventListener('click', function () {
            // wait for the specific table rows
            waitForSelector('#holds-table tbody tr', 2000)
              .then(() => observeHoldsTable())
              .catch(() => requestAnimationFrame(() => observeHoldsTable()));
        });
    } else {
        // if no tab (page rendered directly), try to observe immediately
        waitForSelector('#holds-table tbody tr', 2000).then(() => observeHoldsTable()).catch(()=>{});
    }
}
  });
})();