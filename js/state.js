/********************************************************************
 * MODULE: js/state.js
 * PURPOSE: Shared application state, sealed API/Tunnel security vault,
 *          mobile double-tap blocker, player models, shuttlecock state,
 *          and BWF scoreboard state (Production Mode - Zero Simulation).
 ********************************************************************/

// Sealed Security Vault: Protects API keys & Cloudflare Tunnel URL from plaintext scraping, global scope leaks, and automated console abuse
const ShuttleSecurity = (() => {
    const _S = 'ShuttlePro_BWF_2026_Vault';
    const _V = {
        g: 'EjlbNRZUNx5EJGoXL3Yda11gYjQ1EUFbLDIcIDExNAQmHh8rLGIyZ0d+BGk5AysUPQ0UIhI=',
        t: 'OxwBBAdWSn8GACohPyM7H19AWjo3DwZBACENFAAdAgJ9Ag48KXkyLUtTXlkqMgcZDQY2RhYbGQ==',
        u: 'OxwBBAdWSn8BCj4rOjQoU0lRUi40Eh4HDCscGVoHGRUxEA4sJ3klMA==',
        k: 'IAoqBAEOCTkBBz4gOyMAQEhHdDxjEjohIRIORyAxDgFpByUZAwgJbHoEdVgzMA=='
    };

    function _dec(b64) {
        try {
            const bin = atob(b64);
            let out = '';
            for (let i = 0; i < bin.length; i++) {
                out += String.fromCharCode(bin.charCodeAt(i) ^ _S.charCodeAt(i % _S.length));
            }
            return out;
        } catch (e) {
            return '';
        }
    }

    // Read optional local env override then immediately scrub global window.SHUTTLEPRO_ENV
    const _envKey = (window.SHUTTLEPRO_ENV && window.SHUTTLEPRO_ENV.GEMINI_API_KEY) || '';
    try {
        delete window.SHUTTLEPRO_ENV;
    } catch (e) {
        window.SHUTTLEPRO_ENV = {};
    }

    let _activeUserToken = null;
    let _tokenExpiresAt = 0;
    let _lastAiCallAt = 0;
    const _aiCallTimestamps = [];

    function _getGeminiKey() {
        return _envKey || localStorage.getItem('shuttlepro_gemini_key') || _dec(_V.g);
    }

    function _sanitizeError(msg) {
        if (!msg) return 'ไม่สามารถเชื่อมต่อระบบ AI ได้ในขณะนี้';
        return String(msg)
            .replace(/https?:\/\/[^\s"'<>]+/gi, '[protected-endpoint]')
            .replace(/key=[A-Za-z0-9._-]+/gi, 'key=[redacted]')
            .replace(/trycloudflare\.com/gi, '[protected-tunnel]');
    }

    // Issue a short-lived one-time token strictly on genuine user button click in the AI Coach tab
    function issueActionToken() {
        const now = Date.now();
        if (now - _lastAiCallAt < 6000) {
            return { ok: false, error: 'กรุณารอสักครู่ก่อนกดวิเคราะห์ซ้ำ (ป้องกันการกดรัว)' };
        }
        // Sliding 10-minute window rate limit (max 12 calls per 10 mins)
        while (_aiCallTimestamps.length > 0 && now - _aiCallTimestamps[0] > 10 * 60 * 1000) {
            _aiCallTimestamps.shift();
        }
        if (_aiCallTimestamps.length >= 12) {
            return { ok: false, error: 'จำกัดจำนวนการเรียก AI ชั่วคราวเพื่อป้องกันการใช้โควตาเกินกำหนด' };
        }
        _activeUserToken = `${now}-${Math.random().toString(36).slice(2, 10)}`;
        _tokenExpiresAt = now + 45000;
        return { ok: true, token: _activeUserToken };
    }

    function _verifyToken(token) {
        const now = Date.now();
        if (!token || token !== _activeUserToken || now > _tokenExpiresAt) {
            return false;
        }
        return true;
    }

    function consumeActionToken() {
        _lastAiCallAt = Date.now();
        _aiCallTimestamps.push(_lastAiCallAt);
        _activeUserToken = null;
        _tokenExpiresAt = 0;
    }

    async function fetchGeminiModel(modelName, bodyObj, token) {
        if (!_verifyToken(token)) {
            return { ok: false, status: 403, error: 'ไม่อนุญาตให้เรียก API โดยตรงนอกหน้าต่างโค้ช AI' };
        }
        const key = _getGeminiKey();
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(key)}`;
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                referrerPolicy: 'no-referrer',
                body: JSON.stringify(bodyObj)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                return {
                    ok: false,
                    status: res.status,
                    error: _sanitizeError(data?.error?.message || `HTTP ${res.status}`)
                };
            }
            const text = data?.candidates?.[0]?.content?.parts?.find(p => p.text)?.text || '';
            return { ok: Boolean(text), status: 200, text };
        } catch (err) {
            return { ok: false, status: 0, error: _sanitizeError(err.message) };
        }
    }

    async function fetchLocalAITunnel(modelName, messages, token) {
        if (!_verifyToken(token)) {
            return { ok: false, error: 'ไม่อนุญาตให้เข้าถึง Local AI Tunnel โดยตรง' };
        }
        const tunnelBase = _dec(_V.t);
        if (!tunnelBase) return { ok: false, error: 'Local AI ไม่พร้อมใช้งาน' };

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 28000);
        try {
            const res = await fetch(`${tunnelBase}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'ShuttlePro-Client'
                },
                referrerPolicy: 'no-referrer',
                body: JSON.stringify({
                    model: modelName,
                    stream: false,
                    options: { temperature: 0.2 },
                    messages
                }),
                signal: controller.signal
            });
            clearTimeout(timer);
            if (!res.ok) {
                return { ok: false, error: `Local AI HTTP ${res.status}` };
            }
            const data = await res.json().catch(() => ({}));
            const replyText = data?.message?.content || data?.response || '';
            return { ok: Boolean(replyText && replyText.trim()), text: (replyText || '').trim() };
        } catch (err) {
            clearTimeout(timer);
            return { ok: false, error: _sanitizeError(err.message) };
        }
    }

    async function fetchSupabaseRest(pathAndQuery, options = {}) {
        const sbUrl = _dec(_V.u);
        const sbKey = _dec(_V.k);
        if (!sbUrl || !sbKey) throw new Error('Cloud configuration unavailable');
        const headers = {
            'apikey': sbKey,
            'Authorization': `Bearer ${sbKey}`,
            ...(options.headers || {})
        };
        return fetch(`${sbUrl}/rest/v1/${pathAndQuery}`, {
            ...options,
            headers,
            referrerPolicy: 'no-referrer'
        });
    }

    const sbClient = (window.supabase && window.supabase.createClient)
        ? window.supabase.createClient(_dec(_V.u), _dec(_V.k))
        : null;

    return Object.freeze({
        supabaseClient: sbClient,
        issueActionToken,
        consumeActionToken,
        fetchGeminiModel,
        fetchLocalAITunnel,
        fetchSupabaseRest,
        sanitizeError: _sanitizeError
    });
})();

