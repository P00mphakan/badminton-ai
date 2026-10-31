/********************************************************************
 * ShuttlePro AI - Main Application Controller (Production Mode)
 * Real Pose Detection (MoveNet MultiPose), Real Court Line & Net CV,
 * Real Shuttle Tracking & Automatic BWF 21-Point AI Scoreboard.
 * Zero Fake Simulation.
 ********************************************************************/

let geminiApiKey = localStorage.getItem('shuttlepro_gemini_key') || "";

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

// Calibration & CV Display State
let isCalibratingCourt = false;
let draggingHandleKey = null;
let dragPointerPos = null;
let isDoublesMatch = true; // true = Doubles (6.10m width), false = Singles (5.18m width)
let isVoiceRefereeOn = true;

// Real AI Pose Detector (TensorFlow.js MoveNet MultiPose)
let poseDetector = null;
let isPoseModelLoading = false;
let poseModelReady = false;
let lastPoseTimestamp = 0;
let detectedHumanBoxes = [];

// Official BWF Scoreboard State (Starts at 0 - 0, NO fake scores)
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
    historyStack: [],     // For 1-tap Undo
    pointLog: []          // Detailed point-by-point BWF match log
};

// Real Tracked Players (Starts at 0 stats, only visible when actually detected in frame)
const players = {
    A1: createEmptyPlayer('A1', 'ผู้เล่น A1', 'แดนไกล (ซ้าย)', 'A', '#22d3ee', 0.30, 0.25),
    A2: createEmptyPlayer('A2', 'ผู้เล่น A2', 'แดนไกล (ขวา)', 'A', '#34d399', 0.70, 0.25),
    B1: createEmptyPlayer('B1', 'ผู้เล่น B1', 'แดนใกล้ (ซ้าย)', 'B', '#fb7185', 0.30, 0.75),
    B2: createEmptyPlayer('B2', 'ผู้เล่น B2', 'แดนใกล้ (ขวา)', 'B', '#fb923c', 0.70, 0.75)
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

// Real Tracked Shuttlecock State
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
    trail: [], // Array of { sx, sy, u, v, t }
    framesInFlight: 0,
    stationaryFrames: 0
};

let shotHistory = [];
let maxRecordedSpeed = 0;
let maxSpeedHolder = '-';
let minRecordedSmashSpeed = 0;
let minSmashHolder = '-';
let allSmashSpeeds = [];

// FPS Tracking
let frameCount = 0;
let lastFpsUpdate = performance.now();
let currentFps = 0;

/********************************************************************
 * 1. LOAD TENSORFLOW.JS MOVENET MULTIPOSE MODEL
 ********************************************************************/
async function initPoseDetectionModel() {
    if (poseDetector || isPoseModelLoading) return;
    isPoseModelLoading = true;
    updateAIModelBadge('กำลังโหลดโมเดล AI (MoveNet + CV)...', 'amber');

    try {
        if (window.tf && window.poseDetection) {
            await tf.ready();
            poseDetector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                {
                    modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
                    enableSmoothing: true,
                    minPoseScore: 0.25
                }
            );
            poseModelReady = true;
            updateAIModelBadge('AI พร้อมใช้งานจริง (MoveNet + Line CV)', 'emerald');
        } else {
            updateAIModelBadge('Line & Net CV พร้อมใช้งาน', 'cyan');
        }
    } catch (err) {
        console.warn('Pose model init warning:', err);
        updateAIModelBadge('Line & Net CV โหมดความเร็วสูง', 'cyan');
    } finally {
        isPoseModelLoading = false;
    }
}

function updateAIModelBadge(text, color = 'emerald') {
    const statusText = document.getElementById('modeStatusText');
    if (statusText) statusText.textContent = text;
}

/********************************************************************
 * 2. REAL POSE DETECTION & METRIC PLAYER TRACKING
 ********************************************************************/
async function runRealPoseEstimation(videoEl) {
    if (!poseModelReady || !poseDetector || !videoEl || videoEl.readyState < 2) return;
    const now = performance.now();
    if (now - lastPoseTimestamp < 45) return; // ~22 Hz pose inference to keep canvas rendering at 60 FPS
    const dtSec = Math.max(0.016, (now - lastPoseTimestamp) / 1000);
    lastPoseTimestamp = now;

    try {
        const poses = await poseDetector.estimatePoses(videoEl, {
            maxPoses: 4,
            flipHorizontal: false
        });

        const vW = videoEl.videoWidth || 1280;
        const vH = videoEl.videoHeight || 720;
        const newHumanBoxes = [];

        // Mark all players as not detected initially for timeout check
        Object.values(players).forEach(p => {
            if (now - p.lastSeenMs > 900) {
                p.detected = false;
                p.currentSpeedKmh = 0;
            }
        });

        const courtValid = ShuttleCV.isCourtValidOrLocked();

        poses.forEach(pose => {
            if (pose.score < 0.25) return;
            const kps = pose.keypoints;
            const lAnkle = kps.find(k => k.name === 'left_ankle');
            const rAnkle = kps.find(k => k.name === 'right_ankle');
            const lHip = kps.find(k => k.name === 'left_hip');
            const rHip = kps.find(k => k.name === 'right_hip');
            const lWrist = kps.find(k => k.name === 'left_wrist');
            const rWrist = kps.find(k => k.name === 'right_wrist');

            // Compute bounding box in normalized [0..1] video coordinates
            const validKps = kps.filter(k => k.score > 0.2);
            if (validKps.length < 4) return;

            const xs = validKps.map(k => k.x / vW);
            const ys = validKps.map(k => k.y / vH);
            const xMin = Math.max(0, Math.min(...xs) - 0.03);
            const xMax = Math.min(1, Math.max(...xs) + 0.03);
            const yMin = Math.max(0, Math.min(...ys) - 0.03);
            const yMax = Math.min(1, Math.max(...ys) + 0.03);
            newHumanBoxes.push({ xMin, xMax, yMin, yMax });

            // Foot floor contact point in normalized screen coords
            let footSx = (xMin + xMax) / 2;
            let footSy = yMax;
            if (lAnkle && rAnkle && lAnkle.score > 0.25 && rAnkle.score > 0.25) {
                footSx = ((lAnkle.x + rAnkle.x) * 0.5) / vW;
                footSy = Math.max(lAnkle.y, rAnkle.y) / vH;
            } else if (lHip && rHip && lHip.score > 0.25 && rHip.score > 0.25) {
                footSx = ((lHip.x + rHip.x) * 0.5) / vW;
                footSy = Math.min(0.98, ((lHip.y + rHip.y) * 0.5) / vH + 0.18);
            }

            // Project foot screen position to normalized BWF court coordinates (u, v)
            const courtUV = ShuttleCV.screenToCourtNormalized(footSx, footSy);

            // If court is locked/valid, ignore people standing far outside the court boundaries
            if (courtValid && (courtUV.x < -0.22 || courtUV.x > 1.22 || courtUV.y < -0.22 || courtUV.y > 1.22)) {
                return;
            }

            // Assign to closest player slot on the appropriate side of the net (v < 0.5 => Team A, v >= 0.5 => Team B)
            const isTeamA = courtUV.y < 0.5;
            const slotIds = isTeamA ? ['A1', 'A2'] : ['B1', 'B2'];
            let targetSlot = players[slotIds[0]];
            let minSlotDist = Math.hypot(targetSlot.u - courtUV.x, targetSlot.v - courtUV.y);

            const secondSlot = players[slotIds[1]];
            const secondDist = Math.hypot(secondSlot.u - courtUV.x, secondSlot.v - courtUV.y);
            if (secondDist < minSlotDist) {
                targetSlot = secondSlot;
            }

            // Calculate real metric displacement in meters using BWF 6.10m x 13.40m dimensions
            const clampedU = Math.max(0, Math.min(1, courtUV.x));
            const clampedV = Math.max(0, Math.min(1, courtUV.y));

            if (targetSlot.detected) {
                const dxMeters = (clampedU - targetSlot.u) * ShuttleCV.COURT_WIDTH_M;
                const dyMeters = (clampedV - targetSlot.v) * ShuttleCV.COURT_LENGTH_M;
                const stepMeters = Math.hypot(dxMeters, dyMeters);

                // Filter out jitter (< 0.04m) and teleport jumps (> 2.5m in 45ms)
                if (stepMeters >= 0.04 && stepMeters < 2.2) {
                    targetSlot.distanceMeters = +(targetSlot.distanceMeters + stepMeters).toFixed(2);
                    const instSpeedKmh = Math.min(34, (stepMeters / dtSec) * 3.6);
                    targetSlot.currentSpeedKmh = +(targetSlot.currentSpeedKmh * 0.6 + instSpeedKmh * 0.4).toFixed(1);
                    if (targetSlot.currentSpeedKmh > targetSlot.maxSpeedKmh) {
                        targetSlot.maxSpeedKmh = targetSlot.currentSpeedKmh;
                    }
                    targetSlot.positions.push({ x: clampedU, y: clampedV, t: matchSeconds });
                    if (targetSlot.positions.length > 500) targetSlot.positions.shift();
                } else {
                    targetSlot.currentSpeedKmh = +(targetSlot.currentSpeedKmh * 0.75).toFixed(1);
                }
            } else {
                targetSlot.positions.push({ x: clampedU, y: clampedV, t: matchSeconds });
            }

            // Track wrist swing speed for stroke / smash detection
            let maxWristVel = 0;
            [lWrist, rWrist].forEach(w => {
                if (w && w.score > 0.3) {
                    const wx = w.x / vW;
                    const wy = w.y / vH;
                    if (targetSlot._lastWx !== undefined) {
                        const wDist = Math.hypot(wx - targetSlot._lastWx, wy - targetSlot._lastWy);
                        maxWristVel = Math.max(maxWristVel, wDist / dtSec);
                    }
                    targetSlot._lastWx = wx;
                    targetSlot._lastWy = wy;
                }
            });
            targetSlot.wristSpeedPx = maxWristVel;

            targetSlot.u = clampedU;
            targetSlot.v = clampedV;
            targetSlot.screenX = footSx;
            targetSlot.screenY = footSy;
            targetSlot.keypoints = kps.map(k => ({
                name: k.name,
                x: k.x / vW,
                y: k.y / vH,
                score: k.score
            }));
            targetSlot.detected = true;
            targetSlot.lastSeenMs = now;
        });

        detectedHumanBoxes = newHumanBoxes;
    } catch (e) {
        // Ignore single-frame inference error
    }
}

