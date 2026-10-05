(function () {
    // === DÉTECTION MOBILE / PETIT ÉCRAN ===
    function isMobileOrSmallScreen() {
        const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|tablet|Silk/i.test(navigator.userAgent);
        const isSmallScreen = window.innerWidth <= 1024;
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const criteriaMet = [isMobileUA, isSmallScreen, isTouch].filter(Boolean).length;
        (function(){})(`[Quagga] Détection: Mobile=${isMobileUA}, SmallScreen=${isSmallScreen}, Touch=${isTouch} → Actif=${criteriaMet >= 2}`);
        return criteriaMet >= 2;
    }

    if (!isMobileOrSmallScreen()) {
        (function(){})('[Quagga] Désactivé: non mobile ou écran trop grand');
        return;
    }

    const STYLE_ID = 'koha-quagga-styles';
    const OVERLAY_ID = 'koha-quagga-overlay';
    const VIDEO_ID = 'koha-quagga-video';
    const MSG_ID = 'koha-quagga-msg';

    // === LISTE DES CHAMPS À ÉQUIPER ===
    const TARGET_INPUTS = [
        'search-form',
        'searchmember',
        'ret_barcode',
        'findborrower',
        'barcode'
    ];

    // === CONFIGURATION DE LA VÉRIFICATION MULTIPLE ===
    const VERIFICATION_CONFIG = {
        REQUIRED_READS: 3,        // Nombre de lectures identiques requises
        TIMEOUT_MS: 800,          // Délai max entre deux lectures (ms)
        RESET_ON_DIFFERENT: true  // Réinitialise si un code différent est lu
    };

    // === STYLES ===
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.innerHTML = `
            /* === Wrapper et bouton sobre === */
            .quagga-wrapper {
                position: relative;
                display: inline-block;
                width: 100%;
                max-width: 100%;
            }

            .quagga-wrapper .quagga-btn {
                position: absolute;
                right: 8px;
                top: 50%;
                transform: translateY(-50%);
                z-index: 10;
                border: 0;
                background: transparent;
                color: #6c757d;
                width: 32px;
                height: 32px;
                border-radius: 4px;
                font-size: 18px;
                line-height: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: color 0.2s, background 0.2s;
                padding: 0;
            }

            .quagga-wrapper .quagga-btn:hover {
                color: #212529;
                background: rgba(0, 0, 0, 0.05);
            }

            .quagga-wrapper .quagga-btn:focus {
                outline: none;
            }

            .quagga-wrapper input {
                padding-right: 46px !important;
            }

            /* === Overlay === */
            #${OVERLAY_ID} {
                position: fixed;
                inset: 0;
                z-index: 999999;
                background: rgba(0, 0, 0, 0.92);
                display: none;
                flex-direction: column;
            }

            /* === Top bar épurée === */
            #koha-quagga-topbar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                color: #e9ecef;
                gap: 12px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: rgba(0, 0, 0, 0.6);
                z-index: 10;
                flex-wrap: wrap;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            }

            #koha-quagga-topbar-left {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }

            #koha-quagga-topbar-left strong {
                font-weight: 500;
                font-size: 15px;
                letter-spacing: 0.3px;
                color: #dee2e6;
            }

            #koha-quagga-restart-btn {
                padding: 4px 12px;
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 4px;
                background: transparent;
                color: #ced4da;
                font-size: 12px;
                cursor: pointer;
                transition: background 0.2s, color 0.2s;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }

            #koha-quagga-restart-btn:hover {
                background: rgba(255, 255, 255, 0.08);
                color: #fff;
            }

            #koha-quagga-close {
                border: 0;
                border-radius: 4px;
                padding: 4px 14px;
                cursor: pointer;
                background: transparent;
                color: #adb5bd;
                font-size: 13px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                transition: background 0.2s, color 0.2s;
            }

            #koha-quagga-close:hover {
                background: rgba(220, 53, 69, 0.15);
                color: #f8d7da;
            }

            /* === Statut === */
            #koha-quagga-status {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                color: #adb5bd;
            }

            #koha-quagga-status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #6c757d;
                display: inline-block;
                transition: background 0.3s;
            }

            #koha-quagga-status-dot.scanning {
                background: #ffc107;
                animation: pulse-dot 0.8s ease-in-out infinite;
            }

            #koha-quagga-status-dot.detected {
                background: #28a745;
            }

            #koha-quagga-status-dot.error {
                background: #dc3545;
            }

            #koha-quagga-status-dot.verifying {
                background: #17a2b8;
                animation: pulse-dot 0.4s ease-in-out infinite;
            }

            @keyframes pulse-dot {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.4; transform: scale(0.8); }
            }

            /* === Résolution affichée === */
            #koha-quagga-resolution {
                font-size: 11px;
                color: #6c757d;
                font-family: monospace;
                margin-left: 4px;
            }

            /* === Vidéo === */
            #${VIDEO_ID} {
                flex: 1;
                min-height: 0;
                width: 100%;
                object-fit: cover;
                background: #000;
            }

            /* === Message === */
            #${MSG_ID} {
                padding: 10px 16px 16px;
                color: #adb5bd;
                text-align: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 13px;
                background: rgba(0, 0, 0, 0.6);
                border-top: 1px solid rgba(255, 255, 255, 0.04);
                letter-spacing: 0.2px;
            }

            #${MSG_ID} strong {
                color: #e9ecef;
                font-weight: 500;
            }

            #${MSG_ID} .highlight {
                color: #ffc107;
            }

            #${MSG_ID} .progress {
                color: #17a2b8;
            }

            /* === Cache le canvas de Quagga === */
            #${OVERLAY_ID} canvas.drawingBuffer {
                display: none !important;
            }

            /* === Responsive pour petits écrans === */
            @media (max-width: 480px) {
                #koha-quagga-topbar-left strong {
                    font-size: 13px;
                }
                #koha-quagga-restart-btn {
                    font-size: 11px;
                    padding: 3px 8px;
                }
                #koha-quagga-close {
                    font-size: 12px;
                    padding: 3px 10px;
                }
                #koha-quagga-status {
                    font-size: 11px;
                }
                #koha-quagga-resolution {
                    font-size: 10px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // === État ===
    let active = false;
    let isScanning = false;
    let quaggaStream = null;
    let currentInput = null;

    // === État pour la vérification multiple ===
    let verificationState = {
        code: null,
        count: 0,
        timer: null,
        lastRead: null,
        isVerifying: false
    };

    // === Icône sobre (caméra stylisée) ===
    function createIcon() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.8');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.innerHTML = `
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
        `;
        return svg;
    }

    // === Équiper un champ avec le bouton ===
    function equipInput(input) {
        if (!input) return;
        if (input.dataset.quaggaReady === '1') return;

        const wrapper = document.createElement('span');
        wrapper.className = 'quagga-wrapper';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quagga-btn';
        btn.setAttribute('aria-label', 'Scanner un code-barres');
        btn.title = 'Scanner un code-barres';
        btn.appendChild(createIcon());
        wrapper.appendChild(btn);

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openScanner(input);
        });

        input.dataset.quaggaReady = '1';
        (function(){})(`[Quagga] Champ équipé: #${input.id || input.name}`);
    }

    // === Trouver tous les champs cibles ===
    function findAndEquipInputs() {
        TARGET_INPUTS.forEach(selector => {
            const inputs = document.querySelectorAll(`#${selector}`);
            if (inputs.length === 0) {
                const byName = document.querySelectorAll(`input[name="${selector}"]`);
                byName.forEach(input => equipInput(input));
                return;
            }
            inputs.forEach(input => equipInput(input));
        });

        // Champs DataTables
        document.querySelectorAll('.dt-search input[type="search"]').forEach(input => {
            if (!input.dataset.quaggaReady) {
                equipInput(input);
            }
        });

        document.querySelectorAll('[data-quagga-target]').forEach(input => {
            equipInput(input);
        });
    }

    // === Overlay ===
    function ensureOverlay() {
        let overlay = document.getElementById(OVERLAY_ID);
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;

        overlay.innerHTML = `
            <div id="koha-quagga-topbar">
                <div id="koha-quagga-topbar-left">
                    <strong>📷 Scanner</strong>
                    <button type="button" id="koha-quagga-restart-btn">Relancer</button>
                </div>
                <div id="koha-quagga-status">
                    <span id="koha-quagga-status-dot"></span>
                    <span id="koha-quagga-status-text">Prêt</span>
                    <span id="koha-quagga-resolution"></span>
                </div>
                <button type="button" id="koha-quagga-close">Fermer</button>
            </div>
            <video id="${VIDEO_ID}" autoplay playsinline muted></video>
            <div id="${MSG_ID}">Alignez le code-barres dans le cadre</div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#koha-quagga-close').addEventListener('click', closeScanner);
        overlay.querySelector('#koha-quagga-restart-btn').addEventListener('click', function () {
            restartScan();
        });
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeScanner();
        });

        return overlay;
    }

    function loadQuagga() {
        return new Promise(function (resolve, reject) {
            if (window.Quagga) {
                resolve();
                return;
            }

            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/@ericblade/quagga2@1.8.2/dist/quagga.min.js';
            s.onload = function () {
                (function(){})('[Quagga] Chargé');
                resolve();
            };
            s.onerror = function () {
                reject(new Error('Impossible de charger Quagga2'));
            };
            document.head.appendChild(s);
        });
    }

    function setStatus(text, state, resolution) {
        const dot = document.getElementById('koha-quagga-status-dot');
        const label = document.getElementById('koha-quagga-status-text');
        const msg = document.getElementById(MSG_ID);
        const resEl = document.getElementById('koha-quagga-resolution');

        if (label) label.textContent = text;
        if (resEl && resolution) {
            resEl.textContent = `📐 ${resolution}`;
        } else if (resEl) {
            resEl.textContent = '';
        }
        if (dot) {
            dot.className = '';
            if (state === 'scanning') dot.classList.add('scanning');
            else if (state === 'detected') dot.classList.add('detected');
            else if (state === 'error') dot.classList.add('error');
            else if (state === 'verifying') dot.classList.add('verifying');
        }
        if (msg && state !== 'error') {
            msg.textContent = text;
        }
    }

    function cleanBarcode(code, format) {
        if (!code) return code;

        let cleaned = code;

        if (format === 'codabar_reader' || format === 'codabar') {
            cleaned = cleaned.replace(/^[A-Da-d]+/, '').replace(/[A-Da-d]+$/, '');
            if (cleaned !== code) (function(){})(`[Quagga] Codabar nettoyé: "${code}" → "${cleaned}"`);
        }

        if (format === 'code_39_reader' || format === 'code_39') {
            cleaned = cleaned.replace(/^\*+/, '').replace(/\*+$/, '');
            if (cleaned !== code) (function(){})(`[Quagga] Code39 nettoyé: "${code}" → "${cleaned}"`);
        }

        if (format === 'code_128_reader' || format === 'code_128') {
            cleaned = cleaned.replace(/^[^\x20-\x7E]+/, '').replace(/[^\x20-\x7E]+$/, '');
            if (cleaned !== code) (function(){})(`[Quagga] Code128 nettoyé: "${code}" → "${cleaned}"`);
        }

        return cleaned;
    }

    // === FONCTION DE VÉRIFICATION MULTIPLE ===
    function handleBarcodeRead(code, format) {
        if (!currentInput) return;
        
        const cleanedCode = cleanBarcode(code, format);
        if (!cleanedCode) return;

        (function(){})(`[Quagga] Lecture ${format}: "${cleanedCode}"`);

        // Réinitialise si un code différent est lu (si configuré)
        if (VERIFICATION_CONFIG.RESET_ON_DIFFERENT && 
            verificationState.code !== null && 
            verificationState.code !== cleanedCode) {
            (function(){})(`[Quagga] Code différent détecté, réinitialisation`);
            resetVerificationState();
        }

        // Si c'est le premier code ou le même code
        if (verificationState.code === null) {
            verificationState.code = cleanedCode;
            verificationState.count = 1;
            verificationState.lastRead = Date.now();
            verificationState.isVerifying = true;
            
            setStatus(`🔍 Vérification... (1/${VERIFICATION_CONFIG.REQUIRED_READS})`, 'verifying');
            updateMessage(`🔍 Vérification en cours... (${1}/${VERIFICATION_CONFIG.REQUIRED_READS})`);
            
            // Démarre le timer
            startVerificationTimer();
        } 
        else if (verificationState.code === cleanedCode) {
            // Incrémente le compteur
            verificationState.count++;
            verificationState.lastRead = Date.now();
            
            const progress = verificationState.count;
            const required = VERIFICATION_CONFIG.REQUIRED_READS;
            
            if (progress < required) {
                setStatus(`🔍 Vérification... (${progress}/${required})`, 'verifying');
                updateMessage(`🔍 Vérification en cours... (${progress}/${required})`);
                
                // Réinitialise le timer
                resetVerificationTimer();
                startVerificationTimer();
            } else {
                // ✅ Lecture confirmée !
                (function(){})(`[Quagga] ✅ Code confirmé après ${progress} lectures: "${cleanedCode}"`);
                confirmBarcode(cleanedCode);
            }
        }
    }

    function resetVerificationState() {
        if (verificationState.timer) {
            clearTimeout(verificationState.timer);
            verificationState.timer = null;
        }
        verificationState.code = null;
        verificationState.count = 0;
        verificationState.lastRead = null;
        verificationState.isVerifying = false;
    }

    function startVerificationTimer() {
        if (verificationState.timer) {
            clearTimeout(verificationState.timer);
        }
        
        verificationState.timer = setTimeout(() => {
            (function(){})(`[Quagga] ⏱️ Délai d'attente dépassé, réinitialisation`);
            resetVerificationState();
            setStatus('🔍 Scan en cours...', 'scanning');
            updateMessage('Alignez le code-barres dans le cadre');
        }, VERIFICATION_CONFIG.TIMEOUT_MS);
    }

    function resetVerificationTimer() {
        if (verificationState.timer) {
            clearTimeout(verificationState.timer);
            verificationState.timer = null;
        }
    }

    function confirmBarcode(cleanedCode) {
        resetVerificationState();
        
        // ✅ Insère le code dans le champ
        if (currentInput) {
            currentInput.value = cleanedCode;
            currentInput.dispatchEvent(new Event('input', { bubbles: true }));
            currentInput.dispatchEvent(new Event('change', { bubbles: true }));
            currentInput.dispatchEvent(new Event('blur', { bubbles: true }));
        }

        setStatus(`✅ ${cleanedCode}`, 'detected');
        updateMessage(`✅ Code-barres validé : <strong>${cleanedCode}</strong>`);

        // Ferme après un court délai
        setTimeout(closeScanner, 600);
    }

    function updateMessage(text) {
        const msg = document.getElementById(MSG_ID);
        if (msg) msg.innerHTML = text;
    }

    function stopCurrentScan() {
        try {
            if (window.Quagga) {
                window.Quagga.stop();
                window.Quagga.offDetected();
            }
        } catch (e) {}

        const video = document.getElementById(VIDEO_ID);
        if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
        quaggaStream = null;
        resetVerificationState();
        setStatus('Prêt', '');
    }

    // === RÉSOLUTION AMÉLIORÉE ===
    async function getBestCameraResolution() {
        const resolutions = [
            { width: 3840, height: 2160 },
            { width: 2560, height: 1440 },
            { width: 1920, height: 1080 },
            { width: 1600, height: 1200 },
            { width: 1280, height: 720 },
            { width: 1024, height: 768 }
        ];

        try {
            for (const res of resolutions) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            width: { ideal: res.width },
                            height: { ideal: res.height },
                            facingMode: 'environment'
                        }
                    });
                    const track = stream.getVideoTracks()[0];
                    const settings = track.getSettings();
                    stream.getTracks().forEach(t => t.stop());
                    
                    (function(){})(`[Quagga] Résolution testée: ${res.width}x${res.height} → OK (obtenue: ${settings.width}x${settings.height})`);
                    return {
                        width: settings.width || res.width,
                        height: settings.height || res.height
                    };
                } catch (e) {
                    (function(){})(`[Quagga] Résolution ${res.width}x${res.height} non supportée`);
                }
            }
        } catch (e) {
            (function(){})('[Quagga] Impossible de tester les résolutions, fallback HD');
        }

        return { width: 1280, height: 720 };
    }

    async function startQuaggaScan() {
        const video = document.getElementById(VIDEO_ID);
        if (!video) {
            setStatus('Erreur: vidéo non trouvée', 'error');
            return;
        }

        if (!currentInput) {
            setStatus('Erreur: aucun champ cible', 'error');
            return;
        }

        try {
            const bestResolution = await getBestCameraResolution();
            (function(){})(`[Quagga] Résolution sélectionnée: ${bestResolution.width}x${bestResolution.height}`);

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: bestResolution.width },
                    height: { ideal: bestResolution.height },
                    facingMode: 'environment',
                    focusMode: 'continuous',
                    zoom: { ideal: 1.0 }
                },
                audio: false
            });

            video.srcObject = stream;
            await video.play();
            quaggaStream = stream;

            const track = stream.getVideoTracks()[0];
            const settings = track.getSettings();
            const resolutionStr = `${settings.width || bestResolution.width}×${settings.height || bestResolution.height}`;
            (function(){})(`[Quagga] Caméra: ${track.label || 'unknown'}, Résolution: ${resolutionStr}`);

            setStatus('🔍 Scan en cours...', 'scanning', resolutionStr);
            updateMessage('Alignez le code-barres dans le cadre');

            const config = {
                inputStream: {
                    name: 'Live',
                    type: 'LiveStream',
                    target: video,
                    constraints: {
                        facingMode: 'environment',
                        width: { ideal: bestResolution.width },
                        height: { ideal: bestResolution.height }
                    }
                },
                decoder: {
                    readers: [
                        'code_128_reader',
                        'code_39_reader',
                        'code_93_reader',
                        'codabar_reader',
                        'ean_reader',
                        'ean_8_reader',
                        'upc_reader',
                        'upc_e_reader',
                        'i2of5_reader'
                    ],
                    multiple: false
                },
                locator: {
                    patchSize: 'medium',
                    halfSample: true
                },
                frequency: 20,
                locate: true
            };

            if (window.Quagga) {
                try {
                    window.Quagga.stop();
                    window.Quagga.offDetected();
                } catch (e) {}
            }

            window.Quagga.init(config, function(err) {
                if (err) {
                    (function(){})('[Quagga] Erreur init:', err);
                    setStatus('Erreur: ' + err.message, 'error');
                    isScanning = false;
                    return;
                }

                window.Quagga.start();
                (function(){})('[Quagga] Démarré en mode Auto');

                window.Quagga.onDetected(function(result) {
                    if (result && result.codeResult) {
                        // Utilise la nouvelle fonction avec vérification multiple
                        handleBarcodeRead(result.codeResult.code, result.codeResult.format);
                    }
                });
            });

        } catch (err) {
            (function(){})('[Quagga] Erreur:', err);
            setStatus('Erreur: ' + (err.message || 'inconnue'), 'error');
            isScanning = false;
        }
    }

    async function startScan() {
        if (isScanning) return;

        stopCurrentScan();
        isScanning = true;

        const video = document.getElementById(VIDEO_ID);
        if (video) video.style.display = 'block';

        try {
            await loadQuagga();
            await startQuaggaScan();
        } catch (err) {
            (function(){})('[Quagga] Erreur:', err);
            isScanning = false;
            setStatus('Erreur: ' + (err.message || 'inconnue'), 'error');
        }
    }

    async function restartScan() {
        stopCurrentScan();
        isScanning = false;
        resetVerificationState();
        await startScan();
    }

    async function openScanner(input) {
        if (active) return;
        active = true;
        isScanning = false;
        currentInput = input;
        resetVerificationState();

        const overlay = ensureOverlay();
        overlay.style.display = 'flex';

        setStatus('🔍 Détection de la meilleure résolution...', '');

        try {
            await loadQuagga();
            await startScan();
        } catch (e) {
            (function(){})('[Quagga] Erreur:', e);
            setStatus('Erreur: ' + (e.message || 'inconnue'), 'error');
            active = false;
        }
    }

    function closeScanner() {
        active = false;
        isScanning = false;

        stopCurrentScan();
        resetVerificationState();

        try {
            if (window.Quagga) {
                window.Quagga.stop();
                window.Quagga.offDetected();
            }
        } catch (e) {}

        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay) overlay.style.display = 'none';
        currentInput = null;
        updateMessage('Alignez le code-barres dans le cadre');
    }

    // === Initialisation ===
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                findAndEquipInputs();
            });
        } else {
            findAndEquipInputs();
        }

        const observer = new MutationObserver(function() {
            findAndEquipInputs();
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        (function(){})('[Quagga Scanner] Chargé (mobile uniquement)');
        (function(){})(`[Quagga Scanner] Champs cibles: ${TARGET_INPUTS.join(', ')}`);
        (function(){})('[Quagga Scanner] Mode: Auto (tous les formats)');
        (function(){})('[Quagga Scanner] Résolution: Auto (meilleure disponible)');
        (function(){})(`[Quagga Scanner] Vérification: ${VERIFICATION_CONFIG.REQUIRED_READS} lectures requises, délai ${VERIFICATION_CONFIG.TIMEOUT_MS}ms`);
    }

    init();
})();