const supabaseClient = ShuttleSecurity.supabaseClient;
let currentAuthUser = null;
let currentAuthMode = 'signin'; // 'signin' | 'signup'
let clubCode = (localStorage.getItem('shuttlepro_club_code') || 'PUBLIC').trim().toUpperCase();
let isCloudSynced = false;
let latestAICoachReportText = "";

// Block Mobile Double-Tap Zoom, Rapid Accidental Double-Tap Button Clicks, and Casual DevTools/Source Inspection
(function initMobileDoubleTapAndSecurityBlocker() {
    let lastTouchEndTime = 0;
    let lastButtonClickTime = 0;
    let lastClickedBtn = null;

    // 1. Block double-tap zoom on iOS Safari & Android Chrome
    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        const delta = now - lastTouchEndTime;
        const target = e.target;
        const isScoreAdj = target && target.closest && target.closest('.score-adj');
        if (delta > 0 && delta < 330 && !isScoreAdj) {
            if (e.cancelable) e.preventDefault();
        }
        lastTouchEndTime = now;
    }, { passive: false, capture: true });

    // 2. Block native dblclick zoom/events globally
    document.addEventListener('dblclick', (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
    }, { passive: false, capture: true });

    // 3. Block iOS Safari pinch-to-zoom gesture on mobile touch screens only (never blocks desktop trackpads/touchpads)
    if ('ontouchstart' in window && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) {
        ['gesturestart', 'gesturechange'].forEach(evtName => {
            document.addEventListener(evtName, (e) => {
                if (e.scale !== undefined && e.scale !== 1 && e.cancelable) {
                    e.preventDefault();
                }
            }, { passive: false });
        });
    }

    // 4. Debounce rapid accidental double-taps on action buttons (except manual +/- score buttons)
    document.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('button') : null;
        if (!btn || btn.classList.contains('score-adj')) return;
        const now = Date.now();
        if (btn === lastClickedBtn && (now - lastButtonClickTime) < 420) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
        }
        lastClickedBtn = btn;
        lastButtonClickTime = now;
    }, true);

    // 5. Block casual context-menu & DevTools keyboard shortcuts (F12, Ctrl+Shift+I/J/C, Cmd+Opt+I/J/C, Ctrl+U)
    document.addEventListener('contextmenu', (e) => {
        const tag = e.target?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
            e.preventDefault();
        }
    });
    document.addEventListener('keydown', (e) => {
        const key = (e.key || '').toUpperCase();
        const ctrlOrCmd = e.ctrlKey || e.metaKey;
        if (
            e.key === 'F12' ||
            (ctrlOrCmd && e.shiftKey && ['I', 'J', 'C', 'K'].includes(key)) ||
            (e.metaKey && e.altKey && ['I', 'J', 'C', 'U'].includes(key)) ||
            (ctrlOrCmd && key === 'U')
        ) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
})();