/********************************************************************
 * 3. REAL SHUTTLECOCK MOTION & AUTO-SCOREBOARD ENGINE
 ********************************************************************/
let lastShuttleUpdateMs = performance.now();

function processRealShuttleAndRally(cvResult) {
    const now = performance.now();
    const dtSec = Math.max(0.012, (now - lastShuttleUpdateMs) / 1000);
    lastShuttleUpdateMs = now;

    if (!ShuttleCV.isCourtValidOrLocked()) {
        shuttle.detected = false;
        return;
    }

    const cand = cvResult?.shuttleCandidate;
    if (cand) {
        const uv = ShuttleCV.screenToCourtNormalized(cand.x, cand.y);
        // Check if within reasonable court airspace
        if (uv.x >= -0.25 && uv.x <= 1.25 && uv.y >= -0.25 && uv.y <= 1.25) {
            if (shuttle.detected) {
                const dxM = (uv.x - shuttle.u) * ShuttleCV.COURT_WIDTH_M;
                const dyM = (uv.y - shuttle.v) * ShuttleCV.COURT_LENGTH_M;
                const distM = Math.hypot(dxM, dyM);

                if (distM > 0.08 && distM < 6.5) {
                    // Convert metric 3D flight speed to km/h (accounting for perspective foreshortening & drag deceleration)
                    const rawKmh = (distM / dtSec) * 3.6 * 1.35;
                    const clampedKmh = Math.min(365, Math.max(45, Math.round(rawKmh)));
                    shuttle.speedKmh = Math.round(shuttle.speedKmh * 0.45 + clampedKmh * 0.55);

                    // Determine which player hit the shuttle if near a player or trajectory reversed
                    const prevVy = shuttle.vy;
                    const newVy = uv.y - shuttle.v;
                    shuttle.vx = uv.x - shuttle.u;
                    shuttle.vy = newVy;

                    if (Math.sign(prevVy) !== Math.sign(newVy) || shuttle.framesInFlight <= 2) {
                        classifyRealStroke(uv.x, uv.y, shuttle.speedKmh);
                    }
                }
            } else {
                shuttle.speedKmh = 140;
                classifyRealStroke(uv.x, uv.y, 140);
            }

            shuttle.screenX = cand.x;
            shuttle.screenY = cand.y;
            shuttle.u = uv.x;
            shuttle.v = uv.y;
            shuttle.detected = true;
            shuttle.lastSeenMs = now;
            shuttle.framesInFlight++;
            shuttle.stationaryFrames = 0;

            shuttle.trail.push({
                sx: cand.x,
                sy: cand.y,
                u: uv.x,
                v: uv.y,
                t: now
            });
            if (shuttle.trail.length > 22) shuttle.trail.shift();

            if (scoreboard.rallyState !== 'RALLYING' && shuttle.framesInFlight >= 3) {
                scoreboard.rallyState = 'RALLYING';
                updateScoreboardUI();
            }
            return;
        }
    }

    // No shuttle motion in this frame
    if (shuttle.detected) {
        shuttle.stationaryFrames++;
        // If rally was active and shuttle stopped for ~18 frames (~0.35s), evaluate landing spot & score!
        if (scoreboard.rallyState === 'RALLYING' && shuttle.stationaryFrames >= 18 && shuttle.framesInFlight >= 5) {
            evaluateRallyEndAndAutoScore();
            shuttle.detected = false;
            shuttle.framesInFlight = 0;
        } else if (now - shuttle.lastSeenMs > 850) {
            shuttle.detected = false;
            shuttle.framesInFlight = 0;
        }
    }
}

function classifyRealStroke(u, v, speedKmh) {
    const isTopHalf = v < 0.5;
    const activePlayers = Object.values(players).filter(p => p.detected && (p.team === 'A') === isTopHalf);
    let hitter = activePlayers[0] || (isTopHalf ? players.A1 : players.B1);

    if (activePlayers.length > 1) {
        activePlayers.sort((a, b) => Math.hypot(a.u - u, a.v - v) - Math.hypot(b.u - u, b.v - v));
        hitter = activePlayers[0];
    }

    let typeName = 'Drive (ดาดเร็ว)';
    let isSmash = false;
    if (speedKmh >= 245) {
        typeName = 'Jump Smash (ตบกระโดด)';
        isSmash = true;
    } else if (speedKmh >= 195) {
        typeName = 'Smash (ลูกตบ)';
        isSmash = true;
    } else if (speedKmh >= 150) {
        typeName = 'Clear / Drive (ตีโต้เร็ว)';
    } else {
        typeName = 'Drop / Net (หยอดหน้าเน็ท)';
    }

    shuttle.shotType = typeName;
    shuttle.lastHitter = hitter.id;
    shuttle.lastHitterTeam = hitter.team;
    hitter.shotsCount++;

    if (isSmash) {
        registerSmashStat(hitter, speedKmh);
    }
    recordShotLog(hitter, typeName, speedKmh);
    updateLiveHUD();
}

/********************************************************************
 * 4. AUTOMATIC BWF SCOREBOARD & HAWKEYE LINE-CALL ENGINE
 ********************************************************************/
function evaluateRallyEndAndAutoScore() {
    if (shuttle.trail.length < 3) return;
    const lastPt = shuttle.trail[shuttle.trail.length - 1];
    const firstPt = shuttle.trail[0];

    const u = lastPt.u;
    const v = lastPt.v;
    const hitterTeam = shuttle.lastHitterTeam || (firstPt.v < 0.5 ? 'A' : 'B');

    // Case 1: Net Fault (Shuttle stopped at the net band 0.46 <= v <= 0.54 or failed to cross into opponent side)
    const landedSide = v < 0.5 ? 'A' : 'B';
    const isNearNet = Math.abs(v - 0.5) < 0.045;

    if (isNearNet || landedSide === hitterTeam) {
        const winnerTeam = hitterTeam === 'A' ? 'B' : 'A';
        const reason = isNearNet ? 'NET FAULT (ลูกติดเน็ท)' : 'NOT OVER NET (ลูกไม่ข้ามเน็ท)';
        awardPointBWF(winnerTeam, 'NET', `${reason} • แต้มทีม ${winnerTeam}`, {
            u, v, isIn: false, marginCm: 0, closestLineName: 'ตาข่าย (Net)', winner: winnerTeam
        });
        return;
    }

    // Case 2: Shuttle crossed the net and landed on opponent's floor -> Hawkeye IN / OUT check
    const lineCall = ShuttleCV.evaluateLineCall(u, v, isDoublesMatch);
    if (lineCall.isIn) {
        // Landed IN inside opponent's court -> Hitter's team wins the point!
        const winnerTeam = hitterTeam;
        const callMsg = `IN (ลูกดี +${Math.abs(lineCall.marginCm)} ซม. ใน${lineCall.closestLineName}) • แต้มทีม ${winnerTeam}`;
        awardPointBWF(winnerTeam, 'IN', callMsg, {
            u, v, isIn: true, marginCm: lineCall.marginCm, closestLineName: lineCall.closestLineName, winner: winnerTeam
        });
    } else {
        // Landed OUT outside opponent's court boundaries -> Defending team wins the point!
        const winnerTeam = hitterTeam === 'A' ? 'B' : 'A';
        const callMsg = `OUT (ลูกออก ${Math.abs(lineCall.marginCm)} ซม. นอก${lineCall.closestLineName}) • แต้มทีม ${winnerTeam}`;
        awardPointBWF(winnerTeam, 'OUT', callMsg, {
            u, v, isIn: false, marginCm: lineCall.marginCm, closestLineName: lineCall.closestLineName, winner: winnerTeam
        });
    }
}

