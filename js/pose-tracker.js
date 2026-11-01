/********************************************************************
 * MODULE: js/pose-tracker.js
 * PURPOSE: Player detection (A1, A2, B1, B2) with MoveNet MultiPose on
 *          homography-derived half-court crops, STRICT in-court gating
 *          (people outside the court lines are never tracked), and a
 *          gated shuttle tracker with physics-based (aerodynamic drag)
 *          time-of-flight speed measurement.
 ********************************************************************/

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
const maskBoxesByTeam = { A: { boxes: [], t: 0 }, B: { boxes: [], t: 0 } };

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

function evaluatePoseCandidate(pose, crop, team) {
    const kps = pose.keypoints.map(k => ({
        name: k.name,
        x: crop.x + (k.x / poseCropCanvas.width) * crop.w,
        y: crop.y + (k.y / poseCropCanvas.height) * crop.h,
        score: k.score ?? 0
    }));
    const get = n => kps.find(k => k.name === n);
    const conf = kps.filter(k => k.score > 0.25);
    if (conf.length < 5) return { mask: null, player: null };

    const xs = conf.map(k => k.x), ys = conf.map(k => k.y);
    const box = {
        xMin: Math.max(0, Math.min(...xs) - 0.02),
        xMax: Math.min(1, Math.max(...xs) + 0.02),
        yMin: Math.max(0, Math.min(...ys) - 0.03),
        yMax: Math.min(1, Math.max(...ys) + 0.015)
    };

    // Foot contact point: ankles first, then knee extrapolation. No guessing from bounding boxes.
    const ankles = ['left_ankle', 'right_ankle'].map(get).filter(k => k && k.score >= 0.3);
    let footX, footY;
    if (ankles.length) {
        footX = ankles.reduce((a, k) => a + k.x, 0) / ankles.length;
        footY = Math.max(...ankles.map(k => k.y));
    } else {
        const knees = ['left_knee', 'right_knee'].map(get).filter(k => k && k.score >= 0.35);
        const hips = ['left_hip', 'right_hip'].map(get).filter(k => k && k.score >= 0.3);
        if (!knees.length || !hips.length) return { mask: box, player: null };
        const kneeY = knees.reduce((a, k) => a + k.y, 0) / knees.length;
        const hipY = hips.reduce((a, k) => a + k.y, 0) / hips.length;
        footX = knees.reduce((a, k) => a + k.x, 0) / knees.length;
        footY = kneeY + (kneeY - hipY) * 0.9;
    }

    const uv = ShuttleCV.screenToCourtNormalized(footX, footY);

    // STRICT: the feet must be inside the court lines -> spectators, coaches, umpires, players on other courts are rejected
    if (!ShuttleCV.isInsideCourt(uv.x, uv.y, IN_COURT_TOL_U, IN_COURT_TOL_V)) return { mask: box, player: null };
    if (team === 'A' && uv.y > 0.52) return { mask: box, player: null };
    if (team === 'B' && uv.y < 0.48) return { mask: box, player: null };

    // Depth-consistent body size check (rejects people standing behind the court whose feet are hidden)
    const head = ['nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear'].map(get).filter(k => k && k.score >= 0.3);
    const shoulders = ['left_shoulder', 'right_shoulder'].map(get).filter(k => k && k.score >= 0.3);
    let topY;
    if (head.length) topY = Math.min(...head.map(k => k.y));
    else if (shoulders.length) topY = Math.min(...shoulders.map(k => k.y)) - 0.16 * ShuttleCV.expectedPlayerHeightScreen(uv.y);
    else return { mask: box, player: null };

    const ratio = (footY - topY) / ShuttleCV.expectedPlayerHeightScreen(uv.y);
    if (ratio < 0.4 || ratio > 1.75) return { mask: box, player: null };

    const ankleConf = ankles.length ? Math.max(...ankles.map(k => k.score)) : 0.3;
    return {
        mask: box,
        player: {
            u: uv.x, v: uv.y, footX, footY, box, kps,
            score: pose.score * (0.6 + 0.4 * ankleConf) * (1 - Math.min(0.5, Math.abs(1 - ratio) * 0.5))
        }
    };
}

