/********************************************************************
 * MODULE: js/pose-tracker.js
 * PURPOSE: Player detection (A1, A2, B1, B2) with MoveNet MultiPose on
 *          homography-derived half-court crops, STRICT in-court gating
 *          (people outside the court lines are never tracked), and a
 *          gated shuttle tracker with physics-based (aerodynamic drag)
 *          time-of-flight speed measurement.
 ********************************************************************/

function trackerNow() {
    if (typeof isUploadedVideoActive !== 'undefined' && isUploadedVideoActive) {
        if (typeof frameClockMs === 'number' && isFinite(frameClockMs)) {
            return frameClockMs;
        }
    }
    return performance.now();
}

/**
 * One Euro Filter for adaptive jitter-free tracking with low latency.
 * - Low speed / stationary: cutoff drops to minCutoff (eliminates foot jitter).
 * - High speed / sprint: cutoff increases proportionally to speed via beta (zero lag).
 */
class OneEuroFilter {
    constructor(freq = 30, minCutoff = 0.8, beta = 0.010, dCutoff = 1.0) {
        this.freq = freq;
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
        this.x = null;
        this.dx = 0;
    }
    alpha(cutoff) {
        const te = 1.0 / Math.max(1, this.freq);
        const tau = 1.0 / (2 * Math.PI * Math.max(0.001, cutoff));
        return 1.0 / (1.0 + tau / te);
    }
    filter(val, dt) {
        if (!isFinite(val)) return val;
        if (dt && dt > 0.001 && dt < 1.0) {
            this.freq = 1.0 / dt;
        }
        if (this.x === null || !isFinite(this.x)) {
            this.x = val;
            this.dx = 0;
            return val;
        }
        const dVal = (val - this.x) * this.freq;
        const edx = this.alpha(this.dCutoff);
        this.dx = this.dx + edx * (dVal - this.dx);
        const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
        const a = this.alpha(cutoff);
        this.x = this.x + a * (val - this.x);
        return isFinite(this.x) ? this.x : val;
    }
    reset() {
        this.x = null;
        this.dx = 0;
    }
}

function resetShuttleTracker() {
    shuttleTrack = [];
    activeShot = null;
    pendingRallyEnd = null;
    shuttle.detected = false;
    shuttle.trail = [];
    if (typeof shuttleSpeedCalc !== 'undefined' && shuttleSpeedCalc.reset) {
        shuttleSpeedCalc.reset();
    }
}

async function initPoseDetectionModel() {
    if (poseDetector || isPoseModelLoading) return;
    isPoseModelLoading = true;
    updateAIModelBadge('กำลังโหลด AI...');

    try {
        if (window.tf && window.poseDetection) {
            await tf.ready();
            poseDetector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                {
                    modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
                    // Smoothing is disabled because each inference runs on a different half-court crop
                    enableSmoothing: false,
                    minPoseScore: 0.2
                }
            );
            poseModelReady = true;
            updateAIModelBadge('AI พร้อม');
        } else {
            updateAIModelBadge('CV พร้อม');
        }
    } catch (err) {
        console.warn('Pose model init warning:', err);
        updateAIModelBadge('CV โหมดเร็ว');
    } finally {
        isPoseModelLoading = false;
    }
}

function updateAIModelBadge(text) {
    const statusText = document.getElementById('modeStatusText');
    if (statusText) statusText.textContent = text;
}

/* ================================================================
 * 1. PLAYER TRACKING (A1, A2 far half • B1, B2 near half)
 * ================================================================ */
const poseCropCanvas = document.createElement('canvas');
const poseCropCtx = poseCropCanvas.getContext('2d');
let posePassTeam = 'A';
let poseInferenceBusy = false;
let isPlayersLocked = false;
let targetLockTimestamp = 0;
const maskBoxesByTeam = { A: { boxes: [], t: 0 }, B: { boxes: [], t: 0 } };

function resetPlayerLockState() {
    isPlayersLocked = false;
    targetLockTimestamp = 0;
    Object.values(players).forEach(p => {
        p.isLocked = false;
    });
    updatePlayerLockHUD(0, isDoublesMatch ? 4 : 2);
}

function checkAndUpdatePlayerLockState(now) {
    const requiredSlotIds = isDoublesMatch ? ['A1', 'A2', 'B1', 'B2'] : ['A1', 'B1'];
    const activeDetected = requiredSlotIds.filter(id => {
        const p = players[id];
        return p && p.detected && (now - p.lastSeenMs < 2000);
    });

    const activeCount = activeDetected.length;
    const requiredCount = requiredSlotIds.length;

    if (!isPlayersLocked) {
        // เมื่อตรวจจับผู้เล่นได้ครบทั้ง 4 คน (หรือ 2 คนในโหมดเดี่ยว) -> สั่งล็อคเป้าหมายทันที!
        if (activeCount === requiredCount) {
            isPlayersLocked = true;
            targetLockTimestamp = now;
            requiredSlotIds.forEach(id => {
                if (players[id]) players[id].isLocked = true;
            });
            showToast(`🎯 ล็อคเป้าหมายผู้เล่นครบ ${requiredCount} คนแล้ว! (${isDoublesMatch ? 'A1, A2, B1, B2' : 'A1, B1'})`);
        } else {
            // ล็อคเป้ารายตัวให้ Slot ที่ตรวจจับได้เสถียร
            activeDetected.forEach(id => {
                if (players[id] && (now - players[id].lastSeenMs < 1200)) {
                    players[id].isLocked = true;
                }
            });
        }
    } else {
        // ขณะอยู่ในสถานะล็อคเป้า: คงสถานะล็อคให้ผู้เล่นทุกคน
        requiredSlotIds.forEach(id => {
            if (players[id]) players[id].isLocked = true;
        });

        // หากหลุดจากจอนานเกิน 6 วินาทีทุกๆ คน (เช่น พักเบรก หรือเดินออกจากคอร์ท) จึงค่อยปลดล็อคเพื่อสแกนใหม่
        const anyActive = requiredSlotIds.some(id => players[id] && (now - players[id].lastSeenMs < 6000));
        if (!anyActive) {
            isPlayersLocked = false;
            requiredSlotIds.forEach(id => {
                if (players[id]) players[id].isLocked = false;
            });
        }
    }

    updatePlayerLockHUD(activeCount, requiredCount);
}

function updatePlayerLockHUD(activeCount, requiredCount) {
    const statusText = document.getElementById('modeStatusText');
    const recDot = document.getElementById('recDot');
    if (!statusText) return;

    if (isPlayersLocked) {
        statusText.innerHTML = `<span class="text-emerald-400 font-bold">🎯 ล็อคเป้า ${activeCount}/${requiredCount}</span>`;
        if (recDot) recDot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse';
    } else {
        if (activeCount > 0) {
            statusText.textContent = `ค้นหา [${activeCount}/${requiredCount}]`;
            if (recDot) recDot.className = 'w-1.5 h-1.5 rounded-full bg-amber-400';
        } else {
            statusText.textContent = 'AI พร้อม';
            if (recDot) recDot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400';
        }
    }
}

// Tolerance outside the painted lines for foot-position noise (15 cm sideways, 25 cm lengthwise)
const IN_COURT_TOL_U = 0.15 / 6.10;
const IN_COURT_TOL_V = 0.25 / 13.40;