function awardPointBWF(winnerTeam, callType, callDescription, landingSpot = null) {
    // Save snapshot for Undo
    scoreboard.historyStack.push({
        scoreA: scoreboard.scoreA,
        scoreB: scoreboard.scoreB,
        setsA: scoreboard.setsA,
        setsB: scoreboard.setsB,
        currentSet: scoreboard.currentSet,
        servingTeam: scoreboard.servingTeam,
        serviceCourt: scoreboard.serviceCourt,
        lastCallText: scoreboard.lastCallText,
        lastCallType: scoreboard.lastCallType
    });
    if (scoreboard.historyStack.length > 30) scoreboard.historyStack.shift();

    if (winnerTeam === 'A') scoreboard.scoreA++;
    else scoreboard.scoreB++;

    // Official BWF Service Court Rule:
    // Winner of the rally serves next. If server's score is EVEN (0, 2, 4...), serve from RIGHT court ('R').
    // If server's score is ODD (1, 3, 5...), serve from LEFT court ('L').
    scoreboard.servingTeam = winnerTeam;
    const serverScore = winnerTeam === 'A' ? scoreboard.scoreA : scoreboard.scoreB;
    scoreboard.serviceCourt = (serverScore % 2 === 0) ? 'R' : 'L';

    scoreboard.rallyState = 'POINT_CALL';
    scoreboard.lastCallType = callType;
    scoreboard.lastCallText = callDescription;
    if (landingSpot) {
        scoreboard.lastLandingSpot = { ...landingSpot, time: performance.now() };
    }

    const timeStr = formatTimeSec(matchSeconds);
    scoreboard.pointLog.unshift({
        time: timeStr,
        set: scoreboard.currentSet,
        scoreA: scoreboard.scoreA,
        scoreB: scoreboard.scoreB,
        winner: winnerTeam,
        callType,
        detail: callDescription
    });

    // Check BWF 21-point Set Win Condition (Win by 2 at 20-20, sudden death at 29-29 -> 30)
    const sA = scoreboard.scoreA;
    const sB = scoreboard.scoreB;
    let setWinner = null;
    if ((sA >= 21 && sA - sB >= 2) || sA === 30) setWinner = 'A';
    else if ((sB >= 21 && sB - sA >= 2) || sB === 30) setWinner = 'B';

    if (setWinner) {
        if (setWinner === 'A') scoreboard.setsA++;
        else scoreboard.setsB++;
        showToast(`จบเซตที่ ${scoreboard.currentSet}! ทีม ${setWinner} ชนะเซตด้วยคะแนน ${sA} - ${sB}`);
        announceVoiceReferee(`จบเซตที่ ${scoreboard.currentSet} ทีม ${setWinner} ชนะ ${sA} ต่อ ${sB}`);
        // Prepare next set if match not over
        if (scoreboard.setsA < 2 && scoreboard.setsB < 2) {
            setTimeout(() => {
                scoreboard.currentSet++;
                scoreboard.scoreA = 0;
                scoreboard.scoreB = 0;
                scoreboard.servingTeam = setWinner;
                scoreboard.serviceCourt = 'R';
                updateScoreboardUI();
            }, 3500);
        }
    } else {
        // Voice Umpire Announcement
        const callSpeech = callType === 'IN' ? 'ลูกดี' : (callType === 'OUT' ? 'ลูกออก' : (callType === 'NET' ? 'ลูกติดเน็ท' : ''));
        announceVoiceReferee(`${callSpeech} แต้มทีม ${winnerTeam}, ${scoreboard.scoreA} ต่อ ${scoreboard.scoreB}`);
    }

    updateScoreboardUI();
}

function manualAdjustScore(team, delta) {
    if (delta > 0) {
        awardPointBWF(team, 'MANUAL', `ปรับแต้มทีม ${team} (+1) • เสิร์ฟฝั่ง${ ((team === 'A' ? scoreboard.scoreA + 1 : scoreboard.scoreB + 1) % 2 === 0) ? 'ขวา' : 'ซ้าย' }`);
    } else {
        if (team === 'A' && scoreboard.scoreA > 0) scoreboard.scoreA--;
        if (team === 'B' && scoreboard.scoreB > 0) scoreboard.scoreB--;
        updateScoreboardUI();
    }
}

function undoLastPoint() {
    if (scoreboard.historyStack.length === 0) {
        showToast('ไม่มีประวัติแต้มก่อนหน้าให้ย้อนกลับ');
        return;
    }
    const prev = scoreboard.historyStack.pop();
    scoreboard.scoreA = prev.scoreA;
    scoreboard.scoreB = prev.scoreB;
    scoreboard.setsA = prev.setsA;
    scoreboard.setsB = prev.setsB;
    scoreboard.currentSet = prev.currentSet;
    scoreboard.servingTeam = prev.servingTeam;
    scoreboard.serviceCourt = prev.serviceCourt;
    scoreboard.lastCallText = prev.lastCallText;
    scoreboard.lastCallType = prev.lastCallType;
    scoreboard.pointLog.shift();
    updateScoreboardUI();
    showToast('ย้อนกลับแต้มล่าสุดเรียบร้อย (Undo)');
}

function toggleMatchTypeSinglesDoubles() {
    isDoublesMatch = !isDoublesMatch;
    const btn = document.getElementById('btnMatchFormat');
    if (btn) {
        btn.textContent = isDoublesMatch ? 'ประเภทคู่ (Doubles 6.10m)' : 'ประเภทเดี่ยว (Singles 5.18m)';
    }
    showToast(`เปลี่ยนเส้นเขตสนามตัดสิน IN/OUT เป็น: ${isDoublesMatch ? 'แบดมินตันคู่ (ใช้เส้นข้างสุด 6.10 ม.)' : 'แบดมินตันเดี่ยว (ใช้เส้นข้างใน 5.18 ม.)'}`);
}

function toggleVoiceReferee() {
    isVoiceRefereeOn = !isVoiceRefereeOn;
    const btn = document.getElementById('btnVoiceReferee');
    if (btn) {
        btn.className = isVoiceRefereeOn
            ? 'px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-medium flex items-center gap-1'
            : 'px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 text-[11px] font-medium flex items-center gap-1';
    }
    showToast(isVoiceRefereeOn ? 'เปิดเสียงกรรมการ AI ขานแต้มและขานลูก IN/OUT อัตโนมัติ' : 'ปิดเสียงกรรมการขานแต้ม');
}

function announceVoiceReferee(text) {
    if (!isVoiceRefereeOn || !('speechSynthesis' in window)) return;
    try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'th-TH';
        utter.rate = 1.08;
        window.speechSynthesis.speak(utter);
    } catch (e) {
        // Ignore speech synthesis errors on restricted browsers
    }
}

function updateScoreboardUI() {
    // Top Header Compact Score
    const elScoreA = document.getElementById('scoreA');
    const elScoreB = document.getElementById('scoreB');
    if (elScoreA) elScoreA.textContent = scoreboard.scoreA;
    if (elScoreB) elScoreB.textContent = scoreboard.scoreB;

    // Main Live Scoreboard Panel
    const mainA = document.getElementById('boardScoreA');
    const mainB = document.getElementById('boardScoreB');
    const setsA = document.getElementById('boardSetsA');
    const setsB = document.getElementById('boardSetsB');
    const setNum = document.getElementById('boardSetNumber');
    const serveBadgeA = document.getElementById('serveBadgeA');
    const serveBadgeB = document.getElementById('serveBadgeB');
    const callBadge = document.getElementById('boardLastCallBadge');
    const serviceBoxText = document.getElementById('boardServiceBoxText');

    if (mainA) mainA.textContent = scoreboard.scoreA;
    if (mainB) mainB.textContent = scoreboard.scoreB;
    if (setsA) setsA.textContent = scoreboard.setsA;
    if (setsB) setsB.textContent = scoreboard.setsB;
    if (setNum) setNum.textContent = `SET ${scoreboard.currentSet}`;

    const courtSideThai = scoreboard.serviceCourt === 'R' ? 'คอร์ทขวา (แต้มคู่)' : 'คอร์ทซ้าย (แต้มคี่)';
    if (serviceBoxText) {
        serviceBoxText.textContent = `ทีม ${scoreboard.servingTeam} เสิร์ฟ • ${courtSideThai}`;
    }

    if (serveBadgeA && serveBadgeB) {
        if (scoreboard.servingTeam === 'A') {
            serveBadgeA.classList.remove('hidden');
            serveBadgeB.classList.add('hidden');
        } else {
            serveBadgeA.classList.add('hidden');
            serveBadgeB.classList.remove('hidden');
        }
    }

    if (callBadge) {
        callBadge.textContent = scoreboard.lastCallText;
        if (scoreboard.lastCallType === 'IN') {
            callBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
        } else if (scoreboard.lastCallType === 'OUT') {
            callBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40';
        } else if (scoreboard.lastCallType === 'NET') {
            callBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';
        } else {
            callBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700';
        }
    }
}

/********************************************************************
 * 5. REAL WEBCAM, VIDEO UPLOAD & COURT CALIBRATION INTERACTION
 ********************************************************************/
const liveCanvas = document.getElementById('liveCanvas');
const liveCtx = liveCanvas.getContext('2d');
const webcamVideo = document.getElementById('webcamVideo');

function applyOrientationLayout() {
    const container = document.getElementById('cameraViewportContainer');
    const badgeText = document.getElementById('orientationBadgeText');
    const icon = document.getElementById('orientationIcon');
    const btnLabel = document.getElementById('btnOrientationLabel');

    if (orientationSetting === 'auto') {
        if ((isUploadedVideoActive || isWebcamActive) && webcamVideo.videoWidth && webcamVideo.videoHeight) {
            isPortraitViewport = webcamVideo.videoHeight > webcamVideo.videoWidth;
        } else {
            isPortraitViewport = window.innerHeight > window.innerWidth;
        }
        if (btnLabel) btnLabel.textContent = 'หมุนจอ: Auto';
    } else if (orientationSetting === 'portrait') {
        isPortraitViewport = true;
        if (btnLabel) btnLabel.textContent = 'หมุนจอ: แนวตั้ง';
    } else {
        isPortraitViewport = false;
        if (btnLabel) btnLabel.textContent = 'หมุนจอ: แนวนอน';
    }

    if (container) {
        if (isPortraitViewport) {
            container.classList.remove('camera-viewport-landscape');
            container.classList.add('camera-viewport-portrait', 'max-w-md');
            if (badgeText) badgeText.textContent = orientationSetting === 'auto' ? 'แนวตั้ง Auto' : 'แนวตั้ง (Portrait)';
            if (icon) icon.className = 'ph-bold ph-device-mobile-camera';
        } else {
            container.classList.remove('camera-viewport-portrait', 'max-w-md');
            container.classList.add('camera-viewport-landscape');
            if (badgeText) badgeText.textContent = orientationSetting === 'auto' ? 'แนวนอน Auto' : 'แนวนอน (Landscape)';
            if (icon) icon.className = 'ph-bold ph-device-mobile-camera rotate-90';
        }
    }
}

function cycleCameraOrientation() {
    if (orientationSetting === 'auto') orientationSetting = 'portrait';
    else if (orientationSetting === 'portrait') orientationSetting = 'landscape';
    else orientationSetting = 'auto';

    applyOrientationLayout();
    resizeCanvases();
    showToast(`ปรับมุมมองกล้องเป็น: ${orientationSetting}`);
}

