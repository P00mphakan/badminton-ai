/********************************************************************
 * MODULE: js/pose-tracker.js
 * PURPOSE: TensorFlow.js MoveNet MultiPose player detection,
 *          ankle-to-court metric mapping, distance/speed tracking,
 *          and 3-frame shuttlecock flight + stroke classification.
 ********************************************************************/

async function initPoseDetectionModel() {
    if (poseDetector || isPoseModelLoading) return;
    isPoseModelLoading = true;
    updateAIModelBadge('กำลังโหลดโมเดล AI (MoveNet + CV)...');

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
            updateAIModelBadge('AI พร้อมใช้งานจริง (MoveNet + Line CV)');
        } else {
            updateAIModelBadge('Line & Net CV พร้อมใช้งาน');
        }
    } catch (err) {
        console.warn('Pose model init warning:', err);
        updateAIModelBadge('Line & Net CV โหมดความเร็วสูง');
    } finally {
        isPoseModelLoading = false;
    }
}

function updateAIModelBadge(text) {
    const statusText = document.getElementById('modeStatusText');
    if (statusText) statusText.textContent = text;
}

async function runRealPoseEstimation(videoEl) {
    if (!poseModelReady || !poseDetector || !videoEl || videoEl.readyState < 2) return;
    const now = performance.now();
    if (now - lastPoseTimestamp < 45) return; // ~22 Hz pose inference
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

            const validKps = kps.filter(k => k.score > 0.2);
            if (validKps.length < 4) return;

            const xs = validKps.map(k => k.x / vW);
            const ys = validKps.map(k => k.y / vH);
            const xMin = Math.max(0, Math.min(...xs) - 0.03);
            const xMax = Math.min(1, Math.max(...xs) + 0.03);
            const yMin = Math.max(0, Math.min(...ys) - 0.03);
            const yMax = Math.min(1, Math.max(...ys) + 0.03);
            newHumanBoxes.push({ xMin, xMax, yMin, yMax });

            let footSx = (xMin + xMax) / 2;
            let footSy = yMax;
            if (lAnkle && rAnkle && lAnkle.score > 0.25 && rAnkle.score > 0.25) {
                footSx = ((lAnkle.x + rAnkle.x) * 0.5) / vW;
                footSy = Math.max(lAnkle.y, rAnkle.y) / vH;
            } else if (lHip && rHip && lHip.score > 0.25 && rHip.score > 0.25) {
                footSx = ((lHip.x + rHip.x) * 0.5) / vW;
                footSy = Math.min(0.98, ((lHip.y + rHip.y) * 0.5) / vH + 0.18);
            }

            const courtUV = ShuttleCV.screenToCourtNormalized(footSx, footSy);

            if (courtValid && (courtUV.x < -0.22 || courtUV.x > 1.22 || courtUV.y < -0.22 || courtUV.y > 1.22)) {
                return;
            }

            const isTeamA = courtUV.y < 0.5;
            const slotIds = isTeamA ? ['A1', 'A2'] : ['B1', 'B2'];
            let targetSlot = players[slotIds[0]];
            let minSlotDist = Math.hypot(targetSlot.u - courtUV.x, targetSlot.v - courtUV.y);

            const secondSlot = players[slotIds[1]];
            if (Math.hypot(secondSlot.u - courtUV.x, secondSlot.v - courtUV.y) < minSlotDist) {
                targetSlot = secondSlot;
            }

            const clampedU = Math.max(0, Math.min(1, courtUV.x));
            const clampedV = Math.max(0, Math.min(1, courtUV.y));

            if (targetSlot.detected) {
                const dxMeters = (clampedU - targetSlot.u) * ShuttleCV.COURT_WIDTH_M;
                const dyMeters = (clampedV - targetSlot.v) * ShuttleCV.COURT_LENGTH_M;
                const stepMeters = Math.hypot(dxMeters, dyMeters);

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
        // Ignore single-frame error
    }
}

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
        if (uv.x >= -0.25 && uv.x <= 1.25 && uv.y >= -0.25 && uv.y <= 1.25) {
            if (shuttle.detected) {
                const dxM = (uv.x - shuttle.u) * ShuttleCV.COURT_WIDTH_M;
                const dyM = (uv.y - shuttle.v) * ShuttleCV.COURT_LENGTH_M;
                const distM = Math.hypot(dxM, dyM);

                if (distM > 0.08 && distM < 6.5) {
                    const rawKmh = (distM / dtSec) * 3.6 * 1.35;
                    const clampedKmh = Math.min(365, Math.max(45, Math.round(rawKmh)));
                    shuttle.speedKmh = Math.round(shuttle.speedKmh * 0.45 + clampedKmh * 0.55);

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

            shuttle.trail.push({ sx: cand.x, sy: cand.y, u: uv.x, v: uv.y, t: now });
            if (shuttle.trail.length > 22) shuttle.trail.shift();

            if (scoreboard.rallyState !== 'RALLYING' && shuttle.framesInFlight >= 3) {
                scoreboard.rallyState = 'RALLYING';
                updateScoreboardUI();
            }
            return;
        }
    }

    if (shuttle.detected) {
        shuttle.stationaryFrames++;
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
