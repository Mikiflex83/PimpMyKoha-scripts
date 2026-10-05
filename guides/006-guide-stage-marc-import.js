(function () {
    'use strict';

    const ID = 'stage-marc-import';
    const PATH_STAGE = '/cgi-bin/koha/tools/stage-marc-import.pl';
    const PATH_MANAGE = '/cgi-bin/koha/tools/manage-marc-import.pl';
    const PATH_JOBS = '/cgi-bin/koha/admin/background_jobs.pl';

    let lastJobStatus = null;

    function api() {
        return window.KOHA_GUIDES;
    }

    function qs(selector) {
        try { return document.querySelector(selector); } catch (_) { return null; }
    }

    function visible(el) {
        if (!el) return false;
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    }

    function selectedText(selector, fallback) {
        const el = qs(selector);
        if (!el) return fallback || '—';
        if (el.tagName === 'SELECT') {
            const opt = el.options[el.selectedIndex];
            return opt ? opt.textContent.trim() : (fallback || '—');
        }
        return (el.value || fallback || '—').trim();
    }

    function fileName() {
        const input = qs('#fileToUpload');
        return input && input.files && input.files[0] ? input.files[0].name : '—';
    }

    function currentParseItems() {
        const checked = qs('input[name="parse_items"]:checked');
        if (!checked) return '—';
        return checked.value === '1' ? 'Oui' : 'Non';
    }

    function matcherEnabled() {
        const matcher = qs('#matcher');
        return !!(matcher && matcher.value);
    }

    function itemsEnabled() {
        const recordType = qs('#record_type');
        if (recordType && recordType.value === 'auth') return false;
        const no = qs('#parse_itemsno');
        return !(no && no.checked);
    }

    function stageSummary() {
        const matcher = selectedText('#matcher', 'Ne pas rechercher de correspondance');
        const rows = [
            ['Fichier', fileName()],
            ['Profil', selectedText('#profile', 'Aucun')],
            ['Type', selectedText('#record_type')],
            ['Encodage', selectedText('#encoding')],
            ['Format', selectedText('#format')],
            ['Concordance', matcher],
            ['Sans correspondance', selectedText('#nomatch_action')],
            ['Exemplaires intégrés', currentParseItems()]
        ];
        if (matcherEnabled()) rows.splice(6, 0, ['Avec correspondance', selectedText('#overlay_action')]);
        if (itemsEnabled()) rows.push(['Traitement exemplaires', selectedText('#item_action')]);

        return `
            <p>Relisez les choix qui vont être utilisés pour constituer le lot.</p>
            <div class="kg-summary">
                ${rows.map(r => `<div><b>${api().helpers.esc(r[0])}</b><span>${api().helpers.esc(r[1])}</span></div>`).join('')}
            </div>
            <p class="kg-success"><strong>À ce stade, rien n’est encore importé dans le catalogue.</strong> L’étape suivante place les notices dans le réservoir d’import.</p>`;
    }

    function manageSummary() {
        const batch = getBatchId();
        return `
            <p>Le fichier est maintenant dans le <strong>réservoir</strong>. Vous pouvez contrôler les correspondances avant toute écriture dans le catalogue.</p>
            ${batch ? `<p>Lot en cours : <strong>#${api().helpers.esc(batch)}</strong>.</p>` : ''}
            <p>Regardez particulièrement le statut, le type de correspondance et les différences proposées pour les notices existantes.</p>`;
    }

    function getBatchId() {
        const fromForm = qs('#import_batch_form input[name="import_batch_id"]');
        if (fromForm && fromForm.value) return fromForm.value;
        const params = new URLSearchParams(location.search);
        const fromUrl = params.get('import_batch_id');
        if (fromUrl) return fromUrl;
        const state = api() && api().getPracticeState ? api().getPracticeState() : null;
        return state && state.data ? state.data.batchId : null;
    }

    function isStageInitial() {
        return location.pathname === PATH_STAGE && !!qs('#fileToUpload');
    }

    function isStageJob() {
        return location.pathname === PATH_STAGE && !!qs('#job_callback') && !qs('#fileToUpload');
    }

    function isManageReady() {
        return location.pathname === PATH_MANAGE && !!qs('#import_batch_form');
    }

    function isManageEnqueued() {
        return location.pathname === PATH_MANAGE && !!qs('a.job_details') && !qs('#import_batch_form');
    }

    function isImportedBatch() {
        if (location.pathname !== PATH_MANAGE || !qs('#staged-record-matching-rules')) return false;
        const txt = qs('#staged-record-matching-rules').textContent || '';
        return /Imported|Importé|imported/i.test(txt) && !qs('#import_batch_form');
    }

    function jobId() {
        return new URLSearchParams(location.search).get('id');
    }

    function ensureReturnLink() {
        let box = qs('#kg-return-batch-box');
        if (box) return box;
        const batchId = getBatchId();
        if (!batchId) return null;
        const anchor = qs('#job_details') || qs('main') || qs('#main') || document.body;
        box = document.createElement('div');
        box.id = 'kg-return-batch-box';
        box.className = 'alert alert-info';
        box.style.marginTop = '12px';
        box.innerHTML = `<strong>Guide import MARC :</strong> <a id="kg-return-batch" class="btn btn-default btn-sm" href="${PATH_MANAGE}?import_batch_id=${encodeURIComponent(batchId)}">Revenir au lot #${api().helpers.esc(batchId)}</a>`;
        anchor.insertAdjacentElement('afterend', box);
        return box;
    }

    async function checkImportJob() {
        const id = jobId();
        if (!id) return false;
        const response = await fetch(`/api/v1/jobs/${encodeURIComponent(id)}`, {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) return false;
        const job = await response.json();
        lastJobStatus = job.status || null;
        return ['finished', 'failed', 'cancelled'].includes(lastJobStatus);
    }

    function finalJobMessage() {
        const status = lastJobStatus || (api().getPracticeState()?.data?.jobStatus) || '';
        ensureReturnLink();
        if (status === 'finished') {
            return `<p class="kg-success"><strong>La tâche d’import est terminée.</strong> Revenez maintenant au lot afin de vérifier son état final.</p>`;
        }
        return `<p class="kg-danger"><strong>La tâche s’est terminée avec l’état « ${api().helpers.esc(status || 'inconnu')} ».</strong> Revenez au lot pour contrôler le résultat et les éventuels messages d’erreur.</p>`;
    }

    function classicSteps() {
        if (isStageInitial()) {
            return [
                {
                    element: '#uploadform',
                    title: 'Importer des notices MARC',
                    intro: 'Cette page sert d’abord à envoyer un fichier, puis à définir les règles qui seront utilisées pour le mettre en réservoir.'
                },
                {
                    element: '#fileToUpload',
                    title: 'Fichier MARC',
                    intro: 'Choisissez le fichier MARC ou MARCXML à traiter. Koha n’écrit encore rien dans le catalogue à cette étape.'
                },
                {
                    element: '#fileuploadbutton',
                    title: 'Téléverser le fichier',
                    intro: 'Koha envoie le fichier temporairement. Une fois l’envoi terminé, la partie réglages apparaît.'
                },
                {
                    element: '#profile_fieldset',
                    title: 'Profil',
                    intro: 'Un profil peut préremplir les paramètres. Les valeurs affichées dans le formulaire restent celles qui seront réellement utilisées.',
                    optional: true
                },
                {
                    element: '#record_type',
                    title: 'Type de notices',
                    intro: 'Bibliographiques ou autorités : ce choix conditionne notamment la gestion des exemplaires.'
                },
                {
                    element: '#encoding',
                    title: 'Encodage',
                    intro: 'UTF-8 est le choix courant. Conservez l’encodage correspondant réellement au fichier source.'
                },
                {
                    element: '#matcher',
                    title: 'Règle de concordance',
                    intro: 'Cette règle détermine comment Koha recherche une notice existante avant l’import.'
                },
                {
                    element: '#items',
                    title: 'Exemplaires',
                    intro: 'Pour les notices bibliographiques, indiquez si Koha doit rechercher et traiter les données d’exemplaires intégrées au fichier.',
                    optional: true
                },
                {
                    element: '#mainformsubmit',
                    title: 'Mise en réservoir',
                    intro: 'Ce bouton lance la préparation du lot. Le véritable import dans le catalogue se fera ensuite depuis la gestion du lot.'
                }
            ];
        }

        if (isStageJob()) {
            return [
                {
                    element: '.alert.alert-info',
                    title: 'Analyse en cours',
                    intro: 'Koha traite le fichier en tâche de fond. À la fin, un lien vers le lot apparaît.'
                },
                {
                    element: '#job_callback',
                    title: 'Accéder au lot',
                    intro: 'Lorsque le traitement est terminé, utilisez le lien affiché ici pour contrôler le lot avant import.'
                }
            ];
        }

        if (location.pathname === PATH_MANAGE) {
            return [
                {
                    element: '#staged-record-matching-rules',
                    title: 'Paramètres du lot',
                    intro: 'Cette zone récapitule le fichier, son statut et les règles de concordance appliquées.',
                    optional: true
                },
                {
                    element: '#records-table',
                    title: 'Notices du lot',
                    intro: 'Contrôlez ici les correspondances et, si nécessaire, les différences entre notices avant import.',
                    optional: true
                },
                {
                    element: '#import_batch_form',
                    title: 'Import dans le catalogue',
                    intro: 'Cette action constitue l’écriture réelle dans le catalogue. Vérifiez le lot avant de la lancer.',
                    optional: true
                }
            ];
        }

        return [];
    }

    const definition = {
        id: ID,
        title: 'Import de notices MARC',
        priority: 120,
        match: () => location.pathname === PATH_STAGE || location.pathname === PATH_MANAGE,
        steps: classicSteps,
        options: {
            tooltipClass: 'custom-tooltip',
            highlightClass: 'custom-highlight',
            exitOnOverlayClick: false,
            disableInteraction: false
        },
        practice: {
            expiresMs: 2 * 60 * 60 * 1000,
            initialPhase: 'stage-upload',
            phases: [
                {
                    id: 'stage-upload',
                    match: isStageInitial,
                    steps: [
                        {
                            id: 'welcome',
                            element: '#uploadform',
                            title: 'Import MARC — parcours pratique',
                            intro: '<p>Vous allez réaliser un véritable import accompagné, étape par étape.</p><p>Le guide <strong>n’effectue aucune action à votre place</strong> : il observe vos choix et attend que Koha confirme chaque opération.</p>'
                        },
                        {
                            id: 'file',
                            element: '#fileToUpload',
                            title: '1 — Choisissez le fichier',
                            intro: '<p>Sélectionnez le fichier à mettre en réservoir.</p>',
                            wait: {
                                type: 'event',
                                event: 'change',
                                target: '#fileToUpload',
                                acceptCurrent: true,
                                acceptCurrentLabel: 'Utiliser le fichier déjà sélectionné',
                                check: (_e, el) => !!(el && el.files && el.files.length),
                                status: 'En attente de la sélection d’un fichier…',
                                successMessage: '✓ Fichier sélectionné'
                            }
                        },
                        {
                            id: 'upload',
                            element: '#fileuploadbutton',
                            title: '2 — Envoyez le fichier à Koha',
                            intro: '<p>Cliquez sur <strong>Télécharger le fichier</strong>. Le guide attendra la confirmation réelle de Koha avant de continuer.</p>',
                            skipIf: () => !!(qs('#uploadedfileid')?.value && visible(qs('#processfile'))),
                            wait: {
                                type: 'event',
                                event: 'click',
                                target: '#fileuploadbutton',
                                capture: true,
                                status: 'Cliquez sur le bouton de téléversement.',
                                waitingMessage: 'Téléversement en cours…',
                                waitFor: () => !!(qs('#uploadedfileid')?.value && visible(qs('#processfile'))),
                                failure: () => {
                                    const box = qs('#fileuploadfailed');
                                    return box && visible(box) && box.textContent.trim() ? box.textContent.trim() : false;
                                },
                                interval: 350,
                                timeout: 120000,
                                successMessage: '✓ Fichier reçu par Koha'
                            }
                        },
                        {
                            id: 'profile',
                            element: '#profile_fieldset',
                            title: '3 — Profil d’import',
                            intro: '<p>Sélectionnez votre profil si cette source en utilise un. Sinon, conservez <strong>Ne pas utiliser de profil</strong>.</p>',
                            wait: {
                                type: 'event',
                                event: 'change',
                                target: '#profile',
                                acceptCurrent: true,
                                status: 'Choisissez un profil ou conservez le choix actuel.',
                                successMessage: '✓ Profil validé'
                            }
                        },
                        {
                            id: 'record-type',
                            element: '#record_type',
                            title: '4 — Type de notices',
                            intro: '<p>Vérifiez s’il s’agit de notices <strong>bibliographiques</strong> ou d’<strong>autorités</strong>.</p>',
                            wait: {
                                type: 'event', event: 'change', target: '#record_type', acceptCurrent: true,
                                status: 'Modifiez le type si nécessaire.', successMessage: '✓ Type validé'
                            }
                        },
                        {
                            id: 'encoding',
                            element: '#encoding',
                            title: '5 — Encodage',
                            intro: '<p>Vérifiez l’encodage du fichier. UTF-8 est sélectionné par défaut.</p>',
                            wait: {
                                type: 'event', event: 'change', target: '#encoding', acceptCurrent: true,
                                status: 'Modifiez l’encodage si nécessaire.', successMessage: '✓ Encodage validé'
                            }
                        },
                        {
                            id: 'format',
                            element: '#format',
                            title: '6 — Format',
                            intro: '<p>Vérifiez MARC ou MARCXML. Koha sélectionne automatiquement MARCXML lorsqu’un fichier .xml vient d’être envoyé.</p>',
                            wait: {
                                type: 'event', event: 'change', target: '#format', acceptCurrent: true,
                                status: 'Modifiez le format si nécessaire.', successMessage: '✓ Format validé'
                            }
                        },
                        {
                            id: 'matcher',
                            element: '#matcher',
                            title: '7 — Concordance',
                            intro: '<p>Choisissez la règle permettant à Koha de rechercher une notice existante. Vous pouvez aussi décider de ne pas rechercher de correspondance.</p>',
                            wait: {
                                type: 'event', event: 'change', target: '#matcher', acceptCurrent: true,
                                status: 'Choisissez la règle adaptée ou conservez le choix actuel.', successMessage: '✓ Concordance validée'
                            }
                        },
                        {
                            id: 'overlay',
                            element: '#overlay_action',
                            title: '8 — Si une correspondance existe',
                            intro: '<p>Déterminez ce que Koha doit faire lorsqu’une notice correspondante est trouvée.</p>',
                            skipIf: () => !matcherEnabled(),
                            wait: {
                                type: 'event', event: 'change', target: '#overlay_action', acceptCurrent: true,
                                status: 'Vérifiez l’action appliquée aux correspondances.', successMessage: '✓ Action sur correspondance validée'
                            }
                        },
                        {
                            id: 'nomatch',
                            element: '#nomatch_action',
                            title: '9 — Si aucune correspondance',
                            intro: '<p>Déterminez ce que Koha doit faire lorsque la notice entrante ne correspond à aucune notice du catalogue.</p>',
                            wait: {
                                type: 'event', event: 'change', target: '#nomatch_action', acceptCurrent: true,
                                status: 'Vérifiez l’action en absence de correspondance.', successMessage: '✓ Action sans correspondance validée'
                            }
                        },
                        {
                            id: 'parse-items',
                            element: '#items',
                            title: '10 — Données d’exemplaires',
                            intro: '<p>Pour les notices bibliographiques, indiquez si Koha doit rechercher des données d’exemplaires intégrées dans le fichier.</p>',
                            skipIf: () => qs('#record_type')?.value === 'auth',
                            wait: {
                                type: 'event',
                                event: 'change',
                                target: 'input[name="parse_items"]',
                                acceptCurrent: true,
                                check: () => !!qs('input[name="parse_items"]:checked'),
                                status: 'Choisissez Oui/Non ou conservez le choix actuel.',
                                successMessage: '✓ Recherche d’exemplaires validée'
                            }
                        },
                        {
                            id: 'item-action',
                            element: '#item_action',
                            title: '11 — Traitement des exemplaires',
                            intro: '<p>Choisissez la façon dont les exemplaires intégrés doivent être traités.</p>',
                            skipIf: () => !itemsEnabled() || !qs('#item_action'),
                            wait: {
                                type: 'event', event: 'change', target: '#item_action', acceptCurrent: true,
                                status: 'Vérifiez le traitement des exemplaires.', successMessage: '✓ Traitement des exemplaires validé'
                            }
                        },
                        {
                            id: 'summary',
                            element: '#processfile',
                            title: '12 — Contrôle avant mise en réservoir',
                            intro: stageSummary,
                            nextLabel: 'Les réglages sont corrects'
                        },
                        {
                            id: 'stage',
                            element: '#mainformsubmit',
                            title: '13 — Mettre en réservoir',
                            intro: '<p>Cliquez vous-même sur <strong>Mettre en réservoir / Stage for import</strong>.</p><p>Le guide reprendra automatiquement lorsque Koha aura ouvert l’écran de suivi.</p>',
                            wait: {
                                type: 'event', event: 'click', target: '#mainformsubmit', capture: true,
                                navigate: true, nextPhase: 'stage-job',
                                status: 'En attente de votre clic sur le bouton de mise en réservoir.'
                            }
                        }
                    ]
                },
                {
                    id: 'stage-job',
                    match: isStageJob,
                    steps: [
                        {
                            id: 'wait-stage-job',
                            element: '.alert.alert-info',
                            title: '14 — Koha analyse le fichier',
                            intro: '<p>La tâche de fond prépare le lot et applique les règles de concordance. Aucune action n’est nécessaire pour l’instant.</p>',
                            wait: {
                                type: 'condition',
                                status: 'Analyse en cours…',
                                waitFor: () => !!qs('#job_callback a[href*="manage-marc-import.pl?import_batch_id="]'),
                                interval: 700,
                                timeout: 300000,
                                successMessage: '✓ Lot préparé'
                            }
                        },
                        {
                            id: 'open-batch',
                            element: () => qs('#job_callback a[href*="manage-marc-import.pl?import_batch_id="]'),
                            title: '15 — Ouvrir le lot',
                            intro: '<p>Koha a terminé la mise en réservoir. Cliquez sur <strong>Voir le lot</strong>.</p>',
                            wait: {
                                type: 'event',
                                event: 'click',
                                target: '#job_callback a[href*="manage-marc-import.pl?import_batch_id="]',
                                capture: true,
                                navigate: true,
                                nextPhase: 'manage-batch',
                                onEvent: (_e, el) => {
                                    const url = new URL(el.href, location.href);
                                    return { batchId: url.searchParams.get('import_batch_id') };
                                },
                                status: 'Cliquez sur le lien vers le lot.'
                            }
                        }
                    ]
                },
                {
                    id: 'manage-batch',
                    match: isManageReady,
                    steps: [
                        {
                            id: 'batch-overview',
                            element: '#staged-record-matching-rules',
                            title: '16 — Contrôler le lot',
                            intro: manageSummary,
                            nextLabel: 'J’ai compris'
                        },
                        {
                            id: 'records',
                            element: '#records-table',
                            title: '17 — Contrôler les correspondances',
                            intro: '<p>Cette table donne le statut de chaque notice, le type de correspondance et les éventuelles différences.</p><p>Avant un import important, contrôlez quelques lignes significatives et les correspondances qui vous paraissent sensibles.</p>',
                            optional: true,
                            nextLabel: 'Contrôle effectué'
                        },
                        {
                            id: 'framework-new',
                            element: '#frameworks',
                            title: '18 — Grille des nouvelles notices',
                            intro: '<p>Vérifiez la grille MARC qui sera affectée aux nouvelles notices.</p>',
                            skipIf: () => !qs('#frameworks'),
                            wait: {
                                type: 'event', event: 'change', target: '#frameworks', acceptCurrent: true,
                                status: 'Modifiez la grille si nécessaire.', successMessage: '✓ Grille des nouvelles notices validée'
                            }
                        },
                        {
                            id: 'framework-overlay',
                            element: '#overlay_frameworks',
                            title: '19 — Grille des notices remplacées',
                            intro: '<p>Vérifiez la grille utilisée lorsqu’une notice existante est remplacée. « Conserver la grille d’origine » est souvent le choix le plus prudent.</p>',
                            skipIf: () => !qs('#overlay_frameworks'),
                            wait: {
                                type: 'event', event: 'change', target: '#overlay_frameworks', acceptCurrent: true,
                                status: 'Modifiez la grille si nécessaire.', successMessage: '✓ Grille de remplacement validée'
                            }
                        },
                        {
                            id: 'commit',
                            element: '#import_batch_form input[name="mainformsubmit"]',
                            title: '20 — Import réel dans le catalogue',
                            intro: '<div class="kg-danger"><strong>Attention :</strong> cette fois, l’action va réellement créer ou modifier des notices du catalogue selon les règles du lot.</div><p>Si vos contrôles sont terminés, cliquez vous-même sur <strong>Importer ce lot dans le catalogue</strong>.</p>',
                            wait: {
                                type: 'event',
                                event: 'click',
                                target: '#import_batch_form input[name="mainformsubmit"]',
                                capture: true,
                                navigate: true,
                                nextPhase: 'import-enqueued',
                                onEvent: () => ({ batchId: getBatchId() }),
                                status: 'En attente de votre validation de l’import.'
                            }
                        }
                    ]
                },
                {
                    id: 'import-enqueued',
                    match: isManageEnqueued,
                    steps: [
                        {
                            id: 'import-enqueued-info',
                            element: '.alert.alert-info',
                            title: '21 — Import lancé',
                            intro: '<p>Koha a placé l’import dans sa file de tâches. Cette page va ouvrir automatiquement le détail de la tâche.</p>',
                            wait: {
                                type: 'condition',
                                status: 'Redirection vers la tâche de fond…',
                                waitFor: () => false,
                                interval: 1000,
                                timeout: 0
                            }
                        }
                    ]
                },
                {
                    id: 'import-job',
                    match: () => location.pathname === PATH_JOBS && new URLSearchParams(location.search).get('op') === 'view' && !!jobId(),
                    steps: [
                        {
                            id: 'wait-import-job',
                            element: '#job_details',
                            title: '22 — Import en cours',
                            intro: '<p>Le guide suit uniquement cette tâche d’import. Il interroge son état de manière séquentielle, sans lancer d’autres appels en parallèle.</p>',
                            wait: {
                                type: 'condition',
                                status: 'Import en cours…',
                                waitFor: checkImportJob,
                                onComplete: () => ({ jobStatus: lastJobStatus }),
                                interval: 4000,
                                timeout: 600000,
                                timeoutMessage: 'L’import dure plus longtemps que prévu. Le guide reste actif ; vous pouvez conserver cette page ouverte.',
                                successMessage: '✓ Tâche terminée'
                            }
                        },
                        {
                            id: 'return-batch',
                            element: ensureReturnLink,
                            title: '23 — Revenir au lot',
                            intro: finalJobMessage,
                            wait: {
                                type: 'event',
                                event: 'click',
                                target: '#kg-return-batch',
                                capture: true,
                                navigate: true,
                                nextPhase: 'final',
                                status: 'Cliquez sur « Revenir au lot ».'
                            }
                        }
                    ]
                },
                {
                    id: 'final',
                    match: isImportedBatch,
                    completeOnFinish: true,
                    steps: [
                        {
                            id: 'done',
                            element: '#staged-record-matching-rules',
                            title: '24 — Import terminé',
                            intro: '<div class="kg-success"><strong>Le lot est maintenant indiqué comme importé.</strong></div><p>Vous pouvez contrôler le tableau des notices pour vérifier les statuts individuels et ouvrir quelques notices du catalogue si nécessaire.</p><p>Le parcours pratique est terminé.</p>',
                            doneLabel: 'Terminer le guide',
                            completePractice: true
                        }
                    ]
                }
            ]
        }
    };

    function registerWhenReady() {
        if (window.KOHA_GUIDES && typeof window.KOHA_GUIDES.register === 'function') {
            window.KOHA_GUIDES.register(definition);
            return;
        }
        setTimeout(registerWhenReady, 100);
    }

    registerWhenReady();
})();