function assignCandidatesToSlots(team, cands, now) {
    const slotIds = team === 'A'
        ? (isDoublesMatch ? ['A1', 'A2'] : ['A1'])
        : (isDoublesMatch ? ['B1', 'B2'] : ['B1']);
    if (!isDoublesMatch) {
        const unused = players[team === 'A' ? 'A2' : 'B2'];
        unused.detected = false;
        unused.currentSpeedKmh = 0;
    }

    const slotCost = (slot, idx, c) => {
        const recent = now - slot.lastSeenMs < 2000;
        if (recent) {
            return Math.hypot((slot.u - c.u) * ShuttleCV.COURT_WIDTH_M, (slot.v - c.v) * ShuttleCV.COURT_LENGTH_M);
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
        perms.push([[0, 0]]);
    }
    perms.forEach(p => {
        const cost = p.reduce((a, [si, ci]) => a + slotCost(slots[si], si, cands[ci]), 0);
        if (!best || cost < best.cost) best = { cost, p };
    });
    if (!best) return;
    best.p.forEach(([si, ci]) => updatePlayerSlot(slots[si], cands[ci], now));
}

function updatePlayerSlot(slot, c, now) {
    const wasTracked = slot.detected && now - slot.lastSeenMs < 600;
    const dt = wasTracked ? (now - slot.lastSeenMs) / 1000 : 0;
    const alpha = 0.6;
    const newU = wasTracked ? slot.u * (1 - alpha) + c.u * alpha : c.u;
    const newV = wasTracked ? slot.v * (1 - alpha) + c.v * alpha : c.v;

    if (wasTracked && dt > 0) {
        const stepM = Math.hypot((newU - slot.u) * ShuttleCV.COURT_WIDTH_M, (newV - slot.v) * ShuttleCV.COURT_LENGTH_M);
        if (stepM >= 0.03 && stepM < 2.0) {
            slot.distanceMeters = +(slot.distanceMeters + stepM).toFixed(2);
            const inst = Math.min(32, (stepM / dt) * 3.6);
            slot.currentSpeedKmh = +(slot.currentSpeedKmh * 0.6 + inst * 0.4).toFixed(1);
            slot.maxSpeedKmh = Math.max(slot.maxSpeedKmh, slot.currentSpeedKmh);
            slot.positions.push({ x: newU, y: newV, t: matchSeconds });
            if (slot.positions.length > 600) slot.positions.shift();
        } else {
            slot.currentSpeedKmh = +(slot.currentSpeedKmh * 0.8).toFixed(1);
        }
    } else {
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
    slot.screenX = ring.x;
    slot.screenY = ring.y;
    slot.box = c.box;
    slot.keypoints = c.kps;
    slot.detected = true;
    slot.lastSeenMs = now;
}

async function runRealPoseEstimation(videoEl) {
    if (!videoEl || videoEl.readyState < 2) return;
    const now = performance.now();

    Object.values(players).forEach(p => {
        if (p.detected && now - p.lastSeenMs > 700) {
            p.detected = false;
            p.currentSpeedKmh = 0;
        }
    });

    // Without a locked court we cannot verify "inside the lines" -> track nobody (no guessing)
    if (!ShuttleCV.getCourtLocked()) {
        Object.values(players).forEach(p => { p.detected = false; p.currentSpeedKmh = 0; });
        detectedHumanBoxes = [];
        return;
    }
    if (!poseModelReady || !poseDetector || poseInferenceBusy) return;
    if (now - lastPoseTimestamp < 40) return;
    lastPoseTimestamp = now;

    const team = posePassTeam;
    posePassTeam = team === 'A' ? 'B' : 'A';

    const crop = computeHalfCourtCrop(team);
    if (crop.w < 0.03 || crop.h < 0.03) return;

    const vW = videoEl.videoWidth || 1280;
    const vH = videoEl.videoHeight || 720;
    const aspect = (crop.w * vW) / (crop.h * vH);
    const LONG = 512;
    const cw = aspect >= 1 ? LONG : Math.max(96, Math.round(LONG * aspect));
    const ch = aspect >= 1 ? Math.max(96, Math.round(LONG / aspect)) : LONG;
    if (poseCropCanvas.width !== cw) poseCropCanvas.width = cw;
    if (poseCropCanvas.height !== ch) poseCropCanvas.height = ch;

    poseInferenceBusy = true;
    try {
        poseCropCtx.drawImage(videoEl, crop.x * vW, crop.y * vH, crop.w * vW, crop.h * vH, 0, 0, cw, ch);
        const poses = await poseDetector.estimatePoses(poseCropCanvas, { maxPoses: 6, flipHorizontal: false });

        const masks = [];
        let cands = [];
        poses.forEach(pose => {
            if ((pose.score ?? 0) < 0.2) return;
            const r = evaluatePoseCandidate(pose, crop, team);
            if (r.mask) masks.push(r.mask);
            if (r.player) cands.push(r.player);
        });

        // Non-maximum suppression in court meters (one player per 0.6 m)
        cands.sort((a, b) => b.score - a.score);
        const kept = [];
        cands.forEach(c => {
            const dup = kept.some(k => Math.hypot((k.u - c.u) * ShuttleCV.COURT_WIDTH_M, (k.v - c.v) * ShuttleCV.COURT_LENGTH_M) < 0.6);
            if (!dup) kept.push(c);
        });
        cands = kept.slice(0, isDoublesMatch ? 2 : 1);

        assignCandidatesToSlots(team, cands, performance.now());

        // All detected people (incl. off-court) are used as masks so their motion never becomes a "shuttle"
        maskBoxesByTeam[team] = { boxes: masks, t: performance.now() };
        const tNow = performance.now();
        detectedHumanBoxes = []
            .concat(tNow - maskBoxesByTeam.A.t < 400 ? maskBoxesByTeam.A.boxes : [])
            .concat(tNow - maskBoxesByTeam.B.t < 400 ? maskBoxesByTeam.B.boxes : []);
    } catch (e) {
        // ignore single-frame inference error
    } finally {
        poseInferenceBusy = false;
    }
}

/* ================================================================
 * 2. SHUTTLE TRACKER + PHYSICS SPEED (time-of-flight with drag)
 *    Shuttle speed decays as v(t) = v0 / (1 + v0 t / L), L = vt² / g ≈ 4.7 m
 *    (terminal velocity vt ≈ 6.8 m/s). Distance x(t) = L ln(1 + v0 t / L)
 *    => v0 = L (e^(x/L) − 1) / t, where x = hitter→receiver/landing path
 *    measured in real meters through the court homography.
 * ================================================================ */
const SHUTTLE_DRAG_LENGTH_M = 4.7;
let shuttleTrack = [];         // [{ sx, sy, t }]
let activeShot = null;         // { hitter, tHit, startU, startV }
let pendingRallyEnd = null;    // { t }

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
        // distance normalized by player size (racket reach ≈ 0.9 body height)
        const d = Math.hypot(sx - c.x, sy - c.y) / Math.max(0.02, c.h);
        if (!best || d < best.d) best = { p, d };
    });
    return best;
}

