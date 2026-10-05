/*
 Nom du fichier : 066-067-lists-manager.js
 Koha : 25.11+
 Version : v10.5 - sans compte Firebase + moteur transverse couvertures PMK + sans barre basse

 Objectif :
 - autant de listes nommées que souhaité par utilisateur ;
 - type strict : notices OU exemplaires ;
 - synchronisation multi-postes / multi-navigateurs via Cloud Firestore ;
 - identification légère par nom choisi dans Koha, sans compte ni mot de passe ;
 - toutes les listes d'un agent sont liées à ce nom et synchronisées via Firestore ;
 - conservation des intégrations search.pl + detail.pl + cartes KXRI ;
 - migration automatique des anciennes listes locales sidebarItems / items ;
 - sélection multiple avec copie ou déplacement entre listes du même type ;
 - destination visible dans le bouton d’ajout ;
 - petite flèche intégrée pour changer rapidement la liste active ;
 - annuaire Firestore des utilisateurs pour éviter les doublons de saisie ;
 - interface recentrée sur le contenu des listes ;
 - annulation pendant quelques secondes après un ajout ;
 - ajout direct par biblionumber, code-barres ou itemnumber ;
 - enrichissement automatique des ajouts directs (titre, lien, couverture quand possible) ;
 - couvertures des listes enrichies via window.PMKCoverResolver (moteur commun avec le module 142) ;
 - 50 listes maximum par utilisateur ;
 - 250 éléments maximum par liste ;
 - prévisualisation contrôlée des imports/collages avec choix ajouter/remplacer ;
 - rapport détaillé des éléments non ajoutés avec copie/export.
*/