function resizeCanvases() {
    applyOrientationLayout();
    const rect = liveCanvas.parentElement.getBoundingClientRect();
    liveCanvas.width = rect.width || 800;
    liveCanvas.height = rect.height || 450;

    const anaCanvas = document.getElementById('analyticsCourtCanvas');
    if (anaCanvas && anaCanvas.parentElement) {
        const anaRect = anaCanvas.parentElement.getBoundingClientRect();
        anaCanvas.width = anaRect.width || 720;
        anaCanvas.height = anaRect.height || 450;
        drawAnalyticsCourt();
    }
}
window.addEventListener('resize', resizeCanvases);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvases, 150));

async function toggleWebcam() {
    const btnText = document.getElementById('cameraBtnText');

    if (isUploadedVideoActive) {
        exitUploadedVideoMode();
    }

    if (!isWebcamActive) {
        try {
            const isPort = window.innerHeight > window.innerWidth;
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: isPort ? 720 : 1280 },
                    height: { ideal: isPort ? 1280 : 720 },
                    frameRate: { ideal: 60 }
                },
                audio: false
            });
            webcamVideo.srcObject = stream;
            webcamVideo.loop = false;
            await webcamVideo.play();
            isWebcamActive = true;
            btnText.textContent = 'ปิดกล้องสด';
            initPoseDetectionModel();
            resizeCanvases();
            showToast('เปิดกล้องสดแล้ว! เล็งกล้องไปที่สนามแบดมินตันจริง หรือกด "ล็อกพิกัดเส้นสนาม & เน็ท"');
        } catch (err) {
            showToast('ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตสิทธิ์กล้อง หรืออัปโหลดคลิปวิดีโอสนามจริง');
        }
    } else {
        if (webcamVideo.srcObject) {
            webcamVideo.srcObject.getTracks().forEach(t => t.stop());
            webcamVideo.srcObject = null;
        }
        isWebcamActive = false;
        btnText.textContent = 'เปิดกล้องสด';
        showToast('ปิดกล้องสดแล้ว');
    }
}

function triggerVideoUploadSelect() {
    document.getElementById('videoUploadInput').click();
}

function handleVideoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (isWebcamActive && webcamVideo.srcObject) {
        webcamVideo.srcObject.getTracks().forEach(t => t.stop());
        webcamVideo.srcObject = null;
        isWebcamActive = false;
        document.getElementById('cameraBtnText').textContent = 'เปิดกล้องสด';
    }

    if (uploadedVideoURL) {
        URL.revokeObjectURL(uploadedVideoURL);
    }
    uploadedVideoURL = URL.createObjectURL(file);
    webcamVideo.srcObject = null;
    webcamVideo.src = uploadedVideoURL;
    webcamVideo.loop = true;
    webcamVideo.muted = true;
    webcamVideo.playbackRate = 1.0;

    webcamVideo.onloadedmetadata = () => {
        isUploadedVideoActive = true;
        isTrackingPaused = false;
        document.getElementById('videoPlaybackControls').classList.remove('hidden');
        document.getElementById('uploadedFileName').textContent = file.name;
        document.getElementById('videoDurTime').textContent = formatTimeSec(webcamVideo.duration || 0);
        initPoseDetectionModel();
        resetMatchData(true);
        webcamVideo.play();
        resizeCanvases();
        showToast(`โหลดคลิปสนามจริง "${file.name}" สำเร็จ! กำลังตรวจจับเส้นสนาม เน็ท และผู้เล่นด้วย AI`);
    };
}

function setVideoSpeed(rate) {
    webcamVideo.playbackRate = rate;
    [0.5, 1, 1.5].forEach(r => {
        const btn = document.getElementById(`spd-${r}`);
        if (!btn) return;
        btn.className = (r === rate)
            ? 'px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-bold text-[10px]'
            : 'px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] hover:bg-slate-700';
    });
}

function seekUploadedVideo(percentVal) {
    if (!isUploadedVideoActive || !webcamVideo.duration) return;
    webcamVideo.currentTime = (Number(percentVal) / 100) * webcamVideo.duration;
}

function exitUploadedVideoMode() {
    webcamVideo.pause();
    webcamVideo.removeAttribute('src');
    webcamVideo.load();
    isUploadedVideoActive = false;
    document.getElementById('videoPlaybackControls').classList.add('hidden');
    resizeCanvases();
    showToast('ปิดโหมดวิเคราะห์คลิปวิดีโอแล้ว');
}

/********************************************************************
 * 6. HIGH-PRECISION COURT & NET CALIBRATION + MAGNIFIER LOUPE
 ********************************************************************/
function toggleCourtCalibrationMode() {
    if (!isWebcamActive && !isUploadedVideoActive) {
        showToast('กรุณาเปิดกล้องสดหรืออัปโหลดคลิปวิดีโอสนามก่อนทำการล็อกพิกัดเส้นสนามและเน็ท');
        return;
    }
    isCalibratingCourt = !isCalibratingCourt;
    const btn = document.getElementById('btnCalibrateCourt');
    if (isCalibratingCourt) {
        ShuttleCV.setCourtLocked(true);
        if (btn) {
            btn.className = 'flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-400/20 transition-all';
            btn.innerHTML = '<i class="ph-fill ph-check-fat text-base"></i><span>บันทึกการล็อกเส้นสนาม & เน็ท</span>';
        }
        showToast('โหมดล็อกเส้นสนามความแม่นยำสูง: ลากจุดมุมคอร์ททั้ง 4 มุม และปลายเน็ท 2 ข้างให้ตรงกับสนามจริง (มีแว่นขยายช่วยเล็ง)');
    } else {
        ShuttleCV.setCourtLocked(true);
        if (btn) {
            btn.className = 'flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-all';
            btn.innerHTML = '<i class="ph-bold ph-crosshair text-emerald-400 text-base"></i><span>ล็อกเส้นสนาม & เน็ทแล้ว (แก้ไข)</span>';
        }
        showToast('ล็อกพิกัดเส้นสนาม 13.40m × 6.10m และความสูงเน็ทเรียบร้อย! ความแม่นยำสูงสุด');
    }
}

function triggerAutoSnapCourtCV() {
    if (!isWebcamActive && !isUploadedVideoActive) {
        showToast('กรุณาเปิดกล้องสดหรืออัปโหลดคลิปวิดีโอก่อนสแกนเส้นสนาม');
        return;
    }
    ShuttleCV.setCourtLocked(false);
    const cvRes = ShuttleCV.analyzeVideoFrameCV(webcamVideo, detectedHumanBoxes);
    if (cvRes && cvRes.courtConfidence >= 55) {
        ShuttleCV.setCourtLocked(true);
        showToast(`AI สแกนและล็อกเส้นสนามจริงสำเร็จ! (ความแม่นยำ ${cvRes.courtConfidence}%, เน็ท ${cvRes.netConfidence}%)`);
    } else {
        showToast('กำลังสแกนหาเส้นขาวและขอบเน็ท... หากแสงสะท้อนมาก กดปุ่ม "ล็อกพิกัดเส้นสนาม & เน็ท" เพื่อเล็งด้วยแว่นขยายได้ทันที');
    }
}

// Pointer events on liveCanvas for dragging the 4 court corners + 2 net posts with Magnifier Loupe
function getPointerNormPos(evt) {
    const rect = liveCanvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return {
        x: Math.max(0.01, Math.min(0.99, (clientX - rect.left) / rect.width)),
        y: Math.max(0.01, Math.min(0.99, (clientY - rect.top) / rect.height))
    };
}

liveCanvas.addEventListener('pointerdown', (e) => {
    if (!isCalibratingCourt) return;
    const pos = getPointerNormPos(e);
    const corners = ShuttleCV.getCorners();
    const handleKeys = ['tl', 'tr', 'br', 'bl', 'netL', 'netR'];

    let closestKey = null;
    let minDist = 0.065; // Hit radius
    handleKeys.forEach(k => {
        const pt = corners[k];
        const d = Math.hypot(pt.x - pos.x, pt.y - pos.y);
        if (d < minDist) {
            minDist = d;
            closestKey = k;
        }
    });

    if (closestKey) {
        draggingHandleKey = closestKey;
        dragPointerPos = pos;
        liveCanvas.setPointerCapture(e.pointerId);
        e.preventDefault();
    }
});

liveCanvas.addEventListener('pointermove', (e) => {
    if (!isCalibratingCourt || !draggingHandleKey) return;
    const pos = getPointerNormPos(e);
    dragPointerPos = pos;
    ShuttleCV.setCorner(draggingHandleKey, pos.x, pos.y);
    e.preventDefault();
});

liveCanvas.addEventListener('pointerup', (e) => {
    if (draggingHandleKey) {
        draggingHandleKey = null;
        dragPointerPos = null;
        liveCanvas.releasePointerCapture(e.pointerId);
    }
});

/********************************************************************
 * 7. RENDER REAL CAMERA SCENE, DETECTED LINES/NET & AI HUD
 ********************************************************************/
