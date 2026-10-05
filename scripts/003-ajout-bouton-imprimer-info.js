/*
 Nom du fichier: 003-ajout-bouton-imprimer-info.js
 Dépendances: aucune
 Date de dernière modification: 2026-06-19
 Auteur: Michael Mundet
 Description: Ajoute une option permettant d'imprimer les informations d'un adhérent directement dans le menu déroulant "Imprimer" de la fiche membre via délégation d'événement au clic.
*/

(function(){
    document.addEventListener('DOMContentLoaded', function(){

        if (window.location.pathname.includes("moremember.pl") || window.location.pathname.includes("circulation.pl")) {

            // Attendre proprement la présence de la zone patroninfo plutôt que d'utiliser setTimeout
            function waitForSelector(selector, options) {
                options = options || {};
                const timeout = options.timeout;
                const signal = options.signal;
                return new Promise((resolve, reject) => {
                    const el = document.querySelector(selector);
                    if (el) return resolve(el);
                    const obs = new MutationObserver(() => {
                        const found = document.querySelector(selector);
                        if (found) { obs.disconnect(); cleanup(); resolve(found); }
                    });
                    obs.observe(document.documentElement, { childList: true, subtree: true });

                    let timeoutId;
                    const cleanup = () => {
                        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
                        if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort);
                    };

                    const onAbort = () => { obs.disconnect(); cleanup(); reject(new DOMException('Aborted','AbortError')); };

                    if (timeout) {
                        timeoutId = setTimeout(() => { obs.disconnect(); cleanup(); reject(new Error('timeout')); }, timeout);
                    }

                    if (signal) {
                        if (signal.aborted) return onAbort();
                        signal.addEventListener('abort', onAbort);
                    }
                });
            }

            // Attente de la présence de la fiche de l'adhérent pour extraire les données
            waitForSelector('.patroninfo h5').then(() => {

                // ---- Extraction des données (Variables globales à la fermeture) ----
                let name = 'Non disponible';
                let cardNumbers = '';
                const nameElement = document.querySelector('.patroninfo h5');
                
                if (nameElement) {
                    const fullText = nameElement.textContent.trim();
                    const numbersMatch = fullText.match(/\(([^)]+)\)/);
                    if (numbersMatch && numbersMatch[1]) { cardNumbers = numbersMatch[1]; }
                    name = fullText.replace(/\(.*?\)/g, '').trim();
                }

                const phoneElement = document.querySelector('li a[href^="tel:"]');
                const phone = phoneElement ? phoneElement.textContent.trim() : 'Non disponible';

                const emailElement = document.querySelector('li.email a[href^="mailto:"]');
                const email = emailElement ? emailElement.textContent.trim() : 'Non disponible';

                const birthdateElement = Array.from(document.querySelectorAll('li')).find(el => el.querySelector('span.label') && el.querySelector('span.label').textContent.includes("Date de naissance"));
                const birthdate = birthdateElement ? birthdateElement.textContent.replace('Date de naissance :', '').trim() : 'Non disponible';

                const genderElement = Array.from(document.querySelectorAll('li')).find(el => el.querySelector('span.label') && el.querySelector('span.label').textContent.includes("Genre"));
                const gender = genderElement ? genderElement.textContent.replace('Genre :', '').trim() : 'Non disponible';

                const guarantorsList = Array.from(document.querySelectorAll('#patron-information li ul li')).map(el => el.textContent.trim()).filter(Boolean);

                const suspensionMessages = [];
                document.querySelectorAll('#patron_messages .blocker').forEach(msg => { suspensionMessages.push(msg.innerText.trim()); });

                const messageElements = [];
                document.querySelectorAll('#patron_messages li').forEach(item => {
                    const title = item.querySelector('span.circ-hlt') ? item.querySelector('span.circ-hlt').innerText.trim() : '';
                    const details = item.childNodes[2] ? item.childNodes[2].textContent.trim() : '';
                    messageElements.push(`${title} ${details}`);
                });

                // ---- Logique d'injection dynamique au clic ----
                // On écoute TOUS les clics sur la page. Si on clique sur le bouton "Imprimer" (ou un de ses enfants)
                document.addEventListener('click', function(event) {
                    const printButton = event.target.closest('.btn-group button.dropdown-toggle');
                    
                    // Si on a cliqué sur le bouton "Imprimer"
                    if (printButton) {
                        // On cherche le menu dropdown associé à ce bouton spécifique
                        const printMenu = printButton.closest('.btn-group').querySelector('ul.dropdown-menu');
                        
                        if (printMenu && !document.getElementById('infoButton')) {
                            const listItem = document.createElement('li');
                            const button = document.createElement('a');
                            
                            button.id = 'infoButton';
                            button.className = 'dropdown-item'; 
                            button.href = '#';
                            button.setAttribute('role', 'button');
                            button.setAttribute('aria-label', 'Imprimer les informations de l\'adhérent');
                            button.textContent = 'Imprimer les informations';

                            // Action d'impression
                            button.addEventListener('click', function (e) {
                                e.preventDefault();
                                e.stopPropagation(); // Évite de fermer le menu trop abruptement avant action
                                
                                const printWindow = window.open('', '', 'height=800,width=600');
                                if (!printWindow) return;
                                
                                printWindow.document.open();
                                printWindow.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Impression des informations</title></head><body></body></html>');
                                
                                const doc = printWindow.document;
                                const ps = doc.createElement('style');
                                ps.textContent = 'body{font-family:Arial,Helvetica,sans-serif;padding:16px;color:#111} h1{font-size:1.2em;margin-bottom:8px} p{margin:6px 0}';
                                doc.head.appendChild(ps);
                                
                                const container = doc.createElement('div');
                                const h1 = doc.createElement('h1'); h1.textContent = name || 'Non disponible'; container.appendChild(h1);
                                
                                const addRow = (label, value) => { const p = doc.createElement('p'); const strong = doc.createElement('strong'); strong.textContent = label + ': '; p.appendChild(strong); p.appendChild(doc.createTextNode(value || 'Non disponible')); container.appendChild(p); };
                                
                                addRow('Numéros de carte', cardNumbers);
                                addRow('Téléphone', phone);
                                addRow('Email', email);
                                addRow('Date de naissance', birthdate);
                                addRow('Genre', gender);
                                addRow('Garants', guarantorsList.length ? guarantorsList.join(', ') : 'Non disponible');

                                if (suspensionMessages.length) {
                                    const p = doc.createElement('p'); const strong = doc.createElement('strong'); strong.textContent = 'Messages de suspension:'; p.appendChild(strong); suspensionMessages.forEach(m => { const div = doc.createElement('div'); div.textContent = m; p.appendChild(div); }); container.appendChild(p);
                                }
                                if (messageElements.length) {
                                    const p = doc.createElement('p'); const strong = doc.createElement('strong'); strong.textContent = 'Messages:'; p.appendChild(strong); messageElements.forEach(m => { const div = doc.createElement('div'); div.textContent = m; p.appendChild(div); }); container.appendChild(p);
                                }

                                doc.body.appendChild(container);
                                doc.body.offsetHeight;
                                doc.close();
                                
                                printWindow.focus();
                                printWindow.print();
                            });

                            listItem.appendChild(button);
                            printMenu.appendChild(listItem);
                        }
                    }
                });

            }).catch(() => {});
        }
    });
})();