// Match Title (user-named recording) & saved match history
function buildDefaultMatchTitle() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `แมตช์ ${dd}/${mm} ${hh}:${mi}`;
}
let matchTitle = localStorage.getItem('shuttlepro_match_title') || buildDefaultMatchTitle();
let matchHistory = [];
try {
    matchHistory = JSON.parse(localStorage.getItem('shuttlepro_match_history') || '[]');
} catch (e) {
    matchHistory = [];
}

let activeTab = 'live';
let isWebcamActive = false;
let isUploadedVideoActive = false;
let uploadedVideoURL = null;
let isTrackingPaused = false;
let orientationSetting = 'auto'; // 'auto' | 'landscape' | 'portrait'
let isPortraitViewport = false;
let matchSeconds = 0;
let graphicMode = 'both'; // 'both' | 'heatmap' | 'trails'
let analyticsFilter = 'ALL';

// Calibration & Match Format State
let isCalibratingCourt = false;
let draggingHandleKey = null;
let dragPointerPos = null;
let isDoublesMatch = true; // true = Doubles (6.10m), false = Singles (5.18m)
let isVoiceRefereeOn = true;

// Pose Model State
let poseDetector = null;
let isPoseModelLoading = false;
let poseModelReady = false;
let lastPoseTimestamp = 0;
let detectedHumanBoxes = [];

// Official BWF Scoreboard State (Starts at 0 - 0)
const scoreboard = {
    scoreA: 0,
    scoreB: 0,
    setsA: 0,
    setsB: 0,
    currentSet: 1,
    servingTeam: 'A',     // 'A' or 'B'
    serviceCourt: 'R',    // 'R' (Right/Even) or 'L' (Left/Odd)
    rallyState: 'WAITING',// 'WAITING' | 'RALLYING' | 'POINT_CALL'
    lastCallText: 'รอเริ่มแรลลี่ (พร้อมตรวจจับอัตโนมัติ)',
    lastCallType: 'IDLE', // 'IN' | 'OUT' | 'NET' | 'IDLE'
    lastLandingSpot: null,// { u, v, isIn, marginCm, closestLineName, winner, time }
    historyStack: [],
    pointLog: []
};

function createEmptyPlayer(id, name, role, team, color, defaultU, defaultV) {
    return {
        id,
        name,
        role,
        team,
        color,
        detected: false,
        lastSeenMs: 0,
        u: defaultU,
        v: defaultV,
        screenX: 0.5,
        screenY: 0.5,
        keypoints: [],
        wristSpeedPx: 0,
        distanceMeters: 0.0,
        currentSpeedKmh: 0.0,
        maxSpeedKmh: 0.0,
        shotsCount: 0,
        smashHistory: [],
        maxSmashKmh: 0,
        minSmashKmh: 0,
        avgSmashKmh: 0,
        positions: []
    };
}

const players = {
    A1: createEmptyPlayer('A1', 'ผู้เล่น A1', 'แดนไกล (ซ้าย)', 'A', '#22d3ee', 0.30, 0.25),
    A2: createEmptyPlayer('A2', 'ผู้เล่น A2', 'แดนไกล (ขวา)', 'A', '#34d399', 0.70, 0.25),
    B1: createEmptyPlayer('B1', 'ผู้เล่น B1', 'แดนใกล้ (ซ้าย)', 'B', '#fb7185', 0.30, 0.75),
    B2: createEmptyPlayer('B2', 'ผู้เล่น B2', 'แดนใกล้ (ขวา)', 'B', '#fb923c', 0.70, 0.75)
};

const shuttle = {
    detected: false,
    lastSeenMs: 0,
    screenX: 0.5,
    screenY: 0.5,
    u: 0.5,
    v: 0.5,
    vx: 0,
    vy: 0,
    speedKmh: 0,
    lastSpeedAtMs: 0,
    shotType: 'รอตรวจจับลูกแบด',
    lastHitter: null,
    lastHitterTeam: null,
    trail: [],
    framesInFlight: 0,
    stationaryFrames: 0
};

let shotHistory = [];
let maxRecordedSpeed = 0;
let maxSpeedHolder = '-';
let minRecordedSmashSpeed = 0;
let minSmashHolder = '-';
let allSmashSpeeds = [];

function formatTimeSec(sec) {
    if (!isFinite(sec) || sec < 0) return '00:00';
    const totalSec = Math.floor(sec);
    if (totalSec >= 3600) {
        const h = String(Math.floor(totalSec / 3600));
        const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
        const s = String(totalSec % 60).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }
    const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${m}:${s}`;
}

function showToast(msg) {
    const banner = document.getElementById('toastBanner');
    const textEl = document.getElementById('toastMessage');
    if (!banner || !textEl) return;
    textEl.textContent = msg;
    banner.classList.remove('hidden');
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => {
        banner.classList.add('hidden');
    }, 3800);
}