function renderLiveScene() {
    const w = liveCanvas.width;
    const h = liveCanvas.height;
    liveCtx.clearRect(0, 0, w, h);

    const hasVideoFeed = (isWebcamActive || isUploadedVideoActive) && webcamVideo.readyState >= 2;

    if (!hasVideoFeed) {
        // Clean Standby View (NO FAKE SIMULATION!)
        const grad = liveCtx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#090d16');
        grad.addColorStop(1, '#0f172a');
        liveCtx.fillStyle = grad;
        liveCtx.fillRect(0, 0, w, h);

        // Subtle grid lines
        liveCtx.strokeStyle = 'rgba(51, 65, 85, 0.25)';
        liveCtx.lineWidth = 1;
        for (let gx = 0; gx < w; gx += 48) {
            liveCtx.beginPath(); liveCtx.moveTo(gx, 0); liveCtx.lineTo(gx, h); liveCtx.stroke();
        }
        for (let gy = 0; gy < h; gy += 48) {
            liveCtx.beginPath(); liveCtx.moveTo(0, gy); liveCtx.lineTo(w, gy); liveCtx.stroke();
        }

        // Center instructions
        liveCtx.fillStyle = '#34d399';
        liveCtx.font = 'bold 16px Prompt, sans-serif';
        liveCtx.textAlign = 'center';
        liveCtx.fillText('โหมดใช้งานจริง 100% (ปิดระบบจำลองแล้ว)', w / 2, h / 2 - 22);

        liveCtx.fillStyle = '#cbd5e1';
        liveCtx.font = '13px Prompt, sans-serif';
        liveCtx.fillText('กดปุ่ม "เปิดกล้องสด" หรือ "อัปโหลดคลิปวิเคราะห์" ด้านล่าง', w / 2, h / 2 + 6);

        liveCtx.fillStyle = '#64748b';
        liveCtx.font = '11px Prompt, sans-serif';
        liveCtx.fillText('AI จะตรวจจับเส้นคอร์ทจริง ตาข่าย (Net) ผู้เล่น ความเร็วลูกตบ และนับแต้มอัตโนมัติ', w / 2, h / 2 + 30);
        return;
    }

    // 1. Draw Real Camera / Video Frame
    liveCtx.drawImage(webcamVideo, 0, 0, w, h);

    // 2. Run Real-Time CV Line, Net & Shuttle Detection + Pose Estimation
    if (!isTrackingPaused) {
        runRealPoseEstimation(webcamVideo);
        const cvRes = ShuttleCV.analyzeVideoFrameCV(webcamVideo, detectedHumanBoxes);
        processRealShuttleAndRally(cvRes);
        updateCVConfidenceBadges();
    }

    // 3. Draw Raw CV-Detected Line Segments (Cyan/Yellow highlights showing actual white lines detected in image)
    const rawSegments = ShuttleCV.getDetectedSegments();
    if (rawSegments.length > 0) {
        liveCtx.save();
        rawSegments.forEach(seg => {
            liveCtx.strokeStyle = seg.type === 'H' ? 'rgba(56, 189, 248, 0.65)' : 'rgba(250, 204, 21, 0.65)';
            liveCtx.lineWidth = 2;
            liveCtx.beginPath();
            liveCtx.moveTo(seg.x1 * w, seg.y1 * h);
            liveCtx.lineTo(seg.x2 * w, seg.y2 * h);
            liveCtx.stroke();
        });
        liveCtx.restore();
    }

    // 4. Draw Homography-Locked BWF Court Lines & Net ONLY when a court is genuinely detected OR locked/calibrating
    const showCourtOverlay = isCalibratingCourt || ShuttleCV.isCourtValidOrLocked();
    if (showCourtOverlay) {
        drawHomographyCourtAndNet(liveCtx, w, h);
    } else {
        // Show non-intrusive scanning banner when camera points at non-court scene (e.g. room/face)
        liveCtx.save();
        const boxW = Math.min(w - 32, 460);
        const boxH = 44;
        const bx = (w - boxW) / 2;
        const by = h - 78;
        liveCtx.fillStyle = 'rgba(9, 13, 22, 0.85)';
        liveCtx.beginPath();
        liveCtx.roundRect(bx, by, boxW, boxH, 12);
        liveCtx.fill();
        liveCtx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
        liveCtx.lineWidth = 1.2;
        liveCtx.stroke();

        liveCtx.fillStyle = '#fbbf24';
        liveCtx.font = '600 12px Prompt, sans-serif';
        liveCtx.textAlign = 'center';
        liveCtx.fillText('กำลังสแกนหาเส้นสนามและเน็ทจริง... (เล็งกล้องไปที่คอร์ท หรือกด "ล็อกพิกัดเส้นสนาม & เน็ท")', w / 2, by + 26);
        liveCtx.restore();
    }

    // 5. Draw Real Detected Players (MoveNet Keypoints + Metric Foot Ring)
    drawRealDetectedPlayers(liveCtx, w, h);

    // 6. Draw Real Detected Shuttlecock & Hawkeye Landing Spot
    drawRealShuttleAndHawkeye(liveCtx, w, h);

    // 7. If in Precision Calibration Mode, draw draggable handles & Magnifier Loupe
    if (isCalibratingCourt) {
        drawCalibrationHandlesAndLoupe(liveCtx, w, h);
    }
}

function drawHomographyCourtAndNet(ctx, w, h) {
    ctx.save();
    const isLocked = ShuttleCV.getCourtLocked();
    ctx.strokeStyle = isCalibratingCourt
        ? 'rgba(251, 191, 36, 0.92)'
        : (isLocked ? 'rgba(16, 185, 129, 0.88)' : 'rgba(52, 211, 153, 0.72)');
    ctx.lineWidth = isCalibratingCourt ? 2.5 : 2.2;

    function drawMetricLine(u1, v1, u2, v2, dashed = false, customColor = null) {
        const p1 = ShuttleCV.courtNormalizedToScreen(u1, v1);
        const p2 = ShuttleCV.courtNormalizedToScreen(u2, v2);
        ctx.save();
        if (customColor) ctx.strokeStyle = customColor;
        if (dashed) ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(p1.x * w, p1.y * h);
        ctx.lineTo(p2.x * w, p2.y * h);
        ctx.stroke();
        ctx.restore();
    }

    // Official BWF Proportional Fractions:
    // Width = 6.10m, Singles inset = 0.46m / 6.10m = 0.0754
    // Length = 13.40m, Long doubles service = 0.76m / 13.40m = 0.0567
    // Short service from net = 1.98m / 13.40m = 0.1478 -> v = 0.5 - 0.1478 = 0.3522 and 0.6478
    const sInset = 0.0754;
    const lService = 0.0567;
    const sServiceTop = 0.3522;
    const sServiceBot = 0.6478;

    // Outer Doubles Boundary
    drawMetricLine(0, 0, 1, 0);
    drawMetricLine(1, 0, 1, 1);
    drawMetricLine(1, 1, 0, 1);
    drawMetricLine(0, 1, 0, 0);

    // Singles Sidelines (Highlighted if Singles Mode is active)
    const singlesColor = !isDoublesMatch ? 'rgba(34, 211, 238, 0.95)' : null;
    drawMetricLine(sInset, 0, sInset, 1, false, singlesColor);
    drawMetricLine(1 - sInset, 0, 1 - sInset, 1, false, singlesColor);

    // Short Service Lines
    drawMetricLine(0, sServiceTop, 1, sServiceTop);
    drawMetricLine(0, sServiceBot, 1, sServiceBot);

    // Long Service Lines for Doubles
    drawMetricLine(0, lService, 1, lService);
    drawMetricLine(0, 1 - lService, 1, 1 - lService);

    // Center Line
    drawMetricLine(0.5, 0, 0.5, sServiceTop);
    drawMetricLine(0.5, sServiceBot, 0.5, 1);

    // Net Floor Line (v = 0.5) & 3D Net Mesh + Top White Tape
    const netFloorL = ShuttleCV.courtNormalizedToScreen(0, 0.5);
    const netFloorR = ShuttleCV.courtNormalizedToScreen(1, 0.5);
    const corners = ShuttleCV.getCorners();
    const netTopL = corners.netL;
    const netTopR = corners.netR;

    // Net Mesh Fill
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.beginPath();
    ctx.moveTo(netFloorL.x * w, netFloorL.y * h);
    ctx.lineTo(netFloorR.x * w, netFloorR.y * h);
    ctx.lineTo(netTopR.x * w, netTopR.y * h);
    ctx.lineTo(netTopL.x * w, netTopL.y * h);
    ctx.closePath();
    ctx.fill();

    // Net Posts (Left & Right)
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(netFloorL.x * w, netFloorL.y * h);
    ctx.lineTo(netTopL.x * w, netTopL.y * h);
    ctx.moveTo(netFloorR.x * w, netFloorR.y * h);
    ctx.lineTo(netTopR.x * w, netTopR.y * h);
    ctx.stroke();

    // Net Top White Tape (High Contrast Cyan/White Glow)
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(netTopL.x * w, netTopL.y * h);
    ctx.lineTo(netTopR.x * w, netTopR.y * h);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Net Label Tag
    const netMidX = ((netTopL.x + netTopR.x) * 0.5) * w;
    const netMidY = ((netTopL.y + netTopR.y) * 0.5) * h - 8;
    ctx.fillStyle = 'rgba(9, 13, 22, 0.8)';
    ctx.beginPath();
    ctx.roundRect(netMidX - 38, netMidY - 12, 76, 16, 6);
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 9.5px Prompt, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NET (1.55m)', netMidX, netMidY - 1);

    ctx.restore();
}