// === GESTION DES RÉSULTATS (UNIQUEMENT SUR SEARCH.PL) ===
(function() {
    // Vérifier qu'on est bien sur la page search.pl
    if (!window.location.pathname.includes('/catalogue/search.pl')) {
        return;
    }

    document.addEventListener('DOMContentLoaded', function() {
        // ====== 1. BOUTON "AFFICHER PLUS" ======
        function initResultRow(row) {
            if (row.dataset.initialized === 'true') return;
            row.dataset.initialized = 'true';

            var thirdCell = row.querySelector('td:nth-child(3)');
            if (!thirdCell) return;

            var titleElement = thirdCell.querySelector('.firstresult');
            if (!titleElement) return;

            // Créer le conteneur pour les détails
            var detailsContainer = document.createElement('div');
            detailsContainer.className = 'notice-details';
            detailsContainer.id = 'details-' + Math.random().toString(36).substr(2, 9);

            // Collecter les éléments à déplacer
            var elementsToMove = [];
            var currentElement = titleElement.nextElementSibling;
            
            while (currentElement) {
                var nextElement = currentElement.nextElementSibling;
                
                if (currentElement.classList && 
                    (currentElement.classList.contains('bouton') || 
                     currentElement.querySelector('.bouton'))) {
                    elementsToMove.push(currentElement);
                } else if (currentElement.tagName !== 'BR' && 
                           !currentElement.classList.contains('btn-show-more') &&
                           !currentElement.classList.contains('notice-details')) {
                    elementsToMove.push(currentElement);
                }
                
                currentElement = nextElement;
            }

            elementsToMove.forEach(function(el) {
                detailsContainer.appendChild(el);
            });

            titleElement.after(detailsContainer);

            // Créer le bouton
            var showBtn = document.createElement('button');
            showBtn.className = 'btn-show-more';
            showBtn.innerHTML = 'Afficher plus <span class="arrow">▼</span>';
            showBtn.setAttribute('aria-expanded', 'false');
            
            showBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                var isVisible = detailsContainer.classList.toggle('visible');
                this.innerHTML = isVisible ? 
                    'Afficher moins <span class="arrow open">▲</span>' : 
                    'Afficher plus <span class="arrow">▼</span>';
                this.setAttribute('aria-expanded', isVisible);
                
                var rowId = row.id || 'row-' + Math.random().toString(36).substr(2, 9);
                if (!row.id) row.id = rowId;
                
                var expandedState = JSON.parse(localStorage.getItem('expandedRows') || '{}');
                expandedState[rowId] = isVisible;
                localStorage.setItem('expandedRows', JSON.stringify(expandedState));
            });

            titleElement.after(showBtn);

            // Restaurer l'état
            var rowId = row.id || 'row-' + Math.random().toString(36).substr(2, 9);
            if (!row.id) row.id = rowId;
            
            var expandedState = JSON.parse(localStorage.getItem('expandedRows') || '{}');
            if (expandedState[rowId]) {
                detailsContainer.classList.add('visible');
                showBtn.innerHTML = 'Afficher moins <span class="arrow open">▲</span>';
                showBtn.setAttribute('aria-expanded', 'true');
            }

            // Transformer en icônes UNIQUEMENT SI ON EST SUR MOBILE
            if (window.innerWidth <= 768) {
                transformLinksToIcons(row);
            }

            // Gérer les boutons "Afficher/Masquer" existants
            var toggleButtons = detailsContainer.querySelectorAll('.bouton');
            toggleButtons.forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    var target = this.nextElementSibling;
                    while (target && !target.classList.contains('sectionz')) {
                        target = target.nextElementSibling;
                    }
                    if (target) {
                        if (target.style.display === 'none' || !target.style.display) {
                            target.style.display = 'block';
                            this.textContent = 'Masquer le résumé';
                        } else {
                            target.style.display = 'none';
                            this.textContent = 'Afficher/Masquer le résumé';
                        }
                    }
                });
            });

            // Gérer les boutons des exemplaires
            var exemplaireBtns = row.querySelectorAll('.btn-toggle-exemplaire');
            exemplaireBtns.forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    var detailsDiv = this.closest('.bloc-exemplaire').querySelector('.details-exemplaire');
                    if (detailsDiv) {
                        if (detailsDiv.style.display === 'none' || !detailsDiv.style.display) {
                            detailsDiv.style.display = 'block';
                            this.textContent = 'Masquer détails';
                        } else {
                            detailsDiv.style.display = 'none';
                            this.textContent = 'Afficher détails';
                        }
                    }
                });
            });
        }

        // ====== 2. TRANSFORMER LES LIENS EN ICÔNES ======
        function transformLinksToIcons(row) {
            var holdElement = row.querySelector('.hold');
            if (!holdElement) return;

            var actionContainer = document.createElement('div');
            actionContainer.className = 'action-icons';

            var links = holdElement.querySelectorAll('a');
            var cartLink = holdElement.querySelector('.addtocart');
            var cartRemove = holdElement.querySelector('.cartRemove');

            links.forEach(function(link) {
                if (link.classList.contains('addtocart') || link.classList.contains('cartRemove')) {
                    return;
                }
                
                var newLink = document.createElement('a');
                newLink.href = link.href;
                newLink.title = link.textContent.trim().replace(/[\(\)]/g, '').trim();
                newLink.target = link.target || '';
                newLink.rel = link.rel || '';
                newLink.textContent = link.textContent;
                
                Array.from(link.attributes).forEach(function(attr) {
                    if (attr.name.startsWith('data-')) {
                        newLink.setAttribute(attr.name, attr.value);
                    }
                });
                
                if (link.onclick) {
                    newLink.onclick = link.onclick;
                }
                
                actionContainer.appendChild(newLink);
            });

            if (cartLink) {
                var cartClone = cartLink.cloneNode(true);
                cartClone.className = 'addtocart';
                cartClone.textContent = 'Ajouter au panier';
                cartClone.title = 'Ajouter au panier';
                if (cartLink.onclick) {
                    cartClone.onclick = cartLink.onclick;
                }
                actionContainer.appendChild(cartClone);
            }

            if (cartRemove) {
                var removeClone = cartRemove.cloneNode(true);
                removeClone.className = 'cartRemove';
                removeClone.textContent = '(Supprimer)';
                removeClone.title = 'Retirer du panier';
                if (cartRemove.onclick) {
                    removeClone.onclick = cartRemove.onclick;
                }
                actionContainer.appendChild(removeClone);
            }

            holdElement.parentNode.replaceChild(actionContainer, holdElement);
        }

        // ====== 3. INITIALISER TOUTES LES LIGNES ======
        function initAllRows() {
            var rows = document.querySelectorAll('#searchresults tbody tr');
            rows.forEach(function(row) {
                initResultRow(row);
            });
        }

        // ====== 4. OBSERVER LES CHANGEMENTS ======
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1 && node.tagName === 'TR') {
                        initResultRow(node);
                    }
                    if (node.querySelectorAll) {
                        node.querySelectorAll('#searchresults tbody tr').forEach(function(row) {
                            if (!row.dataset.initialized) {
                                initResultRow(row);
                            }
                        });
                    }
                });
            });
        });

        var targetNode = document.getElementById('searchresults');
        if (targetNode) {
            observer.observe(targetNode, {
                childList: true,
                subtree: true,
                attributes: false
            });
        }

        // ====== 5. INITIALISATION ======
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            initAllRows();
        } else {
            document.addEventListener('DOMContentLoaded', initAllRows);
        }

        // Réinitialiser après un changement de page
        document.addEventListener('searchresults-updated', initAllRows);

        // === EXPOSER LA FONCTION ===
        window.initSearchResults = function() {
            var rows = document.querySelectorAll('#searchresults tbody tr');
            rows.forEach(function(row) {
                row.dataset.initialized = 'false';
                initResultRow(row);
            });
        };
    });
})();


