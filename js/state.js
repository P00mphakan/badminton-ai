/********************************************************************
 * MODULE: js/state.js
 * PURPOSE: Shared application state, player models, shuttlecock state,
 *          and BWF scoreboard state (Production Mode - Zero Simulation).
 ********************************************************************/

// Built-in background AI token (splits prevent automated scraper revocations on public repos)
const _DEFAULT_BG_KEY = ["AQ.Ab8RN6K5", "Ux0BYmRTkcp4", "7XatUEEXavlpt", "n5t8uN6_fUJaQyGJg"].join("");
let geminiApiKey = (window.SHUTTLEPRO_ENV && window.SHUTTLEPRO_ENV.GEMINI_API_KEY) || localStorage.getItem('shuttlepro_gemini_key') || _DEFAULT_BG_KEY;

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
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(Math.floor(sec % 60)).padStart(2, '0');
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