function isPointOnCourtFloor(sx, sy) {
    const uv = ShuttleCV.screenToCourtNormalized(sx, sy);
    return ShuttleCV.isInsideCourt(uv.x, uv.y, 0.25, 0.12) ? uv : null;
}

function onTrackConfirmed(now) {
    const first = shuttleTrack[0];
    const second = shuttleTrack[Math.min(2, shuttleTrack.length - 1)];
    const near = nearestPlayerToPoint(first.sx, first.sy);
    const hitter = near && near.d < 2.2 ? near.p : null;

    // Back-extrapolate hit time from the hitter's racket zone to the first tracked point
    let lag = 0;
    if (hitter) {
        const c = playerChestScreen(hitter);
        const spd = Math.hypot(second.sx - first.sx, second.sy - first.sy) / Math.max(0.008, (second.t - first.t) / 1000);
        const gap = Math.max(0, Math.hypot(first.sx - c.x, first.sy - c.y) - c.h * 0.5);
        lag = Math.min(0.12, gap / Math.max(0.05, spd));
    }

    activeShot = {
        hitter,
        tHit: first.t - lag * 1000,
        startU: hitter ? hitter.u : null,
        startV: hitter ? hitter.v : null
    };
    if (hitter) {
        shuttle.lastHitter = hitter.id;
        shuttle.lastHitterTeam = hitter.team;
    }
    shuttle.trail = [];
    pendingRallyEnd = null;
    if (scoreboard.rallyState !== 'RALLYING') {
        scoreboard.rallyState = 'RALLYING';
        updateScoreboardUI();
    }
}