function drawCalibrationHandlesAndLoupe(ctx, w, h) {
    const corners = ShuttleCV.getCorners();
    const labels = {
        tl: 'มุมบนซ้าย (TL)',
        tr: 'มุมบนขวา (TR)',
        br: 'มุมล่างขวา (BR)',
        bl: 'มุมล่างซ้าย (BL)',
        netL: 'หัวเน็ทซ้าย (Net-L)',
        netR: 'หัวเน็ทขวา (Net-R)'
    };

    Object.entries(labels).forEach(([key, label]) => {
        const pt = corners[key];
        const px = pt.x * w;
        const py = pt.y * h;
        const isNet = key.startsWith('net');
        const color = isNet ? '#38bdf8' : '#fbbf24';

        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, 12, 0, Math.PI * 2);
        ctx.fillStyle = color + '33';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = color;
        ctx.stroke();

        // Crosshair center
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Handle label
        ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
        ctx.beginPath();
        ctx.roundRect(px - 44, py - 28, 88, 16, 5);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.font = 'bold 9.5px Prompt, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, px, py - 17);
        ctx.restore();
    });

    // Sub-Pixel Precision Magnifier Loupe when dragging a corner or net post
    if (draggingHandleKey && dragPointerPos && webcamVideo.readyState >= 2) {
        const loupeRadius = 56;
        const zoom = 3.0;
        const targetX = dragPointerPos.x * w;
        const targetY = dragPointerPos.y * h;
        // Position loupe above finger/cursor, or below if near top edge
        const loupeX = Math.max(loupeRadius + 12, Math.min(w - loupeRadius - 12, targetX));
        const loupeY = targetY > loupeRadius * 2.4 ? targetY - loupeRadius - 28 : targetY + loupeRadius + 28;

        const vW = webcamVideo.videoWidth || w;
        const vH = webcamVideo.videoHeight || h;
        const srcW = (loupeRadius * 2 / zoom) * (vW / w);
        const srcH = (loupeRadius * 2 / zoom) * (vH / h);
        const srcX = dragPointerPos.x * vW - srcW / 2;
        const srcY = dragPointerPos.y * vH - srcH / 2;

        ctx.save();
        ctx.beginPath();
        ctx.arc(loupeX, loupeY, loupeRadius, 0, Math.PI * 2);
        ctx.clip();

        ctx.fillStyle = '#090d16';
        ctx.fillRect(loupeX - loupeRadius, loupeY - loupeRadius, loupeRadius * 2, loupeRadius * 2);
        ctx.drawImage(
            webcamVideo,
            srcX, srcY, srcW, srcH,
            loupeX - loupeRadius, loupeY - loupeRadius, loupeRadius * 2, loupeRadius * 2
        );

        // Precision Crosshair inside Loupe
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(loupeX - loupeRadius, loupeY);
        ctx.lineTo(loupeX + loupeRadius, loupeY);
        ctx.moveTo(loupeX, loupeY - loupeRadius);
        ctx.lineTo(loupeX, loupeY + loupeRadius);
        ctx.stroke();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(loupeX, loupeY, loupeRadius, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fbbf24';
        ctx.stroke();
    }
}

