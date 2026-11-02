/********************************************************************
 * MODULE: js/pose-tracker.js
 * PURPOSE: Player detection (A1, A2, B1, B2) with MoveNet MultiPose on
 *          homography-derived half-court crops, STRICT in-court gating
 *          (people outside the court lines are never tracked), and a
 *          gated shuttle tracker with physics-based (aerodynamic drag)
 *          time-of-flight speed measurement.
 ********************************************************************/

function trackerNow() {
    return (typeof frameClockMs === 'number' && frameClockMs > 0) ? frameClockMs : performance.now();
}

function resetShuttleTracker() {
    shuttleTrack = [];
    activeShot = null;
    pendingRallyEnd = null;
    shuttle.detected = false;
    shuttle.trail = [];
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
let lastPoseWallTimestamp = 0;
let isPlayersLocked = false;
let targetLockTimestamp = 0;
const maskBoxesByTeam = { A: { boxes: [], t: 0 }, B: { boxes: [], t: 0 } };

function resetPoseTimestamps() {
    lastPoseWallTimestamp = 0;
}

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

    // Foot contact point: must contact the court floor mat at the shoe soles (not up at the ankle bone/knees)
    // 1. Ankles (if visible and confident)
    const ankles = ['left_ankle', 'right_ankle'].map(get).filter(k => k && k.score >= 0.16);
    let footX, footY;
    if (ankles.length) {
        footX = ankles.reduce((a, k) => a + k.x, 0) / ankles.length;
        const maxAnkleY = Math.max(...ankles.map(k => k.y));
        const knees = ['left_knee', 'right_knee'].map(get).filter(k => k && k.score >= 0.16);
        const ankleToKnee = knees.length ? (maxAnkleY - (knees.reduce((a, k) => a + k.y, 0) / knees.length)) : 0;
        // Shift lower by sole offset so the tracker ring sits directly on the court mat under the shoe soles
        const soleOffset = ankleToKnee > 0.02 ? ankleToKnee * 0.22 : playerH * 0.055;
        footY = Math.min(1.0, maxAnkleY + soleOffset);
    } else {
        // 2. Knees + Hips extrapolation
        const knees = ['left_knee', 'right_knee'].map(get).filter(k => k && k.score >= 0.14);
        const hips = ['left_hip', 'right_hip'].map(get).filter(k => k && k.score >= 0.14);
        if (knees.length && hips.length) {
            const kneeY = knees.reduce((a, k) => a + k.y, 0) / knees.length;
            const hipY = hips.reduce((a, k) => a + k.y, 0) / hips.length;
            footX = knees.reduce((a, k) => a + k.x, 0) / knees.length;
            const thighH = Math.max(0.03, kneeY - hipY);
            // Lower leg + shoe sole length is ~1.18x thigh length
            footY = Math.min(1.0, kneeY + thighH * 1.18);
        } else if (hips.length) {
            // 3. Net Occlusion: Far court players behind badminton net tape/mesh
            // Human anatomy: Hip-to-floor length is approx 1.30 - 1.40x torso length
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
    // Far Court (Team A): court depth v <= 0.50 (or screen feet behind netBaseY)
    // Near Court (Team B): court depth v > 0.50 (or screen feet in front of netBaseY)
    let team;
    if (uv && isFinite(uv.y)) {
        team = (uv.y <= 0.51) ? 'A' : 'B';
    } else {
        team = (footY < netBaseY) ? 'A' : 'B';
    }

    // In-court gating:
    // Players regularly jump behind the baseline (especially Far Court receives) and dive into tramlines.
    // Tolerate lateral displacement (tolU = 0.45) and depth displacement (tolV = 0.85) so players never drop lock.
    if (ShuttleCV.isCourtTrusted() && uv && isFinite(uv.x) && isFinite(uv.y)) {
        const inCourt = ShuttleCV.isInsideCourt(uv.x, uv.y, 0.45, 0.85);
        if (!inCourt) {
            return { mask: box, player: null };
        }
    }

    // Court proximity score: give higher weight to players within court lines vs distant spectators
    const lateralDist = Math.abs(uv.x - 0.5);
    const courtProximity = Math.max(0.4, 1.0 - Math.max(0, lateralDist - 0.5) * 1.2);
    const ankleConf = ankles.length ? Math.max(...ankles.map(k => k.score)) : 0.40;

    return {
        mask: box,
        player: {
            team,
            u: Math.max(0, Math.min(1, uv.x)),
            v: Math.max(0, Math.min(1, uv.y)),
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
        if (recent) {
            const distM = Math.hypot((slot.u - c.u) * ShuttleCV.COURT_WIDTH_M, (slot.v - c.v) * ShuttleCV.COURT_LENGTH_M);
            
            if (isPlayersLocked || slot.isLocked) {
                // เมื่อเข้าสู่สถานะล็อคเป้า:
                // 1. ลงโทษอย่างรุนแรงหากพิกัดกระโดดเกิน 2.8 เมตร (ป้องกันการสลับ Slot ID ระหว่างคู่ขา)
                if (distM > 2.8) return distM * 5.0 + 30.0;
                // 2. ให้ความสำคัญสูงสุดกับความต่อเนื่องของ Track เดิม
                return distM * 1.6;
            }

            // ก่อนล็อคเป้า: ปกป้องการกระโดดฉับพลันปกติ
            if (now - slot.lastSeenMs < 300 && distM > 3.0) return distM + 12.0;
            return distM;
        }
        // Not tracked yet: slot 1 = left side of screen, slot 2 = right side
        const priorU = slotIds.length === 1 ? 0.5 : (idx === 0 ? 0.25 : 0.75);
        return Math.abs(c.u - priorU) * ShuttleCV.COURT_WIDTH_M + 1.5;
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
    const wasTracked = slot.detected && now - slot.lastSeenMs < 700;
    const dt = wasTracked ? (now - slot.lastSeenMs) / 1000 : 0;
    const alpha = 0.55;
    const newU = wasTracked ? slot.u * (1 - alpha) + c.u * alpha : c.u;
    const newV = wasTracked ? slot.v * (1 - alpha) + c.v * alpha : c.v;

    // Maintain a rolling 500ms window for noise-resilient speed calculation
    if (!slot._posWindow) slot._posWindow = [];
    slot._posWindow.push({ u: newU, v: newV, t: now });
    // Keep window within 500ms
    while (slot._posWindow.length > 1 && now - slot._posWindow[0].t > 500) {
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
        const dtWindow = (now - firstPt.t) / 1000;
        const netDisplacementM = Math.hypot((newU - firstPt.u) * ShuttleCV.COURT_WIDTH_M, (newV - firstPt.v) * ShuttleCV.COURT_LENGTH_M);

        let inst = 0;
        if (netDisplacementM > noiseM && dtWindow >= 0.15) {
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

    const ring = ShuttleCV.courtNormalizedToScreen(newU, newV);
    slot.u = newU;
    slot.v = newV;
    // Lock floor ring and tactical bracket directly to the detected player feet in screen space
    slot.screenX = (c.footX !== undefined) ? c.footX : ring.x;
    slot.screenY = (c.footY !== undefined) ? c.footY : ring.y;
    slot.box = c.box;
    slot.keypoints = c.kps;
    slot.detected = true;
    slot.lastSeenMs = now;
}

async function runRealPoseEstimation(videoEl) {
    if (!videoEl || videoEl.readyState < 2) return;
    const now = trackerNow();

    // Video pause protection: if video playback is paused, do not expire player tracking
    const isVideoPaused = (typeof isUploadedVideoActive !== 'undefined' && isUploadedVideoActive && videoEl.paused) || (typeof isTrackingPaused !== 'undefined' && isTrackingPaused);

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

        // Seeking / video time leap resilience
        if (now < p.lastSeenMs || Math.abs(now - p.lastSeenMs) > 3000) {
            p.lastSeenMs = now;
        }

        // เมื่อล็อคเป้าแล้ว: ขยายเวลา Coasting เป็น 2400ms เผื่อจังหวะคู่ขาวิ่งตัดหน้าหรือกระโดดตบ
        if (!isVideoPaused) {
            const timeoutMs = (isPlayersLocked && p.isLocked) ? 2400 : 1800;
            if (p.detected && now - p.lastSeenMs > timeoutMs) {
                p.detected = false;
                p.currentSpeedKmh = 0;
                p._posWindow = [];
                p._anchor = null;
            }
        }
    });

    if (!poseModelReady || !poseDetector || poseInferenceBusy) return;
    const wallNow = performance.now();
    if (wallNow - lastPoseWallTimestamp < 33) return;
    lastPoseWallTimestamp = wallNow;

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
    try {
        poseCropCtx.drawImage(
            videoEl,
            cropPixelX, cropPixelY, cropPixelW, cropPixelH,
            0, 0, cw, ch
        );
        // maxPoses: 8 ensures background gym spectators do not crowd out active Team A / Team B players
        const poses = await poseDetector.estimatePoses(poseCropCanvas, { maxPoses: 8, flipHorizontal: false });

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
        // ignore single-frame inference error
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
    // 2.2 Interference Rejection:
    // Shuttlecock hit must originate near an active on-court match player
    if (!near || near.d > 2.2 || !near.p) {
        shuttleTrack = [];
        return;
    }
    shuttle.trail = [];
    startShotFromContact(first, second, now, near.p);
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

    // Require minimum flight duration (0.24s) and court travel (1.8m) so partial tracks never inflate v0
    if (tf < 0.24 || tf > 3.2 || dH < 1.8) return;

    // 1. Aerodynamic drag model exit speed (BWF standard aerodynamic length L ~ 4.99m)
    const smashSpeedKmh = calculateSmashInitialSpeed(x, tf);
    const vDrag = smashSpeedKmh / 3.6; // m/s
    if (vDrag <= 0) return;

    // 2. Direct pixel-to-meter velocity from early shuttle track at hitter's depth plane
    const vTrack = measureTrackInitialSpeedMps(shuttleTrack, shot.startV);
    // If no real track speed was observed on camera, DO NOT invent/hallucinate speed from pure time-of-flight
    if (vTrack <= 0) return;

    // Trajectory consistency check: time-of-flight vs measured metric speed must align within 1.8x
    const ratio = Math.max(vDrag, vTrack) / Math.max(0.1, Math.min(vDrag, vTrack));
    if (ratio > 1.8) return;

    const realPts = shuttleTrack.filter(pt => !pt.inpainted);
    if (realPts.length < 4) return;

    // 3. Cross-validate both measurements (blends time-of-flight with actual observed pixel velocity)
    let v0 = (vDrag * 0.55 + vTrack * 0.45);

    // Controlled wrist boost up to 1.05 only on clear explosive swings
    const wristBoost = Math.min(1.05, 1.0 + Math.max(0, (shot.hitter.wristSpeedPx || 0) - 1.2) * 0.03);
    let kmh = Math.round(v0 * 3.6 * wristBoost);

    // Realistic club / competitive single-camera bounds (rejects physically impossible > 265 km/h spikes)
    if (kmh < 22 || kmh > 265) return;

    shuttle.speedKmh = kmh;
    shuttle.lastSpeedAtMs = trackerNow();
    classifyRealStroke(shot.hitter, kmh, dH, shot.startV, endV, tf);
}

function handleTrackEnd(now) {
    const realPts = shuttleTrack.filter(pt => !pt.inpainted);
    if (realPts.length >= 3 && activeShot) {
        const last = realPts[realPts.length - 1];
        const prev = realPts[realPts.length - 2];
        const oppTeam = activeShot.hitter ? (activeShot.hitter.team === 'A' ? 'B' : 'A') : null;
        const rec = nearestPlayerToPoint(last.sx, last.sy, oppTeam);

        if (rec && rec.d < 1.85) {
            finalizeShot(activeShot, rec.p.u, rec.p.v, last.t, false);
            pendingRallyEnd = null;
        } else {
            const descending = last.sy > prev.sy;
            const floorUV = descending ? isPointOnCourtFloor(last.sx, last.sy) : null;
            if (floorUV && realPts.length >= 6 && activeShot.hitter) {
                finalizeShot(activeShot, Math.max(-0.2, Math.min(1.2, floorUV.x)), Math.max(-0.1, Math.min(1.1, floorUV.y)), last.t, true);
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
        const missedMs = lastReal ? (now - lastReal.t) : 16;
        const gapMultiplier = 1 + Math.min(2.2, missedMs / 45);
        const gate = Math.min(0.22, (0.032 + pred.stepLen * 0.85) * gapMultiplier);
        let bestD = gate;
        cands.forEach(c => {
            const d = Math.hypot(c.x - pred.x, c.y - pred.y);
            if (d < bestD) { bestD = d; chosen = c; }
        });

        // InpaintNet-style Trajectory Bridge: if no candidate matched right on the ballistic curve,
        // check if a candidate near a player represents a sharp hit reversal, or inpaint the occluded frame
        if (!chosen && cands.length > 0) {
            const b = shuttleTrack[m - 1];
            const nearCand = cands.find(c => Math.hypot(c.x - b.sx, c.y - b.sy) < 0.09);
            if (nearCand) chosen = nearCand;
        }
    } else if (m === 1) {
        const b = shuttleTrack[0];
        const maxStep = Math.min(0.16, 0.095 * Math.max(1, (now - b.t) / 16.7));
        let bestD = maxStep;
        cands.forEach(c => {
            const d = Math.hypot(c.x - b.sx, c.y - b.sy);
            if (d >= 0.0025 && d < bestD) { bestD = d; chosen = c; }
        });
        if (!chosen && cands.length) shuttleTrack = [{ sx: cands[0].x, sy: cands[0].y, t: now, inpainted: false }];
    } else if (cands.length) {
        shuttleTrack = [{ sx: cands[0].x, sy: cands[0].y, t: now, inpainted: false }];
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
        shuttle.trail.push({ sx: last.sx, sy: last.sy, u: shuttle.u, v: shuttle.v, t: now });
        if (shuttle.trail.length > 28) shuttle.trail.shift();
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
window.resetPoseTimestamps = resetPoseTimestamps;