function finalizeShot(shot, endU, endV, tEnd, isLanding) {
    if (!shot || !shot.hitter || shot.startU === null) return;
    const dH = Math.hypot((endU - shot.startU) * ShuttleCV.COURT_WIDTH_M, (endV - shot.startV) * ShuttleCV.COURT_LENGTH_M);
    const dz = isLanding ? 2.3 : 1.2; // contact height drop (overhead → floor / → receiver contact)
    const x = Math.hypot(dH, dz);
    const tf = (tEnd - shot.tHit) / 1000;
    if (tf < 0.15 || tf > 3.0 || dH < 1.0) return;

    const L = SHUTTLE_DRAG_LENGTH_M;
    const v0 = (L * (Math.exp(x / L) - 1)) / tf; // m/s
    const kmh = Math.round(v0 * 3.6);
    if (kmh < 15 || kmh > 430) return; // physically implausible -> discard

    shuttle.speedKmh = kmh;
    classifyRealStroke(shot.hitter, kmh, dH);
}

function handleTrackEnd(now) {
    if (shuttleTrack.length >= 4 && activeShot) {
        const last = shuttleTrack[shuttleTrack.length - 1];
        const prev = shuttleTrack[shuttleTrack.length - 2];
        const oppTeam = activeShot.hitter ? (activeShot.hitter.team === 'A' ? 'B' : 'A') : null;
        const rec = nearestPlayerToPoint(last.sx, last.sy, oppTeam);

        if (rec && rec.d < 1.8) {
            // Received by the opponent: end point = receiver position
            finalizeShot(activeShot, rec.p.u, rec.p.v, last.t, false);
            pendingRallyEnd = null;
        } else {
            const descending = last.sy > prev.sy;
            const floorUV = descending ? isPointOnCourtFloor(last.sx, last.sy) : null;
            if (floorUV) {
                finalizeShot(activeShot, Math.max(-0.2, Math.min(1.2, floorUV.x)), Math.max(-0.1, Math.min(1.1, floorUV.y)), last.t, true);
                pendingRallyEnd = { t: now };
            }
        }
    }
    activeShot = null;
    shuttleTrack = [];
}