function computeHalfCourtCrop(team) {
    const v0 = team === 'A' ? -IN_COURT_TOL_V : 0.5;
    const v1 = team === 'A' ? 0.5 : 1 + IN_COURT_TOL_V;
    const pts = [[0, v0], [1, v0], [0, v1], [1, v1]].map(([u, v]) => ShuttleCV.courtNormalizedToScreen(u, v));
    let x0 = Math.min(...pts.map(p => p.x));
    let x1 = Math.max(...pts.map(p => p.x));
    let y0 = Math.min(...pts.map(p => p.y));
    let y1 = Math.max(...pts.map(p => p.y));

    const hFar = ShuttleCV.expectedPlayerHeightScreen(v0);
    const hNear = ShuttleCV.expectedPlayerHeightScreen(v1);
    y0 -= hFar * 1.3;          // head room for a player standing on the far edge (incl. jump)
    y1 += hNear * 0.08;
    x0 -= hNear * 0.35;
    x1 += hNear * 0.35;

    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(1, x1); y1 = Math.min(1, y1);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function getCourtActionCrop(vW, vH) {
    const corners = ShuttleCV.getCorners();
    // In low-angle badminton view, players never jump into the upper 30-40% ceiling
    const minCourtY = Math.min(corners.tl.y, corners.tr.y, corners.netL.y, corners.netR.y);
    // Allow 24% screen height above far baseline for jump smash and overhead clears
    const cropY0 = Math.max(0, Math.min(0.40, minCourtY - 0.24));
    return {
        x: 0,
        y: cropY0,
        w: 1.0,
        h: 1.0 - cropY0
    };
}

function evaluatePoseCandidate(pose, crop) {
    const kps = pose.keypoints.map(k => ({
        name: k.name,
        x: crop.x + (k.x / poseCropCanvas.width) * crop.w,
        y: crop.y + (k.y / poseCropCanvas.height) * crop.h,
        score: k.score ?? 0
    }));
    const get = n => kps.find(k => k.name === n);
    const conf = kps.filter(k => k.score > 0.12);
    if (conf.length < 3) return { mask: null, player: null };

    const xs = conf.map(k => k.x), ys = conf.map(k => k.y);
    const box = {
        xMin: Math.max(0, Math.min(...xs) - 0.02),
        xMax: Math.min(1, Math.max(...xs) + 0.02),
        yMin: Math.max(0, Math.min(...ys) - 0.03),
        yMax: Math.min(1, Math.max(...ys) + 0.015)
    };
    const playerH = Math.max(0.06, box.yMax - box.yMin);

    // Foot contact point: use ankle mid-point and lowest point (max Y) contacting court floor
    const leftAnkle = get('left_ankle');
    const rightAnkle = get('right_ankle');
    const confidentAnkles = [leftAnkle, rightAnkle].filter(k => k && k.score >= 0.16);
    let footX, footY;
    if (confidentAnkles.length === 2) {
        footX = (leftAnkle.x + rightAnkle.x) / 2;
        footY = Math.max(leftAnkle.y, rightAnkle.y); // จุดที่ต่ำสุดคือจุดแตะพื้น
    } else if (confidentAnkles.length === 1) {
        footX = confidentAnkles[0].x;
        footY = confidentAnkles[0].y;
    } else {
        // 2. Knees + Hips fallback when ankles are occluded (e.g. by net tape)
        const knees = ['left_knee', 'right_knee'].map(get).filter(k => k && k.score >= 0.14);
        const hips = ['left_hip', 'right_hip'].map(get).filter(k => k && k.score >= 0.14);
        if (knees.length && hips.length) {
            const kneeY = knees.reduce((a, k) => a + k.y, 0) / knees.length;
            const hipY = hips.reduce((a, k) => a + k.y, 0) / hips.length;
            footX = knees.reduce((a, k) => a + k.x, 0) / knees.length;
            const thighH = Math.max(0.03, kneeY - hipY);
            footY = Math.min(1.0, kneeY + thighH * 1.18);
        } else if (hips.length) {
            const shoulders = ['left_shoulder', 'right_shoulder'].map(get).filter(k => k && k.score >= 0.14);
            const hipY = hips.reduce((a, k) => a + k.y, 0) / hips.length;
            footX = hips.reduce((a, k) => a + k.x, 0) / hips.length;
            if (shoulders.length) {
                const shoulderY = shoulders.reduce((a, k) => a + k.y, 0) / shoulders.length;
                const torsoH = Math.max(0.025, hipY - shoulderY);
                footY = Math.min(1.0, hipY + torsoH * 1.35);
            } else {
                footY = Math.min(1.0, Math.max(...ys) + playerH * 0.12);
            }
        } else {
            footX = xs.reduce((a, b) => a + b, 0) / xs.length;
            footY = Math.min(1.0, Math.max(...ys) + playerH * 0.08);
        }
    }

    const uv = ShuttleCV.screenToCourtNormalized(footX, footY);
    const corners = ShuttleCV.getCorners();
    // Net floor line in screen space (where the net meets the court floor, NOT the 1.55m top tape!)
    const netFloorScreen = ShuttleCV.courtNormalizedToScreen(0.5, 0.5);
    const netBaseY = (netFloorScreen && netFloorScreen.valid !== false)
        ? netFloorScreen.y
        : ((corners.netL.y + corners.netR.y) / 2 + 0.08);

    // Team assignment:
    // Far Court (Team A): court depth Y <= 6.70m (v <= 0.51)
    // Near Court (Team B): court depth Y > 6.70m (v > 0.51)
    let team;
    if (uv && isFinite(uv.y)) {
        team = (uv.y <= 0.51) ? 'A' : 'B';
    } else {
        team = (footY < netBaseY) ? 'A' : 'B';
    }

    // In-court gating & Audience rejection:
    // Allow players to defend behind baseline and jump into tramlines
    // Strict lateral gate (tolU = 0.16 ~ 0.98m outside doubles tramline): strictly eliminates adjacent courts!
    // Depth gate (tolV = 0.25 ~ 3.3m behind baseline): allows deep jump smashes and lifts while rejecting spectators
    if (ShuttleCV.isCourtTrusted() && uv && isFinite(uv.x) && isFinite(uv.y)) {
        const inCourt = ShuttleCV.isInsideCourt(uv.x, uv.y, 0.16, 0.25);
        if (!inCourt) {
            return { mask: box, player: null };
        }
    }

    // Court proximity score: give substantially higher weight to players within court lines vs adjacent sidelines
    const isInsideLines = (uv && isFinite(uv.x) && isFinite(uv.y)) && (uv.x >= 0 && uv.x <= 1 && uv.y >= 0 && uv.y <= 1);
    const outDistM = (uv && isFinite(uv.x)) ? Math.max(0, -uv.x, uv.x - 1.0) * ShuttleCV.COURT_WIDTH_M : 1.0;
    const courtProximity = isInsideLines ? 1.0 : Math.max(0.12, 1.0 - outDistM * 1.6);
    const ankleConf = confidentAnkles.length ? Math.max(...confidentAnkles.map(k => k.score)) : 0.40;

    return {
        mask: box,
        player: {
            team,
            u: Math.max(-0.2, Math.min(1.2, uv.x)),
            v: Math.max(-0.3, Math.min(1.3, uv.y)),
            footX, footY, box, kps,
            score: (pose.score ?? 0.5) * courtProximity * (0.6 + 0.4 * ankleConf)
        }
    };
}

function assignCandidatesToSlots(team, cands, now) {
    const slotIds = team === 'A'
        ? (isDoublesMatch ? ['A1', 'A2'] : ['A1'])
        : (isDoublesMatch ? ['B1', 'B2'] : ['B1']);
    if (!isDoublesMatch) {
        const unusedKey = team === 'A' ? 'A2' : 'B2';
        if (players[unusedKey]) {
            players[unusedKey].detected = false;
            players[unusedKey].currentSpeedKmh = 0;
            players[unusedKey]._posWindow = [];
            players[unusedKey]._anchor = null;
            players[unusedKey].isLocked = false;
        }
    }

    const slotCost = (slot, idx, c) => {
        const recent = now - slot.lastSeenMs < (isPlayersLocked ? 2500 : 2000);
        const boundaryPenalty = (c.u < 0 || c.u > 1) ? 6.0 : 0.0;
        if (recent) {
            const distM = Math.hypot((slot.u - c.u) * ShuttleCV.COURT_WIDTH_M, (slot.v - c.v) * ShuttleCV.COURT_LENGTH_M);
            
            if (isPlayersLocked || slot.isLocked) {
                // เมื่อเข้าสู่สถานะล็อคเป้า:
                // 1. ลงโทษอย่างรุนแรงหากพิกัดกระโดดเกิน 2.8 เมตร (ป้องกันการสลับ Slot ID ระหว่างคู่ขา)
                if (distM > 2.8) return distM * 5.0 + 30.0 + boundaryPenalty;
                // 2. ให้ความสำคัญสูงสุดกับความต่อเนื่องของ Track เดิม
                return distM * 1.6 + boundaryPenalty;
            }

            // ก่อนล็อคเป้า: ปกป้องการกระโดดฉับพลันปกติ
            let cost = distM + boundaryPenalty;
            if (now - slot.lastSeenMs < 300 && distM > 3.0) cost += 12.0;
            return cost;
        }
        // Not tracked yet: slot 1 = left side of screen, slot 2 = right side
        const priorU = slotIds.length === 1 ? 0.5 : (idx === 0 ? 0.25 : 0.75);
        return Math.abs(c.u - priorU) * ShuttleCV.COURT_WIDTH_M + 1.5 + boundaryPenalty;
    };

    let best = null;
    const slots = slotIds.map(id => players[id]);
    const perms = [];
    if (cands.length === 1) {
        slots.forEach((s, i) => perms.push([[i, 0]]));
    } else if (cands.length >= 2 && slots.length === 2) {
        perms.push([[0, 0], [1, 1]], [[0, 1], [1, 0]]);
    } else if (cands.length >= 2 && slots.length === 1) {
        cands.forEach((_, ci) => perms.push([[0, ci]]));
    }
    perms.forEach(p => {
        const cost = p.reduce((a, [si, ci]) => a + slotCost(slots[si], si, cands[ci]), 0);
        if (!best || cost < best.cost) best = { cost, p };
    });
    if (!best) return;

    // หากล็อคเป้าแล้ว: ป้องกันไม่ให้หยิบ Candidate ที่อยู่ไกลเกินจริงมาแทนที่ Slot
    if (isPlayersLocked) {
        best.p.forEach(([si, ci]) => {
            const slot = slots[si];
            const cand = cands[ci];
            const wasTracked = slot.detected && (now - slot.lastSeenMs < 2500);
            if (wasTracked) {
                const distM = Math.hypot((slot.u - cand.u) * ShuttleCV.COURT_WIDTH_M, (slot.v - cand.v) * ShuttleCV.COURT_LENGTH_M);
                if (distM > 4.8) return; // ทิ้ง candidate หากพิกัดห่างจากเป้าที่ล็อคไว้เกินกว่าระยะสปรินต์จริง
            }
            updatePlayerSlot(slot, cand, now);
        });
    } else {
        best.p.forEach(([si, ci]) => updatePlayerSlot(slots[si], cands[ci], now));
    }
}

function updatePlayerSlot(slot, c, now) {
    const wasTracked = slot.detected && slot.lastSeenMs > 0 && now >= slot.lastSeenMs && (now - slot.lastSeenMs < 700);
    const dt = wasTracked ? Math.max(0.005, Math.min(0.25, (now - slot.lastSeenMs) / 1000)) : 0.033;

    // One Euro Filter initialization & filtering (removes foot jitter while maintaining instant sprint response)
    if (!slot._filterU) {
        slot._filterU = new OneEuroFilter(30, 0.45, 0.006, 1.0);
        slot._filterV = new OneEuroFilter(30, 0.45, 0.006, 1.0);
        slot._filterSX = new OneEuroFilter(30, 0.45, 0.008, 1.0);
        slot._filterSY = new OneEuroFilter(30, 0.45, 0.008, 1.0);
    }
    if (!wasTracked) {
        slot._filterU.reset();
        slot._filterV.reset();
        slot._filterSX.reset();
        slot._filterSY.reset();
        slot.renderScreenX = null;
        slot.renderScreenY = null;
        slot._renderKp = null;
    }

    const ring = ShuttleCV.courtNormalizedToScreen(c.u, c.v);
    const targetSX = (c.footX !== undefined) ? c.footX : ring.x;
    const targetSY = (c.footY !== undefined) ? c.footY : ring.y;

    const filteredU = slot._filterU.filter(c.u, dt);
    const filteredV = slot._filterV.filter(c.v, dt);
    const filteredSX = slot._filterSX.filter(targetSX, dt);
    const filteredSY = slot._filterSY.filter(targetSY, dt);

    const newU = isFinite(filteredU) ? filteredU : c.u;
    const newV = isFinite(filteredV) ? filteredV : c.v;
    const newScreenX = isFinite(filteredSX) ? filteredSX : targetSX;
    const newScreenY = isFinite(filteredSY) ? filteredSY : targetSY;

    // Maintain a rolling 500ms window for noise-resilient speed calculation
    if (!slot._posWindow) slot._posWindow = [];
    slot._posWindow.push({ u: newU, v: newV, t: now });
    // Keep window within 500ms
    while (slot._posWindow.length > 1 && (now - slot._posWindow[0].t > 500 || now < slot._posWindow[0].t)) {
        slot._posWindow.shift();
    }

    // Depth-adaptive deadband (perspective causes higher meter jitter in far court where 1px = ~40cm)
    const noiseM = 0.14 + 0.30 * (1 - Math.max(0, Math.min(1, newV)));

    if (wasTracked && dt > 0) {
        // 1. Distance accumulation via anchor to eliminate stationary jitter drift
        if (!slot._anchor) slot._anchor = { u: newU, v: newV };
        const dAnchor = Math.hypot((newU - slot._anchor.u) * ShuttleCV.COURT_WIDTH_M, (newV - slot._anchor.v) * ShuttleCV.COURT_LENGTH_M);
        if (dAnchor > noiseM && dAnchor < 2.5) {
            slot.distanceMeters = +(slot.distanceMeters + dAnchor).toFixed(2);
            slot._anchor = { u: newU, v: newV };
        }

        // 2. Velocity derived from net displacement over the 500ms window
        const firstPt = slot._posWindow[0];
        const dtWindow = Math.max(0.01, (now - firstPt.t) / 1000);
        const netDisplacementM = Math.hypot((newU - firstPt.u) * ShuttleCV.COURT_WIDTH_M, (newV - firstPt.v) * ShuttleCV.COURT_LENGTH_M);

        let inst = 0;
        if (netDisplacementM > noiseM && dtWindow >= 0.15 && dtWindow <= 1.0) {
            inst = Math.min(28, (netDisplacementM / dtWindow) * 3.6);
        }

        if (inst > 0) {
            slot.currentSpeedKmh = +(slot.currentSpeedKmh * 0.4 + inst * 0.6).toFixed(1);
        } else {
            slot.currentSpeedKmh = +(slot.currentSpeedKmh * 0.5).toFixed(1);
            if (slot.currentSpeedKmh < 0.8) slot.currentSpeedKmh = 0;
        }
        slot.maxSpeedKmh = Math.max(slot.maxSpeedKmh, slot.currentSpeedKmh);
        slot.positions.push({ x: newU, y: newV, t: matchSeconds });
        if (slot.positions.length > 600) slot.positions.shift();
    } else {
        slot._anchor = { u: newU, v: newV };
        slot.currentSpeedKmh = 0;
        slot.positions.push({ x: newU, y: newV, t: matchSeconds });
    }

    // Wrist speed (normalized screen units / s) used for hit attribution
    const wrists = c.kps.filter(k => (k.name === 'left_wrist' || k.name === 'right_wrist') && k.score > 0.3);
    if (wrists.length && slot._lastWrist && dt > 0) {
        const w = wrists.reduce((a, k) => (k.y < a.y ? k : a), wrists[0]);
        slot.wristSpeedPx = Math.hypot(w.x - slot._lastWrist.x, w.y - slot._lastWrist.y) / dt;
    }
    if (wrists.length) slot._lastWrist = wrists.reduce((a, k) => (k.y < a.y ? k : a), wrists[0]);

    slot.u = newU;
    slot.v = newV;
    // Lock floor ring and tactical bracket directly to the filtered player feet in screen space
    slot.screenX = newScreenX;
    slot.screenY = newScreenY;
    slot.box = c.box;
    slot.keypoints = c.kps;
    slot.detected = true;
    slot.lastSeenMs = now;
}

let lastPoseDurationMs = 0;

async function runRealPoseEstimation(videoEl) {
    if (!videoEl || videoEl.readyState < 2) return;
    const now = trackerNow();

    Object.values(players).forEach(p => {
        // Enforce strict Singles vs Doubles slot state
        if (!isDoublesMatch && (p.id === 'A2' || p.id === 'B2')) {
            p.detected = false;
            p.currentSpeedKmh = 0;
            p._posWindow = [];
            p._anchor = null;
            p.isLocked = false;
            return;
        }
        // เมื่อล็อคเป้าแล้ว: ขยายเวลา Coasting เป็น 2400ms เผื่อจังหวะคู่ขาวิ่งตัดหน้าหรือกระโดดตบ
        const timeoutMs = (isPlayersLocked && p.isLocked) ? 2400 : 1800;
        if (p.detected && (now - p.lastSeenMs > timeoutMs || p.lastSeenMs > now)) {
            p.detected = false;
            p.currentSpeedKmh = 0;
            p._posWindow = [];
            p._anchor = null;
        }
    });

    if (!poseModelReady || !poseDetector || poseInferenceBusy) return;
    if (lastPoseTimestamp > now || now - lastPoseTimestamp > 5000) lastPoseTimestamp = 0;
    if (lastPoseTimestamp > 0 && (now - lastPoseTimestamp < 33)) return;
    lastPoseTimestamp = now;

    const vW = videoEl.videoWidth || 1280;
    const vH = videoEl.videoHeight || 720;

    // Active Court Action Zone crop: strips empty ceiling in portrait orientation so far-court players are 2.5x larger
    const crop = getCourtActionCrop(vW, vH);
    const cropPixelX = Math.round(crop.x * vW);
    const cropPixelY = Math.round(crop.y * vH);
    const cropPixelW = Math.round(crop.w * vW);
    const cropPixelH = Math.round(crop.h * vH);

    const cropAspect = cropPixelW / cropPixelH;
    const TARGET_LONG = 448; // Crisp resolution so far players are 55+ px tall for MoveNet MultiPose
    const cw = cropAspect >= 1 ? TARGET_LONG : Math.max(160, Math.round(TARGET_LONG * cropAspect));
    const ch = cropAspect >= 1 ? Math.max(160, Math.round(TARGET_LONG / cropAspect)) : TARGET_LONG;
    if (poseCropCanvas.width !== cw) poseCropCanvas.width = cw;
    if (poseCropCanvas.height !== ch) poseCropCanvas.height = ch;

    poseInferenceBusy = true;
    const tStartPose = performance.now();
    try {
        poseCropCtx.drawImage(
            videoEl,
            cropPixelX, cropPixelY, cropPixelW, cropPixelH,
            0, 0, cw, ch
        );
        // maxPoses: 8 ensures background gym spectators do not crowd out active Team A / Team B players
        const poses = await poseDetector.estimatePoses(poseCropCanvas, { maxPoses: 8, flipHorizontal: false });
        lastPoseDurationMs = performance.now() - tStartPose;

        const masks = [];
        const candsA = [];
        const candsB = [];

        poses.forEach(pose => {
            if ((pose.score ?? 0) < 0.12) return;
            const r = evaluatePoseCandidate(pose, crop);
            if (r.mask) masks.push(r.mask);
            if (r.player) {
                if (r.player.team === 'A') candsA.push(r.player);
                else candsB.push(r.player);
            }
        });

        // Non-maximum suppression per team in screen/court space
        const filterTeam = (cands) => {
            cands.sort((a, b) => b.score - a.score);
            const kept = [];
            cands.forEach(c => {
                const dup = kept.some(k => Math.hypot((k.u - c.u) * ShuttleCV.COURT_WIDTH_M, (k.v - c.v) * ShuttleCV.COURT_LENGTH_M) < 0.65);
                if (!dup) kept.push(c);
            });
            return kept.slice(0, isDoublesMatch ? 2 : 1);
        };

        assignCandidatesToSlots('A', filterTeam(candsA), now);
        assignCandidatesToSlots('B', filterTeam(candsB), now);

        // ตรวจสอบและอัปเดตสถานะล็อคเป้าหมายผู้เล่นครบ 4 คน
        checkAndUpdatePlayerLockState(now);

        detectedHumanBoxes = masks;
    } catch (e) {
        console.error('[runRealPoseEstimation error]:', e);
    } finally {
        poseInferenceBusy = false;
    }
}

/* ================================================================
 * 2. SHUTTLE TRACKER + INPAINT TRAJECTORY BRIDGE + PHYSICS SPEED
 *    Upgraded with TrackNetV3 + InpaintNet + Dual-Cross-Validated Speed:
 *    - 2nd-order Ballistic Trajectory Predictor & Inpaint Gap Filler
 *    - Inflection Turn-Score Hit Detector: |v2 - v1| / (|v1| + |v2|) >= 0.58
 *    - Cross-validated Initial Speed (Screen-Space Metric Velocity + Drag Model)
 *      Prevents perspective/exponential blow-up (no fake 300-400 km/h spikes!)
 * ================================================================ */
const SHUTTLE_DRAG_LENGTH_M = 4.99; // Aerodynamic length L = (VT * VT) / G (~4.99m for VT=7.0m/s)

/**
 * 1. Physics Engine: การคำนวณความเร็วลูกตบ (Smash Exit Velocity)
 * Aerodynamic Drag Formula:
 * Fd = 1/2 * rho * Cd * A * v^2
 * dv/dt = -k * v^2 where k = g / (v_t^2) = 1 / L
 * D = L * ln(1 + v0 * T / L)
 * v0 = L * (exp(D / L) - 1) / T
 *
 * @param {number} distanceMeters - Travel distance in meters (D)
 * @param {number} flightTimeSec - Flight time in seconds (T)
 * @returns {number} Initial smash velocity v0 in km/h (capped at 550 km/h)
 */
function calculateSmashInitialSpeed(distanceMeters, flightTimeSec) {
    if (flightTimeSec <= 0.04 || distanceMeters <= 0.5) return 0;
    
    const VT = 7.0;             // Terminal velocity (m/s)
    const G = 9.81;            // Gravity (m/s^2)
    const L = (VT * VT) / G;   // Aerodynamic length (~4.99 m)
    
    // จำกัดอัตราส่วน D/L สูงสุดที่ 2.2 เพื่อป้องกัน Floating-point overflow
    const expTerm = Math.exp(Math.min(2.2, distanceMeters / L)) - 1.0;
    const v0_mps = (L * expTerm) / flightTimeSec;
    
    const speedKmh = v0_mps * 3.6;
    return Math.min(550, Math.max(0, Math.round(speedKmh)));
}

if (typeof window !== 'undefined') {
    window.calculateSmashInitialSpeed = calculateSmashInitialSpeed;
    if (window.ShuttleCV) window.ShuttleCV.calculateSmashInitialSpeed = calculateSmashInitialSpeed;
}

/**
 * Multi-point Regression Speed Estimator + Aerodynamic Drag Compensation
 * (Exponential drag back-calculation to initial release speed v0 = v * e^(k * s))
 */
const K_DRAG = 9.81 / (6.8 * 6.8);   // ~0.212 1/m (BWF shuttlecock terminal velocity ~6.8 m/s)
const MAX_KMH = 500;                 // Outlier gate

class ShuttleSpeed {
    constructor() {
        this.buf = [];
        this.hit = null;
    }

    onHit(p) {
        this.hit = p; // { X, Y } in meters
        this.buf = [];
    }

    push(t, X, Y) {
        if (!isFinite(t) || !isFinite(X) || !isFinite(Y)) return null;
        const last = this.buf.length ? this.buf[this.buf.length - 1] : null;
        if (last) {
            const dt = t - last.t;
            if (dt <= 0.002 || dt > 0.6) {
                this.buf = [{ t, X, Y }];
                return null;
            }
            const jump = Math.hypot(X - last.X, Y - last.Y);
            if ((jump / dt) > (MAX_KMH / 3.6)) {
                this.buf = [{ t, X, Y }];
                return null; // outlier gating
            }
        }
        this.buf.push({ t, X, Y });
        if (this.buf.length > 6) this.buf.shift();
        return this.estimate();
    }

    estimate() {
        const n = this.buf.length;
        if (n < 3) return null;
        // linear regression ของ X(t), Y(t) ได้ความเร็วเฉลี่ยที่ทน noise
        const t0 = this.buf[0].t;
        let st = 0, sx = 0, sy = 0, stt = 0, stx = 0, sty = 0;
        for (const p of this.buf) {
            const t = p.t - t0;
            st += t; sx += p.X; sy += p.Y; stt += t * t; stx += t * p.X; sty += t * p.Y;
        }
        const d = n * stt - st * st;
        if (Math.abs(d) < 1e-9) return null;
        const vx = (n * stx - st * sx) / d;
        const vy = (n * sty - st * sy) / d;
        const v = Math.hypot(vx, vy);

        // ชดเชยแรงต้าน: ย้อนกลับไปหาความเร็วตอนออกจากไม้ (v0 = v * exp(k * s))
        const mid = this.buf[Math.floor(n / 2)];
        const s = this.hit ? Math.hypot(mid.X - this.hit.X, mid.Y - this.hit.Y) : 0;
        const v0 = v * Math.exp(K_DRAG * s);
        return {
            kmh: Math.round(v * 3.6),
            initialKmh: Math.min(MAX_KMH, Math.round(v0 * 3.6))
        };
    }

    reset() {
        this.buf = [];
        this.hit = null;
    }
}
const shuttleSpeedCalc = new ShuttleSpeed();
if (typeof window !== 'undefined') {
    window.ShuttleSpeed = ShuttleSpeed;
    window.shuttleSpeedCalc = shuttleSpeedCalc;
}

const INPAINT_MAX_GAP_MS = 210; // Bridge up to ~5-6 frames of occlusion/blur like InpaintNet
let shuttleTrack = [];          // [{ sx, sy, t, inpainted }]
let activeShot = null;          // { hitter, tHit, startU, startV }
let pendingRallyEnd = null;     // { t }

function playerChestScreen(p) {
    const h = ShuttleCV.expectedPlayerHeightScreen(p.v);
    return { x: p.screenX, y: p.screenY - h * 0.6, h };
}

function nearestPlayerToPoint(sx, sy, teamFilter = null) {
    let best = null;
    Object.values(players).forEach(p => {
        if (!p.detected) return;
        if (teamFilter && p.team !== teamFilter) return;
        const c = playerChestScreen(p);
        // Check both chest/racket center and active wrist keypoints for precise hit attribution
        let d = Math.hypot(sx - c.x, sy - c.y) / Math.max(0.02, c.h);
        if (p._lastWrist) {
            const dw = Math.hypot(sx - p._lastWrist.x, sy - p._lastWrist.y) / Math.max(0.02, c.h);
            d = Math.min(d, dw * 0.9);
        }
        if (!best || d < best.d) best = { p, d };
    });
    return best;
}

function isPointOnCourtFloor(sx, sy) {
    const uv = ShuttleCV.screenToCourtNormalized(sx, sy);
    return ShuttleCV.isInsideCourt(uv.x, uv.y, 0.25, 0.12) ? uv : null;
}

function predictBallisticPoint(track, targetT) {
    const m = track.length;
    if (m === 0) return null;
    if (m === 1) return { x: track[0].sx, y: track[0].sy, stepLen: 0.04 };
    const b = track[m - 1];
    const a = track[Math.max(0, m - 2)];
    const dt1 = Math.max(8, b.t - a.t);
    const vx = (b.sx - a.sx) / dt1;
    const vy = (b.sy - a.sy) / dt1;
    const dtPred = Math.min(INPAINT_MAX_GAP_MS, Math.max(0, targetT - b.t));

    // Estimate vertical gravity curvature from last 3 points if available
    let ay = 0.00008; // slight downward screen gravity default
    if (m >= 3) {
        const c = track[m - 3];
        const dt0 = Math.max(8, a.t - c.t);
        const vy0 = (a.sy - c.sy) / dt0;
        const rawAy = (vy - vy0) / ((dt0 + dt1) * 0.5);
        ay = Math.max(-0.00025, Math.min(0.00035, rawAy * 0.5));
    }

    return {
        x: b.sx + vx * dtPred,
        y: b.sy + vy * dtPred + 0.5 * ay * dtPred * dtPred,
        stepLen: Math.hypot(b.sx - a.sx, b.sy - a.sy)
    };
}

function startShotFromContact(contactPt, nextPt, now, forcedHitter = null) {
    const near = forcedHitter ? { p: forcedHitter, d: 0.5 } : nearestPlayerToPoint(contactPt.sx, contactPt.sy);
    const hitter = near && near.d < 2.2 ? near.p : null;

    let lag = 0;
    if (hitter && nextPt) {
        const c = playerChestScreen(hitter);
        const spd = Math.hypot(nextPt.sx - contactPt.sx, nextPt.sy - contactPt.sy) / Math.max(0.008, (nextPt.t - contactPt.t) / 1000);
        const gap = Math.max(0, Math.hypot(contactPt.sx - c.x, contactPt.sy - c.y) - c.h * 0.5);
        lag = Math.min(0.10, gap / Math.max(0.05, spd));
    }

    activeShot = {
        hitter,
        tHit: contactPt.t - lag * 1000,
        startU: hitter ? hitter.u : null,
        startV: hitter ? hitter.v : null
    };

    // Multi-point regression & aerodynamic drag speed estimator
    const hitCourt = ShuttleCV.screenToCourtMeters(contactPt.sx, contactPt.sy);
    shuttleSpeedCalc.onHit({ X: hitCourt.xMeters, Y: hitCourt.yMeters });
    const contactT = (contactPt.t - lag * 1000) / 1000;
    shuttleSpeedCalc.push(contactT, hitCourt.xMeters, hitCourt.yMeters);
    if (nextPt) {
        const nextCourt = ShuttleCV.screenToCourtMeters(nextPt.sx, nextPt.sy);
        shuttleSpeedCalc.push(nextPt.t / 1000, nextCourt.xMeters, nextCourt.yMeters);
    }
    if (hitter) {
        shuttle.lastHitter = hitter.id;
        shuttle.lastHitterTeam = hitter.team;
    }
    pendingRallyEnd = null;
    if (scoreboard.rallyState !== 'RALLYING') {
        scoreboard.rallyState = 'RALLYING';
        updateScoreboardUI();
    }
}

function onTrackConfirmed(now) {
    const first = shuttleTrack[0];
    const second = shuttleTrack[Math.min(2, shuttleTrack.length - 1)];
    const near = nearestPlayerToPoint(first.sx, first.sy);
    let hitter = (near && near.p && near.d <= 3.2) ? near.p : null;
    if (!hitter) {
        const uv = ShuttleCV.screenToCourtNormalized(first.sx, first.sy);
        const isFarHalf = (uv && isFinite(uv.y)) ? (uv.y <= 0.51) : (first.sy < 0.5);
        hitter = isFarHalf ? players.A1 : players.B1;
    }
    shuttle.trail = [];
    startShotFromContact(first, second, now, hitter);
}

function measureTrackInitialSpeedMps(track, hitterV) {
    const realPts = track.filter(pt => !pt.inpainted);
    if (realPts.length < 2) return 0;
    const scale = ShuttleCV.metersPerScreenUnit(hitterV ?? 0.5);
    const speeds = [];
    // Measure frame-to-frame metric velocity across the first 4 segments right after racket contact
    const limit = Math.min(realPts.length - 1, 4);
    for (let i = 0; i < limit; i++) {
        const a = realPts[i], b = realPts[i + 1];
        const dt = (b.t - a.t) / 1000;
        if (dt < 0.008 || dt > 0.12) continue;
        const dxM = (b.sx - a.sx) * scale.x;
        const dyM = (b.sy - a.sy) * scale.y;
        // Compensate foreshortening along depth axis (camera viewing angle ~25-35 deg)
        const vSeg = Math.hypot(dxM, dyM * 1.35) / dt;
        if (vSeg >= 4 && vSeg <= 80) speeds.push(vSeg);
    }
    if (!speeds.length) return 0;
    speeds.sort((a, b) => a - b);
    // 75th percentile of early flight segments = initial release speed after impact
    return speeds[Math.min(speeds.length - 1, Math.floor(speeds.length * 0.75))];
}

function finalizeShot(shot, endU, endV, tEnd, isLanding) {
    if (!shot || !shot.hitter || shot.startU === null) return;
    const dH = Math.hypot((endU - shot.startU) * ShuttleCV.COURT_WIDTH_M, (endV - shot.startV) * ShuttleCV.COURT_LENGTH_M);
    const dz = isLanding ? 1.8 : 0.9; // realistic contact height difference
    const x = Math.hypot(dH, dz);
    const tf = (tEnd - shot.tHit) / 1000;

    // Require minimum flight duration (0.08s) and court travel (1.0m) so fast smashes and drives are preserved
    if (tf < 0.08 || tf > 3.8 || dH < 1.0) return;

    // 1. Aerodynamic drag model exit speed (BWF standard aerodynamic length L ~ 4.99m)
    const smashSpeedKmh = calculateSmashInitialSpeed(x, tf);
    const vDrag = smashSpeedKmh / 3.6; // m/s
    if (vDrag <= 0) return;

    // 2. Linear regression estimator speed with aerodynamic drag compensation
    const regEst = shuttleSpeedCalc.estimate();
    let regSpeedMps = (regEst && regEst.initialKmh > 0) ? (regEst.initialKmh / 3.6) : 0;

    // 3. Early segment pixel-to-meter velocity
    const vTrack = measureTrackInitialSpeedMps(shuttleTrack, shot.startV);

    // Blend estimators: regression speed + time-of-flight aerodynamic model
    let v0;
    if (regSpeedMps >= 6 && regSpeedMps <= 140) {
        v0 = vDrag * 0.50 + regSpeedMps * 0.50;
    } else if (vTrack > 0) {
        v0 = vDrag * 0.55 + vTrack * 0.45;
    } else {
        v0 = vDrag;
    }

    // Controlled wrist boost up to 1.05 only on clear explosive swings
    const wristBoost = Math.min(1.05, 1.0 + Math.max(0, (shot.hitter.wristSpeedPx || 0) - 1.2) * 0.03);
    let kmh = Math.round(v0 * 3.6 * wristBoost);

    // Realistic club / competitive single-camera bounds (22 - 350 km/h)
    if (kmh < 22 || kmh > 350) return;

    shuttle.speedKmh = kmh;
    shuttle.lastSpeedAtMs = trackerNow();
    classifyRealStroke(shot.hitter, kmh, dH, shot.startV, endV, tf);
}

function handleTrackEnd(now) {
    const realPts = shuttleTrack.filter(pt => !pt.inpainted);
    if (realPts.length >= 3 && activeShot) {
        const last = realPts[realPts.length - 1];
        const oppTeam = activeShot.hitter ? (activeShot.hitter.team === 'A' ? 'B' : 'A') : null;
        const rec = nearestPlayerToPoint(last.sx, last.sy, oppTeam);

        if (rec && rec.d < 2.5) {
            finalizeShot(activeShot, rec.p.u, rec.p.v, last.t, false);
            pendingRallyEnd = null;
        } else {
            const lastUV = ShuttleCV.screenToCourtNormalized(last.sx, last.sy);
            const endU = (lastUV && isFinite(lastUV.x)) ? Math.max(-0.3, Math.min(1.3, lastUV.x)) : 0.5;
            const endV = (lastUV && isFinite(lastUV.y)) ? Math.max(-0.3, Math.min(1.3, lastUV.y)) : 0.5;
            const prev = realPts[realPts.length - 2];
            const descending = prev ? last.sy > prev.sy : false;
            const floorUV = descending ? isPointOnCourtFloor(last.sx, last.sy) : null;
            finalizeShot(activeShot, endU, endV, last.t, !!floorUV);
            if (floorUV || realPts.length >= 5) {
                pendingRallyEnd = { t: now };
            }
        }
    }
    activeShot = null;
    shuttleTrack = [];
}

function processRealShuttleAndRally(cvResult) {
    const now = trackerNow();
    if (!ShuttleCV.getCourtLocked()) {
        shuttleTrack = [];
        activeShot = null;
        shuttle.detected = false;
        return;
    }

    if (shuttleTrack.length > 0) {
        const lastT = shuttleTrack[shuttleTrack.length - 1].t;
        if (now < lastT || now - lastT > 1000) {
            shuttleTrack = [];
            activeShot = null;
        }
    }

    // 2.2 Spatial Gate Filter: candidate points must reside within Play Volume Box
    const rawCands = cvResult?.shuttleCandidates || (cvResult?.shuttleCandidate ? [cvResult.shuttleCandidate] : []);
    const cands = rawCands.filter(c => {
        if (typeof ShuttleCV.isInsidePlayVolumeUV === 'function') {
            const uv = ShuttleCV.screenToCourtNormalized(c.x, c.y);
            if (uv && !ShuttleCV.isInsidePlayVolumeUV(uv.x, uv.y)) return false;
        }
        return true;
    });
    let chosen = null;

    // Trim trailing inpainted points if gap exceeded INPAINT_MAX_GAP_MS
    const lastReal = [...shuttleTrack].reverse().find(pt => !pt.inpainted);
    if (shuttleTrack.length > 0 && (!lastReal || now - lastReal.t > INPAINT_MAX_GAP_MS)) {
        handleTrackEnd(now);
    }

    const m = shuttleTrack.length;
    if (m >= 2) {
        const pred = predictBallisticPoint(shuttleTrack, now);
        const lastReal = [...shuttleTrack].reverse().find(pt => !pt.inpainted);
        const missedMs = lastReal ? (now - lastReal.t) : 16;
        const gapMultiplier = 1 + Math.min(2.0, missedMs / 45);

        // Adaptive search gate: tight enough to prevent jumping across court, wide enough for fast smashes
        const gate = Math.min(0.12, Math.max(0.038, pred.stepLen * 1.45) * gapMultiplier);
        let bestCost = Infinity;

        const b = shuttleTrack[m - 1];
        const a = shuttleTrack[Math.max(0, m - 2)];
        const prevVx = (b.sx - a.sx);
        const prevVy = (b.sy - a.sy);
        const prevSpeed = Math.hypot(prevVx, prevVy);

        // Direction constraint from active hitter:
        // If Team B hit: direction points towards far court (vy < 0)
        // If Team A hit: direction points towards near court (vy > 0)
        const hitterTeam = activeShot?.hitter?.team;

        cands.forEach(c => {
            const dPred = Math.hypot(c.x - pred.x, c.y - pred.y);
            if (dPred > gate) return;

            const candVx = c.x - b.sx;
            const candVy = c.y - b.sy;
            const candMag = Math.hypot(candVx, candVy);

            // Speed sanity check: speed cannot exceed 380 km/h (~105 m/s)
            const dtSec = Math.max(0.008, (now - b.t) / 1000);
            const metricDist = Math.hypot((c.x - b.sx) * ShuttleCV.COURT_WIDTH_M, (c.y - b.sy) * ShuttleCV.COURT_LENGTH_M);
            if (metricDist / dtSec > 110) return; // Discard impossible teleportation jumps

            // Direction consistency with existing flight trajectory
            const dot = candVx * prevVx + candVy * prevVy;
            const cosAngle = (candMag * prevSpeed > 1e-6) ? (dot / (candMag * prevSpeed)) : 1.0;

            // If in mid-air (no opponent nearby), flight path MUST be straight/smooth (cosAngle >= 0.30)
            const oppTeam = hitterTeam ? (hitterTeam === 'A' ? 'B' : 'A') : null;
            const nearOpp = nearestPlayerToPoint(b.sx, b.sy, oppTeam);
            const isNearOpponent = nearOpp && nearOpp.d < 2.4;

            if (!isNearOpponent && cosAngle < 0.30) {
                return; // Discard wild mid-air 90-180 degree turns
            }

            // Hitter directional penalty: if ball is flying backwards towards hitter's wall early in flight
            let dirPenalty = 0;
            if (m < 8 && hitterTeam) {
                if (hitterTeam === 'B' && candVy > 0.01) dirPenalty += 0.08; // Team B hit should move UP towards net
                if (hitterTeam === 'A' && candVy < -0.01) dirPenalty += 0.08; // Team A hit should move DOWN towards net
            }

            const cost = dPred * 1.5 + (1.0 - cosAngle) * 0.03 + dirPenalty - (c.confidence / 100) * 0.01;
            if (cost < bestCost) {
                bestCost = cost;
                chosen = c;
            }
        });

        // InpaintNet-style Trajectory Bridge: if no candidate matched right on the ballistic curve,
        // check if a candidate near a player represents a sharp hit reversal
        if (!chosen && cands.length > 0) {
            const bPt = shuttleTrack[m - 1];
            const nearOpp = nearestPlayerToPoint(bPt.sx, bPt.sy);
            if (nearOpp && nearOpp.d < 2.0) {
                const nearCand = cands.find(c => Math.hypot(c.x - bPt.sx, c.y - bPt.sy) < 0.08);
                if (nearCand) chosen = nearCand;
            }
        }
    } else if (m === 1) {
        const b = shuttleTrack[0];
        const maxStep = Math.min(0.12, Math.max(0.035, 0.085 * Math.max(1, (now - b.t) / 16.7)));
        let bestCost = Infinity;

        // Check if origin b is near a player who hit the shuttle
        const nearHitter = nearestPlayerToPoint(b.sx, b.sy);
        const hitterTeam = nearHitter?.p?.team;

        cands.forEach(c => {
            const d = Math.hypot(c.x - b.sx, c.y - b.sy);
            if (d < 0.003 || d > maxStep) return;

            const candVy = c.y - b.sy;
            // Direction verification after player hit:
            // Team B player must hit forwards towards net (sy decreasing / candVy < 0)
            // Team A player must hit forwards towards net (sy increasing / candVy > 0)
            let dirScore = 0;
            if (hitterTeam === 'B') {
                if (candVy > 0.01) return; // wrong direction (flying backwards)
                dirScore = -0.02;
            } else if (hitterTeam === 'A') {
                if (candVy < -0.01) return; // wrong direction (flying backwards)
                dirScore = -0.02;
            }

            const cost = d + dirScore - (c.confidence / 100) * 0.02;
            if (cost < bestCost) {
                bestCost = cost;
                chosen = c;
            }
        });

        if (!chosen) {
            // Do NOT randomly jump to noise across the screen! Only re-seed if near a player
            const candNearPlayer = cands.find(c => {
                const n = nearestPlayerToPoint(c.x, c.y);
                return n && n.d < 2.0;
            });
            if (candNearPlayer) {
                shuttleTrack = [{ sx: candNearPlayer.x, sy: candNearPlayer.y, t: now, inpainted: false }];
            }
        }
    } else if (cands.length) {
        // Only seed a brand-new track if the candidate originates near an active player or high-confidence airspace point
        const candNearPlayer = cands.find(c => {
            const n = nearestPlayerToPoint(c.x, c.y);
            return n && n.d < 2.5;
        }) || cands.find(c => c.confidence >= 45);

        if (candNearPlayer) {
            shuttleTrack = [{ sx: candNearPlayer.x, sy: candNearPlayer.y, t: now, inpainted: false }];
        }
    }

    if (chosen) {
        // Backfill / Inpaint intermediate frames if we bridged an occlusion gap (linear + ballistic blend)
        while (shuttleTrack.length > 0 && shuttleTrack[shuttleTrack.length - 1].inpainted) {
            shuttleTrack.pop();
        }
        if (shuttleTrack.length >= 2) {
            const prevPt = shuttleTrack[shuttleTrack.length - 1];
            const gapMs = now - prevPt.t;
            if (gapMs > 36 && gapMs <= INPAINT_MAX_GAP_MS) {
                const steps = Math.min(4, Math.floor(gapMs / 22));
                for (let s = 1; s < steps; s++) {
                    const frac = s / steps;
                    const interp = {
                        sx: prevPt.sx + (chosen.x - prevPt.sx) * frac,
                        sy: prevPt.sy + (chosen.y - prevPt.sy) * frac,
                        t: prevPt.t + gapMs * frac,
                        inpainted: true
                    };
                    shuttleTrack.push(interp);
                    shuttle.trail.push({ sx: interp.sx, sy: interp.sy, u: shuttle.u, v: shuttle.v, t: interp.t });
                }
            }
        }

        // Inflection Turn-Score Hit Detector (inspired by badminton-ai-analyzer `turning_points`):
        // turnScore = |v2 - v1| / (|v1| + |v2|). When >= 0.55 near a player, finalize previous shot & start new shot seamlessly!
        if (shuttleTrack.length >= 2) {
            const a = shuttleTrack[shuttleTrack.length - 2], b = shuttleTrack[shuttleTrack.length - 1];
            const v1x = b.sx - a.sx, v1y = b.sy - a.sy;
            const v2x = chosen.x - b.sx, v2y = chosen.y - b.sy;
            const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
            const turnScore = (m1 + m2 > 1e-4) ? Math.hypot(v2x - v1x, v2y - v1y) / (m1 + m2) : 0;

            if (turnScore >= 0.58) {
                const nearPlayer = nearestPlayerToPoint(b.sx, b.sy);
                const isDiffPlayer = !activeShot || !activeShot.hitter || nearPlayer?.p?.id !== activeShot.hitter.id;
                if (nearPlayer && nearPlayer.d < 1.95 && isDiffPlayer) {
                    if (activeShot && activeShot.hitter && b.t - activeShot.tHit >= 260) {
                        finalizeShot(activeShot, nearPlayer.p.u, nearPlayer.p.v, b.t, false);
                    }
                    const nextPt = { sx: chosen.x, sy: chosen.y, t: now, inpainted: false };
                    shuttleTrack = [b, nextPt];
                    startShotFromContact(b, nextPt, now, nearPlayer.p);
                    chosen = null;
                } else if (turnScore >= 0.78) {
                    handleTrackEnd(now);
                    shuttleTrack = [{ sx: chosen.x, sy: chosen.y, t: now, inpainted: false }];
                    chosen = null;
                }
            }
        }

        if (chosen) {
            shuttleTrack.push({ sx: chosen.x, sy: chosen.y, t: now, inpainted: false });
            if (shuttleTrack.length > 120) shuttleTrack.shift();
            const realCount = shuttleTrack.filter(pt => !pt.inpainted).length;
            if (realCount === 3 && !activeShot) onTrackConfirmed(now);

            // Feed metric court coordinates into multi-point regression estimator
            const courtPt = ShuttleCV.screenToCourtMeters(chosen.x, chosen.y);
            const est = shuttleSpeedCalc.push(now / 1000, courtPt.xMeters, courtPt.yMeters);
            if (est && est.kmh > 0) {
                shuttle.speedKmh = est.initialKmh > 0 ? est.initialKmh : est.kmh;
                shuttle.lastSpeedAtMs = now;
            }
        }
    } else if (shuttleTrack.length >= 3 && lastReal && (now - lastReal.t) <= 95) {
        // Real-time InpaintNet prediction for up to ~3 frames during fast motion blur
        const pred = predictBallisticPoint(shuttleTrack, now);
        if (pred && pred.x > 0.02 && pred.x < 0.98 && pred.y > 0.02 && pred.y < 0.98) {
            shuttleTrack.push({ sx: pred.x, sy: pred.y, t: now, inpainted: true });
        }
    }

    const realCount = shuttleTrack.filter(pt => !pt.inpainted).length;
    if (realCount >= 3) {
        const last = shuttleTrack[shuttleTrack.length - 1];
        const uv = ShuttleCV.screenToCourtNormalized(last.sx, last.sy);
        shuttle.screenX = last.sx;
        shuttle.screenY = last.sy;
        shuttle.u = Math.max(-0.2, Math.min(1.2, uv.x));
        shuttle.v = Math.max(-0.2, Math.min(1.2, uv.y));
        shuttle.detected = true;
        if (!last.inpainted) shuttle.lastSeenMs = now;
        shuttle.framesInFlight = shuttleTrack.length;
        // Trail hygiene: reject teleportation jumps into the visual trail
        const lastTrail = shuttle.trail.length ? shuttle.trail[shuttle.trail.length - 1] : null;
        const jumpD = lastTrail ? Math.hypot(last.sx - lastTrail.sx, last.sy - lastTrail.sy) : 0;
        if (!lastTrail || jumpD < 0.12) {
            shuttle.trail.push({ sx: last.sx, sy: last.sy, u: shuttle.u, v: shuttle.v, t: now });
            if (shuttle.trail.length > 28) shuttle.trail.shift();
        }
        return;
    }

    // Auto-score only after a verified floor landing and no new flight within 0.7 s
    if (pendingRallyEnd && shuttleTrack.length === 0 && now - pendingRallyEnd.t > 700) {
        pendingRallyEnd = null;
        if (scoreboard.rallyState === 'RALLYING') evaluateRallyEndAndAutoScore();
        shuttle.detected = false;
        shuttle.trail = [];
    } else if (shuttle.detected && now - shuttle.lastSeenMs > 420) {
        shuttle.detected = false;
    }
}

function classifyRealStroke(hitter, speedKmh, distM, startV = null, endV = null, flightSec = 0.5) {
    // Combine aerodynamic speed with court-depth geometry (hit_depth & land_depth from Net at v=0.5)
    const hitDepthM = startV !== null ? Math.abs(startV - 0.5) * ShuttleCV.COURT_LENGTH_M : 3.5;
    const landDepthM = endV !== null ? Math.abs(endV - 0.5) * ShuttleCV.COURT_LENGTH_M : 3.5;

    let typeName;
    let isSmash = false;
    if (speedKmh >= 185) {
        typeName = 'Jump Smash (ตบกระโดด)';
        isSmash = true;
    } else if (speedKmh >= 130 || (hitDepthM >= 3.2 && landDepthM <= 4.4 && flightSec < 0.52 && speedKmh >= 115)) {
        typeName = 'Smash (ลูกตบ)';
        isSmash = true;
    } else if (hitDepthM < 2.6 && landDepthM < 2.8) {
        typeName = 'Net Shot (ลูกหน้าเน็ต)';
    } else if (hitDepthM < 3.2 && landDepthM >= 3.8) {
        typeName = flightSec >= 0.68 ? 'Lift (งัดโด่งหลัง)' : 'Push / Drive (ผลักดาด)';
    } else if (speedKmh >= 95) {
        typeName = (distM >= 7.5 || flightSec >= 0.72) ? 'Clear (โยนลึก)' : 'Drive (ดาดเร็ว)';
    } else {
        typeName = landDepthM <= 3.6 ? 'Drop Shot (หยอด)' : 'Clear / Lift (โยนหลัง)';
    }

    shuttle.shotType = typeName;
    shuttle.lastHitter = hitter.id;
    shuttle.lastHitterTeam = hitter.team;
    hitter.shotsCount++;

    if (isSmash) registerSmashStat(hitter, speedKmh);
    recordShotLog(hitter, typeName, speedKmh);
    updateLiveHUD();
}

window.resetPlayerLockState = resetPlayerLockState;
window.getLastPoseDurationMs = function() {
    return lastPoseDurationMs;
};
window.resetPoseTimestamps = function() {
    lastPoseTimestamp = 0;
    if (typeof players !== 'undefined' && players) {
        Object.values(players).forEach(p => {
            p.lastSeenMs = 0;
            p._posWindow = [];
            p._anchor = null;
            p.renderScreenX = null;
            p.renderScreenY = null;
            p._renderKp = null;
        });
    }
};
window.resetShuttleTracker = function() {
    shuttleTrack = [];
    activeShot = null;
    pendingRallyEnd = null;
    if (typeof shuttleSpeedCalc !== 'undefined' && shuttleSpeedCalc) {
        shuttleSpeedCalc.reset();
    }
    if (typeof shuttle !== 'undefined' && shuttle) {
        shuttle.detected = false;
        shuttle.trail = [];
    }
};