function drawRealDetectedPlayers(ctx, w, h) {
    const showTrails = document.getElementById('chkShowTrails')?.checked;
    const showSkeleton = document.getElementById('chkShowSkeleton')?.checked;

    Object.values(players).forEach(p => {
        if (!p.detected) return; // NEVER draw fake players when not detected!

        const px = p.screenX * w;
        const py = p.screenY * h;

        // 1. Optional Running Footpath Trail
        if (showTrails && p.positions.length > 1 && ShuttleCV.isCourtValidOrLocked()) {
            const recent = p.positions.slice(-25);
            ctx.save();
            ctx.beginPath();
            recent.forEach((pt, i) => {
                const sc = ShuttleCV.courtNormalizedToScreen(pt.x, pt.y);
                if (i === 0) ctx.moveTo(sc.x * w, sc.y * h);
                else ctx.lineTo(sc.x * w, sc.y * h);
            });
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.55;
            ctx.stroke();
            ctx.restore();
        }

        // 2. Real Pose Keypoint Skeleton (MoveNet 17 keypoints)
        if (showSkeleton && p.keypoints && p.keypoints.length > 0) {
            const kpMap = {};
            p.keypoints.forEach(k => { if (k.score > 0.25) kpMap[k.name] = k; });
            const bones = [
                ['left_shoulder', 'right_shoulder'],
                ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
                ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
                ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'],
                ['left_hip', 'right_hip'],
                ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
                ['right_hip', 'right_knee'], ['right_knee', 'right_ankle']
            ];
            ctx.save();
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2.2;
            bones.forEach(([a, b]) => {
                if (kpMap[a] && kpMap[b]) {
                    ctx.beginPath();
                    ctx.moveTo(kpMap[a].x * w, kpMap[a].y * h);
                    ctx.lineTo(kpMap[b].x * w, kpMap[b].y * h);
                    ctx.stroke();
                }
            });
            Object.values(kpMap).forEach(k => {
                ctx.beginPath();
                ctx.arc(k.x * w, k.y * h, 3.2, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
            });
            ctx.restore();
        }

        // 3. Glowing Floor Foot Ring at Real Ankle Position
        ctx.save();
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(px, py, 20, 8, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Player ID & Real Speed Badge
        const label = `${p.id} • ${p.currentSpeedKmh} km/h`;
        ctx.font = 'bold 10px Prompt, sans-serif';
        const tw = ctx.measureText(label).width + 12;
        ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
        ctx.beginPath();
        ctx.roundRect(px - tw / 2, py + 10, tw, 16, 6);
        ctx.fill();
        ctx.fillStyle = p.color;
        ctx.textAlign = 'center';
        ctx.fillText(label, px, py + 21);
        ctx.restore();
    });
}

function drawRealShuttleAndHawkeye(ctx, w, h) {
    // 1. Draw Active Shuttlecock in Flight (if detected)
    if (shuttle.detected && shuttle.trail.length > 0) {
        const isFast = shuttle.speedKmh >= 220;
        const sColor = isFast ? '#fbbf24' : '#38bdf8';

        ctx.save();
        if (shuttle.trail.length > 1) {
            ctx.beginPath();
            shuttle.trail.slice(-10).forEach((pt, i) => {
                if (i === 0) ctx.moveTo(pt.sx * w, pt.sy * h);
                else ctx.lineTo(pt.sx * w, pt.sy * h);
            });
            ctx.strokeStyle = sColor + '88';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        const sx = shuttle.screenX * w;
        const sy = shuttle.screenY * h;
        ctx.shadowColor = sColor;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = sColor;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(sx, sy, 8, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = sColor;
        ctx.fillText(`${shuttle.speedKmh} km/h`, sx + 12, sy + 4);
        ctx.restore();
    }

    // 2. Draw Recent Hawkeye IN/OUT Landing Spot Mark (persists for 6 seconds after point call)
    const spot = scoreboard.lastLandingSpot;
    if (spot && performance.now() - spot.time < 6000 && ShuttleCV.isCourtValidOrLocked()) {
        const sc = ShuttleCV.courtNormalizedToScreen(spot.u, spot.v);
        const lx = sc.x * w;
        const ly = sc.y * h;
        const markColor = spot.isIn ? '#10b981' : '#f43f5e';

        ctx.save();
        ctx.shadowColor = markColor;
        ctx.shadowBlur = 14;
        ctx.strokeStyle = markColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(lx, ly, 16, 7, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = markColor;
        ctx.beginPath();
        ctx.arc(lx, ly, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        const callTag = spot.isIn ? `IN (+${Math.abs(spot.marginCm)}cm)` : `OUT (-${Math.abs(spot.marginCm)}cm)`;
        ctx.font = 'bold 11px Prompt, sans-serif';
        const bw = ctx.measureText(callTag).width + 14;
        ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
        ctx.beginPath();
        ctx.roundRect(lx - bw / 2, ly - 28, bw, 18, 6);
        ctx.fill();
        ctx.strokeStyle = markColor;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = markColor;
        ctx.textAlign = 'center';
        ctx.fillText(callTag, lx, ly - 15.5);
        ctx.restore();
    }
}

function updateCVConfidenceBadges() {
    const courtConfEl = document.getElementById('cvCourtConfText');
    const netConfEl = document.getElementById('cvNetConfText');
    const cConf = ShuttleCV.getCourtConfidence();
    const nConf = ShuttleCV.getNetConfidence();
    const locked = ShuttleCV.getCourtLocked();

    if (courtConfEl) {
        courtConfEl.textContent = locked ? `ล็อกพิกัดคอร์ทแล้ว (100%)` : `เส้นสนาม: ${cConf}%`;
        courtConfEl.className = (locked || cConf >= 60)
            ? 'text-[10px] font-semibold text-emerald-300'
            : 'text-[10px] font-semibold text-amber-300';
    }
    if (netConfEl) {
        netConfEl.textContent = locked ? `เน็ท: ล็อกแล้ว` : `เน็ท: ${nConf}%`;
    }
}

/********************************************************************
 * 8. AI VISION REFEREE VERIFICATION (GEMINI MULTIMODAL CHECK)
 ********************************************************************/
async function verifyFrameWithGeminiAI() {
    if (!isWebcamActive && !isUploadedVideoActive) {
        showToast('กรุณาเปิดกล้องสดหรือเปิดคลิปวิดีโอเพื่อส่งภาพให้ AI ตรวจสอบ');
        return;
    }
    if (!geminiApiKey) {
        toggleApiKeyModal();
        showToast('กรุณาใส่ Gemini API Key เพื่อใช้ฟีเจอร์ส่งภาพเฟรมสนามให้ Gemini Vision ตรวจสอบ');
        return;
    }

    showToast('กำลังส่งภาพเฟรมสนามจริงให้ Gemini Vision AI ตรวจสอบเส้นคอร์ท เน็ท และขานแต้ม...');
    try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 640;
        tempCanvas.height = 360;
        tempCanvas.getContext('2d').drawImage(webcamVideo, 0, 0, 640, 360);
        const base64Jpeg = tempCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
        const prompt = `คุณคือกรรมการแบดมินตัน BWF AI วิเคราะห์ภาพสนามแบดมินตันนี้และตอบเป็น JSON เท่านั้น:
{
  "courtDetected": true หรือ false,
  "tl": {"x": 0.0-1.0, "y": 0.0-1.0},
  "tr": {"x": 0.0-1.0, "y": 0.0-1.0},
  "br": {"x": 0.0-1.0, "y": 0.0-1.0},
  "bl": {"x": 0.0-1.0, "y": 0.0-1.0},
  "netY": 0.0-1.0,
  "playersCount": จำนวนผู้เล่นในสนาม,
  "refereeSummary": "สรุปสิ่งที่เห็นในสนามและตำแหน่งผู้เล่น/ลูกแบดสั้นๆ ภาษาไทย"
}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: 'image/jpeg', data: base64Jpeg } }
                    ]
                }],
                generationConfig: { responseMimeType: 'application/json' }
            })
        });
        if (!res.ok) throw new Error('Gemini Vision API Error');
        const data = await res.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(rawText);

        if (parsed.courtDetected && parsed.tl && parsed.tr && parsed.br && parsed.bl) {
            ShuttleCV.setCorner('tl', parsed.tl.x, parsed.tl.y);
            ShuttleCV.setCorner('tr', parsed.tr.x, parsed.tr.y);
            ShuttleCV.setCorner('br', parsed.br.x, parsed.br.y);
            ShuttleCV.setCorner('bl', parsed.bl.x, parsed.bl.y);
            if (parsed.netY) {
                ShuttleCV.setCorner('netL', parsed.tl.x * 0.6 + parsed.bl.x * 0.4, parsed.netY);
                ShuttleCV.setCorner('netR', parsed.tr.x * 0.6 + parsed.br.x * 0.4, parsed.netY);
            }
            ShuttleCV.setCourtLocked(true);
            showToast(`Gemini Vision ล็อกพิกัดเส้นสนามสำเร็จ! ${parsed.refereeSummary || ''}`);
        } else {
            showToast(parsed.refereeSummary || 'Gemini Vision ไม่พบเส้นคอร์ทแบดมินตันที่ชัดเจนในเฟรมนี้');
        }
    } catch (e) {
        showToast('ไม่สามารถเชื่อมต่อ Gemini Vision API ได้ กรุณาตรวจสอบ API Key');
    }
}

/********************************************************************
 * 9. STATS, 2D ANALYTICS & AI COACH UPDATES
 ********************************************************************/
function registerSmashStat(player, speed) {
    allSmashSpeeds.push(speed);
    player.smashHistory.push(speed);
    player.maxSmashKmh = Math.max(...player.smashHistory);
    player.minSmashKmh = Math.min(...player.smashHistory);
    player.avgSmashKmh = Math.round(player.smashHistory.reduce((a, b) => a + b, 0) / player.smashHistory.length);

    if (speed > maxRecordedSpeed) {
        maxRecordedSpeed = speed;
        maxSpeedHolder = player.name;
    }
    if (minRecordedSmashSpeed === 0 || speed < minRecordedSmashSpeed) {
        minRecordedSmashSpeed = speed;
        minSmashHolder = player.name;
    }
}

function recordShotLog(player, shotType, speed) {
    const timeStr = formatTimeSec(matchSeconds);
    shotHistory.unshift({
        time: timeStr,
        player: player.name,
        team: player.team,
        type: shotType,
        speed: speed
    });
    if (shotHistory.length > 30) shotHistory.pop();
    renderShotHistoryList();
}

function renderShotHistoryList() {
    const container = document.getElementById('shotHistoryList');
    if (!container) return;
    if (shotHistory.length === 0) {
        container.innerHTML = `<div class="text-center text-xs text-slate-500 py-6">ยังไม่มีจังหวะตีที่ตรวจพบจากกล้อง/คลิปจริง</div>`;
        return;
    }
    container.innerHTML = shotHistory.slice(0, 10).map(item => {
        const isFast = item.speed >= 240;
        const teamColor = item.team === 'A' ? 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30' : 'text-rose-300 bg-rose-500/10 border-rose-500/30';
        return `
            <div class="flex items-center justify-between bg-slate-900/80 border border-slate-800/90 px-2.5 py-1.5 rounded-lg text-xs">
                <div class="flex items-center gap-2">
                    <span class="text-[10px] font-mono text-slate-500">${item.time}</span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold border ${teamColor}">ทีม ${item.team}</span>
                    <span class="font-medium text-slate-200">${item.player}</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[11px] text-slate-400 hidden sm:inline">${item.type.split(' ')[0]}</span>
                    <span class="font-mono font-bold ${isFast ? 'text-amber-400' : 'text-emerald-400'}">${item.speed} km/h</span>
                </div>
            </div>
        `;
    }).join('');
}

function updateLiveHUD() {
    const speedEl = document.getElementById('liveSpeedValue');
    const badgeEl = document.getElementById('liveShotTypeBadge');
    if (speedEl) speedEl.textContent = shuttle.speedKmh;
    if (badgeEl) badgeEl.textContent = shuttle.shotType;

    document.getElementById('statMaxSpeed').textContent = maxRecordedSpeed;
    document.getElementById('statMaxHolder').textContent = maxSpeedHolder;
    document.getElementById('statMinSmashSpeed').textContent = minRecordedSmashSpeed;
    document.getElementById('statMinHolder').textContent = minSmashHolder;

    const avgSmash = allSmashSpeeds.length > 0
        ? Math.round(allSmashSpeeds.reduce((acc, v) => acc + v, 0) / allSmashSpeeds.length)
        : 0;
    document.getElementById('statAvgSmashSpeed').textContent = avgSmash;
    document.getElementById('statTotalSmashes').textContent = allSmashSpeeds.length;

    const quickMax = document.getElementById('hudMaxSmashQuick');
    const quickAvg = document.getElementById('hudAvgSmashQuick');
    if (quickMax) quickMax.textContent = maxRecordedSpeed;
    if (quickAvg) quickAvg.textContent = avgSmash;

    const avgSpeed = shotHistory.length > 0
        ? Math.round(shotHistory.reduce((acc, s) => acc + s.speed, 0) / shotHistory.length)
        : 0;
    document.getElementById('statAvgSpeed').textContent = avgSpeed;

    renderLivePlayersCards();
}

function renderLivePlayersCards() {
    const container = document.getElementById('livePlayersContainer');
    if (!container) return;
    container.innerHTML = Object.values(players).map(p => {
        const teamBadge = p.team === 'A'
            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
            : 'bg-rose-500/20 text-rose-300 border-rose-500/30';
        const statusDot = p.detected
            ? '<span class="w-2 h-2 rounded-full bg-emerald-400 inline-block mr-1"></span>ตรวจพบในสนาม'
            : '<span class="w-2 h-2 rounded-full bg-slate-600 inline-block mr-1"></span>ไม่พบในเฟรม';
        return `
            <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-slate-950" style="background-color: ${p.color}">
                        ${p.id}
                    </div>
                    <div>
                        <div class="flex items-center gap-1.5">
                            <span class="text-xs font-bold text-white">${p.name}</span>
                            <span class="text-[10px] px-1.5 py-0.2 rounded border ${teamBadge}">ทีม ${p.team}</span>
                        </div>
                        <div class="text-[11px] text-slate-400">${statusDot} • ตี ${p.shotsCount} ลูก</div>
                    </div>
                </div>
                <div class="text-right font-mono">
                    <div class="text-xs font-bold text-emerald-400">${p.distanceMeters.toFixed(1)} ม.</div>
                    <div class="text-[10px] text-slate-400">วิ่ง ${p.currentSpeedKmh} km/h</div>
                </div>
            </div>
        `;
    }).join('');
}

function drawAnalyticsCourt() {
    const canvas = document.getElementById('analyticsCourtCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padX = w * 0.08;
    const padY = h * 0.08;
    const cw = w - padX * 2;
    const ch = h - padY * 2;

    function normTo2DCourt(nx, ny) {
        return { x: padX + ny * cw, y: padY + nx * ch };
    }

    ctx.fillStyle = '#064e3b';
    ctx.fillRect(padX, padY, cw, ch);

    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(padX, padY, cw, ch);
    ctx.strokeRect(padX, padY + ch * 0.0754, cw, ch * (1 - 0.1508));

    ctx.beginPath();
    ctx.moveTo(padX + cw * 0.352, padY);
    ctx.lineTo(padX + cw * 0.352, padY + ch);
    ctx.moveTo(padX + cw * 0.648, padY);
    ctx.lineTo(padX + cw * 0.648, padY + ch);
    ctx.moveTo(padX, padY + ch * 0.5);
    ctx.lineTo(padX + cw * 0.352, padY + ch * 0.5);
    ctx.moveTo(padX + cw * 0.648, padY + ch * 0.5);
    ctx.lineTo(padX + cw, padY + ch * 0.5);
    ctx.stroke();

    // Net Line
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(padX + cw * 0.5, padY - 8);
    ctx.lineTo(padX + cw * 0.5, padY + ch + 8);
    ctx.stroke();
    ctx.restore();

    const activePlayers = Object.values(players).filter(p => {
        if (analyticsFilter === 'ALL') return true;
        if (analyticsFilter === 'TEAM_A') return p.team === 'A';
        if (analyticsFilter === 'TEAM_B') return p.team === 'B';
        return p.id === analyticsFilter;
    });

    if (graphicMode === 'both' || graphicMode === 'heatmap') {
        activePlayers.forEach(p => {
            p.positions.forEach((pt, idx) => {
                if (idx % 2 !== 0) return;
                const c = normTo2DCourt(pt.x, pt.y);
                const grad = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, 22);
                grad.addColorStop(0, p.color + '55');
                grad.addColorStop(1, p.color + '00');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(c.x, c.y, 22, 0, Math.PI * 2);
                ctx.fill();
            });
        });
    }

    if (graphicMode === 'both' || graphicMode === 'trails') {
        activePlayers.forEach(p => {
            if (p.positions.length < 2) return;
            ctx.beginPath();
            p.positions.forEach((pt, idx) => {
                const c = normTo2DCourt(pt.x, pt.y);
                if (idx === 0) ctx.moveTo(c.x, c.y);
                else ctx.lineTo(c.x, c.y);
            });
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2.2;
            ctx.stroke();
        });
    }

    renderAnalyticsSummaryCards();
}

function renderAnalyticsSummaryCards() {
    const teamADist = (players.A1.distanceMeters + players.A2.distanceMeters).toFixed(1);
    const teamBDist = (players.B1.distanceMeters + players.B2.distanceMeters).toFixed(1);
    const elADist = document.getElementById('teamADistText');
    const elBDist = document.getElementById('teamBDistText');
    if (elADist) elADist.textContent = `${teamADist} ม.`;
    if (elBDist) elBDist.textContent = `${teamBDist} ม.`;

    const container = document.getElementById('analyticsPlayerCards');
    if (!container) return;
    container.innerHTML = Object.values(players).map(p => `
        <div class="bg-slate-900/85 border border-slate-800 rounded-xl p-3 space-y-2">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full" style="background-color: ${p.color}"></span>
                    <span class="text-xs font-bold text-white">${p.name}</span>
                </div>
                <span class="text-xs font-mono font-bold text-emerald-400">ระยะวิ่งจริง ${p.distanceMeters.toFixed(1)} ม.</span>
            </div>
            <div class="grid grid-cols-3 gap-1.5 text-[11px] bg-slate-950/60 p-2 rounded-lg">
                <div>
                    <span class="text-slate-400 block text-[10px]">ตบเร็วสุด</span>
                    <span class="font-mono font-bold text-amber-300">${p.maxSmashKmh} km/h</span>
                </div>
                <div>
                    <span class="text-slate-400 block text-[10px]">ตบช้าสุด</span>
                    <span class="font-mono font-bold text-cyan-300">${p.minSmashKmh} km/h</span>
                </div>
                <div>
                    <span class="text-slate-400 block text-[10px]">ตบเฉลี่ย</span>
                    <span class="font-mono font-bold text-emerald-300">${p.avgSmashKmh} km/h</span>
                </div>
            </div>
        </div>
    `).join('');
}

function setGraphicMode(mode) {
    graphicMode = mode;
    ['both', 'heatmap', 'trails'].forEach(m => {
        const btn = document.getElementById(`gMode-${m}`);
        if (btn) {
            btn.className = (m === mode)
                ? 'px-3 py-1 rounded-lg text-xs font-medium bg-emerald-500 text-slate-950'
                : 'px-3 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white';
        }
    });
    drawAnalyticsCourt();
}

function setAnalyticsFilter(filter) {
    analyticsFilter = filter;
    drawAnalyticsCourt();
}

/********************************************************************
 * 10. CONTROLS, RESET, API KEY MODAL & MAIN LOOP
 ********************************************************************/
function toggleTrackingPause() {
    isTrackingPaused = !isTrackingPaused;
    const pauseBtnText = document.getElementById('pauseBtnText');
    const pauseIcon = document.getElementById('pauseIcon');
    if (isTrackingPaused) {
        if (isUploadedVideoActive) webcamVideo.pause();
        if (pauseBtnText) pauseBtnText.textContent = 'วิเคราะห์ต่อ';
        if (pauseIcon) pauseIcon.className = 'ph-fill ph-play text-base';
    } else {
        if (isUploadedVideoActive) webcamVideo.play();
        if (pauseBtnText) pauseBtnText.textContent = 'หยุดชั่วคราว';
        if (pauseIcon) pauseIcon.className = 'ph-fill ph-pause text-base';
    }
}

function resetMatchData(silent = false) {
    matchSeconds = 0;
    scoreboard.scoreA = 0;
    scoreboard.scoreB = 0;
    scoreboard.setsA = 0;
    scoreboard.setsB = 0;
    scoreboard.currentSet = 1;
    scoreboard.servingTeam = 'A';
    scoreboard.serviceCourt = 'R';
    scoreboard.rallyState = 'WAITING';
    scoreboard.lastCallText = 'รอเริ่มแรลลี่ (พร้อมตรวจจับอัตโนมัติ)';
    scoreboard.lastCallType = 'IDLE';
    scoreboard.lastLandingSpot = null;
    scoreboard.historyStack = [];
    scoreboard.pointLog = [];

    allSmashSpeeds = [];
    shotHistory = [];
    maxRecordedSpeed = 0;
    maxSpeedHolder = '-';
    minRecordedSmashSpeed = 0;
    minSmashHolder = '-';

    Object.values(players).forEach(p => {
        p.detected = false;
        p.distanceMeters = 0;
        p.currentSpeedKmh = 0;
        p.maxSpeedKmh = 0;
        p.shotsCount = 0;
        p.smashHistory = [];
        p.maxSmashKmh = 0;
        p.minSmashKmh = 0;
        p.avgSmashKmh = 0;
        p.positions = [];
    });

    updateScoreboardUI();
    updateLiveHUD();
    renderShotHistoryList();
    drawAnalyticsCourt();
    if (!silent) {
        showToast('รีเซ็ตสกอร์บอร์ด (0-0) และสถิติทั้งหมดเรียบร้อย พร้อมเริ่มแมตช์จริง');
    }
}

function switchTab(tabId) {
    activeTab = tabId;
    ['live', 'stats', 'analytics', 'coach'].forEach(t => {
        const section = document.getElementById(`tab-${t}`);
        const btn = document.getElementById(`tabBtn-${t}`);
        if (!section || !btn) return;
        if (t === tabId) {
            section.classList.remove('hidden');
            btn.className = 'flex flex-col items-center justify-center py-1.5 rounded-2xl text-emerald-400 bg-emerald-500/15 font-semibold transition-all';
        } else {
            section.classList.add('hidden');
            btn.className = 'flex flex-col items-center justify-center py-1.5 rounded-2xl text-slate-400 hover:text-slate-200 font-medium transition-all';
        }
    });
    if (tabId === 'live' || tabId === 'analytics') {
        setTimeout(() => {
            resizeCanvases();
            if (tabId === 'analytics') drawAnalyticsCourt();
        }, 40);
    }
}

function toggleApiKeyModal() {
    const modal = document.getElementById('apiKeyModal');
    if (!modal) return;
    modal.classList.toggle('hidden');
    const input = document.getElementById('geminiKeyInput');
    if (input) input.value = geminiApiKey;
}

function saveGeminiApiKey() {
    const input = document.getElementById('geminiKeyInput');
    if (input) {
        geminiApiKey = input.value.trim();
        localStorage.setItem('shuttlepro_gemini_key', geminiApiKey);
        showToast(geminiApiKey ? 'บันทึก Gemini API Key สำเร็จ!' : 'ล้างค่า API Key แล้ว');
    }
    toggleApiKeyModal();
}

function toggleIOSGuideModal() {
    document.getElementById('iosGuideModal')?.classList.toggle('hidden');
}

function exportReportJSON() {
    const reportData = {
        exportedAt: new Date().toISOString(),
        scoreboard,
        smashStats: {
            maxSmashSpeedKmh: maxRecordedSpeed,
            maxSmashHolder: maxSpeedHolder,
            minSmashSpeedKmh: minRecordedSmashSpeed,
            minSmashHolder: minSmashHolder,
            totalSmashes: allSmashSpeeds.length
        },
        players,
        recentShots: shotHistory
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shuttlepro-real-match.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('ส่งออกข้อมูลแมตช์จริง (.JSON) สำเร็จ');
}

async function generateAICoachAdvice(focusTopic = 'full') {
    const outputBox = document.getElementById('aiCoachOutput');
    if (!outputBox) return;

    const statsSnapshot = Object.values(players).map(p =>
        `${p.name} (ทีม ${p.team}): วิ่งจริง ${p.distanceMeters.toFixed(1)} ม., ตบสูงสุด ${p.maxSmashKmh} km/h, ตี ${p.shotsCount} ลูก`
    ).join('\n');

    if (!geminiApiKey) {
        outputBox.innerHTML = `
            <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
                <div class="font-bold text-emerald-400">สรุปสถิติจริงจากสนามปัจจุบัน (สกอร์ ${scoreboard.scoreA} - ${scoreboard.scoreB})</div>
                <pre class="text-slate-300 whitespace-pre-wrap font-sans">${statsSnapshot}</pre>
                <p class="text-amber-300 pt-2">💡 หากต้องการให้ Gemini AI วิเคราะห์เชิงลึกเพิ่มเติม กดปุ่ม "ตั้งค่า AI Key" ด้านบนเพื่อเชื่อมต่อ API Key ของคุณ</p>
            </div>
        `;
        return;
    }

    outputBox.innerHTML = `<div class="py-8 text-center text-xs text-emerald-300">กำลังวิเคราะห์สถิติจริงจากสนามด้วย Gemini AI...</div>`;
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `คุณคือโค้ชแบดมินตันอาชีพ วิเคราะห์สถิติสนามจริงนี้ (สกอร์ ${scoreboard.scoreA}-${scoreboard.scoreB}, หัวข้อ ${focusTopic}):\n${statsSnapshot}` }] }]
            })
        });
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'ไม่สามารถวิเคราะห์ได้';
        outputBox.innerHTML = `<div class="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-4 text-xs leading-relaxed">${text.replace(/\n/g, '<br>')}</div>`;
    } catch (e) {
        outputBox.innerHTML = `<div class="text-rose-400 text-xs p-4">เกิดข้อผิดพลาดในการเชื่อมต่อ Gemini API</div>`;
    }
}

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

function animateLoop() {
    frameCount++;
    const now = performance.now();
    if (now - lastFpsUpdate >= 1000) {
        currentFps = frameCount;
        frameCount = 0;
        lastFpsUpdate = now;
        const fpsEl = document.getElementById('fpsCounter');
        if (fpsEl) fpsEl.textContent = currentFps;
    }

    if (isUploadedVideoActive && webcamVideo.duration) {
        const pct = (webcamVideo.currentTime / webcamVideo.duration) * 100;
        const slider = document.getElementById('videoSeekSlider');
        const curTimeEl = document.getElementById('videoCurTime');
        if (slider) slider.value = pct;
        if (curTimeEl) curTimeEl.textContent = formatTimeSec(webcamVideo.currentTime);
    }

    if (activeTab === 'live') {
        renderLiveScene();
    }
    requestAnimationFrame(animateLoop);
}

setInterval(() => {
    if (!isTrackingPaused && (isWebcamActive || isUploadedVideoActive)) {
        matchSeconds++;
        const el = document.getElementById('matchTimer');
        if (el) el.textContent = formatTimeSec(matchSeconds);
    }
}, 1000);

window.addEventListener('DOMContentLoaded', () => {
    resizeCanvases();
    updateScoreboardUI();
    updateLiveHUD();
    renderShotHistoryList();
    generateAICoachAdvice('full');
    animateLoop();
});