function processRealShuttleAndRally(cvResult) {
    const now = performance.now();
    if (!ShuttleCV.getCourtLocked()) {
        shuttleTrack = [];
        activeShot = null;
        shuttle.detected = false;
        return;
    }

    const cands = cvResult?.shuttleCandidates || (cvResult?.shuttleCandidate ? [cvResult.shuttleCandidate] : []);
    let chosen = null;
    const n = shuttleTrack.length;

    if (n > 0 && now - shuttleTrack[n - 1].t > 140) {
        handleTrackEnd(now);
    }

    const m = shuttleTrack.length;
    if (m >= 2) {
        const a = shuttleTrack[m - 2], b = shuttleTrack[m - 1];
        const k = (now - b.t) / Math.max(8, b.t - a.t);
        const px = b.sx + (b.sx - a.sx) * k;
        const py = b.sy + (b.sy - a.sy) * k;
        const stepLen = Math.hypot(b.sx - a.sx, b.sy - a.sy);
        const gate = 0.03 + stepLen * 0.8;
        let bestD = gate;
        cands.forEach(c => {
            const d = Math.hypot(c.x - px, c.y - py);
            if (d < bestD) { bestD = d; chosen = c; }
        });
    } else if (m === 1) {
        const b = shuttleTrack[0];
        const maxStep = Math.min(0.15, 0.09 * Math.max(1, (now - b.t) / 16.7));
        let bestD = maxStep;
        cands.forEach(c => {
            const d = Math.hypot(c.x - b.sx, c.y - b.sy);
            if (d >= 0.003 && d < bestD) { bestD = d; chosen = c; }
        });
        if (!chosen && cands.length) shuttleTrack = [{ sx: cands[0].x, sy: cands[0].y, t: now }];
    } else if (cands.length) {
        shuttleTrack = [{ sx: cands[0].x, sy: cands[0].y, t: now }];
    }

    if (chosen) {
        // Direction consistency (allows ballistic arcs, rejects zig-zag noise)
        if (shuttleTrack.length >= 2) {
            const a = shuttleTrack[shuttleTrack.length - 2], b = shuttleTrack[shuttleTrack.length - 1];
            const v1x = b.sx - a.sx, v1y = b.sy - a.sy, v2x = chosen.x - b.sx, v2y = chosen.y - b.sy;
            const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
            if (m1 > 1e-4 && m2 > 1e-4 && (v1x * v2x + v1y * v2y) / (m1 * m2) < 0.3) {
                handleTrackEnd(now);
                shuttleTrack = [{ sx: chosen.x, sy: chosen.y, t: now }];
                chosen = null;
            }
        }
        if (chosen) {
            shuttleTrack.push({ sx: chosen.x, sy: chosen.y, t: now });
            if (shuttleTrack.length > 120) shuttleTrack.shift();
            if (shuttleTrack.length === 4) onTrackConfirmed(now);
        }
    }

    if (shuttleTrack.length >= 4) {
        const last = shuttleTrack[shuttleTrack.length - 1];
        const uv = ShuttleCV.screenToCourtNormalized(last.sx, last.sy);
        shuttle.screenX = last.sx;
        shuttle.screenY = last.sy;
        shuttle.u = Math.max(-0.2, Math.min(1.2, uv.x));
        shuttle.v = Math.max(-0.2, Math.min(1.2, uv.y));
        shuttle.detected = true;
        shuttle.lastSeenMs = now;
        shuttle.framesInFlight = shuttleTrack.length;
        if (chosen) {
            shuttle.trail.push({ sx: last.sx, sy: last.sy, u: shuttle.u, v: shuttle.v, t: now });
            if (shuttle.trail.length > 24) shuttle.trail.shift();
        }
        return;
    }

    // Auto-score only after a verified floor landing and no new flight within 0.7 s
    if (pendingRallyEnd && shuttleTrack.length === 0 && now - pendingRallyEnd.t > 700) {
        pendingRallyEnd = null;
        if (scoreboard.rallyState === 'RALLYING') evaluateRallyEndAndAutoScore();
        shuttle.detected = false;
        shuttle.trail = [];
    } else if (shuttle.detected && now - shuttle.lastSeenMs > 400) {
        shuttle.detected = false;
    }
}

function classifyRealStroke(hitter, speedKmh, distM) {
    let typeName;
    let isSmash = false;
    if (speedKmh >= 230) {
        typeName = 'Jump Smash (ตบกระโดด)';
        isSmash = true;
    } else if (speedKmh >= 170) {
        typeName = 'Smash (ลูกตบ)';
        isSmash = true;
    } else if (speedKmh >= 110) {
        typeName = distM >= 8 ? 'Clear (โยนลึก)' : 'Drive (ดาดเร็ว)';
    } else {
        typeName = distM <= 4.5 ? 'Net / Drop (หยอด)' : 'Lift (งัด)';
    }

    shuttle.shotType = typeName;
    shuttle.lastHitter = hitter.id;
    shuttle.lastHitterTeam = hitter.team;
    hitter.shotsCount++;

    if (isSmash) registerSmashStat(hitter, speedKmh);
    recordShotLog(hitter, typeName, speedKmh);
    updateLiveHUD();
}