(() => {
    'use strict';

    if (window.__KX_TEMP_LISTS_MANAGER__) return;
    window.__KX_TEMP_LISTS_MANAGER__ = true;

    const CONFIG = {
        searchPath: '/cgi-bin/koha/catalogue/search.pl',
        detailPath: '/cgi-bin/koha/catalogue/detail.pl',
        firebaseSdkVersion: '12.18.0',
        limits: {
            listsPerUser: 50,
            entriesPerList: 250
        },
        firebaseAppName: 'kx-personal-lists',
        firebase: {
            apiKey: 'YOUR_FIREBASE_APIKEY',
            authDomain: 'YOUR_FIREBASE_AUTHDOMAIN',
            projectId: 'YOUR_FIREBASE_PROJECTID',
            storageBucket: 'YOUR_FIREBASE_STORAGEBUCKET',
            messagingSenderId: 'YOUR_FIREBASE_MESSAGINGSENDERID',
            appId: 'YOUR_FIREBASE_APPID'
        },
        storage: {
            // Anciennes listes : utilisées uniquement pour la migration vers Firestore.
            notices: 'sidebarItems',
            items: 'items',
            panelOpen: 'sidebarOpen',
            activeTab: 'kxTempListsActiveTab',
            activeNoticeList: 'kxPersonalListsActiveNotice',
            activeItemList: 'kxPersonalListsActiveItem',
            profileName: 'kxPersonalListsProfileName'
        }
    };

    const state = {
        notices: [],
        items: [],
        lists: [],
        activeTab: localStorage.getItem(CONFIG.storage.activeTab) === 'items' ? 'items' : 'notices',
        activeListIds: {
            notices: localStorage.getItem(CONFIG.storage.activeNoticeList) || '',
            items: localStorage.getItem(CONFIG.storage.activeItemList) || ''
        },
        entryListIds: { notices: '', items: '' },
        noticeQuery: '',
        itemQuery: '',
        observer: null,
        scheduled: false,
        firebaseStatus: 'loading',
        firebaseError: '',
        identityMessage: '',
        fb: null,
        profile: null,
        profileDirectory: [],
        unsubLists: null,
        unsubEntries: { notices: null, items: null },
        selectedEntryIds: { notices: new Set(), items: new Set() },
        transferTargetIds: { notices: '', items: '' },
        switchingList: { notices: false, items: false },
        directAddBusy: { notices: false, items: false },
        importReviewOpen: false
    };


    function shouldSkipPage() {
        const href = String(window.location.href || '');
        const path = String(window.location.pathname || '');
        return !!document.getElementById('login') ||
            /(?:slip|print|print_overdues\.pl)/i.test(href) ||
            /(?:slip|print)/i.test(path);
    }

    if (shouldSkipPage()) return;

    /* ============================================================
       OUTILS GÉNÉRAUX
       ============================================================ */

    function cleanText(value) {
        return String(value == null ? '' : value)
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function safeJsonArray(raw) {
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    function getStoredArray(key) {
        return safeJsonArray(localStorage.getItem(key));
    }

    function setStoredArray(key, value) {
        localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
    }

    function extractBiblionumber(value) {
        const str = cleanText(value);
        if (!str || str === '#') return '';

        if (/^\d+$/.test(str)) return str;

        try {
            const url = new URL(str, window.location.origin);
            const fromQuery = url.searchParams.get('biblionumber');
            if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery;
        } catch (_) {}

        const match = str.match(/[?&]biblionumber=(\d+)/i);
        return match ? match[1] : '';
    }

    function detailLink(biblionumber) {
        const id = cleanText(biblionumber);
        return id ? `/cgi-bin/koha/catalogue/detail.pl?biblionumber=${encodeURIComponent(id)}` : '';
    }

    function itemDetailLink(item) {
        const bib = cleanText(item && item.biblionumber);
        const itemNumber = cleanText(item && item.itemNumber);
        if (!bib || !itemNumber) return '';
        return `/cgi-bin/koha/catalogue/moredetail.pl?biblionumber=${encodeURIComponent(bib)}&itemnumber=${encodeURIComponent(itemNumber)}#item${encodeURIComponent(itemNumber)}`;
    }

    function textWithout(selector, removeSelector) {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (!el) return '';
        const clone = el.cloneNode(true);
        if (removeSelector) clone.querySelectorAll(removeSelector).forEach(node => node.remove());
        return cleanText(clone.textContent);
    }

    function firstText(root, selectors) {
        if (!root) return '';
        for (const selector of selectors) {
            const el = root.querySelector(selector);
            if (el) {
                const value = cleanText(el.textContent);
                if (value) return value;
            }
        }
        return '';
    }

    function directTextWithoutChildren(el, childSelectors) {
        if (!el) return '';
        const clone = el.cloneNode(true);
        (childSelectors || []).forEach(selector => clone.querySelectorAll(selector).forEach(node => node.remove()));
        return cleanText(clone.textContent);
    }

    function uniqueBy(list, keyFn) {
        const seen = new Set();
        const out = [];
        for (const entry of list) {
            const key = keyFn(entry);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            out.push(entry);
        }
        return out;
    }

    function uniqueStrings(values) {
        return Array.from(new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean)));
    }

    async function mapLimit(items, limit, iteratee) {
        const list = Array.isArray(items) ? items : [];
        const max = Math.max(1, Math.min(Number(limit) || 1, list.length || 1));
        const results = new Array(list.length);
        let cursor = 0;
        await Promise.all(Array.from({ length: max }, async () => {
            while (cursor < list.length) {
                const index = cursor++;
                results[index] = await iteratee(list[index], index);
            }
        }));
        return results;
    }

    function createElement(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text != null) el.textContent = text;
        return el;
    }

    function icon(className) {
        const i = document.createElement('i');
        i.className = className;
        i.setAttribute('aria-hidden', 'true');
        return i;
    }


    function appendResolvedCover(card, entry) {
        if (!card || !entry) return null;

        const biblionumber = cleanText(entry.biblionumber);
        const initialCover = cleanText(entry.imgSrc || entry.cover);
        const resolver = window.PMKCoverResolver;

        // Sans identifiant de notice ni URL déjà connue, aucun candidat exploitable.
        if (!biblionumber && !initialCover) return null;

        const img = createElement('img', 'kx-tl-cover');
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        card.appendChild(img);

        if (resolver && typeof resolver.bindImage === 'function') {
            Promise.resolve(resolver.bindImage(img, {
                biblionumber,
                imgSrc: initialCover,
                cover: initialCover
            }, {
                // Si une couverture est déjà stockée, on l'affiche d'abord et
                // on ne déclenche la résolution complète qu'en cas d'échec.
                resolveOnErrorOnly: !!initialCover,
                // Si aucune couverture n'est connue, on attend que la carte
                // approche de l'écran avant d'interroger Koha.
                deferUntilVisible: !initialCover,
                rootMargin: '350px',
                removeOnExhausted: true
            })).catch(() => {
                if (img.isConnected && !img.src) img.remove();
            });
            return img;
        }

        // Compatibilité si le moteur transverse n'est pas encore chargé.
        if (initialCover) {
            img.style.visibility = 'visible';
            img.src = initialCover;
            img.addEventListener('error', () => img.remove(), { once: true });
            return img;
        }

        img.remove();
        return null;
    }

    function debounceFrame(fn) {
        if (state.scheduled) return;
        state.scheduled = true;
        requestAnimationFrame(() => {
            state.scheduled = false;
            try { fn(); } catch (error) { (function(){})('[KX Lists]', error); }
        });
    }

    function downloadFile(filename, content, mimeType) {
        const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    async function copyText(value, successMessage) {
        const text = String(value || '');
        if (!text) {
            toast('Rien à copier.', 'info');
            return;
        }

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                textarea.remove();
            }
            toast(successMessage || 'Copié.', 'success');
        } catch (error) {
            (function(){})('[KX Lists] Copie impossible', error);
            toast('Copie impossible.', 'error');
        }
    }

    /* ============================================================
       NORMALISATION / MIGRATION
       ============================================================ */

    function normalizeNotice(raw) {
        if (!raw || typeof raw !== 'object') return null;

        const biblionumber = cleanText(
            raw.biblionumber ||
            raw.biblioNumber ||
            extractBiblionumber(raw.link)
        );

        let title = cleanText(raw.title);
        const subtitle = cleanText(raw.subtitle);
        const author = cleanText(raw.author);
        const editor = cleanText(raw.editor);
        const imgSrc = cleanText(raw.imgSrc || raw.image || raw.cover);
        let link = cleanText(raw.link);

        const isBrokenLegacyPlaceholder =
            !biblionumber &&
            (!link || link === '#') &&
            (!title || /^Titre non trouv[ée]$/i.test(title));

        if (isBrokenLegacyPlaceholder) return null;

        if (!link || link === '#') link = detailLink(biblionumber);
        if (!title && biblionumber) title = `Notice #${biblionumber}`;
        if (!title && !link) return null;

        return {
            biblionumber,
            title,
            subtitle,
            author,
            editor,
            link,
            imgSrc
        };
    }

    function normalizeItem(raw) {
        if (!raw || typeof raw !== 'object') return null;

        const itemNumber = cleanText(raw.itemNumber || raw.itemnumber || raw.item_id);
        const codeBarre = cleanText(raw.codeBarre || raw.barcode || raw.codebarre);

        if (!itemNumber && !codeBarre) return null;

        return {
            itemNumber,
            site: cleanText(raw.site || raw.homebranch || raw.library),
            cote: cleanText(raw.cote || raw.itemcallnumber || raw.callnumber),
            type: cleanText(raw.type || raw.itype || raw.itemtype),
            codeBarre,
            title: cleanText(raw.title),
            subtitle: cleanText(raw.subtitle),
            biblionumber: cleanText(raw.biblionumber || raw.biblioNumber),
            imgSrc: cleanText(raw.imgSrc || raw.image || raw.cover)
        };
    }


    /* ============================================================
       FIREBASE / FIRESTORE / IDENTITÉ PAR NOM
       ============================================================ */

    function tabToListType(tab) {
        return tab === 'items' ? 'item' : 'notice';
    }

    function listTypeToTab(type) {
        return type === 'item' ? 'items' : 'notices';
    }

    function typeLabel(tab, plural = false) {
        if (tab === 'items') return plural ? 'exemplaires' : 'exemplaire';
        return plural ? 'notices' : 'notice';
    }

    function activeList(tab) {
        const id = state.activeListIds[tab];
        return state.lists.find(list => list.id === id && list.type === tabToListType(tab)) || null;
    }

    function listsOfType(tab) {
        const type = tabToListType(tab);
        return state.lists
            .filter(list => list.type === type)
            .sort((a, b) => cleanText(a.name).localeCompare(cleanText(b.name), 'fr', { sensitivity: 'base' }));
    }

    function activeListStorageKey(tab) {
        const base = tab === 'items' ? CONFIG.storage.activeItemList : CONFIG.storage.activeNoticeList;
        return state.profile ? `${base}:${state.profile.id}` : base;
    }

    function loadActiveListsForProfile() {
        state.activeListIds.notices = localStorage.getItem(activeListStorageKey('notices')) || '';
        state.activeListIds.items = localStorage.getItem(activeListStorageKey('items')) || '';
    }

    function persistActiveList(tab, id) {
        state.activeListIds[tab] = id || '';
        localStorage.setItem(activeListStorageKey(tab), id || '');
    }

    function canUseCloud() {
        return !!(state.fb && state.profile && state.firebaseStatus !== 'error');
    }

    function firebaseErrorMessage(error) {
        const code = cleanText(error && error.code);
        const messages = {
            'permission-denied': 'Firestore a refusé l’accès. Vérifiez les règles Firestore.',
            'firestore/permission-denied': 'Firestore a refusé l’accès. Vérifiez les règles Firestore.',
            'unavailable': 'Firestore est momentanément indisponible.',
            'firestore/unavailable': 'Firestore est momentanément indisponible.'
        };
        return messages[code] || cleanText(error && error.message) || 'Erreur Firebase inconnue.';
    }

    function sanitizeProfileName(value) {
        return cleanText(value).slice(0, 80);
    }

    function canonicalProfileName(value) {
        return sanitizeProfileName(value)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .normalize('NFKC')
            .toLocaleLowerCase('fr-FR');
    }

    function existingProfileForName(value) {
        const canonical = canonicalProfileName(value);
        return state.profileDirectory.find(profile => canonicalProfileName(profile.name) === canonical) || null;
    }

    async function refreshProfileDirectory() {
        if (!state.fb) return [];
        const { collection, getDocs } = state.fb.firestoreMod;
        const snap = await getDocs(collection(state.fb.db, 'profiles'));
        const seen = new Set();
        state.profileDirectory = snap.docs
            .map(docSnap => ({ id: docSnap.id, name: sanitizeProfileName(docSnap.data()?.displayName || '') }))
            .filter(profile => profile.name)
            .filter(profile => {
                const key = canonicalProfileName(profile.name);
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
        return state.profileDirectory;
    }

    function profileIdForName(value) {
        const canonical = canonicalProfileName(value);
        if (!canonical) return '';
        const bytes = new TextEncoder().encode(canonical);
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return `p_${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
    }

    async function loadFirebase() {
        try {
            const base = `https://www.gstatic.com/firebasejs/${CONFIG.firebaseSdkVersion}`;
            const [appMod, firestoreMod] = await Promise.all([
                import(`${base}/firebase-app.js`),
                import(`${base}/firebase-firestore.js`)
            ]);

            let app = appMod.getApps().find(candidate => candidate.name === CONFIG.firebaseAppName);
            if (!app) app = appMod.initializeApp(CONFIG.firebase, CONFIG.firebaseAppName);

            const db = firestoreMod.getFirestore(app);
            state.fb = { appMod, firestoreMod, app, db };
            state.firebaseError = '';

            await refreshProfileDirectory();
            const savedName = sanitizeProfileName(localStorage.getItem(CONFIG.storage.profileName));
            if (savedName) {
                const existing = existingProfileForName(savedName);
                await activateProfile(existing?.name || savedName, { silent: true, profileId: existing?.id || '' });
            } else {
                state.firebaseStatus = 'needs-profile';
                renderEverything();
            }
        } catch (error) {
            state.firebaseStatus = 'error';
            state.firebaseError = firebaseErrorMessage(error);
            renderEverything();
        }
    }

    function stopCloudListeners() {
        if (typeof state.unsubLists === 'function') state.unsubLists();
        state.unsubLists = null;
        for (const tab of ['notices', 'items']) {
            if (typeof state.unsubEntries[tab] === 'function') state.unsubEntries[tab]();
            state.unsubEntries[tab] = null;
            state.entryListIds[tab] = '';
        }
    }

    async function activateProfile(rawName, options = {}) {
        const name = sanitizeProfileName(rawName);
        if (!name) {
            toast('Saisissez votre nom pour accéder à vos listes.', 'info');
            return false;
        }

        const existingProfile = existingProfileForName(name);
        const id = options.profileId || existingProfile?.id || profileIdForName(name);
        const displayName = existingProfile?.name || name;
        stopCloudListeners();
        state.profile = { id, name: displayName };
        state.lists = [];
        state.notices = [];
        state.items = [];
        state.identityMessage = '';
        state.switchingList = { notices: false, items: false };
        localStorage.setItem(CONFIG.storage.profileName, displayName);
        loadActiveListsForProfile();
        state.firebaseStatus = 'loading-data';
        renderEverything();

        try {
            const { doc, setDoc, serverTimestamp } = state.fb.firestoreMod;
            await setDoc(doc(state.fb.db, 'profiles', id), {
                displayName,
                canonicalName: canonicalProfileName(displayName),
                updatedAt: serverTimestamp()
            }, { merge: true });

            await refreshProfileDirectory();
            await initializeUserLists();
            state.firebaseStatus = 'ready';
            if (!options.silent) toast(`Listes de « ${displayName} » chargées.`, 'success');
            renderEverything();
            return true;
        } catch (error) {
            stopCloudListeners();
            state.firebaseStatus = 'error';
            state.firebaseError = firebaseErrorMessage(error);
            renderEverything();
            return false;
        }
    }

    function clearProfileSelection() {
        stopCloudListeners();
        state.profile = null;
        state.lists = [];
        state.notices = [];
        state.items = [];
        state.activeListIds = { notices: '', items: '' };
        state.selectedEntryIds.notices.clear();
        state.selectedEntryIds.items.clear();
        state.transferTargetIds = { notices: '', items: '' };
        state.firebaseStatus = state.fb ? 'needs-profile' : 'loading';
        state.firebaseError = '';
        state.identityMessage = '';
        state.switchingList = { notices: false, items: false };
        localStorage.removeItem(CONFIG.storage.profileName);
        renderEverything();
    }

    function userListsCollection() {
        const { collection } = state.fb.firestoreMod;
        return collection(state.fb.db, 'profiles', state.profile.id, 'lists');
    }

    function listDocument(listId) {
        return state.fb.firestoreMod.doc(state.fb.db, 'profiles', state.profile.id, 'lists', listId);
    }

    function entriesCollection(listId) {
        return state.fb.firestoreMod.collection(state.fb.db, 'profiles', state.profile.id, 'lists', listId, 'entries');
    }

    function entryDocument(listId, entryId) {
        return state.fb.firestoreMod.doc(state.fb.db, 'profiles', state.profile.id, 'lists', listId, 'entries', entryId);
    }

    async function fetchListsOnce() {
        const snap = await state.fb.firestoreMod.getDocs(userListsCollection());
        state.lists = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
            .filter(list => list.type === 'notice' || list.type === 'item');
    }

    async function ensureDefaultLists() {
        const { setDoc, serverTimestamp } = state.fb.firestoreMod;
        let count = state.lists.length;
        let changed = false;

        if (!state.lists.some(list => list.type === 'notice') && count < CONFIG.limits.listsPerUser) {
            await setDoc(listDocument('default-notices'), {
                name: 'Ma liste', type: 'notice', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
            }, { merge: true });
            count += 1;
            changed = true;
        }
        if (!state.lists.some(list => list.type === 'item') && count < CONFIG.limits.listsPerUser) {
            await setDoc(listDocument('default-items'), {
                name: 'Ma liste', type: 'item', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
            }, { merge: true });
            changed = true;
        }
        if (changed) await fetchListsOnce();
    }

    function reconcileActiveLists() {
        for (const tab of ['notices', 'items']) {
            const available = listsOfType(tab);
            const current = state.activeListIds[tab];
            if (!available.some(list => list.id === current)) {
                persistActiveList(tab, available[0]?.id || '');
            }
        }
    }

    async function initializeUserLists() {
        await fetchListsOnce();
        await ensureDefaultLists();
        reconcileActiveLists();
        await migrateLegacyLocalLists();
        await fetchListsOnce();
        reconcileActiveLists();
        subscribeLists();
        subscribeEntries('notices');
        subscribeEntries('items');
    }

    function subscribeLists() {
        if (!state.profile) return;
        if (typeof state.unsubLists === 'function') state.unsubLists();
        state.unsubLists = state.fb.firestoreMod.onSnapshot(userListsCollection(), snap => {
            const previous = { ...state.activeListIds };
            state.lists = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
                .filter(list => list.type === 'notice' || list.type === 'item');
            reconcileActiveLists();

            for (const tab of ['notices', 'items']) {
                if (previous[tab] !== state.activeListIds[tab] || state.entryListIds[tab] !== state.activeListIds[tab]) {
                    subscribeEntries(tab);
                }
            }
            renderEverything();
        }, error => {
            state.firebaseError = firebaseErrorMessage(error);
            toast(state.firebaseError, 'error');
        });
    }

    function subscribeEntries(tab) {
        const listId = state.activeListIds[tab];
        if (typeof state.unsubEntries[tab] === 'function') state.unsubEntries[tab]();
        state.unsubEntries[tab] = null;
        state.entryListIds[tab] = listId || '';

        if (!canUseCloud() || !listId) {
            state[tab] = [];
            renderEverything();
            return;
        }

        state.unsubEntries[tab] = state.fb.firestoreMod.onSnapshot(entriesCollection(listId), snap => {
            const raw = snap.docs.map(docSnap => docSnap.data());
            state.switchingList[tab] = false;
            state[tab] = tab === 'items'
                ? uniqueBy(raw.map(normalizeItem).filter(Boolean), item => item.itemNumber || `barcode:${item.codeBarre}`)
                : uniqueBy(raw.map(normalizeNotice).filter(Boolean), notice => notice.biblionumber || notice.link);
            pruneSelection(tab);
            renderEverything();
        }, error => {
            state.switchingList[tab] = false;
            state[tab] = [];
            toast(firebaseErrorMessage(error), 'error');
            renderEverything();
        });
    }

    async function selectList(tab, listId) {
        if (!listsOfType(tab).some(list => list.id === listId)) return;
        if (state.activeListIds[tab] === listId && state.entryListIds[tab] === listId) return;

        persistActiveList(tab, listId);
        state.selectedEntryIds[tab].clear();
        if (state.transferTargetIds[tab] === listId) state.transferTargetIds[tab] = '';

        // Évite d'afficher pendant quelques millisecondes l'état de l'ancienne liste.
        state.switchingList[tab] = true;
        state[tab] = [];
        renderEverything();
        subscribeEntries(tab);
    }

    function sanitizeListName(value) {
        return cleanText(value).slice(0, 80);
    }

    async function createNamedList(tab) {
        if (!canUseCloud()) return requireCloud(tab);
        if (state.lists.length >= CONFIG.limits.listsPerUser) {
            toast(`Limite atteinte : ${CONFIG.limits.listsPerUser} listes maximum par utilisateur.`, 'info');
            return;
        }
        const proposed = window.prompt(`Nom de la nouvelle liste de ${typeLabel(tab, true)} :`, 'Nouvelle liste');
        if (proposed == null) return;
        const name = sanitizeListName(proposed);
        if (!name) return toast('Le nom de la liste est obligatoire.', 'error');

        try {
            const { addDoc, serverTimestamp } = state.fb.firestoreMod;
            const ref = await addDoc(userListsCollection(), {
                name,
                type: tabToListType(tab),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            persistActiveList(tab, ref.id);
            subscribeEntries(tab);
            toast(`Liste « ${name} » créée.`, 'success');
        } catch (error) {
            toast(firebaseErrorMessage(error), 'error');
        }
    }

    async function renameActiveList(tab) {
        const list = activeList(tab);
        if (!canUseCloud() || !list) return requireCloud(tab);
        const proposed = window.prompt('Nouveau nom de la liste :', list.name || 'Ma liste');
        if (proposed == null) return;
        const name = sanitizeListName(proposed);
        if (!name || name === list.name) return;
        try {
            await state.fb.firestoreMod.setDoc(listDocument(list.id), {
                name,
                updatedAt: state.fb.firestoreMod.serverTimestamp()
            }, { merge: true });
            toast('Liste renommée.', 'success');
        } catch (error) {
            toast(firebaseErrorMessage(error), 'error');
        }
    }

    async function deleteCollectionInBatches(collectionRef) {
        const { getDocs, writeBatch, query, limit } = state.fb.firestoreMod;
        while (true) {
            const snap = await getDocs(query(collectionRef, limit(400)));
            if (snap.empty) break;
            const batch = writeBatch(state.fb.db);
            snap.docs.forEach(docSnap => batch.delete(docSnap.ref));
            await batch.commit();
        }
    }

    async function deleteActiveList(tab) {
        const list = activeList(tab);
        if (!canUseCloud() || !list) return requireCloud(tab);
        if (listsOfType(tab).length <= 1) {
            toast(`Créez d’abord une autre liste de ${typeLabel(tab, true)}.`, 'info');
            return;
        }
        if (!window.confirm(`Supprimer définitivement la liste « ${list.name} » et tout son contenu ?`)) return;

        try {
            await deleteCollectionInBatches(entriesCollection(list.id));
            await state.fb.firestoreMod.deleteDoc(listDocument(list.id));
            persistActiveList(tab, '');
            state[tab] = [];
            state.selectedEntryIds[tab].clear();
            if (state.transferTargetIds[tab] === list.id) state.transferTargetIds[tab] = '';
            toast('Liste supprimée.', 'info');
        } catch (error) {
            toast(firebaseErrorMessage(error), 'error');
        }
    }

    function stableHash(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function entryIdFor(tab, entry) {
        if (tab === 'items') {
            const itemNumber = cleanText(entry.itemNumber);
            if (itemNumber) return `item_${itemNumber}`;
            return `barcode_${stableHash(entry.codeBarre)}`;
        }
        const bib = cleanText(entry.biblionumber);
        if (bib) return `bib_${bib}`;
        return `notice_${stableHash(entry.link || entry.title)}`;
    }

    async function touchList(listId) {
        await state.fb.firestoreMod.setDoc(listDocument(listId), {
            updatedAt: state.fb.firestoreMod.serverTimestamp()
        }, { merge: true });
    }

    async function listEntryState(listId) {
        const snap = await state.fb.firestoreMod.getDocs(entriesCollection(listId));
        return {
            count: snap.size,
            ids: new Set(snap.docs.map(docSnap => docSnap.id))
        };
    }

    function normalizeEntriesForTab(tab, entries) {
        return tab === 'items'
            ? uniqueBy((entries || []).map(normalizeItem).filter(Boolean), item => item.itemNumber || `barcode:${item.codeBarre}`)
            : uniqueBy((entries || []).map(normalizeNotice).filter(Boolean), notice => notice.biblionumber || notice.link);
    }

    async function planEntriesForList(tab, listId, entries) {
        const normalized = normalizeEntriesForTab(tab, entries);
        if (!normalized.length) {
            return { normalized: [], accepted: [], duplicates: [], rejected: [], currentCount: 0, remainingBefore: CONFIG.limits.entriesPerList };
        }

        const targetState = await listEntryState(listId);
        const duplicates = [];
        const fresh = [];
        normalized.forEach(entry => {
            const id = entryIdFor(tab, entry);
            if (targetState.ids.has(id)) duplicates.push(entry);
            else fresh.push(entry);
        });

        const remainingBefore = Math.max(0, CONFIG.limits.entriesPerList - targetState.count);
        const accepted = fresh.slice(0, remainingBefore);
        const rejected = fresh.slice(remainingBefore);
        return { normalized, accepted, duplicates, rejected, currentCount: targetState.count, remainingBefore };
    }

    function activeListIsFull(tab) {
        return (state[tab] || []).length >= CONFIG.limits.entriesPerList;
    }

    async function writeEntries(tab, listId, entries) {
        const plan = await planEntriesForList(tab, listId, entries);
        const toWrite = [...plan.duplicates, ...plan.accepted];
        if (!toWrite.length) {
            return {
                written: 0,
                added: 0,
                duplicates: plan.duplicates.length,
                rejected: plan.rejected.length,
                currentCount: plan.currentCount
            };
        }

        const { writeBatch, serverTimestamp } = state.fb.firestoreMod;
        for (let i = 0; i < toWrite.length; i += 400) {
            const batch = writeBatch(state.fb.db);
            toWrite.slice(i, i + 400).forEach(entry => {
                batch.set(entryDocument(listId, entryIdFor(tab, entry)), {
                    ...entry,
                    addedAt: serverTimestamp()
                }, { merge: true });
            });
            await batch.commit();
        }
        await touchList(listId);
        return {
            written: toWrite.length,
            added: plan.accepted.length,
            duplicates: plan.duplicates.length,
            rejected: plan.rejected.length,
            currentCount: plan.currentCount
        };
    }

    function selectedSet(tab) {
        return state.selectedEntryIds[tab];
    }

    function filteredEntries(tab) {
        const queryText = cleanText(tab === 'items' ? state.itemQuery : state.noticeQuery).toLocaleLowerCase('fr');
        const entries = state[tab] || [];
        if (!queryText) return entries.slice();
        if (tab === 'items') {
            return entries.filter(item => [item.title, item.subtitle, item.itemNumber, item.site, item.cote, item.type, item.codeBarre]
                .some(value => cleanText(value).toLocaleLowerCase('fr').includes(queryText)));
        }
        return entries.filter(notice => [notice.title, notice.subtitle, notice.author, notice.editor, notice.biblionumber]
            .some(value => cleanText(value).toLocaleLowerCase('fr').includes(queryText)));
    }

    function pruneSelection(tab) {
        const existingIds = new Set((state[tab] || []).map(entry => entryIdFor(tab, entry)));
        for (const id of Array.from(selectedSet(tab))) {
            if (!existingIds.has(id)) selectedSet(tab).delete(id);
        }
    }

    function clearSelection(tab, rerender = true) {
        selectedSet(tab).clear();
        if (rerender) {
            if (tab === 'items') renderItemList();
            else renderNoticeList();
            renderTransferManager(tab);
        }
    }

    function setEntrySelected(tab, entry, selected, card) {
        const id = entryIdFor(tab, entry);
        if (selected) selectedSet(tab).add(id);
        else selectedSet(tab).delete(id);
        if (card) card.classList.toggle('is-selected', !!selected);
        if (selected) {
            const tools = document.querySelector(`#kx-temp-lists-panel details[data-tools-for="${tab}"]`);
            if (tools) tools.open = true;
        }
        renderTransferManager(tab);
    }

    function selectVisibleEntries(tab) {
        filteredEntries(tab).forEach(entry => selectedSet(tab).add(entryIdFor(tab, entry)));
        if (tab === 'items') renderItemList();
        else renderNoticeList();
        renderTransferManager(tab);
    }

    function otherListsOfType(tab) {
        const sourceId = state.activeListIds[tab];
        return listsOfType(tab).filter(list => list.id !== sourceId);
    }

    async function transferSelectedEntries(tab, mode) {
        if (!canUseCloud()) return requireCloud(tab);
        const source = activeList(tab);
        if (!source) return requireCloud(tab);

        const targetId = state.transferTargetIds[tab];
        const target = otherListsOfType(tab).find(list => list.id === targetId);
        if (!target) {
            toast(`Choisissez une autre liste de ${typeLabel(tab, true)} comme destination.`, 'info');
            return;
        }

        const selectedIds = selectedSet(tab);
        const entries = (state[tab] || []).filter(entry => selectedIds.has(entryIdFor(tab, entry)));
        if (!entries.length) {
            toast('Sélectionnez au moins un élément.', 'info');
            return;
        }

        try {
            const plan = await planEntriesForList(tab, target.id, entries);
            if (mode === 'copy') {
                const result = await writeEntries(tab, target.id, entries);
                if (!result.added && !result.duplicates) {
                    toast(`La liste « ${target.name} » est pleine (${CONFIG.limits.entriesPerList}/${CONFIG.limits.entriesPerList}).`, 'info');
                    return;
                }
                const suffix = result.rejected ? ` · ${result.rejected} non copié(s), limite atteinte` : '';
                toast(`${result.added} nouvel/nouveaux élément(s) copié(s) vers « ${target.name} »${suffix}.`, 'success');
            } else {
                const duplicateIds = new Set(plan.duplicates.map(entry => entryIdFor(tab, entry)));
                const acceptedIds = new Set(plan.accepted.map(entry => entryIdFor(tab, entry)));
                const movable = entries.filter(entry => duplicateIds.has(entryIdFor(tab, entry)) || acceptedIds.has(entryIdFor(tab, entry)));
                if (!movable.length) {
                    toast(`La liste « ${target.name} » est pleine (${CONFIG.limits.entriesPerList}/${CONFIG.limits.entriesPerList}).`, 'info');
                    return;
                }

                const { writeBatch, serverTimestamp } = state.fb.firestoreMod;
                for (let i = 0; i < movable.length; i += 200) {
                    const batch = writeBatch(state.fb.db);
                    movable.slice(i, i + 200).forEach(entry => {
                        const id = entryIdFor(tab, entry);
                        batch.set(entryDocument(target.id, id), { ...entry, addedAt: serverTimestamp() }, { merge: true });
                        batch.delete(entryDocument(source.id, id));
                    });
                    await batch.commit();
                }
                await touchList(target.id);
                await touchList(source.id);
                const movedIds = new Set(movable.map(entry => entryIdFor(tab, entry)));
                state[tab] = state[tab].filter(entry => !movedIds.has(entryIdFor(tab, entry)));
                const refused = entries.length - movable.length;
                const suffix = refused ? ` · ${refused} laissé(s) dans la source, destination pleine` : '';
                toast(`${movable.length} élément(s) déplacé(s) vers « ${target.name} »${suffix}.`, 'success');
            }
            clearSelection(tab);
        } catch (error) {
            toast(firebaseErrorMessage(error), 'error');
        }
    }

    async function migrateLegacyLocalLists() {
        const legacyNotices = uniqueBy(getStoredArray(CONFIG.storage.notices).map(normalizeNotice).filter(Boolean), n => n.biblionumber || n.link);
        const legacyItems = uniqueBy(getStoredArray(CONFIG.storage.items).map(normalizeItem).filter(Boolean), i => i.itemNumber || `barcode:${i.codeBarre}`);
        if (!legacyNotices.length && !legacyItems.length) return;

        const { setDoc, serverTimestamp } = state.fb.firestoreMod;
        let noticesFullyHandled = !legacyNotices.length;
        let itemsFullyHandled = !legacyItems.length;

        if (legacyNotices.length) {
            const id = 'legacy-notices-v1';
            const alreadyExists = state.lists.some(list => list.id === id);
            if (!alreadyExists && state.lists.length >= CONFIG.limits.listsPerUser) {
                toast(`Ancienne liste de notices conservée localement : limite de ${CONFIG.limits.listsPerUser} listes atteinte.`, 'info');
            } else {
                await setDoc(listDocument(id), {
                    name: 'Ancienne liste locale', type: 'notice', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
                }, { merge: true });
                const result = await writeEntries('notices', id, legacyNotices);
                persistActiveList('notices', id);
                noticesFullyHandled = result.rejected === 0;
                if (result.rejected) toast(`${result.rejected} notice(s) locale(s) conservée(s) localement : limite de ${CONFIG.limits.entriesPerList} atteinte.`, 'info');
            }
        }

        if (legacyItems.length) {
            const id = 'legacy-items-v1';
            const alreadyExists = state.lists.some(list => list.id === id);
            if (!alreadyExists && state.lists.length >= CONFIG.limits.listsPerUser) {
                toast(`Ancienne liste d’exemplaires conservée localement : limite de ${CONFIG.limits.listsPerUser} listes atteinte.`, 'info');
            } else {
                await setDoc(listDocument(id), {
                    name: 'Ancienne liste locale', type: 'item', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
                }, { merge: true });
                const result = await writeEntries('items', id, legacyItems);
                persistActiveList('items', id);
                itemsFullyHandled = result.rejected === 0;
                if (result.rejected) toast(`${result.rejected} exemplaire(s) local/locaux conservé(s) localement : limite de ${CONFIG.limits.entriesPerList} atteinte.`, 'info');
            }
        }

        if (noticesFullyHandled) localStorage.removeItem(CONFIG.storage.notices);
        if (itemsFullyHandled) localStorage.removeItem(CONFIG.storage.items);
        if (noticesFullyHandled || itemsFullyHandled) toast('Anciennes listes locales migrées vers vos listes personnelles.', 'success');
    }

    function noticeExists(notice) {
        const normalized = normalizeNotice(notice);
        if (!normalized) return false;
        return state.notices.some(existing => {
            if (normalized.biblionumber && existing.biblionumber) return normalized.biblionumber === existing.biblionumber;
            return !!normalized.link && normalized.link === existing.link;
        });
    }

    function itemExists(item) {
        const normalized = normalizeItem(item);
        if (!normalized) return false;
        return state.items.some(existing => {
            if (normalized.itemNumber && existing.itemNumber) return normalized.itemNumber === existing.itemNumber;
            return !!normalized.codeBarre && normalized.codeBarre === existing.codeBarre;
        });
    }

    function requireCloud(tab) {
        state.activeTab = tab || state.activeTab;
        localStorage.setItem(CONFIG.storage.activeTab, state.activeTab);
        setPanelOpen(true);
        renderPanel();
        if (!state.profile) toast('Choisissez votre nom pour utiliser vos listes personnelles.', 'info');
        else toast('Les listes personnelles ne sont pas encore disponibles.', 'info');
        return false;
    }

    function undoableAdditionToast(tab, list, entry, noun) {
        const entryId = entryIdFor(tab, entry);
        const duration = 7000;

        toast(`${noun} ajouté${noun === 'Notice' ? 'e' : ''} à « ${list.name} ».`, 'success', {
            duration,
            actionLabel: 'Annuler',
            async onAction() {
                try {
                    await state.fb.firestoreMod.deleteDoc(entryDocument(list.id, entryId));
                    await touchList(list.id);
                    toast(`Ajout ${noun === 'Notice' ? 'de la notice' : 'de l’exemplaire'} annulé.`, 'info');
                } catch (error) {
                    toast(`Annulation impossible : ${firebaseErrorMessage(error)}`, 'error');
                    throw error;
                }
            }
        });
    }

    async function toggleNotice(notice) {
        const normalized = normalizeNotice(notice);
        if (!normalized) return toast('Impossible d’identifier cette notice.', 'error');
        if (!canUseCloud()) return requireCloud('notices');
        const list = activeList('notices');
        if (!list) return requireCloud('notices');
        if (state.switchingList.notices) return toast('Chargement de la liste sélectionnée…', 'info');

        try {
            const ref = entryDocument(list.id, entryIdFor('notices', normalized));
            if (noticeExists(normalized)) {
                await state.fb.firestoreMod.deleteDoc(ref);
                await touchList(list.id);
                toast(`Notice retirée de « ${list.name} ».`, 'info');
            } else {
                const plan = await planEntriesForList('notices', list.id, [normalized]);
                if (!plan.accepted.length && !plan.duplicates.length) {
                    toast(`Liste pleine : ${CONFIG.limits.entriesPerList} notices maximum.`, 'info');
                    return;
                }
                await state.fb.firestoreMod.setDoc(ref, { ...normalized, addedAt: state.fb.firestoreMod.serverTimestamp() }, { merge: true });
                await touchList(list.id);
                undoableAdditionToast('notices', list, normalized, 'Notice');
            }
        } catch (error) {
            toast(firebaseErrorMessage(error), 'error');
        }
    }

    async function toggleItem(item) {
        const normalized = normalizeItem(item);
        if (!normalized) return toast('Impossible d’identifier cet exemplaire.', 'error');
        if (!canUseCloud()) return requireCloud('items');
        const list = activeList('items');
        if (!list) return requireCloud('items');
        if (state.switchingList.items) return toast('Chargement de la liste sélectionnée…', 'info');

        try {
            const ref = entryDocument(list.id, entryIdFor('items', normalized));
            if (itemExists(normalized)) {
                await state.fb.firestoreMod.deleteDoc(ref);
                await touchList(list.id);
                toast(`Exemplaire retiré de « ${list.name} ».`, 'info');
            } else {
                const plan = await planEntriesForList('items', list.id, [normalized]);
                if (!plan.accepted.length && !plan.duplicates.length) {
                    toast(`Liste pleine : ${CONFIG.limits.entriesPerList} exemplaires maximum.`, 'info');
                    return;
                }
                await state.fb.firestoreMod.setDoc(ref, { ...normalized, addedAt: state.fb.firestoreMod.serverTimestamp() }, { merge: true });
                await touchList(list.id);
                undoableAdditionToast('items', list, normalized, 'Exemplaire');
            }
        } catch (error) {
            toast(firebaseErrorMessage(error), 'error');
        }
    }


    /* ============================================================
       EXTRACTION NOTICE
       ============================================================ */

    function extractSearchNotice(row) {
        if (!row) return null;

        const titleLink = row.querySelector('a.titlebibresult, a.titlemikaresult, .titlebibresult a, .titlemikaresult a, a[href*="detail.pl?biblionumber="]');
        const biblionumber = cleanText(
            (row.id || '').match(/^row(\d+)$/)?.[1] ||
            row.querySelector('input.selection[name="biblionumber"]')?.value ||
            row.querySelector('input[name="biblionumber"]')?.value ||
            extractBiblionumber(titleLink?.href)
        );

        const authorNode = row.querySelector('.kx-notice-meta-author, li[title="Zone : 700"]');
        const editorNode = row.querySelector('li[title="Zone : 210"]');
        const cover = row.querySelector(
            'td.bookcoverimg .cover-image img[src], td.bookcoverimg img.imgcouvlist[src], td.bookcoverimg img[src]'
        );

        return normalizeNotice({
            biblionumber,
            title: cleanText(titleLink?.textContent),
            subtitle: firstText(row, ['.subbibresult', '#subbib']),
            author: directTextWithoutChildren(authorNode, ['strong']),
            editor: directTextWithoutChildren(editorNode, ['strong']),
            link: titleLink?.href || detailLink(biblionumber),
            imgSrc: cover?.src || ''
        });
    }

    function extractDetailNotice() {
        const root = document.getElementById('catalogue_detail_biblio') || document;
        const titleLink = root.querySelector('a.titlebib, .titlemika .titlebib a, strong.titlebib a, .titlebib a');
        const biblionumber = cleanText(
            new URLSearchParams(window.location.search).get('biblionumber') ||
            extractBiblionumber(titleLink?.href)
        );

        const authorNode = root.querySelector('li[title="Zone : 700"]');
        const editorNode = root.querySelector('li[title="Zone : 210"]');
        const cover = document.querySelector(
            '#biblio-cover-slider .cover-image img[src], #biblio-cover-slider img[src], .bookcoverimg img.imgcouv[src]'
        );

        return normalizeNotice({
            biblionumber,
            title: cleanText(titleLink?.textContent),
            subtitle: firstText(root, ['#subbib', '.subbib']),
            author: directTextWithoutChildren(authorNode, ['strong']),
            editor: directTextWithoutChildren(editorNode, ['strong']),
            link: titleLink?.href || detailLink(biblionumber),
            imgSrc: cover?.src || ''
        });
    }

    /* ============================================================
       EXTRACTION EXEMPLAIRE
       ============================================================ */

    function extractSearchItem(card) {
        if (!card) return null;
        const row = card.closest('tr[id^="row"]');
        const notice = extractSearchNotice(row);

        const library = card.querySelector('.kxri-library');
        const site = directTextWithoutChildren(library, ['.kxri-local-badge']);
        const type = firstText(card, ['.kxri-secondary']) || cleanText(card.querySelector('.kxri-itemtype-icon')?.title);

        return normalizeItem({
            itemNumber: card.dataset.itemId,
            codeBarre: card.dataset.barcode || firstText(card, ['.kxri-barcode']),
            site,
            cote: firstText(card, ['.kxri-callnumber > a', '.kxri-callnumber']),
            type,
            title: notice?.title || '',
            subtitle: notice?.subtitle || '',
            biblionumber: notice?.biblionumber || '',
            imgSrc: notice?.imgSrc || ''
        });
    }

    function getCellByDataLabel(row, labels, fallbackSelectors) {
        if (!row) return null;
        for (const label of labels || []) {
            const cell = row.querySelector(`td[data-label="${CSS.escape(label)}"]`);
            if (cell) return cell;
        }
        for (const selector of fallbackSelectors || []) {
            const cell = row.querySelector(selector);
            if (cell) return cell;
        }
        return null;
    }

    function extractDetailItem(row) {
        if (!row) return null;
        const notice = extractDetailNotice();

        const itemNumber = cleanText(
            row.querySelector('input[name="itemnumber"]')?.value ||
            row.dataset.itemnumber
        );

        const barcodeCell = getCellByDataLabel(row, ['barcode'], ['td.barcode']);
        const homeCell = getCellByDataLabel(row, ['homebranch'], ['td.homebranch']);
        const callCell = getCellByDataLabel(row, ['itemcallnumber'], ['td.itemcallnumber']);
        const typeCell = getCellByDataLabel(row, ['itype'], ['td.itype']);

        return normalizeItem({
            itemNumber,
            site: cleanText(homeCell?.textContent),
            cote: cleanText(callCell?.textContent),
            type: firstText(typeCell || row, ['.itypedesc', '.itypetext']) || cleanText(typeCell?.textContent),
            codeBarre: cleanText(barcodeCell?.textContent),
            title: notice?.title || '',
            subtitle: notice?.subtitle || '',
            biblionumber: notice?.biblionumber || '',
            imgSrc: notice?.imgSrc || ''
        });
    }

    /* ============================================================
       CSS
       ============================================================ */

    function installStyles() {
        if (document.getElementById('kx-temp-lists-style')) return;

        const style = document.createElement('style');
        style.id = 'kx-temp-lists-style';
        style.textContent = `
            :root {
                --kx-list-green: #4f772d;
                --kx-list-green-dark: #365314;
                --kx-list-green-soft: #f3f7ef;
                --kx-list-border: #d9dfe3;
                --kx-list-text: #27313a;
                --kx-list-muted: #6b7280;
                --kx-list-danger: #b42318;
            }

            #kx-temp-lists-panel {
                position: fixed;
                z-index: 10050;
                top: 0;
                right: 0;
                width: min(430px, 94vw);
                height: 100vh;
                height: 100dvh;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                background: #fff;
                color: var(--kx-list-text);
                border-left: 1px solid var(--kx-list-border);
                box-shadow: -10px 0 30px rgba(30, 41, 59, .16);
                transform: translateX(105%);
                transition: transform .22s ease;
                font-family: inherit;
            }

            #kx-temp-lists-panel.is-open {
                transform: translateX(0);
            }

            #kx-temp-lists-panel .kx-tl-header {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 14px 14px 12px;
                background: linear-gradient(135deg, var(--kx-list-green), var(--kx-list-green-dark));
                color: #fff;
            }

            #kx-temp-lists-panel .kx-tl-header-main {
                min-width: 0;
                flex: 1;
            }

            #kx-temp-lists-panel .kx-tl-title {
                margin: 0;
                font-size: 18px;
                font-weight: 800;
                line-height: 1.2;
                color: #fff !important;
                text-shadow: 0 1px 2px rgba(0,0,0,.22);
            }

            #kx-temp-lists-panel .kx-tl-subtitle {
                margin-top: 4px;
                font-size: 12px;
                font-weight: 600;
                line-height: 1.3;
                color: #fff !important;
                opacity: 1;
                text-shadow: 0 1px 1px rgba(0,0,0,.16);
            }

            #kx-temp-lists-panel .kx-tl-close {
                width: 34px;
                height: 34px;
                flex: 0 0 34px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border: 1px solid rgba(255,255,255,.28);
                border-radius: 8px;
                background: rgba(255,255,255,.12);
                color: #fff;
                cursor: pointer;
                font-size: 20px;
            }

            #kx-temp-lists-panel .kx-tl-close:hover {
                background: rgba(255,255,255,.22);
            }

            #kx-temp-lists-panel .kx-tl-tabs {
                display: grid;
                grid-template-columns: 1fr 1fr;
                padding: 10px 10px 0;
                gap: 6px;
                background: #fff;
            }

            #kx-temp-lists-panel .kx-tl-tab {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 7px;
                padding: 9px 10px;
                border: 1px solid var(--kx-list-border);
                border-radius: 8px 8px 0 0;
                background: #f8fafc;
                color: #475569;
                cursor: pointer;
                font-weight: 650;
            }

            #kx-temp-lists-panel .kx-tl-tab.is-active {
                background: var(--kx-list-green-soft);
                color: var(--kx-list-green-dark);
                border-bottom-color: var(--kx-list-green-soft);
            }

            #kx-temp-lists-panel .kx-tl-count {
                min-width: 22px;
                height: 22px;
                padding: 0 6px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                box-sizing: border-box;
                border-radius: 999px;
                background: #e2e8f0;
                color: #334155;
                font-size: 11px;
                font-weight: 700;
            }

            #kx-temp-lists-panel .kx-tl-tab.is-active .kx-tl-count {
                background: var(--kx-list-green);
                color: #fff;
            }

            #kx-temp-lists-panel .kx-tl-pane {
                display: none;
                flex: 1;
                min-height: 0;
                flex-direction: column;
                padding: 10px;
                background: #f8fafc;
                border-top: 1px solid var(--kx-list-border);
            }

            #kx-temp-lists-panel .kx-tl-pane.is-active {
                display: flex;
            }

            #kx-temp-lists-panel .kx-tl-search {
                width: 100%;
                box-sizing: border-box;
                margin: 0 0 8px;
                padding: 8px 10px;
                border: 1px solid #cbd5e1;
                border-radius: 7px;
                background: #fff;
                color: #1f2937;
            }

            #kx-temp-lists-panel .kx-tl-actions {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 6px;
                margin-bottom: 9px;
            }

            #kx-temp-lists-panel .kx-tl-action {
                min-height: 34px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                border: 1px solid #cbd5e1;
                border-radius: 7px;
                background: #fff;
                color: #334155;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                text-align: center;
            }

            #kx-temp-lists-panel .kx-tl-action:hover {
                border-color: #94a3b8;
                background: #f1f5f9;
            }

            #kx-temp-lists-panel .kx-tl-action.is-danger {
                color: var(--kx-list-danger);
                border-color: #f2c8c4;
                background: #fff8f7;
            }

            #kx-temp-lists-panel .kx-tl-action.is-wide {
                grid-column: 1 / -1;
            }

            #kx-temp-lists-panel .kx-transfer-manager {
                display: grid;
                grid-template-columns: auto auto auto minmax(100px, 1fr) auto auto;
                align-items: center;
                gap: 6px;
                margin: 0 0 9px;
                padding: 7px;
                border: 1px solid #dbe3e8;
                border-radius: 8px;
                background: #fff;
            }

            #kx-temp-lists-panel .kx-transfer-count {
                min-width: 76px;
                color: #475569;
                font-size: 11px;
                font-weight: 700;
                white-space: nowrap;
            }

            #kx-temp-lists-panel .kx-transfer-manager select {
                min-width: 0;
                width: 100%;
                height: 32px;
                padding: 4px 7px;
                border: 1px solid #cbd5e1;
                border-radius: 6px;
                background: #fff;
                color: #334155;
                font-size: 11px;
            }

            #kx-temp-lists-panel .kx-transfer-btn {
                min-height: 32px;
                padding: 4px 8px;
                border: 1px solid #cbd5e1;
                border-radius: 6px;
                background: #fff;
                color: #334155;
                cursor: pointer;
                font-size: 11px;
                font-weight: 650;
                white-space: nowrap;
            }

            #kx-temp-lists-panel .kx-transfer-btn:hover:not(:disabled) {
                background: #f1f5f9;
                border-color: #94a3b8;
            }

            #kx-temp-lists-panel .kx-transfer-btn:disabled,
            #kx-temp-lists-panel .kx-transfer-manager select:disabled {
                opacity: .5;
                cursor: not-allowed;
            }

            #kx-temp-lists-panel .kx-transfer-btn.is-primary {
                border-color: #b9cda9;
                background: var(--kx-list-green-soft);
                color: var(--kx-list-green-dark);
            }

            #kx-temp-lists-panel .kx-tl-card.is-selected {
                border-color: #9dbb85;
                background: #fbfdf9;
            }

            #kx-temp-lists-panel .kx-tl-select-wrap {
                flex: 0 0 20px;
                display: flex;
                align-items: flex-start;
                justify-content: center;
                padding-top: 2px;
            }

            #kx-temp-lists-panel .kx-tl-select {
                width: 17px;
                height: 17px;
                margin: 0;
                accent-color: var(--kx-list-green);
                cursor: pointer;
            }

            #kx-temp-lists-panel .kx-tl-list {
                flex: 1;
                min-height: 0;
                overflow-y: auto;
                padding-right: 2px;
            }

            #kx-temp-lists-panel .kx-tl-empty {
                margin: 22px 8px;
                padding: 22px 14px;
                border: 1px dashed #cbd5e1;
                border-radius: 10px;
                background: #fff;
                text-align: center;
                color: var(--kx-list-muted);
                font-size: 13px;
            }

            #kx-temp-lists-panel .kx-tl-card {
                display: flex;
                gap: 10px;
                position: relative;
                margin-bottom: 7px;
                padding: 10px 35px 10px 10px;
                border: 1px solid var(--kx-list-border);
                border-radius: 9px;
                background: #fff;
                box-shadow: 0 1px 2px rgba(15,23,42,.03);
            }

            #kx-temp-lists-panel .kx-tl-cover {
                width: 36px;
                height: 50px;
                flex: 0 0 36px;
                object-fit: cover;
                align-self: flex-start;
                border: 1px solid #e2e8f0;
                border-radius: 4px;
                background: #f8fafc;
            }

            #kx-temp-lists-panel .kx-tl-card-body {
                min-width: 0;
                flex: 1;
            }

            #kx-temp-lists-panel .kx-tl-card-title {
                display: block;
                margin: 0 0 4px;
                color: var(--kx-list-green-dark);
                font-weight: 700;
                line-height: 1.25;
                text-decoration: none;
                overflow-wrap: anywhere;
            }

            #kx-temp-lists-panel a.kx-tl-card-title:hover {
                text-decoration: underline;
            }

            #kx-temp-lists-panel .kx-tl-card-meta {
                margin-top: 2px;
                color: #64748b;
                font-size: 11.5px;
                line-height: 1.35;
                overflow-wrap: anywhere;
            }

            #kx-temp-lists-panel .kx-tl-chip {
                display: inline-flex;
                align-items: center;
                margin-top: 5px;
                padding: 2px 6px;
                border-radius: 999px;
                background: #eef2f6;
                color: #475569;
                font-size: 10.5px;
                font-weight: 650;
            }

            #kx-temp-lists-panel .kx-tl-remove {
                position: absolute;
                top: 7px;
                right: 7px;
                width: 26px;
                height: 26px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border: 0;
                border-radius: 6px;
                background: transparent;
                color: #94a3b8;
                cursor: pointer;
            }

            #kx-temp-lists-panel .kx-tl-remove:hover {
                background: #fff1f0;
                color: var(--kx-list-danger);
            }

            .kx-temp-list-toggle {
                display: inline-flex !important;
                align-items: center;
                justify-content: center;
                gap: 5px;
                white-space: nowrap;
            }

            .kx-temp-list-toggle.is-saved {
                border-color: #4f772d !important;
                background: #edf5e7 !important;
                color: #365314 !important;
            }

            .kx-temp-list-target-select {
                display: inline-block;
                max-width: 150px;
                min-width: 90px;
                min-height: 30px;
                margin-left: 4px;
                padding: 4px 24px 4px 7px;
                border: 1px solid #cbd5e1;
                border-radius: 6px;
                background: #fff;
                color: #475569;
                font: inherit;
                font-size: 11px;
                vertical-align: middle;
                cursor: pointer;
            }

            .kx-temp-list-target-select:disabled {
                opacity: .55;
                cursor: wait;
            }

            .kxri-actions .kx-temp-list-target-select {
                max-width: 125px;
                min-width: 78px;
                min-height: 28px;
                padding-top: 3px;
                padding-bottom: 3px;
            }

            body.kx-search-results-page .kx-notice-head-tools .kx-temp-list-toggle {
                min-height: 30px;
                padding: 4px 8px;
                border: 1px solid #cbd5e1;
                border-radius: 6px;
                background: #fff;
                color: #475569;
                font-size: 12px;
                cursor: pointer;
            }

            body.kx-search-results-page .kxri-actions .kx-temp-list-toggle {
                cursor: pointer;
            }

            #holdings_table .kx-temp-detail-item-row {
                display: block;
                width: 100%;
                margin-top: 6px;
            }

            #kx-temp-lists-toast-container {
                position: fixed;
                z-index: 10080;
                right: 14px;
                bottom: 72px;
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 6px;
                pointer-events: none;
            }

            .kx-tl-toast {
                max-width: min(360px, 88vw);
                padding: 9px 12px;
                border-radius: 8px;
                background: #1f2937;
                color: #fff;
                box-shadow: 0 5px 18px rgba(15,23,42,.22);
                font-size: 12px;
                opacity: 0;
                transform: translateY(6px);
                transition: opacity .16s ease, transform .16s ease;
            }

            .kx-tl-toast.is-visible { opacity: 1; transform: translateY(0); }
            .kx-tl-toast.is-success { background: #365314; }
            .kx-tl-toast.is-error { background: #9f1d20; }
            .kx-tl-toast.is-info { background: #334155; }
            .kx-tl-toast.has-action {
                display: flex;
                align-items: center;
                gap: 10px;
                pointer-events: auto;
            }
            .kx-tl-toast .kx-toast-message { min-width: 0; flex: 1; }
            .kx-tl-toast .kx-toast-action {
                flex: 0 0 auto;
                min-height: 28px;
                padding: 4px 8px;
                border: 1px solid rgba(255,255,255,.55);
                border-radius: 6px;
                background: rgba(255,255,255,.14);
                color: #fff;
                font: inherit;
                font-weight: 700;
                cursor: pointer;
            }
            .kx-tl-toast .kx-toast-action:hover { background: rgba(255,255,255,.24); }
            .kx-tl-toast .kx-toast-timer {
                flex: 0 0 auto;
                min-width: 24px;
                color: rgba(255,255,255,.8);
                font-size: 10px;
                text-align: right;
            }

            .kx-import-review-backdrop { position: fixed; inset: 0; z-index: 10180; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(15,23,42,.32); }
            .kx-import-review { width: min(680px, 96vw); max-height: min(82vh, 760px); overflow: auto; box-sizing: border-box; padding: 14px; border: 1px solid #d7dde3; border-radius: 10px; background: #fff; box-shadow: 0 18px 50px rgba(15,23,42,.28); color: #27313a; }
            .kx-import-review h3 { margin: 0 0 4px; font-size: 16px; color: var(--kx-list-green-dark); }
            .kx-import-review .kx-review-sub { margin: 0 0 10px; color: #64748b; font-size: 11px; }
            .kx-import-review .kx-review-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 6px; margin-bottom: 10px; }
            .kx-import-review .kx-review-stat { padding: 7px; border: 1px solid #e5e7eb; border-radius: 7px; background: #f8fafc; }
            .kx-import-review .kx-review-stat strong { display: block; font-size: 16px; color: #334155; }
            .kx-import-review .kx-review-stat span { display: block; margin-top: 1px; color: #64748b; font-size: 9.5px; }
            .kx-import-review .kx-review-mode { display: flex; gap: 12px; flex-wrap: wrap; margin: 8px 0 10px; padding: 8px; border: 1px solid #e5e7eb; border-radius: 7px; background: #fff; }
            .kx-import-review .kx-review-mode label { display: inline-flex; align-items: center; gap: 5px; margin: 0; font-size: 11px; cursor: pointer; }
            .kx-import-review .kx-review-preview { margin-top: 9px; border-top: 1px solid #edf0f2; padding-top: 8px; }
            .kx-import-review .kx-review-preview-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 5px; }
            .kx-import-review .kx-review-preview-head strong { color: #334155; font-size: 11px; }
            .kx-import-review .kx-review-preview-actions { display: flex; gap: 4px; }
            .kx-import-review .kx-review-preview-actions button { min-height: 27px; padding: 3px 6px; font-size: 10px; }
            .kx-import-review .kx-review-preview-list { max-height: 310px; overflow: auto; border: 1px solid #e5e7eb; border-radius: 7px; background: #fff; }
            .kx-import-review .kx-review-preview-row { display: grid; grid-template-columns: 22px 38px minmax(0,1fr); gap: 7px; align-items: start; padding: 6px 7px; border-bottom: 1px solid #edf0f2; }
            .kx-import-review .kx-review-preview-row:last-child { border-bottom: 0; }
            .kx-import-review .kx-review-preview-row.is-excluded { opacity: .55; background: #f8fafc; }
            .kx-import-review .kx-review-preview-check { width: 16px; height: 16px; margin: 4px 0 0; accent-color: var(--kx-list-green); cursor: pointer; }
            .kx-import-review .kx-review-preview-cover { width: 34px; height: 47px; object-fit: cover; border: 1px solid #e2e8f0; border-radius: 4px; background: #f8fafc; }
            .kx-import-review .kx-review-preview-cover-placeholder { width: 34px; height: 47px; display: flex; align-items: center; justify-content: center; border: 1px solid #edf0f2; border-radius: 4px; background: #f8fafc; color: #cbd5e1; font-size: 13px; }
            .kx-import-review .kx-review-preview-main { min-width: 0; }
            .kx-import-review .kx-review-preview-title { display: block; color: var(--kx-list-green-dark); font-size: 11.5px; font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }
            .kx-import-review .kx-review-preview-meta { margin-top: 2px; color: #64748b; font-size: 9.8px; line-height: 1.3; overflow-wrap: anywhere; }
            .kx-import-review .kx-review-preview-id { display: inline-block; margin-top: 3px; color: #94a3b8; font-size: 9.3px; }
            .kx-import-review .kx-review-preview-warning { display: inline-block; margin-top: 3px; padding: 1px 5px; border-radius: 999px; background: #fff7ed; color: #9a5b1b; font-size: 9px; }
            .kx-import-review .kx-review-problems { margin-top: 8px; border-top: 1px solid #edf0f2; padding-top: 8px; }
            .kx-import-review .kx-review-problems-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 5px; }
            .kx-import-review .kx-review-problems-list { max-height: 220px; overflow: auto; border: 1px solid #e5e7eb; border-radius: 6px; background: #fbfcfd; }
            .kx-import-review .kx-review-problem { display: grid; grid-template-columns: minmax(120px,1fr) minmax(150px,1.3fr); gap: 8px; padding: 5px 7px; border-bottom: 1px solid #edf0f2; font-size: 10.5px; }
            .kx-import-review .kx-review-problem:last-child { border-bottom: 0; }
            .kx-import-review .kx-review-problem code { overflow-wrap: anywhere; color: #334155; }
            .kx-import-review .kx-review-problem span { color: #8a4b1d; }
            .kx-import-review .kx-review-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 12px; }
            .kx-import-review button { min-height: 31px; padding: 5px 9px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #334155; cursor: pointer; font-size: 11px; font-weight: 650; }
            .kx-import-review button:hover { background: #f1f5f9; }
            .kx-import-review button.is-primary { border-color: #b9cda9; background: var(--kx-list-green-soft); color: var(--kx-list-green-dark); }
            .kx-import-review button:disabled { opacity: .45; cursor: not-allowed; }
            @media (max-width: 560px) { .kx-import-review .kx-review-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } .kx-import-review .kx-review-problem { grid-template-columns: 1fr; gap: 2px; } .kx-import-review .kx-review-preview-row { grid-template-columns: 20px 32px minmax(0,1fr); gap: 5px; } .kx-import-review .kx-review-preview-cover, .kx-import-review .kx-review-preview-cover-placeholder { width: 30px; height: 42px; } }

            #kx-help-training-menu {
                position: fixed;
                z-index: 10060;
                width: min(350px, calc(100vw - 24px));
                padding: 0;
                overflow: hidden;
                border: 1px solid #d8e1e3;
                border-radius: 11px;
                background: #fff;
                color: #263238;
                box-shadow: 0 14px 38px rgba(15,23,42,.20);
            }

            #kx-help-training-menu[hidden] { display: none !important; }

            #kx-help-training-menu .kx-help-head {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 10px;
                padding: 12px 13px 10px;
                background: #f6faf9;
                border-bottom: 1px solid #e3e9e9;
            }

            #kx-help-training-menu .kx-help-title {
                margin: 0;
                color: #245b52;
                font-size: 14px;
                font-weight: 750;
            }

            #kx-help-training-menu .kx-help-context {
                margin-top: 3px;
                color: #607d8b;
                font-size: 11px;
                line-height: 1.35;
            }

            #kx-help-training-menu .kx-help-level {
                display: inline-block;
                margin-left: 4px;
                padding: 1px 5px;
                border-radius: 999px;
                background: #e8f2f0;
                color: #35675f;
                font-size: 10px;
                font-weight: 700;
                white-space: nowrap;
            }

            #kx-help-training-menu .kx-help-close {
                flex: 0 0 auto;
                width: 28px;
                height: 28px;
                padding: 0;
                border: 0;
                border-radius: 6px;
                background: transparent;
                color: #607d8b;
                cursor: pointer;
                font-size: 20px;
                line-height: 1;
            }

            #kx-help-training-menu .kx-help-close:hover { background: #e8eeee; color: #37474f; }

            #kx-help-training-menu .kx-help-actions {
                display: grid;
                gap: 7px;
                padding: 10px;
            }

            #kx-help-training-menu .kx-help-action {
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                min-height: 46px;
                padding: 8px 10px;
                border: 1px solid #dde4e6;
                border-radius: 8px;
                background: #fff;
                color: #37474f;
                text-align: left;
                cursor: pointer;
            }

            #kx-help-training-menu .kx-help-action:hover {
                border-color: #9fc8c0;
                background: #f4faf8;
            }

            #kx-help-training-menu .kx-help-action > i {
                width: 20px;
                color: #397a6e;
                text-align: center;
                font-size: 15px;
            }

            #kx-help-training-menu .kx-help-action-main {
                min-width: 0;
                display: flex;
                flex-direction: column;
                gap: 1px;
            }

            #kx-help-training-menu .kx-help-action-main strong { font-size: 12px; }
            #kx-help-training-menu .kx-help-action-main small { color: #70848c; font-size: 10px; line-height: 1.3; }

            #kx-help-training-menu .kx-help-assist-row {
                display: flex;
                align-items: center;
                gap: 10px;
                min-height: 48px;
                padding: 8px 10px;
                border: 1px solid #dde4e6;
                border-radius: 8px;
                background: #fafcfc;
            }

            #kx-help-training-menu .kx-help-assist-row input {
                width: 18px;
                height: 18px;
                margin: 0;
                accent-color: #397a6e;
                cursor: pointer;
            }

            #kx-help-training-menu .kx-help-assist-copy {
                min-width: 0;
                display: flex;
                flex-direction: column;
                gap: 1px;
                cursor: pointer;
            }

            #kx-help-training-menu .kx-help-assist-copy strong { font-size: 12px; }
            #kx-help-training-menu .kx-help-assist-copy small { color: #70848c; font-size: 10px; line-height: 1.3; }

            @media (max-width: 767px) {
                #kx-temp-lists-panel { width: 100vw; }
                #kx-temp-lists-panel .kx-tl-actions { grid-template-columns: 1fr; }
                #kx-temp-lists-panel .kx-tl-action.is-wide { grid-column: auto; }
                #kx-temp-lists-panel .kx-transfer-manager { grid-template-columns: auto auto 1fr; }
                #kx-temp-lists-panel .kx-transfer-manager select { grid-column: 1 / -1; }
                #kx-temp-lists-panel .kx-transfer-btn[data-transfer-action] { min-width: 0; }
                body.kx-search-results-page .kx-notice-head-tools .kx-temp-list-toggle .kx-temp-list-label,
                body.kx-search-results-page .kxri-actions .kx-temp-list-toggle .kx-temp-list-label {
                    display: none;
                }
                .kx-temp-list-target-select { max-width: 118px; min-width: 72px; }
            }
        `;
        document.head.appendChild(style);
    }

    /* ============================================================
       TOASTS
       ============================================================ */

    function ensureToastContainer() {
        let container = document.getElementById('kx-temp-lists-toast-container');
        if (!container) {
            container = createElement('div');
            container.id = 'kx-temp-lists-toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    function toast(message, type, options = {}) {
        if (!document.body) return null;
        const container = ensureToastContainer();
        const duration = Math.max(1200, Number(options.duration) || 2200);
        const el = createElement('div', `kx-tl-toast is-${type || 'info'}`);
        const messageEl = createElement('span', 'kx-toast-message', message);
        el.appendChild(messageEl);

        let closed = false;
        let closeTimer = null;
        let countdownTimer = null;

        const closeToast = () => {
            if (closed) return;
            closed = true;
            if (closeTimer) clearTimeout(closeTimer);
            if (countdownTimer) clearInterval(countdownTimer);
            el.classList.remove('is-visible');
            setTimeout(() => el.remove(), 220);
        };

        if (options.actionLabel && typeof options.onAction === 'function') {
            el.classList.add('has-action');
            const action = createElement('button', 'kx-toast-action', options.actionLabel);
            action.type = 'button';
            const timer = createElement('span', 'kx-toast-timer', `${Math.ceil(duration / 1000)} s`);
            const startedAt = Date.now();

            countdownTimer = setInterval(() => {
                const remaining = Math.max(0, Math.ceil((duration - (Date.now() - startedAt)) / 1000));
                timer.textContent = `${remaining} s`;
                if (remaining <= 0) clearInterval(countdownTimer);
            }, 250);

            action.addEventListener('click', async () => {
                if (closed || action.disabled) return;
                action.disabled = true;
                action.textContent = 'Annulation…';
                try {
                    await options.onAction();
                    closeToast();
                } catch (_) {
                    action.disabled = false;
                    action.textContent = options.actionLabel;
                }
            });
            el.append(action, timer);
        }

        container.appendChild(el);
        requestAnimationFrame(() => el.classList.add('is-visible'));
        closeTimer = setTimeout(closeToast, duration);
        return { element: el, close: closeToast };
    }



    /* ============================================================
       PANNEAU LISTES PERSONNELLES
       ============================================================ */

    function installCloudStyles() {
        if (document.getElementById('kx-personal-lists-cloud-style')) return;
        const style = document.createElement('style');
        style.id = 'kx-personal-lists-cloud-style';
        style.textContent = `
            #kx-temp-lists-panel .kx-cloud-identity { padding: 10px; border-bottom: 1px solid var(--kx-list-border); background: #fff; }
            #kx-temp-lists-panel .kx-cloud-identity-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
            #kx-temp-lists-panel .kx-cloud-identity input { min-width: 0; flex: 1; box-sizing: border-box; padding: 7px 9px; border: 1px solid #cbd5e1; border-radius: 7px; }
            #kx-temp-lists-panel .kx-cloud-identity button,
            #kx-temp-lists-panel .kx-list-manager button { min-height: 32px; border: 1px solid #cbd5e1; border-radius: 7px; background: #fff; color: #334155; cursor: pointer; font-size: 12px; }
            #kx-temp-lists-panel .kx-cloud-identity button { padding: 5px 9px; }
            #kx-temp-lists-panel .kx-cloud-identity button:hover,
            #kx-temp-lists-panel .kx-list-manager button:hover { background: #f1f5f9; }
            #kx-temp-lists-panel .kx-cloud-user { min-width: 0; flex: 1; font-size: 12px; color: #334155; overflow-wrap: anywhere; }
            #kx-temp-lists-panel .kx-cloud-user strong { color: var(--kx-list-green-dark); }
            #kx-temp-lists-panel .kx-cloud-status { margin-top: 6px; font-size: 11px; color: #64748b; line-height: 1.35; }
            #kx-temp-lists-panel .kx-cloud-status.is-error { color: #9f1d20; }
            #kx-temp-lists-panel .kx-list-manager { display: grid; grid-template-columns: minmax(0,1fr) auto auto auto; gap: 5px; margin-bottom: 8px; }
            #kx-temp-lists-panel .kx-list-manager select { min-width: 0; width: 100%; padding: 7px 8px; border: 1px solid #b9c7d3; border-radius: 7px; background: #fff; color: #1f2937; font-weight: 650; }
            #kx-temp-lists-panel .kx-list-manager button { width: 34px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
            #kx-temp-lists-panel .kx-tl-action:disabled,
            #kx-temp-lists-panel .kx-list-manager button:disabled,
            #kx-temp-lists-panel .kx-list-manager select:disabled { opacity: .48; cursor: not-allowed; }
            #kx-temp-lists-panel .kx-cloud-wait { padding: 22px 14px; text-align: center; color: #64748b; font-size: 12px; }
            #kx-temp-lists-panel .kx-cloud-list-name { font-weight: 700; }
            @media (max-width: 520px) {
                #kx-temp-lists-panel .kx-list-manager { grid-template-columns: minmax(0,1fr) auto auto auto; }
                #kx-temp-lists-panel .kx-cloud-identity-row { align-items: stretch; }
            }
        `;
        document.head.appendChild(style);
    }

    function installCompactListStyles() {
        if (document.getElementById('kx-personal-lists-compact-style')) return;
        const style = document.createElement('style');
        style.id = 'kx-personal-lists-compact-style';
        style.textContent = `
            #kx-temp-lists-panel { width: min(410px, 94vw); }
            #kx-temp-lists-panel .kx-tl-header { padding: 9px 11px; background: #fff; color: var(--kx-list-text); border-bottom: 1px solid var(--kx-list-border); }
            #kx-temp-lists-panel .kx-tl-title { font-size: 15px; color: var(--kx-list-green-dark) !important; text-shadow: none; }
            #kx-temp-lists-panel .kx-tl-subtitle { margin-top: 1px; font-size: 10px; color: #64748b !important; text-shadow: none; }
            #kx-temp-lists-panel .kx-tl-close { width: 30px; height: 30px; flex-basis: 30px; border: 0; background: transparent; color: #64748b; }
            #kx-temp-lists-panel .kx-cloud-identity { padding: 6px 9px; background: #f8fafc; }
            #kx-temp-lists-panel .kx-cloud-identity-row { flex-wrap: nowrap; }
            #kx-temp-lists-panel .kx-cloud-profile-select { min-width: 0; flex: 1; height: 30px; padding: 3px 26px 3px 7px; border: 1px solid #d7dde3; border-radius: 6px; background: #fff; font-size: 11.5px; }
            #kx-temp-lists-panel .kx-cloud-profile-add { width: 30px; min-height: 30px; padding: 0; }
            #kx-temp-lists-panel .kx-cloud-profile-create { display: flex; gap: 5px; margin-top: 5px; }
            #kx-temp-lists-panel .kx-cloud-profile-create[hidden] { display: none !important; }
            #kx-temp-lists-panel .kx-cloud-profile-create input { height: 30px; }
            #kx-temp-lists-panel .kx-cloud-status { margin-top: 4px; font-size: 10px; }
            #kx-temp-lists-panel .kx-tl-tabs { padding: 5px 8px 0; gap: 2px; }
            #kx-temp-lists-panel .kx-tl-tab { padding: 6px 7px; border-radius: 6px 6px 0 0; font-size: 11.5px; }
            #kx-temp-lists-panel .kx-tl-count { min-width: 18px; height: 18px; font-size: 10px; }
            #kx-temp-lists-panel .kx-tl-pane { padding: 7px 8px 8px; background: #fff; }
            #kx-temp-lists-panel .kx-list-manager { grid-template-columns: minmax(0,1fr) auto auto auto; margin-bottom: 5px; gap: 3px; }
            #kx-temp-lists-panel .kx-list-manager select { height: 31px; padding: 4px 7px; font-size: 12px; border-color: #cbd5e1; }
            #kx-temp-lists-panel .kx-list-manager button { width: 30px; min-height: 30px; border-color: transparent; background: transparent; }
            #kx-temp-lists-panel .kx-list-manager button:hover { border-color: #d7dde3; background: #f8fafc; }
            #kx-temp-lists-panel .kx-tl-search { height: 31px; margin-bottom: 5px; padding: 5px 8px; font-size: 12px; }
            #kx-temp-lists-panel .kx-tl-tools { margin: 0 0 5px; border: 0; }
            #kx-temp-lists-panel .kx-tl-tools > summary { display: inline-flex; align-items: center; gap: 4px; padding: 2px 3px; color: #64748b; font-size: 10.5px; cursor: pointer; user-select: none; }
            #kx-temp-lists-panel .kx-tl-tools > summary:hover { color: #334155; }
            #kx-temp-lists-panel .kx-tl-tools-body { margin-top: 4px; padding: 6px; border: 1px solid #e5e7eb; border-radius: 6px; background: #f8fafc; }
            #kx-temp-lists-panel .kx-direct-add { margin-bottom: 6px; padding: 6px; border: 1px solid #dde5ea; border-radius: 6px; background: #fff; }
            #kx-temp-lists-panel .kx-direct-add-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
            #kx-temp-lists-panel .kx-direct-add-title { color: #334155; font-size: 10.5px; font-weight: 700; }
            #kx-temp-lists-panel .kx-direct-add-hint { color: #64748b; font-size: 9.5px; line-height: 1.25; }
            #kx-temp-lists-panel .kx-direct-add-input { width: 100%; min-height: 58px; box-sizing: border-box; padding: 6px 8px; border: 1px solid #d7dde3; border-radius: 6px; background: #fff; color: #1f2937; font: inherit; font-size: 11px; line-height: 1.35; resize: vertical; }
            #kx-temp-lists-panel .kx-direct-add-input:disabled { opacity: .6; cursor: not-allowed; background: #f8fafc; }
            #kx-temp-lists-panel .kx-direct-add-actions { display: flex; align-items: center; gap: 5px; margin-top: 5px; }
            #kx-temp-lists-panel .kx-direct-add-actions .kx-direct-add-hint { min-width: 0; flex: 1; }
            #kx-temp-lists-panel .kx-direct-add-button,
            #kx-temp-lists-panel .kx-direct-paste-button { min-height: 28px; padding: 3px 9px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #334155; cursor: pointer; font-size: 10.5px; font-weight: 650; white-space: nowrap; }
            #kx-temp-lists-panel .kx-direct-add-button:hover:not(:disabled),
            #kx-temp-lists-panel .kx-direct-paste-button:hover:not(:disabled) { background: #f1f5f9; border-color: #94a3b8; }
            #kx-temp-lists-panel .kx-direct-add-button:disabled,
            #kx-temp-lists-panel .kx-direct-paste-button:disabled { opacity: .5; cursor: wait; }
            #kx-temp-lists-panel .kx-tl-actions { gap: 3px; margin-bottom: 5px; }
            #kx-temp-lists-panel .kx-tl-action { min-height: 28px; padding: 3px 5px; font-size: 10.5px; }
            #kx-temp-lists-panel .kx-transfer-manager { padding-top: 4px; gap: 3px; }
            #kx-temp-lists-panel .kx-transfer-btn, #kx-temp-lists-panel .kx-transfer-manager select { min-height: 28px; font-size: 10.5px; }
            #kx-temp-lists-panel .kx-tl-list { padding-right: 0; }
            #kx-temp-lists-panel .kx-tl-card { gap: 7px; margin: 0; padding: 7px 28px 7px 5px; border: 0; border-bottom: 1px solid #edf0f2; border-radius: 0; box-shadow: none; }
            #kx-temp-lists-panel .kx-tl-card:hover { background: #f8fafc; }
            #kx-temp-lists-panel .kx-tl-card.is-selected { background: var(--kx-list-green-soft); }
            #kx-temp-lists-panel .kx-tl-select-wrap { padding-top: 1px; }
            #kx-temp-lists-panel .kx-tl-card-title { margin-bottom: 2px; font-size: 12.5px; line-height: 1.25; }
            #kx-temp-lists-panel .kx-tl-card-meta { margin-top: 1px; font-size: 10.5px; line-height: 1.25; }
            #kx-temp-lists-panel .kx-tl-chip { margin-top: 3px; padding: 0; background: transparent; color: #94a3b8; font-size: 9.5px; font-weight: 500; }
            #kx-temp-lists-panel .kx-tl-remove { top: 5px; right: 2px; width: 24px; height: 24px; }
            #kx-temp-lists-panel .kx-tl-empty { margin: 12px 2px; padding: 16px 8px; border: 0; background: transparent; font-size: 11.5px; }
            .kx-temp-list-target-select { display: none !important; }
            /* Bouton scindé "Ajouter à la liste".
               La flèche reprend maintenant le style du bouton principal selon le contexte
               (toolbar Koha, btn-xs des exemplaires, actions KXRI) au lieu d'imposer
               une apparence unique qui créait des différences de hauteur et de bordure. */
            .kx-temp-list-split:not(.btn-group) {
                display: inline-flex !important;
                align-items: stretch !important;
                gap: 0 !important;
                margin: 0;
                padding: 0;
                vertical-align: middle;
                white-space: nowrap;
            }
            .kx-temp-list-split.btn-group {
                gap: 0 !important;
                white-space: nowrap;
                vertical-align: middle;
            }
            .kx-temp-list-split > .kx-temp-list-toggle {
                margin: 0 !important;
                border-top-right-radius: 0 !important;
                border-bottom-right-radius: 0 !important;
            }
            .kx-temp-list-split > .kx-temp-list-target-arrow {
                position: relative !important;
                z-index: 1;
                display: inline-flex !important;
                align-items: center;
                justify-content: center;
                align-self: stretch;
                width: auto;
                min-width: 22px;
                margin: 0 0 0 -1px !important;
                border-top-left-radius: 0 !important;
                border-bottom-left-radius: 0 !important;
                box-shadow: none;
                vertical-align: middle;
                cursor: pointer;
                line-height: inherit;
            }
            .kx-temp-list-split > .kx-temp-list-target-arrow.btn {
                min-width: 24px;
                padding-left: 6px !important;
                padding-right: 6px !important;
            }
            .kx-temp-list-split > .kx-temp-list-target-arrow.btn-xs {
                min-width: 20px;
                padding-left: 5px !important;
                padding-right: 5px !important;
            }
            .kxri-actions .kx-temp-list-target-arrow.kxri-action {
                min-width: 20px;
                padding-left: 4px !important;
                padding-right: 4px !important;
            }
            body.kx-search-results-page .kx-notice-head-tools .kx-temp-list-target-arrow:not(.btn):not(.kxri-action) {
                min-height: 30px;
                padding: 4px 6px !important;
                border: 1px solid #cbd5e1;
                background: #fff;
                color: #475569;
                font-size: 12px;
            }
            body.kx-search-results-page .kx-notice-head-tools .kx-temp-list-target-arrow:not(.btn):not(.kxri-action):hover:not(:disabled) {
                background: #f8fafc;
                color: #334155;
            }
            .kx-temp-list-split > .kx-temp-list-target-arrow i {
                margin: 0 !important;
                font-size: .82em;
                line-height: 1;
                pointer-events: none;
            }
            .kx-temp-list-split > .kx-temp-list-toggle.is-saved + .kx-temp-list-target-arrow {
                border-color: #4f772d !important;
                background: #edf5e7 !important;
                color: #365314 !important;
            }
            .kx-temp-list-split > .kx-temp-list-toggle.is-saved + .kx-temp-list-target-arrow:hover:not(:disabled) {
                background: #e4f0dc !important;
                color: #365314 !important;
            }
            .kx-temp-list-split > .kx-temp-list-target-arrow:focus-visible {
                z-index: 2;
                outline: 2px solid #94a3b8;
                outline-offset: -2px;
            }
            .kx-temp-list-split > .kx-temp-list-target-arrow:disabled {
                opacity: .55;
                cursor: wait;
            }
            .kx-temp-list-menu { position: fixed; z-index: 10120; min-width: 180px; max-width: min(300px, calc(100vw - 16px)); padding: 4px; border: 1px solid #cbd5e1; border-radius: 7px; background: #fff; box-shadow: 0 8px 22px rgba(15,23,42,.16); }
            .kx-temp-list-menu button { display: flex; align-items: center; gap: 6px; width: 100%; min-height: 31px; padding: 5px 7px; border: 0; border-radius: 5px; background: transparent; color: #334155; text-align: left; font-size: 11.5px; cursor: pointer; }
            .kx-temp-list-menu button:hover, .kx-temp-list-menu button.is-active { background: #f1f5f9; }
            .kx-temp-list-menu button i { width: 13px; color: var(--kx-list-green); text-align: center; }
            @media (max-width: 767px) {
                #kx-temp-lists-panel { width: 100vw; }
                .kx-temp-list-toggle .kx-temp-list-label { display: inline !important; max-width: 115px; overflow: hidden; text-overflow: ellipsis; }
            }
        `;
        document.head.appendChild(style);
    }

    function createActionButton(label, iconClass, onClick, options) {
        const button = createElement('button', 'kx-tl-action');
        button.type = 'button';
        if (options?.danger) button.classList.add('is-danger');
        if (options?.wide) button.classList.add('is-wide');
        if (iconClass) button.appendChild(icon(iconClass));
        button.appendChild(document.createTextNode(label));
        button.addEventListener('click', onClick);
        return button;
    }

    function buildIdentityArea() {
        const area = createElement('div', 'kx-cloud-identity');
        area.id = 'kx-cloud-identity';

        const row = createElement('div', 'kx-cloud-identity-row');
        const select = createElement('select', 'kx-cloud-profile-select');
        select.id = 'kx-cloud-profile-select';
        select.setAttribute('aria-label', 'Utilisateur des listes personnelles');
        select.title = 'Changer d’utilisateur';

        const add = createElement('button', 'kx-cloud-profile-add');
        add.type = 'button';
        add.title = 'Créer un nouvel utilisateur';
        add.setAttribute('aria-label', 'Créer un nouvel utilisateur');
        add.appendChild(icon('fa-solid fa-plus'));
        row.append(select, add);

        const createRow = createElement('div', 'kx-cloud-profile-create');
        createRow.hidden = true;
        const input = createElement('input');
        input.type = 'text';
        input.id = 'kx-cloud-profile-name';
        input.placeholder = 'Prénom Nom';
        input.autocomplete = 'name';
        input.maxLength = 80;
        const create = createElement('button', '', 'Créer');
        create.type = 'button';
        const cancel = createElement('button', 'is-quiet', '×');
        cancel.type = 'button';
        cancel.title = 'Annuler';
        createRow.append(input, create, cancel);

        const status = createElement('div', 'kx-cloud-status');
        status.dataset.cloudStatus = '1';
        area.append(row, createRow, status);

        select.addEventListener('change', async () => {
            const profile = state.profileDirectory.find(entry => entry.id === select.value);
            if (!profile || profile.id === state.profile?.id) return;
            await activateProfile(profile.name, { profileId: profile.id });
        });

        add.addEventListener('click', () => {
            createRow.hidden = !createRow.hidden;
            if (!createRow.hidden) requestAnimationFrame(() => input.focus());
        });
        cancel.addEventListener('click', () => { createRow.hidden = true; input.value = ''; });

        const createProfile = async () => {
            const name = sanitizeProfileName(input.value);
            if (!name) return toast('Saisissez un nom.', 'info');
            const existing = existingProfileForName(name);
            createRow.hidden = true;
            input.value = '';
            if (existing) {
                toast(`« ${existing.name} » existe déjà : ouverture de ses listes.`, 'info');
                await activateProfile(existing.name, { profileId: existing.id });
                return;
            }
            await activateProfile(name);
        };
        create.addEventListener('click', createProfile);
        input.addEventListener('keydown', event => { if (event.key === 'Enter') createProfile(); });
        return area;
    }

    function createPanel() {
        if (document.getElementById('kx-temp-lists-panel')) return;
        const panel = createElement('aside');
        panel.id = 'kx-temp-lists-panel';
        panel.setAttribute('aria-label', 'Listes personnelles de notices et exemplaires');
        panel.setAttribute('aria-hidden', 'true');

        const header = createElement('div', 'kx-tl-header');
        const headerMain = createElement('div', 'kx-tl-header-main');
        const title = createElement('h2', 'kx-tl-title', 'Listes personnelles');
        const subtitle = createElement('div', 'kx-tl-subtitle', '');
        subtitle.dataset.cloudSubtitle = '1';
        headerMain.append(title, subtitle);
        const close = createElement('button', 'kx-tl-close', '×');
        close.type = 'button';
        close.title = 'Fermer';
        close.setAttribute('aria-label', 'Fermer les listes personnelles');
        close.addEventListener('click', () => setPanelOpen(false));
        header.append(headerMain, close);

        const identity = buildIdentityArea();

        const tabs = createElement('div', 'kx-tl-tabs');
        const noticesTab = createElement('button', 'kx-tl-tab');
        noticesTab.type = 'button';
        noticesTab.dataset.tab = 'notices';
        noticesTab.append(icon('fa-solid fa-bookmark'), document.createTextNode(' Notices '));
        const noticesCount = createElement('span', 'kx-tl-count', '0');
        noticesCount.dataset.count = 'notices';
        noticesTab.appendChild(noticesCount);

        const itemsTab = createElement('button', 'kx-tl-tab');
        itemsTab.type = 'button';
        itemsTab.dataset.tab = 'items';
        itemsTab.append(icon('fa-solid fa-barcode'), document.createTextNode(' Exemplaires '));
        const itemsCount = createElement('span', 'kx-tl-count', '0');
        itemsCount.dataset.count = 'items';
        itemsTab.appendChild(itemsCount);

        [noticesTab, itemsTab].forEach(button => button.addEventListener('click', () => {
            state.activeTab = button.dataset.tab;
            localStorage.setItem(CONFIG.storage.activeTab, state.activeTab);
            renderPanel();
        }));
        tabs.append(noticesTab, itemsTab);

        panel.append(header, identity, tabs, buildNoticesPane(), buildItemsPane());
        document.body.appendChild(panel);
        if (localStorage.getItem(CONFIG.storage.panelOpen) === 'true') setPanelOpen(true, false);
    }

    function buildListManager(tab) {
        const manager = createElement('div', 'kx-list-manager');
        manager.dataset.listManager = tab;
        const select = createElement('select');
        select.dataset.listSelect = tab;
        select.setAttribute('aria-label', `Liste active de ${typeLabel(tab, true)}`);
        select.addEventListener('change', () => selectList(tab, select.value));

        const add = createElement('button'); add.type = 'button'; add.title = 'Créer une liste'; add.appendChild(icon('fa-solid fa-plus'));
        const rename = createElement('button'); rename.type = 'button'; rename.title = 'Renommer la liste'; rename.appendChild(icon('fa-solid fa-pen'));
        const remove = createElement('button'); remove.type = 'button'; remove.title = 'Supprimer la liste'; remove.appendChild(icon('fa-solid fa-trash-can'));
        add.addEventListener('click', () => createNamedList(tab));
        rename.addEventListener('click', () => renameActiveList(tab));
        remove.addEventListener('click', () => deleteActiveList(tab));
        manager.append(select, add, rename, remove);
        return manager;
    }

    function buildTransferManager(tab) {
        const manager = createElement('div', 'kx-transfer-manager');
        manager.dataset.transferManager = tab;

        const count = createElement('span', 'kx-transfer-count', '0 sélection');
        count.dataset.selectionCount = '1';

        const all = createElement('button', 'kx-transfer-btn', 'Tout');
        all.type = 'button';
        all.title = 'Sélectionner tous les éléments actuellement affichés';
        all.addEventListener('click', () => selectVisibleEntries(tab));

        const none = createElement('button', 'kx-transfer-btn', 'Aucun');
        none.type = 'button';
        none.title = 'Désélectionner tous les éléments';
        none.addEventListener('click', () => clearSelection(tab));

        const destination = createElement('select');
        destination.dataset.transferDestination = tab;
        destination.setAttribute('aria-label', `Liste de destination pour ${typeLabel(tab, true)}`);
        destination.addEventListener('change', () => {
            state.transferTargetIds[tab] = destination.value;
            renderTransferManager(tab);
        });

        const copy = createElement('button', 'kx-transfer-btn', 'Copier');
        copy.type = 'button';
        copy.dataset.transferAction = 'copy';
        copy.title = 'Copier la sélection dans la liste choisie';
        copy.addEventListener('click', () => transferSelectedEntries(tab, 'copy'));

        const move = createElement('button', 'kx-transfer-btn is-primary', 'Déplacer');
        move.type = 'button';
        move.dataset.transferAction = 'move';
        move.title = 'Déplacer la sélection vers la liste choisie';
        move.addEventListener('click', () => transferSelectedEntries(tab, 'move'));

        manager.append(count, all, none, destination, copy, move);
        return manager;
    }

    function buildDirectAddBlock(tab) {
        const wrap = createElement('div', 'kx-direct-add');
        wrap.dataset.directAddFor = tab;

        const head = createElement('div', 'kx-direct-add-head');
        head.appendChild(createElement('div', 'kx-direct-add-title', tab === 'items'
            ? 'Ajouter des exemplaires par code-barres / itemnumber'
            : 'Ajouter des notices par n°'));
        head.appendChild(createElement('div', 'kx-direct-add-hint', tab === 'items'
            ? 'Un identifiant par ligne, ou séparés par virgules / point-virgules.'
            : 'Biblionumber ou lien Koha, un par ligne.'));

        const textarea = createElement('textarea', 'kx-direct-add-input');
        textarea.dataset.directAddInput = tab;
        textarea.rows = 3;
        textarea.placeholder = tab === 'items'
            ? 'Ex. 20000000017108\n123456\n20000000018234'
            : 'Ex. 444365\nhttps://koha.../detail.pl?biblionumber=444365';

        const actions = createElement('div', 'kx-direct-add-actions');
        const helper = createElement('div', 'kx-direct-add-hint', tab === 'items'
            ? `Titre et couverture récupérés quand possible · ${CONFIG.limits.entriesPerList} max.`
            : `Titre et couverture récupérés quand possible · ${CONFIG.limits.entriesPerList} max.`);

        const paste = createElement('button', 'kx-direct-paste-button');
        paste.type = 'button';
        paste.dataset.directPasteButton = tab;
        paste.title = 'Coller le contenu du presse-papiers dans cette zone';
        paste.appendChild(icon('fa-solid fa-paste'));
        paste.appendChild(document.createTextNode(' Coller'));
        paste.addEventListener('click', () => pasteDirectAddInput(tab));

        const button = createElement('button', 'kx-direct-add-button');
        button.type = 'button';
        button.dataset.directAddButton = tab;
        button.appendChild(icon('fa-solid fa-plus'));
        button.appendChild(document.createTextNode(' Ajouter'));
        button.addEventListener('click', () => handleDirectAdd(tab));
        actions.append(helper, paste, button);

        wrap.append(head, textarea, actions);
        return wrap;
    }

    function buildToolsBlock(tab, actions, transfer, directAdd) {
        const details = createElement('details', 'kx-tl-tools');
        details.dataset.toolsFor = tab;
        const summary = createElement('summary', '', 'Outils');
        summary.title = 'Import, export, ajout manuel, copie, déplacement et vidage';
        const body = createElement('div', 'kx-tl-tools-body');
        if (directAdd) body.appendChild(directAdd);
        body.append(actions, transfer);
        details.append(summary, body);
        return details;
    }

    function buildNoticesPane() {
        const pane = createElement('section', 'kx-tl-pane');
        pane.dataset.pane = 'notices';
        const search = createElement('input', 'kx-tl-search');
        search.type = 'search'; search.placeholder = 'Filtrer les notices…'; search.value = state.noticeQuery;
        search.addEventListener('input', () => { state.noticeQuery = search.value; renderNoticeList(); renderTransferManager('notices'); });
        const actions = createElement('div', 'kx-tl-actions');
        actions.append(
            createActionButton('Exporter', 'fa-solid fa-download', exportNotices),
            createActionButton('Copier les n°', 'fa-solid fa-copy', copyBiblionumbers),
            createActionButton('Importer', 'fa-solid fa-upload', () => document.getElementById('kx-tl-import-notices')?.click()),
            createActionButton('Vider', 'fa-solid fa-trash-can', () => clearList('notices'), { danger: true })
        );
        const input = createElement('input');
        input.id = 'kx-tl-import-notices'; input.type = 'file'; input.accept = '.json,.txt,application/json,text/plain'; input.hidden = true;
        input.addEventListener('change', importNoticesFile);
        const list = createElement('div', 'kx-tl-list'); list.dataset.list = 'notices';
        pane.append(buildListManager('notices'), search, buildToolsBlock('notices', actions, buildTransferManager('notices'), buildDirectAddBlock('notices')), input, list);
        return pane;
    }

    function buildItemsPane() {
        const pane = createElement('section', 'kx-tl-pane');
        pane.dataset.pane = 'items';
        const search = createElement('input', 'kx-tl-search');
        search.type = 'search'; search.placeholder = 'Filtrer les exemplaires…'; search.value = state.itemQuery;
        search.addEventListener('input', () => { state.itemQuery = search.value; renderItemList(); renderTransferManager('items'); });
        const actions = createElement('div', 'kx-tl-actions');
        actions.append(
            createActionButton('Exporter CSV', 'fa-solid fa-download', exportItems),
            createActionButton('Copier codes-barres', 'fa-solid fa-barcode', copyBarcodes),
            createActionButton('Copier n° exemplaires', 'fa-solid fa-copy', copyItemNumbers, { wide: true }),
            createActionButton('Importer', 'fa-solid fa-upload', () => document.getElementById('kx-tl-import-items')?.click()),
            createActionButton('Vider', 'fa-solid fa-trash-can', () => clearList('items'), { danger: true })
        );
        const input = createElement('input');
        input.id = 'kx-tl-import-items'; input.type = 'file'; input.accept = '.csv,.txt,.json,text/csv,text/plain,application/json'; input.hidden = true;
        input.addEventListener('change', importItemsFile);
        const list = createElement('div', 'kx-tl-list'); list.dataset.list = 'items';
        pane.append(buildListManager('items'), search, buildToolsBlock('items', actions, buildTransferManager('items'), buildDirectAddBlock('items')), input, list);
        return pane;
    }

    function setPanelOpen(open, persist = true) {
        const panel = document.getElementById('kx-temp-lists-panel');
        if (!panel) return;
        panel.classList.toggle('is-open', !!open);
        panel.setAttribute('aria-hidden', open ? 'false' : 'true');
        if (persist) localStorage.setItem(CONFIG.storage.panelOpen, open ? 'true' : 'false');
    }

    function togglePanel() {
        const panel = document.getElementById('kx-temp-lists-panel');
        if (panel) setPanelOpen(!panel.classList.contains('is-open'));
    }
    window.toggleSidebar5 = togglePanel;

    function renderIdentityArea() {
        const area = document.getElementById('kx-cloud-identity');
        if (!area) return;
        const select = area.querySelector('#kx-cloud-profile-select');
        const status = area.querySelector('[data-cloud-status]');
        const subtitle = document.querySelector('#kx-temp-lists-panel [data-cloud-subtitle]');

        if (select) {
            const selectedId = state.profile?.id || '';
            select.replaceChildren();
            if (!state.profileDirectory.length) {
                const option = createElement('option', '', state.firebaseStatus === 'loading' ? 'Chargement…' : 'Aucun utilisateur');
                option.value = '';
                select.appendChild(option);
            } else {
                if (!selectedId) {
                    const placeholder = createElement('option', '', 'Choisir un utilisateur…');
                    placeholder.value = '';
                    placeholder.selected = true;
                    select.appendChild(placeholder);
                }
                state.profileDirectory.forEach(profile => {
                    const option = createElement('option', '', profile.name);
                    option.value = profile.id;
                    if (profile.id === selectedId) option.selected = true;
                    select.appendChild(option);
                });
            }
            select.disabled = state.firebaseStatus === 'loading' || state.firebaseStatus === 'loading-data';
        }

        let message = state.identityMessage || '';
        if (!message) {
            if (state.firebaseStatus === 'loading') message = 'Connexion…';
            else if (state.firebaseStatus === 'loading-data') message = 'Synchronisation…';
            else if (state.firebaseStatus === 'needs-profile') message = 'Choisissez un utilisateur.';
            else if (state.firebaseStatus === 'error') message = state.firebaseError || 'Erreur Firebase.';
        }
        if (status) {
            status.textContent = message;
            status.hidden = !message;
            status.classList.toggle('is-error', state.firebaseStatus === 'error');
        }
        if (subtitle) subtitle.textContent = state.profile ? state.profile.name : '';
    }

    function renderListManager(tab) {
        const manager = document.querySelector(`[data-list-manager="${tab}"]`);
        if (!manager) return;
        const select = manager.querySelector('select');
        const buttons = manager.querySelectorAll('button');
        const lists = listsOfType(tab);
        const enabled = canUseCloud();
        select.replaceChildren();
        if (!lists.length) {
            const option = createElement('option', '', enabled ? 'Aucune liste' : 'Choisissez votre nom');
            option.value = '';
            select.appendChild(option);
        } else {
            lists.forEach(list => {
                const option = createElement('option', '', list.name || 'Liste sans nom');
                option.value = list.id;
                if (list.id === state.activeListIds[tab]) option.selected = true;
                select.appendChild(option);
            });
        }
        select.disabled = !enabled || !lists.length;
        buttons.forEach(button => button.disabled = !enabled);
        const listLimitReached = state.lists.length >= CONFIG.limits.listsPerUser;
        if (buttons[0]) {
            buttons[0].disabled = !enabled || listLimitReached;
            buttons[0].title = listLimitReached
                ? `Limite atteinte : ${CONFIG.limits.listsPerUser} listes maximum par utilisateur`
                : `Créer une liste · ${state.lists.length}/${CONFIG.limits.listsPerUser}`;
        }
        if (buttons[1]) buttons[1].disabled = !enabled || !activeList(tab);
        if (buttons[2]) buttons[2].disabled = !enabled || lists.length <= 1 || !activeList(tab);
    }

    function renderTransferManager(tab) {
        const manager = document.querySelector(`[data-transfer-manager="${tab}"]`);
        if (!manager) return;

        pruneSelection(tab);
        const count = selectedSet(tab).size;
        const countEl = manager.querySelector('[data-selection-count]');
        if (countEl) countEl.textContent = `${count} sélection${count > 1 ? 's' : ''}`;

        const destination = manager.querySelector('select');
        const targets = otherListsOfType(tab);
        const currentTarget = targets.some(list => list.id === state.transferTargetIds[tab])
            ? state.transferTargetIds[tab]
            : (targets[0]?.id || '');
        state.transferTargetIds[tab] = currentTarget;

        destination.replaceChildren();
        if (!targets.length) {
            const option = createElement('option', '', 'Créez une autre liste…');
            option.value = '';
            destination.appendChild(option);
        } else {
            targets.forEach(list => {
                const option = createElement('option', '', `Vers : ${list.name || 'Liste sans nom'}`);
                option.value = list.id;
                if (list.id === currentTarget) option.selected = true;
                destination.appendChild(option);
            });
        }

        const cloudReady = canUseCloud();
        const hasEntries = (state[tab] || []).length > 0;
        manager.querySelectorAll('.kx-transfer-btn').forEach(button => {
            if (button.dataset.transferAction) {
                button.disabled = !cloudReady || !count || !currentTarget;
            } else if (button.textContent === 'Tout') {
                button.disabled = !cloudReady || !filteredEntries(tab).length;
            } else {
                button.disabled = !cloudReady || !count;
            }
        });
        destination.disabled = !cloudReady || !targets.length || !hasEntries;
    }

    function renderPanel() {
        const panel = document.getElementById('kx-temp-lists-panel');
        if (!panel) return;
        renderIdentityArea();
        panel.querySelectorAll('.kx-tl-tab').forEach(tab => tab.classList.toggle('is-active', tab.dataset.tab === state.activeTab));
        panel.querySelectorAll('.kx-tl-pane').forEach(pane => pane.classList.toggle('is-active', pane.dataset.pane === state.activeTab));
        const noticeCount = panel.querySelector('[data-count="notices"]');
        const itemCount = panel.querySelector('[data-count="items"]');
        if (noticeCount) noticeCount.textContent = String(state.notices.length);
        if (itemCount) itemCount.textContent = String(state.items.length);
        renderListManager('notices');
        renderListManager('items');
        renderTransferManager('notices');
        renderTransferManager('items');
        renderDirectAddBlock('notices');
        renderDirectAddBlock('items');
        renderNoticeList();
        renderItemList();
        panel.querySelectorAll('.kx-tl-action').forEach(button => button.disabled = !canUseCloud() || !activeList(button.closest('[data-pane]')?.dataset.pane || state.activeTab));
    }

    function renderNoticeList() {
        const list = document.querySelector('#kx-temp-lists-panel [data-list="notices"]');
        if (!list) return;
        list.replaceChildren();
        if (!canUseCloud()) {
            list.appendChild(createElement('div', 'kx-tl-empty', state.firebaseStatus === 'loading-data' ? 'Synchronisation…' : 'Choisissez votre nom pour afficher vos listes.'));
            return;
        }
        const filtered = filteredEntries('notices');
        if (!filtered.length) {
            list.appendChild(createElement('div', 'kx-tl-empty', state.notices.length ? 'Aucune notice ne correspond au filtre.' : 'Cette liste est vide.'));
            return;
        }
        filtered.forEach(notice => list.appendChild(createNoticeCard(notice)));
    }

    function createNoticeCard(notice) {
        const card = createElement('div', 'kx-tl-card');
        const entryId = entryIdFor('notices', notice);
        const selected = selectedSet('notices').has(entryId);
        card.classList.toggle('is-selected', selected);
        card.dataset.entryId = entryId;
        const selectWrap = createElement('label', 'kx-tl-select-wrap');
        const checkbox = createElement('input', 'kx-tl-select');
        checkbox.type = 'checkbox';
        checkbox.checked = selected;
        checkbox.setAttribute('aria-label', `Sélectionner ${notice.title || `la notice ${notice.biblionumber || ''}`}`);
        checkbox.addEventListener('change', () => setEntrySelected('notices', notice, checkbox.checked, card));
        selectWrap.appendChild(checkbox);
        card.appendChild(selectWrap);
        appendResolvedCover(card, notice);
        const body = createElement('div', 'kx-tl-card-body');
        const displayTitle = cleanText(notice.title) && !/^Notice\s*#?\d+$/i.test(cleanText(notice.title)) ? cleanText(notice.title) : 'Titre non renseigné';
        const title = notice.link ? createElement('a', 'kx-tl-card-title', displayTitle) : createElement('div', 'kx-tl-card-title', displayTitle);
        if (notice.link) title.href = notice.link;
        body.appendChild(title);
        if (notice.subtitle) body.appendChild(createElement('div', 'kx-tl-card-meta', notice.subtitle));
        if (notice.author) body.appendChild(createElement('div', 'kx-tl-card-meta', notice.author));
        if (notice.editor) body.appendChild(createElement('div', 'kx-tl-card-meta', notice.editor));
        if (notice.biblionumber) body.appendChild(createElement('span', 'kx-tl-chip', `Notice ${notice.biblionumber}`));
        const remove = createElement('button', 'kx-tl-remove', '×'); remove.type = 'button'; remove.title = 'Retirer de la liste';
        remove.addEventListener('click', () => toggleNotice(notice));
        card.append(body, remove); return card;
    }

    function renderItemList() {
        const list = document.querySelector('#kx-temp-lists-panel [data-list="items"]');
        if (!list) return;
        list.replaceChildren();
        if (!canUseCloud()) {
            list.appendChild(createElement('div', 'kx-tl-empty', state.firebaseStatus === 'loading-data' ? 'Synchronisation…' : 'Choisissez votre nom pour afficher vos listes.'));
            return;
        }
        const filtered = filteredEntries('items');
        if (!filtered.length) {
            list.appendChild(createElement('div', 'kx-tl-empty', state.items.length ? 'Aucun exemplaire ne correspond au filtre.' : 'Cette liste est vide.'));
            return;
        }
        filtered.forEach(item => list.appendChild(createItemCard(item)));
    }

    function createItemCard(item) {
        const card = createElement('div', 'kx-tl-card');
        const entryId = entryIdFor('items', item);
        const selected = selectedSet('items').has(entryId);
        card.classList.toggle('is-selected', selected);
        card.dataset.entryId = entryId;
        const selectWrap = createElement('label', 'kx-tl-select-wrap');
        const checkbox = createElement('input', 'kx-tl-select');
        checkbox.type = 'checkbox';
        checkbox.checked = selected;
        checkbox.setAttribute('aria-label', `Sélectionner l’exemplaire ${item.codeBarre || item.itemNumber || ''}`);
        checkbox.addEventListener('change', () => setEntrySelected('items', item, checkbox.checked, card));
        selectWrap.appendChild(checkbox);
        card.appendChild(selectWrap);
        appendResolvedCover(card, item);
        const body = createElement('div', 'kx-tl-card-body');
        const link = itemDetailLink(item);
        const title = link ? createElement('a', 'kx-tl-card-title', item.title || `Exemplaire ${item.itemNumber}`) : createElement('div', 'kx-tl-card-title', item.title || `Exemplaire ${item.itemNumber}`);
        if (link) title.href = link;
        body.appendChild(title);
        const locationBits = [item.site, item.cote].filter(Boolean);
        if (locationBits.length) body.appendChild(createElement('div', 'kx-tl-card-meta', locationBits.join(' • ')));
        if (item.type) body.appendChild(createElement('div', 'kx-tl-card-meta', item.type));
        const identifiers = [];
        if (item.codeBarre) identifiers.push(`CB ${item.codeBarre}`);
        if (item.itemNumber) identifiers.push(`Ex. ${item.itemNumber}`);
        if (identifiers.length) body.appendChild(createElement('div', 'kx-tl-card-meta', identifiers.join(' • ')));
        const remove = createElement('button', 'kx-tl-remove', '×'); remove.type = 'button'; remove.title = 'Retirer de la liste';
        remove.addEventListener('click', () => toggleItem(item));
        card.append(body, remove); return card;
    }

    /* ============================================================
       IMPORT / COLLAGE CONTRÔLÉ
       ============================================================ */

    function reviewIssueLabel(reason) {
        const labels = {
            invalid: 'Identifiant invalide ou ligne inexploitable',
            duplicate_input: 'Doublon dans les données fournies',
            already_present: 'Déjà présent dans la liste',
            capacity: `Non ajouté : limite de ${CONFIG.limits.entriesPerList} éléments`,
            unresolved: 'Identifiant non résolu dans Koha',
            partial: 'Ajoutable, mais métadonnées incomplètes',
            excluded_by_user: 'Exclu manuellement avant validation'
        };
        return labels[reason] || reason || 'Non ajouté';
    }

    function closeImportReview(result = null) {
        const backdrop = document.querySelector('.kx-import-review-backdrop');
        if (backdrop) backdrop.remove();
        state.importReviewOpen = false;
        const resolver = window.__KX_IMPORT_REVIEW_RESOLVE__;
        window.__KX_IMPORT_REVIEW_RESOLVE__ = null;
        if (typeof resolver === 'function') resolver(result);
    }

    function reviewProblemsText(problems) {
        return (problems || []).map(problem => `${cleanText(problem.input)}\t${reviewIssueLabel(problem.reason)}`).join('\n');
    }

    async function showImportReview(tab, list, analysis) {
        if (state.importReviewOpen) closeImportReview(null);
        state.importReviewOpen = true;
        return new Promise(resolve => {
            window.__KX_IMPORT_REVIEW_RESOLVE__ = resolve;
            const backdrop = createElement('div', 'kx-import-review-backdrop');
            const box = createElement('div', 'kx-import-review');
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-modal', 'true');
            box.setAttribute('aria-label', 'Contrôle avant import');

            const title = createElement('h3', '', `Contrôle avant import — ${list.name}`);
            const sub = createElement('div', 'kx-review-sub', `${analysis.sourceLabel} · liste de ${typeLabel(tab, true)} · ${analysis.currentCount}/${CONFIG.limits.entriesPerList} actuellement`);
            const grid = createElement('div', 'kx-review-grid');
            const stats = [
                [analysis.totalInput, 'Prévus'],
                [analysis.validUnique, 'Identifiants exploitables'],
                [analysis.alreadyPresent.length, 'Déjà présents'],
                [analysis.invalid.length + analysis.duplicateInput.length, 'À contrôler']
            ];
            stats.forEach(([value,label]) => {
                const card=createElement('div','kx-review-stat');
                card.append(createElement('strong','',String(value)),createElement('span','',label));
                grid.appendChild(card);
            });

            const modeBox = createElement('div','kx-review-mode');
            const addLabel = createElement('label');
            const addRadio = createElement('input'); addRadio.type='radio'; addRadio.name='kx-review-mode'; addRadio.value='add'; addRadio.checked=true;
            addLabel.append(addRadio, document.createTextNode(' Ajouter au contenu existant'));
            const replaceLabel = createElement('label');
            const replaceRadio = createElement('input'); replaceRadio.type='radio'; replaceRadio.name='kx-review-mode'; replaceRadio.value='replace';
            replaceLabel.append(replaceRadio, document.createTextNode(' Remplacer entièrement la liste'));
            modeBox.append(addLabel, replaceLabel);
            if (!analysis.currentCount) modeBox.hidden = true;

            const summary = createElement('div','kx-review-sub');

            // Prévisualisation réelle des éléments reconnus : rien n'est écrit tant que
            // l'utilisateur n'a pas validé cette liste. Tous sont sélectionnés par défaut.
            const previewWrap = createElement('div','kx-review-preview');
            const previewHead = createElement('div','kx-review-preview-head');
            const previewTitle = createElement('strong','','Éléments reconnus — à vérifier avant validation');
            const previewActions = createElement('div','kx-review-preview-actions');
            const selectAllBtn = createElement('button','','Tout'); selectAllBtn.type='button';
            const selectNoneBtn = createElement('button','','Aucun'); selectNoneBtn.type='button';
            previewActions.append(selectAllBtn,selectNoneBtn); previewHead.append(previewTitle,previewActions);
            const previewList = createElement('div','kx-review-preview-list');
            previewWrap.append(previewHead,previewList);
            const selectedImportIds = new Set(analysis.uniqueRecords.map(r=>entryIdFor(tab,r.entry)));

            function renderPreview(){
                previewList.replaceChildren();
                if(!analysis.uniqueRecords.length){
                    previewList.appendChild(createElement('div','kx-review-problem','Aucun élément reconnu.'));
                    return;
                }
                analysis.uniqueRecords.forEach(record=>{
                    const id=entryIdFor(tab,record.entry);
                    const row=createElement('div','kx-review-preview-row');
                    row.classList.toggle('is-excluded',!selectedImportIds.has(id));
                    const check=createElement('input','kx-review-preview-check');
                    check.type='checkbox'; check.checked=selectedImportIds.has(id);
                    check.setAttribute('aria-label',`Importer ${record.entry.title||record.input||id}`);
                    check.addEventListener('change',()=>{
                        if(check.checked) selectedImportIds.add(id); else selectedImportIds.delete(id);
                        row.classList.toggle('is-excluded',!check.checked);
                        renderPlan();
                    });
                    let cover;
                    if(record.entry.imgSrc){
                        cover=createElement('img','kx-review-preview-cover'); cover.src=record.entry.imgSrc; cover.alt=''; cover.loading='lazy';
                        cover.addEventListener('error',()=>{ const ph=createElement('div','kx-review-preview-cover-placeholder','•'); cover.replaceWith(ph); });
                    } else cover=createElement('div','kx-review-preview-cover-placeholder','•');
                    const main=createElement('div','kx-review-preview-main');
                    const fallbackTitle=tab==='items'
                        ? `Exemplaire ${record.entry.codeBarre||record.entry.itemNumber||record.input}`
                        : `Notice ${record.entry.biblionumber||record.input}`;
                    main.appendChild(createElement('div','kx-review-preview-title',cleanText(record.entry.title)||fallbackTitle));
                    const meta=[];
                    if(tab==='notices'){
                        if(record.entry.author) meta.push(record.entry.author);
                        if(record.entry.editor) meta.push(record.entry.editor);
                    } else {
                        if(record.entry.site) meta.push(record.entry.site);
                        if(record.entry.cote) meta.push(record.entry.cote);
                        if(record.entry.type) meta.push(record.entry.type);
                    }
                    if(meta.length) main.appendChild(createElement('div','kx-review-preview-meta',meta.join(' • ')));
                    const idText=tab==='items'
                        ? [record.entry.codeBarre?`CB ${record.entry.codeBarre}`:'',record.entry.itemNumber?`Ex. ${record.entry.itemNumber}`:'',record.entry.biblionumber?`Notice ${record.entry.biblionumber}`:''].filter(Boolean).join(' • ')
                        : `Notice ${record.entry.biblionumber||record.input}`;
                    if(idText) main.appendChild(createElement('span','kx-review-preview-id',idText));
                    if(record.warning) main.appendChild(createElement('span','kx-review-preview-warning',reviewIssueLabel(record.warning)));
                    row.append(check,cover,main); previewList.appendChild(row);
                });
            }
            selectAllBtn.addEventListener('click',()=>{ analysis.uniqueRecords.forEach(r=>selectedImportIds.add(entryIdFor(tab,r.entry))); renderPreview(); renderPlan(); });
            selectNoneBtn.addEventListener('click',()=>{ selectedImportIds.clear(); renderPreview(); renderPlan(); });

            const problemsWrap = createElement('div','kx-review-problems');
            const problemsHead = createElement('div','kx-review-problems-head');
            const problemsTitle = createElement('strong','','Éléments à contrôler');
            const problemActions = createElement('div');
            const copyBtn = createElement('button','','Copier'); copyBtn.type='button';
            const exportBtn = createElement('button','','Exporter'); exportBtn.type='button';
            problemActions.append(copyBtn,exportBtn); problemsHead.append(problemsTitle,problemActions);
            const problemsList = createElement('div','kx-review-problems-list');
            problemsWrap.append(problemsHead,problemsList);

            const actions=createElement('div','kx-review-actions');
            const cancel=createElement('button','','Annuler'); cancel.type='button';
            const confirm=createElement('button','is-primary','Valider'); confirm.type='button';
            actions.append(cancel,confirm);

            function currentMode(){ return analysis.currentCount && replaceRadio.checked ? 'replace' : 'add'; }
            function computeModePlan(){
                const mode=currentMode();
                const excluded=analysis.uniqueRecords.filter(r=>!selectedImportIds.has(entryIdFor(tab,r.entry))).map(r=>({input:r.input,reason:'excluded_by_user'}));
                const baseProblems=[...analysis.invalid,...analysis.duplicateInput,...excluded];
                const uniqueRecords=analysis.uniqueRecords.filter(r=>selectedImportIds.has(entryIdFor(tab,r.entry)));
                if(mode==='replace'){
                    const acceptedRecords=uniqueRecords.slice(0,CONFIG.limits.entriesPerList);
                    const rejectedRecords=uniqueRecords.slice(CONFIG.limits.entriesPerList).map(r=>({input:r.input,reason:'capacity'}));
                    return {mode,acceptedRecords,problems:[...baseProblems,...rejectedRecords],already:[]};
                }
                const freshRecords=uniqueRecords.filter(r=>!analysis.existingIds.has(entryIdFor(tab,r.entry)));
                const already=uniqueRecords.filter(r=>analysis.existingIds.has(entryIdFor(tab,r.entry))).map(r=>({input:r.input,reason:'already_present'}));
                const remaining=Math.max(0,CONFIG.limits.entriesPerList-analysis.currentCount);
                const acceptedRecords=freshRecords.slice(0,remaining);
                const rejectedRecords=freshRecords.slice(remaining).map(r=>({input:r.input,reason:'capacity'}));
                return {mode,acceptedRecords,problems:[...baseProblems,...already,...rejectedRecords],already};
            }
            function renderPlan(){
                const plan=computeModePlan();
                const warnings=analysis.uniqueRecords.filter(r=>r.warning).map(r=>({input:r.input,reason:r.warning}));
                const allProblems=[...plan.problems,...warnings];
                summary.textContent = plan.mode==='replace'
                    ? `${selectedImportIds.size} sélectionné(s) · ${plan.acceptedRecords.length} élément(s) seront conservés dans la liste après remplacement.`
                    : `${selectedImportIds.size} sélectionné(s) · ${plan.acceptedRecords.length} nouvel/nouveaux élément(s) seront ajoutés ; ${plan.already.length} déjà présent(s).`;
                problemsList.replaceChildren();
                if(!allProblems.length){
                    problemsList.appendChild(createElement('div','kx-review-problem','Aucun problème détecté.'));
                    problemsWrap.hidden=true;
                } else {
                    problemsWrap.hidden=false;
                    allProblems.forEach(problem=>{
                        const row=createElement('div','kx-review-problem');
                        row.append(createElement('code','',cleanText(problem.input)||'(ligne vide)'),createElement('span','',reviewIssueLabel(problem.reason)));
                        problemsList.appendChild(row);
                    });
                }
                copyBtn.disabled=!allProblems.length; exportBtn.disabled=!allProblems.length;
                copyBtn.onclick=()=>copyText(reviewProblemsText(allProblems),'Liste de contrôle copiée.');
                exportBtn.onclick=()=>downloadFile(`controle-import-${safeFilename(list.name)}.txt`,reviewProblemsText(allProblems),'text/plain;charset=utf-8');
                confirm.disabled=!plan.acceptedRecords.length && !(plan.mode==='replace' && analysis.currentCount);
                confirm.textContent=plan.mode==='replace'?'Valider et remplacer':'Valider l’import';
                box.dataset.currentPlan=JSON.stringify({mode:plan.mode});
                box.__kxPlan=plan;
            }
            addRadio.addEventListener('change',renderPlan); replaceRadio.addEventListener('change',renderPlan);
            cancel.addEventListener('click',()=>closeImportReview(null));
            confirm.addEventListener('click',()=>closeImportReview(box.__kxPlan||null));
            backdrop.addEventListener('click',e=>{ if(e.target===backdrop) closeImportReview(null); });
            document.addEventListener('keydown',function esc(e){ if(e.key==='Escape'&&document.body.contains(backdrop)){ document.removeEventListener('keydown',esc); closeImportReview(null); } });

            box.append(title,sub,grid,modeBox,summary,previewWrap,problemsWrap,actions);
            backdrop.appendChild(box); document.body.appendChild(backdrop); renderPreview(); renderPlan();
            previewList.querySelector('input')?.focus();
        });
    }

    function showPostImportReport(tab, list, sourceLabel, totalInput, mode, added, alreadyCount, problems) {
        const actionable=(problems||[]).filter(p=>p.reason!=='already_present');
        const backdrop=createElement('div','kx-import-review-backdrop');
        const box=createElement('div','kx-import-review');
        box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true');
        const title=createElement('h3','',actionable.length?'Import terminé — contrôle nécessaire':'Import terminé — contrôle OK');
        const sub=createElement('div','kx-review-sub',`${sourceLabel} · ${mode==='replace'?'liste remplacée':'ajout à la liste'} « ${list.name} »`);
        const grid=createElement('div','kx-review-grid');
        [[totalInput,'Prévus'],[added,'Écrits'],[alreadyCount,'Déjà présents'],[actionable.length,'Non ajoutés']].forEach(([v,l])=>{const c=createElement('div','kx-review-stat');c.append(createElement('strong','',String(v)),createElement('span','',l));grid.appendChild(c);});
        const summary=createElement('div','kx-review-sub',actionable.length
            ? `${actionable.length} élément(s) n’ont pas été ajoutés. Vous pouvez les contrôler, les copier ou les exporter.`
            : 'Tous les éléments exploitables ont été pris en compte.');
        box.append(title,sub,grid,summary);
        if(actionable.length){
            const wrap=createElement('div','kx-review-problems');
            const head=createElement('div','kx-review-problems-head');
            head.appendChild(createElement('strong','','Non ajoutés / à contrôler'));
            const btns=createElement('div'); const copy=createElement('button','','Copier'); copy.type='button'; const exp=createElement('button','','Exporter'); exp.type='button'; btns.append(copy,exp); head.appendChild(btns);
            const listEl=createElement('div','kx-review-problems-list');
            actionable.forEach(problem=>{const row=createElement('div','kx-review-problem');row.append(createElement('code','',cleanText(problem.input)||'(ligne vide)'),createElement('span','',reviewIssueLabel(problem.reason)));listEl.appendChild(row);});
            copy.addEventListener('click',()=>copyText(reviewProblemsText(actionable),'Éléments non ajoutés copiés.'));
            exp.addEventListener('click',()=>downloadFile(`non-ajoutes-${safeFilename(list.name)}.txt`,reviewProblemsText(actionable),'text/plain;charset=utf-8'));
            wrap.append(head,listEl); box.appendChild(wrap);
        }
        const actions=createElement('div','kx-review-actions'); const close=createElement('button','is-primary','Fermer'); close.type='button'; actions.appendChild(close); box.appendChild(actions);
        close.addEventListener('click',()=>backdrop.remove()); backdrop.addEventListener('click',e=>{if(e.target===backdrop) backdrop.remove();}); backdrop.appendChild(box); document.body.appendChild(backdrop); close.focus();
    }

    async function analyzeControlledImport(tab, sourceLabel, rawRecords) {
        const list=activeList(tab);
        if(!list) throw new Error('Aucune liste active');
        const target=await listEntryState(list.id);
        const invalid=[]; const duplicateInput=[]; const uniqueRecords=[]; const seen=new Set();
        (rawRecords||[]).forEach(record=>{
            const input=cleanText(record?.input);
            const entry=tab==='items'?normalizeItem(record?.entry):normalizeNotice(record?.entry);
            if(!entry){ invalid.push({input,reason:record?.reason||'invalid'}); return; }
            const id=entryIdFor(tab,entry);
            if(!id){ invalid.push({input,reason:'invalid'}); return; }
            if(seen.has(id)){ duplicateInput.push({input,reason:'duplicate_input'}); return; }
            seen.add(id); uniqueRecords.push({input,entry,warning:record?.warning||''});
        });
        const alreadyPresent=uniqueRecords.filter(r=>target.ids.has(entryIdFor(tab,r.entry)));
        return {sourceLabel,totalInput:(rawRecords||[]).length,validUnique:uniqueRecords.length,invalid,duplicateInput,uniqueRecords,alreadyPresent,currentCount:target.count,existingIds:target.ids};
    }

    async function replaceListEntries(tab,listId,entries){
        const normalized=normalizeEntriesForTab(tab,entries).slice(0,CONFIG.limits.entriesPerList);
        const snap=await state.fb.firestoreMod.getDocs(entriesCollection(listId));
        const {writeBatch,serverTimestamp}=state.fb.firestoreMod;
        const batch=writeBatch(state.fb.db);
        snap.docs.forEach(docSnap=>batch.delete(docSnap.ref));
        normalized.forEach(entry=>batch.set(entryDocument(listId,entryIdFor(tab,entry)),{...entry,addedAt:serverTimestamp()},{merge:true}));
        await batch.commit(); await touchList(listId);
        return normalized.length;
    }

    async function runControlledImport(tab,sourceLabel,rawRecords){
        const list=activeList(tab);
        if(!canUseCloud()||!list) return requireCloud(tab);
        const analysis=await analyzeControlledImport(tab,sourceLabel,rawRecords);
        if(!analysis.totalInput){ toast('Aucun élément à importer.','info'); return {cancelled:true}; }
        const plan=await showImportReview(tab,list,analysis);
        if(!plan) return {cancelled:true};
        const entries=plan.acceptedRecords.map(r=>r.entry);
        if(plan.mode==='replace'){
            const count=await replaceListEntries(tab,list.id,entries);
            toast(`Liste « ${list.name} » remplacée : ${count} ${typeLabel(tab,count!==1)}.`, 'success',{duration:3000});
            const alreadyCount=0;
            showPostImportReport(tab,list,sourceLabel,analysis.totalInput,'replace',count,alreadyCount,plan.problems);
            return {cancelled:false,mode:'replace',added:count,problems:plan.problems};
        }
        const result=await writeEntries(tab,list.id,entries);
        const alreadyCount=plan.already.length;
        toast(`${result.added} ${typeLabel(tab,result.added!==1)} ajouté(s) à « ${list.name} ».`, 'success',{duration:3000});
        showPostImportReport(tab,list,sourceLabel,analysis.totalInput,'add',result.added,alreadyCount,plan.problems);
        return {cancelled:false,mode:'add',added:result.added,problems:plan.problems};
    }

    /* ============================================================
       AJOUT DIRECT PAR IDENTIFIANTS
       ============================================================ */

    function directAddInput(tab) {
        return document.querySelector(`#kx-temp-lists-panel [data-direct-add-input="${tab}"]`);
    }

    function sanitizeManualItemIdentifier(value) {
        const text = cleanText(value);
        if (!text) return '';
        const match = text.match(/(?:code\s*-?barres?|barcode|item\s*number|itemnumber)\s*[:#-]?\s*([A-Za-z0-9._-]+)/i);
        return cleanText(match ? match[1] : text);
    }

    function parseNoticeIdentifiers(content) {
        return uniqueStrings(String(content || '')
            .replace(/^\uFEFF/, '')
            .split(/[\r\n,;]+/)
            .map(value => extractBiblionumber(value) || cleanText(value))
            .filter(value => /^\d+$/.test(value)));
    }

    function parseItemIdentifiers(content) {
        return uniqueStrings(String(content || '')
            .replace(/^\uFEFF/, '')
            .split(/[\r\n,;]+/)
            .map(sanitizeManualItemIdentifier)
            .filter(Boolean));
    }

    function inferredItemIdentifierType(value) {
        const text = sanitizeManualItemIdentifier(value);
        if (!text) return '';
        if (!/^\d+$/.test(text)) return 'barcode';
        return text.length >= 10 ? 'barcode' : 'itemNumber';
    }

    function minimalNoticeFromIdentifier(biblionumber) {
        const bib = cleanText(biblionumber);
        return normalizeNotice({
            biblionumber: bib,
            title: `Notice #${bib}`,
            link: detailLink(bib)
        });
    }

    function minimalItemFromIdentifier(value) {
        const text = sanitizeManualItemIdentifier(value);
        const kind = inferredItemIdentifierType(text);
        return normalizeItem(kind === 'itemNumber'
            ? { itemNumber: text, title: `Exemplaire ${text}` }
            : { codeBarre: text, title: `Exemplaire ${text}` });
    }

    async function fetchDocument(url) {
        const response = await fetch(url, { credentials: 'same-origin', redirect: 'follow' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        return new DOMParser().parseFromString(html, 'text/html');
    }

    function extractDetailNoticeFromDocument(doc, forcedBiblionumber = '') {
        const root = doc.getElementById('catalogue_detail_biblio') || doc;
        const titleLink = root.querySelector('a.titlebib, .titlemika .titlebib a, strong.titlebib a, .titlebib a, a[href*="detail.pl?biblionumber="]');
        const biblionumber = cleanText(forcedBiblionumber ||
            root.querySelector('input[name="biblionumber"]')?.value ||
            extractBiblionumber(titleLink?.href));
        const cover = doc.querySelector('#biblio-cover-slider .cover-image img[src], #biblio-cover-slider img[src], .bookcoverimg img.imgcouv[src], .bookcoverimg img[src]');

        return normalizeNotice({
            biblionumber,
            title: cleanText(titleLink?.textContent) || firstText(root, ['h1', '.titlemika', '.title']),
            subtitle: firstText(root, ['#subbib', '.subbib']),
            author: directTextWithoutChildren(root.querySelector('li[title="Zone : 700"]'), ['strong']),
            editor: directTextWithoutChildren(root.querySelector('li[title="Zone : 210"]'), ['strong']),
            link: detailLink(biblionumber),
            imgSrc: cleanText(cover?.src)
        });
    }

    function extractDetailItemFromDocument(doc, requestedItemNumber = '', requestedBarcode = '') {
        const rows = Array.from(doc.querySelectorAll('#holdings_table tbody tr'));
        let row = null;
        const wantedItemNumber = cleanText(requestedItemNumber);
        const wantedBarcode = cleanText(requestedBarcode);

        if (wantedItemNumber) {
            row = rows.find(candidate => cleanText(candidate.querySelector('input[name="itemnumber"]')?.value || candidate.dataset.itemnumber) === wantedItemNumber) || null;
        }
        if (!row && wantedBarcode) {
            row = rows.find(candidate => cleanText(getCellByDataLabel(candidate, ['barcode'], ['td.barcode'])?.textContent) === wantedBarcode) || null;
        }
        if (!row) row = rows[0] || null;
        if (!row) return null;

        const notice = extractDetailNoticeFromDocument(doc);
        const itemNumber = cleanText(row.querySelector('input[name="itemnumber"]')?.value || row.dataset.itemnumber || wantedItemNumber);
        const barcodeCell = getCellByDataLabel(row, ['barcode'], ['td.barcode']);
        const homeCell = getCellByDataLabel(row, ['homebranch'], ['td.homebranch']);
        const callCell = getCellByDataLabel(row, ['itemcallnumber'], ['td.itemcallnumber']);
        const typeCell = getCellByDataLabel(row, ['itype'], ['td.itype']);

        return normalizeItem({
            itemNumber,
            site: cleanText(homeCell?.textContent),
            cote: cleanText(callCell?.textContent),
            type: firstText(typeCell || row, ['.itypedesc', '.itypetext']) || cleanText(typeCell?.textContent),
            codeBarre: cleanText(barcodeCell?.textContent) || wantedBarcode,
            title: notice?.title || `Exemplaire ${itemNumber || wantedBarcode}` ,
            subtitle: notice?.subtitle || '',
            biblionumber: notice?.biblionumber || '',
            imgSrc: notice?.imgSrc || ''
        });
    }

    function extractItemFromSearchDocument(doc, identifier, mode) {
        const wanted = cleanText(identifier);
        const cards = Array.from(doc.querySelectorAll('.kxri-item[data-item-id], #bookbag_form .kxri-item[data-item-id]'));
        let card = null;
        if (mode === 'barcode') {
            card = cards.find(candidate => cleanText(candidate.dataset.barcode || firstText(candidate, ['.kxri-barcode'])) === wanted) || null;
        } else {
            card = cards.find(candidate => cleanText(candidate.dataset.itemId) === wanted) || null;
        }
        if (card) return extractSearchItem(card);

        const detailFallback = extractDetailItemFromDocument(doc, mode === 'itemNumber' ? wanted : '', mode === 'barcode' ? wanted : '');
        if (!detailFallback) return null;
        if (mode === 'barcode' && cleanText(detailFallback.codeBarre) !== wanted) return null;
        if (mode === 'itemNumber' && cleanText(detailFallback.itemNumber) !== wanted) return null;
        return detailFallback;
    }

    async function resolveNoticeByBiblionumber(biblionumber) {
        const bib = cleanText(biblionumber);
        if (!/^\d+$/.test(bib)) return { entry: null, enriched: false };
        try {
            const doc = await fetchDocument(detailLink(bib));
            const entry = extractDetailNoticeFromDocument(doc, bib) || minimalNoticeFromIdentifier(bib);
            return { entry, enriched: !!(entry && (entry.title || entry.author || entry.imgSrc)) };
        } catch (_) {
            return { entry: minimalNoticeFromIdentifier(bib), enriched: false };
        }
    }

    async function resolveItemByBarcode(barcode) {
        const value = sanitizeManualItemIdentifier(barcode);
        if (!value) return { entry: null, enriched: false };
        const queries = [`bc,phr:${value}`, `barcode:${value}`, value];
        for (const query of queries) {
            try {
                const doc = await fetchDocument(`${CONFIG.searchPath}?q=${encodeURIComponent(query)}`);
                const entry = extractItemFromSearchDocument(doc, value, 'barcode');
                if (entry) return { entry, enriched: !!(entry.title || entry.biblionumber || entry.imgSrc) };
            } catch (_) {}
        }
        return { entry: minimalItemFromIdentifier(value), enriched: false };
    }

    async function resolveItemByItemNumber(itemNumber) {
        const value = sanitizeManualItemIdentifier(itemNumber);
        if (!value) return { entry: null, enriched: false };
        const urls = [
            `/cgi-bin/koha/catalogue/moredetail.pl?itemnumber=${encodeURIComponent(value)}`,
            `${CONFIG.searchPath}?q=${encodeURIComponent(value)}`
        ];
        for (const url of urls) {
            try {
                const doc = await fetchDocument(url);
                const entry = url.includes('moredetail.pl')
                    ? extractDetailItemFromDocument(doc, value, '')
                    : extractItemFromSearchDocument(doc, value, 'itemNumber');
                if (entry) return { entry, enriched: !!(entry.title || entry.biblionumber || entry.imgSrc) };
            } catch (_) {}
        }
        return { entry: minimalItemFromIdentifier(value), enriched: false };
    }

    async function resolveItemByIdentifier(identifier) {
        const value = sanitizeManualItemIdentifier(identifier);
        const guessed = inferredItemIdentifierType(value);
        const attempts = guessed === 'barcode'
            ? [() => resolveItemByBarcode(value), () => resolveItemByItemNumber(value)]
            : [() => resolveItemByItemNumber(value), () => resolveItemByBarcode(value)];
        let fallback = null;
        for (const attempt of attempts) {
            const result = await attempt();
            if (!fallback && result?.entry) fallback = result;
            if (result?.entry && result.enriched) return result;
        }
        return fallback || { entry: minimalItemFromIdentifier(value), enriched: false };
    }

    async function pasteDirectAddInput(tab) {
        const input = directAddInput(tab);
        if (!input) return;
        if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function' || !window.isSecureContext) {
            toast('Le collage direct n’est pas disponible ici. Utilisez Ctrl+V dans la zone.', 'info');
            input.focus();
            return;
        }
        try {
            const value = await navigator.clipboard.readText();
            if (!cleanText(value)) {
                toast('Le presse-papiers est vide.', 'info');
                return;
            }
            input.value = value;
            input.focus();
        } catch (_) {
            toast('Le navigateur a refusé l’accès au presse-papiers. Utilisez Ctrl+V.', 'info');
            input.focus();
        }
    }

    function renderDirectAddBlock(tab) {
        const wrap = document.querySelector(`[data-direct-add-for="${tab}"]`);
        if (!wrap) return;
        const input = wrap.querySelector('[data-direct-add-input]');
        const button = wrap.querySelector('[data-direct-add-button]');
        const paste = wrap.querySelector('[data-direct-paste-button]');
        const busy = !!state.directAddBusy[tab];
        const full = activeListIsFull(tab);
        const cloudReady = canUseCloud() && !!activeList(tab);
        const enabled = cloudReady && !busy && !full;
        if (input) {
            input.disabled = !enabled;
            input.title = full ? `Liste pleine : ${CONFIG.limits.entriesPerList}/${CONFIG.limits.entriesPerList}` : '';
        }
        if (paste) {
            paste.disabled = !enabled;
            paste.title = full ? `Liste pleine : ${CONFIG.limits.entriesPerList}/${CONFIG.limits.entriesPerList}` : 'Coller depuis le presse-papiers';
        }
        if (button) {
            button.disabled = !enabled;
            button.replaceChildren();
            button.appendChild(icon(busy ? 'fa-solid fa-spinner fa-spin' : (full ? 'fa-solid fa-lock' : 'fa-solid fa-plus')));
            button.appendChild(document.createTextNode(busy ? ' Ajout…' : (full ? ' 250/250' : ' Ajouter')));
            button.title = full ? `Liste pleine : ${CONFIG.limits.entriesPerList} éléments maximum` : 'Ajouter à la liste active';
        }
    }

    async function handleDirectAdd(tab) {
        const input = directAddInput(tab);
        if (!input) return;
        const rawTokens = String(input.value || '').replace(/^\uFEFF/, '').split(/[\r\n,;]+/).map(cleanText).filter(Boolean);
        if (!rawTokens.length) {
            toast(tab === 'items' ? 'Collez au moins un code-barres ou itemnumber.' : 'Collez au moins un biblionumber valide.', 'info');
            return;
        }
        const list = activeList(tab);
        if (!canUseCloud() || !list) return requireCloud(tab);
        state.directAddBusy[tab] = true; renderDirectAddBlock(tab);
        try {
            const rawRecords=[];
            if(tab==='items'){
                const results=await mapLimit(rawTokens,4,async token=>{
                    const id=sanitizeManualItemIdentifier(token);
                    if(!id) return {input:token,entry:null,reason:'invalid'};
                    const result=await resolveItemByIdentifier(id);
                    return {input:token,entry:result?.entry||null,warning:result?.enriched?'':'partial',reason:result?.entry?'':'unresolved'};
                });
                rawRecords.push(...results);
            } else {
                const results=await mapLimit(rawTokens,4,async token=>{
                    const bib=extractBiblionumber(token)||(/^\d+$/.test(token)?token:'');
                    if(!bib) return {input:token,entry:null,reason:'invalid'};
                    const result=await resolveNoticeByBiblionumber(bib);
                    return {input:token,entry:result?.entry||null,warning:result?.enriched?'':'partial',reason:result?.entry?'':'unresolved'};
                });
                rawRecords.push(...results);
            }
            const result=await runControlledImport(tab,'Collage direct',rawRecords);
            if(result && !result.cancelled) input.value='';
        } catch(error){
            toast(firebaseErrorMessage(error),'error');
        } finally { state.directAddBusy[tab]=false; renderDirectAddBlock(tab); }
    }

    /* ============================================================
       IMPORT / EXPORT / COPIE
       ============================================================ */

    function safeFilename(value) {
        return (cleanText(value) || 'liste').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'liste';
    }

    function exportNotices() {
        const list = activeList('notices');
        const content = JSON.stringify(state.notices, null, 2);
        downloadFile(`${safeFilename(list?.name)}-notices.json`, content, 'application/json;charset=utf-8');
        toast(`${state.notices.length} notice(s) exportée(s).`, 'success');
    }

    function copyBiblionumbers() {
        const ids = state.notices.map(notice => notice.biblionumber || extractBiblionumber(notice.link)).filter(Boolean);
        copyText(ids.join('\n'), `${ids.length} numéro(s) de notice copié(s).`);
    }

    async function clearList(tab) {
        const list = activeList(tab);
        if (!canUseCloud() || !list) return requireCloud(tab);
        const count = state[tab].length;
        if (!count) return;
        if (!window.confirm(`Vider les ${count} ${typeLabel(tab, true)} de « ${list.name} » ?`)) return;
        try {
            await deleteCollectionInBatches(entriesCollection(list.id));
            await touchList(list.id);
            toast('Liste vidée.', 'info');
        } catch (error) {
            toast(firebaseErrorMessage(error), 'error');
        }
    }

    async function importNoticesFile(event) {
        const input=event.currentTarget; const file=input.files?.[0]; if(!file) return;
        const list=activeList('notices'); if(!canUseCloud()||!list){ input.value=''; return requireCloud('notices'); }
        try{
            const content=await file.text(); const records=[];
            try{
                const parsed=JSON.parse(content);
                if(Array.isArray(parsed)) parsed.forEach((raw,index)=>records.push({input:cleanText(raw?.biblionumber||raw?.link||`Ligne ${index+1}`),entry:normalizeNotice(raw),reason:normalizeNotice(raw)?'':'invalid'}));
                else throw new Error('not-array');
            } catch(_){
                const lines=String(content||'').replace(/^\uFEFF/,'').split(/\r?\n/).map(cleanText).filter(Boolean);
                const enriched=await mapLimit(lines,4,async raw=>{
                    const bib=extractBiblionumber(raw)||(/^\d+$/.test(raw)?raw:'');
                    if(!bib) return {input:raw,entry:null,reason:'invalid'};
                    const result=await resolveNoticeByBiblionumber(bib);
                    return {input:raw,entry:result?.entry||null,warning:result?.enriched?'':'partial',reason:result?.entry?'':'unresolved'};
                });
                records.push(...enriched);
            }
            await runControlledImport('notices',`Fichier ${file.name}`,records);
        } catch(error){ toast(firebaseErrorMessage(error),'error'); }
        finally{ input.value=''; }
    }

    function csvEscape(value) {
        return cleanText(value).replace(/\|/g, ' ');
    }

    function exportItems() {
        const list = activeList('items');
        const header = 'Titre|Sous-titre|Item Number|Site|Cote|Type|Code Barre|Biblionumber|Image';
        const rows = state.items.map(item => [item.title, item.subtitle, item.itemNumber, item.site, item.cote, item.type, item.codeBarre, item.biblionumber, item.imgSrc].map(csvEscape).join('|'));
        downloadFile(`${safeFilename(list?.name)}-exemplaires.csv`, [header, ...rows].join('\n'), 'text/csv;charset=utf-8');
        toast(`${state.items.length} exemplaire(s) exporté(s).`, 'success');
    }

    function copyItemNumbers() {
        const ids = state.items.map(item => item.itemNumber).filter(Boolean);
        copyText(ids.join('\n'), `${ids.length} numéro(s) d’exemplaire copié(s).`);
    }

    function copyBarcodes() {
        const barcodes = state.items.map(item => item.codeBarre).filter(Boolean);
        copyText(barcodes.join('\n'), `${barcodes.length} code(s)-barres copié(s).`);
    }

    function parseItemsDelimited(content) {
        const lines = String(content || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => cleanText(line));
        if (!lines.length) return [];
        const first = lines[0].split('|').map(value => cleanText(value).toLocaleLowerCase('fr'));
        const hasHeader = first.some(value => /titre|item|exempl|code|barre|site|cote|type|biblio/.test(value));
        const header = hasHeader ? first : [];
        const dataLines = hasHeader ? lines.slice(1) : lines;
        function indexOf(...names) {
            for (const name of names) {
                const idx = header.findIndex(value => value === name || value.includes(name));
                if (idx >= 0) return idx;
            }
            return -1;
        }
        const indexes = hasHeader ? {
            title: indexOf('titre'), subtitle: indexOf('sous-titre', 'sous titre'), itemNumber: indexOf('item number', 'numéro exemplaire', 'numero exemplaire', 'itemnumber'),
            site: indexOf('site'), cote: indexOf('cote'), type: indexOf('type'), barcode: indexOf('code barre', 'code-barres', 'barcode'), biblio: indexOf('biblionumber', 'numéro notice', 'numero notice'), image: indexOf('image', 'couverture', 'cover')
        } : null;
        return dataLines.map(line => {
            const cols = line.split('|').map(cleanText);
            if (!hasHeader) return normalizeItem({ title: cols[0], subtitle: cols[1], itemNumber: cols[2], site: cols[3], cote: cols[4], type: cols[5], codeBarre: cols[6], biblionumber: cols[7], imgSrc: cols[8] });
            const get = index => index >= 0 ? cols[index] : '';
            return normalizeItem({ title: get(indexes.title), subtitle: get(indexes.subtitle), itemNumber: get(indexes.itemNumber), site: get(indexes.site), cote: get(indexes.cote), type: get(indexes.type), codeBarre: get(indexes.barcode), biblionumber: get(indexes.biblio), imgSrc: get(indexes.image) });
        }).filter(Boolean);
    }

    async function importItemsFile(event) {
        const input=event.currentTarget; const file=input.files?.[0]; if(!file) return;
        const list=activeList('items'); if(!canUseCloud()||!list){ input.value=''; return requireCloud('items'); }
        try{
            const content=await file.text(); const records=[];
            try{
                const parsed=JSON.parse(content);
                if(Array.isArray(parsed)) parsed.forEach((raw,index)=>{
                    const entry=normalizeItem(raw); records.push({input:cleanText(raw?.codeBarre||raw?.barcode||raw?.itemNumber||raw?.itemnumber||`Ligne ${index+1}`),entry,reason:entry?'':'invalid'});
                }); else throw new Error('not-array');
            } catch(_){
                const lines=String(content||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>cleanText(line));
                const parsed=parseItemsDelimited(content);
                if(parsed.length){
                    parsed.forEach((entry,index)=>records.push({input:cleanText(entry.codeBarre||entry.itemNumber||lines[index]||`Ligne ${index+1}`),entry,reason:entry?'':'invalid'}));
                    if(lines.length>parsed.length) lines.slice(parsed.length).forEach(line=>records.push({input:cleanText(line),entry:null,reason:'invalid'}));
                } else {
                    const enriched=await mapLimit(lines,4,async line=>{
                        const id=sanitizeManualItemIdentifier(line);
                        if(!id) return {input:line,entry:null,reason:'invalid'};
                        const result=await resolveItemByIdentifier(id);
                        return {input:line,entry:result?.entry||null,warning:result?.enriched?'':'partial',reason:result?.entry?'':'unresolved'};
                    });
                    records.push(...enriched);
                }
            }
            await runControlledImport('items',`Fichier ${file.name}`,records);
        } catch(error){ toast(firebaseErrorMessage(error),'error'); }
        finally{ input.value=''; }
    }

    /* ============================================================
       BOUTONS DANS LES PAGES
       ============================================================ */

    function shortenedListName(name, max = 16) {
        const text = cleanText(name) || 'Ma liste';
        return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
    }

    function closeQuickListMenus(except) {
        document.querySelectorAll('.kx-temp-list-menu').forEach(menu => {
            if (menu !== except) menu.remove();
        });
    }

    function openQuickListMenu(anchor, tab) {
        closeQuickListMenus();
        const lists = listsOfType(tab);
        if (!lists.length) {
            requireCloud(tab);
            return;
        }
        const menu = createElement('div', 'kx-temp-list-menu');
        menu.setAttribute('role', 'menu');
        lists.forEach(list => {
            const item = createElement('button', list.id === state.activeListIds[tab] ? 'is-active' : '');
            item.type = 'button';
            item.setAttribute('role', 'menuitem');
            if (list.id === state.activeListIds[tab]) item.appendChild(icon('fa-solid fa-check'));
            item.appendChild(document.createTextNode(list.name || 'Liste sans nom'));
            item.addEventListener('click', async event => {
                event.preventDefault(); event.stopPropagation();
                menu.remove();
                if (list.id !== state.activeListIds[tab]) await selectList(tab, list.id);
            });
            menu.appendChild(item);
        });
        document.body.appendChild(menu);
        const rect = anchor.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        let left = rect.right - menuRect.width;
        left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
        let top = rect.bottom + 4;
        if (top + menuRect.height > window.innerHeight - 8) top = Math.max(8, rect.top - menuRect.height - 4);
        menu.style.left = `${Math.round(left)}px`;
        menu.style.top = `${Math.round(top)}px`;
    }

    function syncQuickTargetArrowPresentation(button, arrow) {
        if (!button || !arrow) return;

        // La flèche doit ressembler exactement au bouton principal dans son contexte.
        // On ne copie que les classes de présentation utiles afin de ne pas lui donner
        // le comportement métier du bouton principal.
        Array.from(arrow.classList).forEach(className => {
            if (className === 'btn' || className === 'kxri-action' || /^btn-/.test(className)) {
                arrow.classList.remove(className);
            }
        });

        Array.from(button.classList).forEach(className => {
            if (className === 'btn' || className === 'kxri-action' || /^btn-/.test(className)) {
                arrow.classList.add(className);
            }
        });
    }

    function ensureQuickTargetArrow(button, tab) {
        if (!button || !button.parentElement) return null;

        const originalParent = button.parentElement;
        originalParent
            .querySelectorAll(`select.kx-temp-list-target-select[data-target-tab="${tab}"]`)
            .forEach(el => el.remove());

        let split = button.closest('.kx-temp-list-split');
        let arrow = null;

        if (split) {
            arrow = split.querySelector(`button.kx-temp-list-target-arrow[data-target-tab="${tab}"]`);
        } else {
            const possibleArrow = button.nextElementSibling?.matches?.(
                `button.kx-temp-list-target-arrow[data-target-tab="${tab}"]`
            ) ? button.nextElementSibling : null;

            // Sur detail.pl, le bouton de notice est déjà placé dans un vrai .btn-group Koha.
            // On réutilise ce groupe au lieu d'ajouter un <span> intermédiaire : ainsi les
            // règles Bootstrap/Koha de la barre d'outils continuent de s'appliquer aux deux boutons.
            if (originalParent.matches('.btn-group[data-kx-temp-notice-group="1"]')) {
                split = originalParent;
                split.classList.add('kx-temp-list-split');
            } else {
                split = createElement('span', 'kx-temp-list-split');
                originalParent.insertBefore(split, button);
                split.appendChild(button);
            }

            if (possibleArrow) {
                arrow = possibleArrow;
                split.appendChild(arrow);
            }
        }

        if (!arrow) {
            arrow = createElement('button', 'kx-temp-list-target-arrow');
            arrow.type = 'button';
            arrow.dataset.targetTab = tab;
            arrow.setAttribute('aria-label', `Changer la liste cible de ${typeLabel(tab, true)}`);
            arrow.appendChild(icon('fa-solid fa-caret-down'));
            arrow.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                if (arrow.disabled) return;
                openQuickListMenu(arrow, tab);
            });
            split.appendChild(arrow);
        }

        syncQuickTargetArrowPresentation(button, arrow);
        return arrow;
    }

    function setToggleButtonState(button, saved, kind) {
        if (!button) return;
        const tab = kind === 'item' ? 'items' : 'notices';
        const list = activeList(tab);
        const switching = !!state.switchingList[tab];
        const targetArrow = ensureQuickTargetArrow(button, tab);
        if (targetArrow) {
            targetArrow.disabled = !canUseCloud() || !listsOfType(tab).length || switching;
            targetArrow.title = list ? `Liste active : ${list.name}. Changer de liste` : 'Choisir une liste';
        }

        const full = activeListIsFull(tab);
        button.classList.toggle('is-saved', !!saved && !switching);
        button.dataset.saved = saved && !switching ? '1' : '0';
        // Une liste pleine doit toujours permettre le retrait des éléments déjà présents.
        button.disabled = switching || (!!list && full && !saved);

        const label = button.querySelector('.kx-temp-list-label');
        if (label) {
            if (switching) label.textContent = 'Chargement…';
            else if (!list) label.textContent = 'Choisir une liste';
            else if (saved) label.textContent = `Retirer de · ${shortenedListName(list.name)}`;
            else if (full) label.textContent = `Liste pleine · ${shortenedListName(list.name)}`;
            else label.textContent = `Ajouter à · ${shortenedListName(list.name)}`;
        }

        const i = button.querySelector('i');
        if (i) i.className = switching
            ? 'fa-solid fa-spinner fa-spin'
            : (saved ? 'fa-solid fa-check' : 'fa-solid fa-bookmark');

        if (!canUseCloud()) button.title = 'Ouvrir les listes personnelles et choisir votre nom';
        else if (switching) button.title = 'Chargement de la liste sélectionnée';
        else if (list && full && !saved) button.title = `Liste pleine : ${CONFIG.limits.entriesPerList}/${CONFIG.limits.entriesPerList}`;
        else if (list) button.title = saved
            ? `Retirer ${kind === 'notice' ? 'cette notice' : 'cet exemplaire'} de « ${list.name} »`
            : `Ajouter ${kind === 'notice' ? 'cette notice' : 'cet exemplaire'} à « ${list.name} »`;
        else button.title = 'Choisir une liste personnelle';
        button.setAttribute('aria-pressed', saved && !switching ? 'true' : 'false');
    }

    function makeToggleButton(kind, compactClass) {
        const button = createElement('button', `kx-temp-list-toggle ${compactClass || ''}`.trim());
        button.type = 'button'; button.dataset.kxTempList = kind;
        button.append(icon('fa-solid fa-bookmark'));
        button.appendChild(createElement('span', 'kx-temp-list-label', 'Ajouter à la liste'));
        return button;
    }

    function integrateSearchPage() {
        if (window.location.pathname !== CONFIG.searchPath) return;
        document.querySelectorAll('#bookbag_form tbody tr[id^="row"]').forEach(row => {
            const notice = extractSearchNotice(row); if (!notice) return;
            let button = row.querySelector('.kx-temp-notice-btn');
            const target = row.querySelector('.kx-notice-head-tools') || row.querySelector('.kx-notice-card .hold') || row.querySelector('td:nth-child(3)');
            if (!button && target) {
                button = makeToggleButton('notice'); button.classList.add('kx-temp-notice-btn');
                button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); const current = extractSearchNotice(row); if (current) toggleNotice(current); });
                target.appendChild(button);
            }
            if (button) setToggleButtonState(button, noticeExists(notice), 'notice');
        });
        document.querySelectorAll('#bookbag_form .kxri-item[data-item-id]').forEach(card => {
            const item = extractSearchItem(card); if (!item) return;
            const target = card.querySelector('.kxri-actions'); if (!target) return;
            let button = card.querySelector('.kx-temp-item-btn');
            if (!button) {
                button = makeToggleButton('item', 'kxri-action'); button.classList.add('kx-temp-item-btn');
                button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); const current = extractSearchItem(card); if (current) toggleItem(current); });
                target.appendChild(button);
            }
            setToggleButtonState(button, itemExists(item), 'item');
            const detailsButton = target.querySelector('.kxri-toggle-details');
            if (detailsButton && detailsButton !== target.lastElementChild) target.appendChild(detailsButton);
        });
    }

    function integrateDetailPage() {
        if (window.location.pathname !== CONFIG.detailPath) return;
        const notice = extractDetailNotice();
        if (notice) {
            let button = document.getElementById('kx-temp-detail-notice-btn');
            if (!button) {
                button = makeToggleButton('notice', 'btn btn-default'); button.id = 'kx-temp-detail-notice-btn';
                button.addEventListener('click', event => { event.preventDefault(); const current = extractDetailNotice(); if (current) toggleNotice(current); });
                const toolbar = document.getElementById('toolbar');
                if (toolbar) { const group = createElement('div', 'btn-group'); group.dataset.kxTempNoticeGroup = '1'; group.appendChild(button); toolbar.appendChild(group); }
                else { const titleContainer = document.querySelector('#catalogue_detail_biblio p.first, #catalogue_detail_biblio .titlemika')?.parentElement; if (titleContainer) titleContainer.appendChild(button); }
            }
            setToggleButtonState(button, noticeExists(notice), 'notice');
        }
        document.querySelectorAll('#holdings_table tbody tr').forEach(row => {
            const item = extractDetailItem(row); if (!item) return;
            const actionsCell = row.querySelector('td.actions, td[data-label="actions"]'); if (!actionsCell) return;
            let button = row.querySelector('.kx-temp-detail-item-btn');
            if (!button) {
                button = makeToggleButton('item', 'btn btn-default btn-xs'); button.classList.add('kx-temp-detail-item-btn');
                button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); const current = extractDetailItem(row); if (current) toggleItem(current); });
                const buttonRow = createElement('div', 'kx-temp-detail-item-row'); buttonRow.appendChild(button); actionsCell.appendChild(buttonRow);
            }
            setToggleButtonState(button, itemExists(item), 'item');
        });
    }


    /* ============================================================
       NETTOYAGE DE L'ANCIEN 066 / 067
       Permet de tester le nouveau fichier avant suppression physique.
       ============================================================ */

    function cleanupLegacyUI() {
        const legacySidebar = document.getElementById('sidebar');
        if (legacySidebar && legacySidebar.id !== 'kx-temp-lists-panel') {
            const text = cleanText(legacySidebar.textContent);
            if (/Notices mises de côté|Exemplaires mis de côté/.test(text)) {
                legacySidebar.remove();
            }
        }

        // Ancien bouton notice de search.pl : cellule supplémentaire contenant uniquement le bouton rond vert.
        document.querySelectorAll('#bookbag_form tbody tr[id^="row"] button[title="Mettre de côté"]:not(.kx-temp-list-toggle)').forEach(button => {
            const cell = button.closest('td');
            if (cell && cleanText(cell.textContent) === '+') cell.remove();
            else button.remove();
        });

        // Ancien bouton notice de detail.pl.
        document.querySelectorAll('#catalogue_detail_biblio button[title="Mettre de côté"]:not(.kx-temp-list-toggle)').forEach(button => button.remove());

        // Évite les sélecteurs orphelins si un autre script reconstruit un bouton.
        document.querySelectorAll('select.kx-temp-list-target-select').forEach(select => {
            const previous = select.previousElementSibling;
            if (!(previous && previous.matches('button.kx-temp-list-toggle'))) select.remove();
        });

        // Ancien bouton exemplaire de 067.
        document.querySelectorAll('#holdings_table .add-button').forEach(button => button.remove());

        // v10.4 : la barre basse historique 066/067 est définitivement supprimée.
        document.getElementById('bottomActionBar')?.remove();
    }

    /* ============================================================
       AIDE / FORMATION — compatibilité historique sans barre basse
       ============================================================ */

    const HELP_ASSIST_KEY = 'kohaGuideAssistEnabled';

    function getHelpPageMeta() {
        try {
            if (window.KOHA_GUIDES && typeof window.KOHA_GUIDES.routeMeta === 'function') {
                return window.KOHA_GUIDES.routeMeta({
                    path: window.location.pathname || '',
                    search: window.location.search || '',
                    bodyId: document.body ? document.body.id : ''
                }) || null;
            }
        } catch (error) {
            (function(){})('[KX Lists] contexte aide', error);
        }
        return null;
    }

    function isAssistEnabled() {
        try {
            if (window.KOHA_GUIDES && window.KOHA_GUIDES.assist && typeof window.KOHA_GUIDES.assist.enabled === 'function') {
                return !!window.KOHA_GUIDES.assist.enabled();
            }
        } catch (_) {}
        return localStorage.getItem(HELP_ASSIST_KEY) === '1';
    }

    function setAssistEnabled(enabled) {
        try {
            if (window.KOHA_GUIDES && window.KOHA_GUIDES.assist && typeof window.KOHA_GUIDES.assist.setEnabled === 'function') {
                window.KOHA_GUIDES.assist.setEnabled(!!enabled);
                return;
            }
        } catch (error) {
            (function(){})('[KX Lists] accompagnement', error);
        }
        localStorage.setItem(HELP_ASSIST_KEY, enabled ? '1' : '0');
        document.dispatchEvent(new CustomEvent('koha-guides-assist-toggle', { detail: { enabled: !!enabled } }));
    }

    function closeHelpTrainingMenu() {
        const menu = document.getElementById('kx-help-training-menu');
        if (!menu) return;
        menu.hidden = true;
        const button = document.getElementById('tutoriel');
        if (button) button.setAttribute('aria-expanded', 'false');
    }

    function positionHelpTrainingMenu(menu, button) {
        if (!menu || !button) return;
        menu.hidden = false;
        menu.style.visibility = 'hidden';
        menu.style.left = '12px';
        menu.style.top = '12px';

        const buttonRect = button.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const margin = 10;
        let left = buttonRect.left + (buttonRect.width / 2) - (menuRect.width / 2);
        left = Math.max(12, Math.min(left, window.innerWidth - menuRect.width - 12));
        let top = buttonRect.top - menuRect.height - margin;
        if (top < 10) top = Math.min(window.innerHeight - menuRect.height - 10, buttonRect.bottom + margin);

        menu.style.left = `${Math.round(left)}px`;
        menu.style.top = `${Math.max(10, Math.round(top))}px`;
        menu.style.visibility = '';
    }

    function syncHelpTrainingMenu(menu) {
        if (!menu) return;
        const meta = getHelpPageMeta();
        const context = menu.querySelector('.kx-help-context');
        if (context) {
            if (meta) {
                const level = Number(meta.level || 2);
                const levelBadge = createElement('span', 'kx-help-level', `Niveau ${level}/4`);
                context.replaceChildren(
                    document.createTextNode(`${cleanText(meta.title || 'Guide de cette page')} `),
                    levelBadge
                );
            } else {
                context.textContent = 'Guide contextuel de la page active';
            }
        }
        const toggle = menu.querySelector('#kx-help-assist-toggle');
        if (toggle) toggle.checked = isAssistEnabled();
    }

    function ensureHelpTrainingMenu() {
        let menu = document.getElementById('kx-help-training-menu');
        if (menu) {
            syncHelpTrainingMenu(menu);
            return menu;
        }

        menu = createElement('div');
        menu.id = 'kx-help-training-menu';
        menu.hidden = true;
        menu.setAttribute('role', 'dialog');
        menu.setAttribute('aria-label', 'Aide et formation Koha');
        menu.innerHTML = `
            <div class="kx-help-head">
                <div>
                    <div class="kx-help-title"><i class="fa-solid fa-circle-question" aria-hidden="true"></i> Aide &amp; formation</div>
                    <div class="kx-help-context">Guide contextuel de la page active</div>
                </div>
                <button type="button" class="kx-help-close" aria-label="Fermer">×</button>
            </div>
            <div class="kx-help-actions">
                <button type="button" class="kx-help-action" data-kx-help-action="guide">
                    <i class="fa-solid fa-play" aria-hidden="true"></i>
                    <span class="kx-help-action-main"><strong>Guide de cette page</strong><small>Découvrir et comprendre l’écran actuellement ouvert.</small></span>
                </button>
                <button type="button" class="kx-help-action" data-kx-help-action="parcours">
                    <i class="fa-solid fa-book-open" aria-hidden="true"></i>
                    <span class="kx-help-action-main"><strong>Parcours de formation</strong><small>Voir tous les sujets, niveaux et accès directs disponibles.</small></span>
                </button>
                <div class="kx-help-assist-row">
                    <input type="checkbox" id="kx-help-assist-toggle">
                    <label class="kx-help-assist-copy" for="kx-help-assist-toggle"><strong>Mode accompagnement</strong><small>Afficher quelques ? contextuels pendant le travail.</small></label>
                </div>
            </div>`;
        document.body.appendChild(menu);

        menu.querySelector('.kx-help-close')?.addEventListener('click', closeHelpTrainingMenu);
        menu.querySelector('[data-kx-help-action="guide"]')?.addEventListener('click', () => {
            closeHelpTrainingMenu();
            try {
                if (window.KOHA_GUIDES && typeof window.KOHA_GUIDES.start === 'function') window.KOHA_GUIDES.start();
                else if (typeof window.startIntro === 'function') window.startIntro();
                else document.dispatchEvent(new CustomEvent('koha:startTutorial'));
            } catch (error) { (function(){})('[KX Lists] guide', error); }
        });
        menu.querySelector('[data-kx-help-action="parcours"]')?.addEventListener('click', () => {
            closeHelpTrainingMenu();
            try {
                if (window.KOHA_GUIDES && typeof window.KOHA_GUIDES.openCatalogue === 'function') {
                    window.KOHA_GUIDES.openCatalogue();
                } else {
                    document.dispatchEvent(new CustomEvent('koha:openGuideCatalogue'));
                }
            } catch (error) { (function(){})('[KX Lists] parcours', error); }
        });
        menu.querySelector('#kx-help-assist-toggle')?.addEventListener('change', event => {
            setAssistEnabled(!!event.currentTarget.checked);
        });

        if (!window.__KX_HELP_TRAINING_OUTSIDE_BOUND__) {
            window.__KX_HELP_TRAINING_OUTSIDE_BOUND__ = true;
            document.addEventListener('click', event => {
                const current = document.getElementById('kx-help-training-menu');
                if (!current || current.hidden) return;
                if (current.contains(event.target) || event.target.closest?.('#tutoriel')) return;
                closeHelpTrainingMenu();
            });
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape') closeHelpTrainingMenu();
            });
            window.addEventListener('resize', closeHelpTrainingMenu);
            window.addEventListener('scroll', closeHelpTrainingMenu, true);
            document.addEventListener('koha-guides-assist-toggle', () => {
                const current = document.getElementById('kx-help-training-menu');
                if (current) syncHelpTrainingMenu(current);
            });
        }

        syncHelpTrainingMenu(menu);
        return menu;
    }

    function toggleHelpTrainingMenu(button) {
        const menu = ensureHelpTrainingMenu();
        const opening = menu.hidden;
        if (!opening) {
            closeHelpTrainingMenu();
            return;
        }
        syncHelpTrainingMenu(menu);
        positionHelpTrainingMenu(menu, button);
        button.setAttribute('aria-expanded', 'true');
    }

    function configureHelpButton(button) {
        if (!button) return;
        button.innerHTML = '';
        button.appendChild(icon('fa-solid fa-circle-question'));
        button.appendChild(document.createTextNode(' Aide & formation'));
        button.title = 'Guides, parcours de formation et accompagnement contextuel';
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-expanded', 'false');
        if (button.dataset.kxHelpMenuBound !== '1') {
            button.dataset.kxHelpMenuBound = '1';
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                toggleHelpTrainingMenu(button);
            });
        }
    }

    /* ============================================================
       RENDU / OBSERVATION
       ============================================================ */

    function renderPageButtons() {
        cleanupLegacyUI();
        integrateSearchPage();
        integrateDetailPage();
    }

    function renderEverything() {
        renderPanel();
        renderPageButtons();

        try {
            window.dispatchEvent(new CustomEvent('pmk:personal-lists-runtime-state', {
                detail: pmkGetState()
            }));
        } catch (_) {}
    }

    function observeRelevantDom() {
        if (state.observer) return;

        const root = window.location.pathname === CONFIG.searchPath
            ? (document.getElementById('bookbag_form') || document.body)
            : window.location.pathname === CONFIG.detailPath
                ? (document.getElementById('bibliodetails') || document.body)
                : null;

        if (!root) return;

        state.observer = new MutationObserver(mutations => {
            let relevant = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes?.length || mutation.removedNodes?.length) {
                    relevant = true;
                    break;
                }
            }
            if (relevant) debounceFrame(renderPageButtons);
        });

        state.observer.observe(root, { childList: true, subtree: true });
    }

    if (!window.__KX_QUICK_LIST_MENU_BOUND__) {
        window.__KX_QUICK_LIST_MENU_BOUND__ = true;
        document.addEventListener('click', event => {
            if (!event.target.closest?.('.kx-temp-list-menu, .kx-temp-list-target-arrow')) closeQuickListMenus();
        });
        window.addEventListener('resize', () => closeQuickListMenus());
        window.addEventListener('scroll', () => closeQuickListMenus(), true);
    }


    /* ============================================================
       API PUBLIQUE PMK — PASSERELLE POUR LES AUTRES MODULES
       Ajout v10.1 — 01/10/2026

       IMPORTANT :
       - aucune authentification Firebase ;
       - aucun e-mail / mot de passe ;
       - aucun users/{uid} ;
       - le profil logique existant reste la seule identité ;
       - aucune modification du rendu ni du métier des listes.
       ============================================================ */

    function pmkPublicClone(value) {
        if (value == null) return value;
        try {
            if (typeof structuredClone === 'function') return structuredClone(value);
        } catch (_) {}
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_) {
            return value;
        }
    }

    function pmkPublicTypeToTab(type) {
        return type === 'item' || type === 'items' ? 'items' : 'notices';
    }

    async function pmkWaitUntilReady(timeoutMs = 12000) {
        const started = Date.now();

        while (Date.now() - started < timeoutMs) {
            if (state.fb && state.profile && state.firebaseStatus === 'ready') return true;

            if (state.firebaseStatus === 'error') {
                throw new Error(state.firebaseError || 'Firestore indisponible.');
            }

            await new Promise(resolve => setTimeout(resolve, 80));
        }

        return !!(state.fb && state.profile && state.firebaseStatus === 'ready');
    }

    function pmkGetProfile() {
        if (!state.profile) return null;

        return {
            id: cleanText(state.profile.id),
            profileId: cleanText(state.profile.id),
            name: cleanText(state.profile.name),
            displayName: cleanText(state.profile.name),
            canonicalName: canonicalProfileName(state.profile.name)
        };
    }

    function pmkGetProfileId() {
        return cleanText(state.profile?.id);
    }

    function pmkGetState() {
        return {
            status: state.firebaseStatus,
            error: state.firebaseError || '',
            ready: !!(state.fb && state.profile && state.firebaseStatus === 'ready'),
            profileId: pmkGetProfileId(),
            profile: pmkGetProfile(),
            activeListIds: pmkPublicClone(state.activeListIds),
            lists: pmkPublicClone(state.lists || [])
        };
    }

    async function pmkGetLists(type) {
        const ready = await pmkWaitUntilReady();
        if (!ready || !state.profile) return [];

        let lists = state.lists || [];

        if (!lists.length) {
            const snap = await state.fb.firestoreMod.getDocs(userListsCollection());
            lists = snap.docs
                .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
                .filter(list => list.type === 'notice' || list.type === 'item');
        }

        const wanted =
            type === 'notice' || type === 'notices' ? 'notice' :
            type === 'item' || type === 'items' ? 'item' :
            '';

        return pmkPublicClone(
            wanted ? lists.filter(list => list.type === wanted) : lists
        );
    }

    async function pmkGetList(listId) {
        const id = cleanText(listId);
        if (!id) return null;

        const ready = await pmkWaitUntilReady();
        if (!ready || !state.profile) return null;

        const local = (state.lists || []).find(list => list.id === id);
        if (local) return pmkPublicClone(local);

        const snap = await state.fb.firestoreMod.getDoc(listDocument(id));
        return snap.exists()
            ? pmkPublicClone({ id: snap.id, ...snap.data() })
            : null;
    }

    async function pmkGetEntries(listId) {
        const id = cleanText(listId);
        if (!id) return [];

        const ready = await pmkWaitUntilReady();
        if (!ready || !state.profile) return [];

        const list = await pmkGetList(id);
        if (!list) return [];

        const snap = await state.fb.firestoreMod.getDocs(entriesCollection(id));
        const raw = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

        if (list.type === 'item') {
            return pmkPublicClone(
                uniqueBy(
                    raw.map(normalizeItem).filter(Boolean),
                    item => item.itemNumber || `barcode:${item.codeBarre}`
                )
            );
        }

        return pmkPublicClone(
            uniqueBy(
                raw.map(normalizeNotice).filter(Boolean),
                notice => notice.biblionumber || notice.link
            )
        );
    }

    function pmkGetActiveList(type) {
        const tab = pmkPublicTypeToTab(type);
        return pmkPublicClone(activeList(tab));
    }

    function pmkGetActiveEntries(type) {
        const tab = pmkPublicTypeToTab(type);
        return pmkPublicClone(state[tab] || []);
    }

    async function pmkGetStorageContext() {
        /*
         * Expose uniquement Firestore + profil logique.
         * Aucun objet Firebase Auth n'existe dans cette branche.
         */
        const ready = await pmkWaitUntilReady();
        if (!ready || !state.fb || !state.profile) return null;

        return {
            db: state.fb.db,
            app: state.fb.app,
            firestoreMod: state.fb.firestoreMod,
            profileId: pmkGetProfileId(),
            profile: pmkGetProfile()
        };
    }

    function installPmkPublicBridge() {
        const existing = (
            window.PMKPersonalLists &&
            typeof window.PMKPersonalLists === 'object'
        ) ? window.PMKPersonalLists : {};

        Object.assign(existing, {
            runtimeVersion: '10.1-profile-bridge',
            authentication: 'none',

            get ready() {
                return !!(state.fb && state.profile && state.firebaseStatus === 'ready');
            },

            waitUntilReady: pmkWaitUntilReady,
            getProfileId: pmkGetProfileId,
            getProfile: pmkGetProfile,
            getState: pmkGetState,
            getLists: pmkGetLists,
            getList: pmkGetList,
            getEntries: pmkGetEntries,
            getActiveList: pmkGetActiveList,
            getActiveEntries: pmkGetActiveEntries,
            getStorageContext: pmkGetStorageContext,

            /*
             * Alias conservé pour compatibilité avec une première recette
             * du 142. Il renvoie exactement le même contexte SANS AUTH.
             */
            getFirestoreContext: pmkGetStorageContext
        });

        window.PMKPersonalLists = existing;

        try {
            window.dispatchEvent(new CustomEvent('pmk:personal-lists-runtime-ready', {
                detail: {
                    version: '10.1-profile-bridge',
                    authentication: 'none'
                }
            }));
        } catch (_) {}
    }

    /* ============================================================
       INITIALISATION
       ============================================================ */


    /* ============================================================
       INITIALISATION
       ============================================================ */

    function init() {
        installStyles();
        installCloudStyles();
        installCompactListStyles();
        createPanel();
        installPmkPublicBridge();

        if (!window.__KX_COVER_RESOLVER_READY_BOUND__) {
            window.__KX_COVER_RESOLVER_READY_BOUND__ = true;
            window.addEventListener('pmk:cover-resolver-ready', () => {
                try {
                    renderNoticeList();
                    renderItemList();
                } catch (_) {}
            });
        }
        renderEverything();
        observeRelevantDom();

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') setPanelOpen(false);
        });

        loadFirebase();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
