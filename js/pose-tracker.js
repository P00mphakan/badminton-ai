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

const poseCropCanvas = document.createElement('canvas');
poseCropCanvas.width = 512;
poseCropCanvas.height = 384;
const poseCropCtx = poseCropCanvas.getContext('2d', { willReadFrequently: true });

function updatePlayerSlotMetrics(targetSlot, courtU, courtV, footSx, footSy, kpsNorm, wristVel, dtSec, now) {
    const clampedU = Math.max(0, Math.min(1, courtU));
    const clampedV = Math.max(0, Math.min(1, courtV));

    if (targetSlot.detected) {
        const dxMeters = (clampedU - targetSlot.u) * ShuttleCV.COURT_WIDTH_M;
        const dyMeters = (clampedV - targetSlot.v) * ShuttleCV.COURT_LENGTH_M;
        const stepMeters = Math.hypot(dxMeters, dyMeters);

        if (stepMeters >= 0.035 && stepMeters < 2.2) {
            targetSlot.distanceMeters = +(targetSlot.distanceMeters + stepMeters).toFixed(2);
            const instSpeedKmh = Math.min(32, (stepMeters / dtSec) * 3.6);
            targetSlot.currentSpeedKmh = +(targetSlot.currentSpeedKmh * 0.62 + instSpeedKmh * 0.38).toFixed(1);
            if (targetSlot.currentSpeedKmh > targetSlot.maxSpeedKmh) {
                targetSlot.maxSpeedKmh = targetSlot.currentSpeedKmh;
            }
            targetSlot.positions.push({ x: clampedU, y: clampedV, t: matchSeconds });
            if (targetSlot.positions.length > 500) targetSlot.positions.shift();
        } else {
            targetSlot.currentSpeedKmh = +(targetSlot.currentSpeedKmh * 0.78).toFixed(1);
        }
    } else {
        targetSlot.positions.push({ x: clampedU, y: clampedV, t: matchSeconds });
    }

    targetSlot.wristSpeedPx = wristVel;
    targetSlot.u = targetSlot.detected ? (targetSlot.u * 0.35 + clampedU * 0.65) : clampedU;
    targetSlot.v = targetSlot.detected ? (targetSlot.v * 0.35 + clampedV * 0.65) : clampedV;
    targetSlot.screenX = targetSlot.detected ? (targetSlot.screenX * 0.35 + footSx * 0.65) : footSx;
    targetSlot.screenY = targetSlot.detected ? (targetSlot.screenY * 0.35 + footSy * 0.65) : footSy;
    if (kpsNorm) targetSlot.keypoints = kpsNorm;
    targetSlot.detected = true;
    targetSlot.lastSeenMs = now;
}

async function runRealPoseEstimation(videoEl) {
    if (!videoEl || videoEl.readyState < 2) return;
    const now = performance.now();
    if (now - lastPoseTimestamp < 45) return; // ~22 Hz pose inference
    const dtSec = Math.max(0.016, (now - lastPoseTimestamp) / 1000);
    lastPoseTimestamp = now;

    try {
        const vW = videoEl.videoWidth || 1280;
        const vH = videoEl.videoHeight || 720;
        const isPortraitVid = vH > vW;

        // Crop active court zone so far-court players (A1/A2) have 2.2x higher pixel resolution
        const cropX0 = isPortraitVid ? 0.12 : 0.05;
        const cropY0 = isPortraitVid ? 0.44 : 0.15;
        const cropW = isPortraitVid ? 0.80 : 0.90;
        const cropH = isPortraitVid ? 0.48 : 0.80;

        poseCropCtx.drawImage(
            videoEl,
            cropX0 * vW, cropY0 * vH, cropW * vW, cropH * vH,
            0, 0, poseCropCanvas.width, poseCropCanvas.height
        );

        let poses = [];
        if (poseModelReady && poseDetector) {
            poses = await poseDetector.estimatePoses(poseCropCanvas, {
                maxPoses: 4,
                flipHorizontal: false
            });
        }

        const newHumanBoxes = [];
        const assignedSlots = new Set();

        Object.values(players).forEach(p => {
            if (now - p.lastSeenMs > 900) {
                p.detected = false;
                p.currentSpeedKmh = 0;
            }
        });

        const courtValid = ShuttleCV.isCourtValidOrLocked();

        poses.forEach(pose => {
            if (pose.score < 0.20) return;
            const kps = pose.keypoints.map(k => ({
                name: k.name,
                x: cropX0 + (k.x / poseCropCanvas.width) * cropW,
                y: cropY0 + (k.y / poseCropCanvas.height) * cropH,
                score: k.score
            }));

            const lAnkle = kps.find(k => k.name === 'left_ankle');
            const rAnkle = kps.find(k => k.name === 'right_ankle');
            const lHip = kps.find(k => k.name === 'left_hip');
            const rHip = kps.find(k => k.name === 'right_hip');
            const lWrist = kps.find(k => k.name === 'left_wrist');
            const rWrist = kps.find(k => k.name === 'right_wrist');

            const validKps = kps.filter(k => k.score > 0.18);
            if (validKps.length < 4) return;

            const xs = validKps.map(k => k.x);
            const ys = validKps.map(k => k.y);
            const xMin = Math.max(0, Math.min(...xs) - 0.025);
            const xMax = Math.min(1, Math.max(...xs) + 0.025);
            const yMin = Math.max(0, Math.min(...ys) - 0.025);
            const yMax = Math.min(1, Math.max(...ys) + 0.025);
            newHumanBoxes.push({ xMin, xMax, yMin, yMax });

            let footSx = (xMin + xMax) / 2;
            let footSy = yMax;
            if (lAnkle && rAnkle && lAnkle.score > 0.22 && rAnkle.score > 0.22) {
                footSx = (lAnkle.x + rAnkle.x) * 0.5;
                footSy = Math.max(lAnkle.y, rAnkle.y);
            } else if (lHip && rHip && lHip.score > 0.22 && rHip.score > 0.22) {
                footSx = (lHip.x + rHip.x) * 0.5;
                footSy = Math.min(0.96, (lHip.y + rHip.y) * 0.5 + 0.11);
            }

            const courtUV = ShuttleCV.screenToCourtNormalized(footSx, footSy);
            if (courtValid && (courtUV.x < -0.22 || courtUV.x > 1.22 || courtUV.y < -0.22 || courtUV.y > 1.22)) {
                return;
            }

            const isTeamA = courtUV.y < 0.5;
            const slotIds = isTeamA ? ['A1', 'A2'] : ['B1', 'B2'];
            let targetSlot = null;
            let bestDist = Infinity;
            slotIds.forEach(id => {
                if (assignedSlots.has(id)) return;
                const d = Math.hypot(players[id].u - courtUV.x, players[id].v - courtUV.y);
                if (d < bestDist) {
                    bestDist = d;
                    targetSlot = players[id];
                }
            });
            if (!targetSlot) return;
            assignedSlots.add(targetSlot.id);

            let maxWristVel = 0;
            [lWrist, rWrist].forEach(w => {
                if (w && w.score > 0.25) {
                    if (targetSlot._lastWx !== undefined) {
                        const wDist = Math.hypot(w.x - targetSlot._lastWx, w.y - targetSlot._lastWy);
                        maxWristVel = Math.max(maxWristVel, wDist / dtSec);
                    }
                    targetSlot._lastWx = w.x;
                    targetSlot._lastWy = w.y;
                }
            });

            updatePlayerSlotMetrics(targetSlot, courtUV.x, courtUV.y, footSx, footSy, kps, maxWristVel, dtSec, now);
        });

        // Supplement MoveNet with Court-Zone Player Silhouette/Shoe detector for small far-court players (A1/A2) or occluded doubles partner
        if (courtValid && assignedSlots.size < 4) {
            const imgData = poseCropCtx.getImageData(0, 0, poseCropCanvas.width, poseCropCanvas.height).data;
            const cw = poseCropCanvas.width;
            const ch = poseCropCanvas.height;

            const searchZones = [
                { id: 'A1', uMin: 0.06, uMax: 0.49, vMin: 0.04, vMax: 0.46, bodyH: 0.085, bodyW: 0.045 },
                { id: 'A2', uMin: 0.51, uMax: 0.94, vMin: 0.04, vMax: 0.46, bodyH: 0.085, bodyW: 0.045 },
                { id: 'B1', uMin: 0.06, uMax: 0.54, vMin: 0.52, vMax: 0.92, bodyH: 0.145, bodyW: 0.065 },
                { id: 'B2', uMin: 0.46, uMax: 0.94, vMin: 0.52, vMax: 0.92, bodyH: 0.145, bodyW: 0.065 }
            ];

            searchZones.forEach(zone => {
                if (assignedSlots.has(zone.id)) return;
                let sumU = 0, sumV = 0, sumW = 0;

                for (let u = zone.uMin; u <= zone.uMax; u += 0.035) {
                    for (let v = zone.vMin; v <= zone.vMax; v += 0.035) {
                        const sc = ShuttleCV.courtNormalizedToScreen(u, v);
                        // Skip if already covered by a MoveNet human box
                        const insideExisting = newHumanBoxes.some(b =>
                            sc.x >= b.xMin - 0.02 && sc.x <= b.xMax + 0.02 &&
                            sc.y >= b.yMin - 0.02 && sc.y <= b.yMax + 0.02
                        );
                        if (insideExisting) continue;

                        // Check torso pixel ~4% above ankle point for dark/colored jersey contrast against court floor
                        const torsoSy = sc.y - zone.bodyH * 0.48;
                        const cx = Math.round(((sc.x - cropX0) / cropW) * cw);
                        const cy = Math.round(((torsoSy - cropY0) / cropH) * ch);
                        if (cx < 4 || cx >= cw - 4 || cy < 4 || cy >= ch - 4) continue;

                        const idx = (cy * cw + cx) * 4;
                        const r = imgData[idx], g = imgData[idx + 1], b = imgData[idx + 2];
                        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
                        // Court floor is bright blue/teal (b > r + 15, luma 95..175). Players wear dark black or red jerseys (luma < 72 or r > b + 35)
                        const isDarkJersey = luma < 68;
                        const isRedJersey = r > b + 30 && r > g + 25;

                        if (isDarkJersey || isRedJersey) {
                            const weight = isRedJersey ? 2.2 : (75 - luma) / 25;
                            sumU += u * weight;
                            sumV += v * weight;
                            sumW += weight;
                        }
                    }
                }

                if (sumW >= 3.2) {
                    const detU = sumU / sumW;
                    const detV = sumV / sumW;
                    const footSc = ShuttleCV.courtNormalizedToScreen(detU, detV);
                    const box = {
                        xMin: Math.max(0, footSc.x - zone.bodyW * 0.5),
                        xMax: Math.min(1, footSc.x + zone.bodyW * 0.5),
                        yMin: Math.max(0, footSc.y - zone.bodyH),
                        yMax: Math.min(1, footSc.y + 0.015)
                    };
                    newHumanBoxes.push(box);
                    assignedSlots.add(zone.id);
                    updatePlayerSlotMetrics(players[zone.id], detU, detV, footSc.x, footSc.y, null, 0, dtSec, now);
                }
            });
        }

        detectedHumanBoxes = newHumanBoxes;
    } catch (e) {
        // Ignore single-frame error
    }
}

let lastShuttleUpdateMs = performance.now();
let shuttleCandidateBuffer = []; // Stores recent unverified candidates [{ sx, sy, u, v, t }]
let lastStrokeRecordedMs = 0;

function processRealShuttleAndRally(cvResult) {
    const now = performance.now();
    lastShuttleUpdateMs = now;

    // Prune stale candidates older than 220ms
    shuttleCandidateBuffer = shuttleCandidateBuffer.filter(pt => now - pt.t <= 220);

    const cand = cvResult?.shuttleCandidate;
    if (cand) {
        const uv = ShuttleCV.screenToCourtNormalized(cand.x, cand.y);
        // Clamp normalized court coords so airborne arcs above the net don't produce extreme perspective distances
        const clampedU = Math.max(-0.15, Math.min(1.15, uv.x));
        const clampedV = Math.max(-0.15, Math.min(1.15, uv.y));

        const prevPt = shuttleCandidateBuffer[shuttleCandidateBuffer.length - 1];
        if (!prevPt) {
            shuttleCandidateBuffer.push({ sx: cand.x, sy: cand.y, u: clampedU, v: clampedV, t: now });
        } else {
            const stepScreen = Math.hypot(cand.x - prevPt.sx, cand.y - prevPt.sy);
            const dtSec = Math.max(0.014, (now - prevPt.t) / 1000);

            // Plausible per-frame screen displacement for a shuttlecock (rejects static spots & huge random jumps)
            if (stepScreen >= 0.008 && stepScreen <= 0.14) {
                let isColinear = true;
                if (shuttleCandidateBuffer.length >= 2) {
                    const prev2 = shuttleCandidateBuffer[shuttleCandidateBuffer.length - 2];
                    const vx1 = prevPt.sx - prev2.sx;
                    const vy1 = prevPt.sy - prev2.sy;
                    const vx2 = cand.x - prevPt.sx;
                    const vy2 = cand.y - prevPt.sy;
                    const mag1 = Math.hypot(vx1, vy1);
                    const mag2 = Math.hypot(vx2, vy2);
                    if (mag1 > 1e-4 && mag2 > 1e-4) {
                        const cosAngle = (vx1 * vx2 + vy1 * vy2) / (mag1 * mag2);
                        // Trajectory must move in a consistent forward/arc direction (cosAngle >= 0.5)
                        if (cosAngle < 0.50) {
                            isColinear = false;
                        }
                    }
                }

                if (isColinear) {
                    shuttleCandidateBuffer.push({
                        sx: cand.x,
                        sy: cand.y,
                        u: clampedU,
                        v: clampedV,
                        t: now,
                        stepScreen,
                        dtSec
                    });
                } else {
                    // Restart buffer from this new direction
                    shuttleCandidateBuffer = [{ sx: cand.x, sy: cand.y, u: clampedU, v: clampedV, t: now }];
                }
            } else if (stepScreen > 0.14) {
                shuttleCandidateBuffer = [{ sx: cand.x, sy: cand.y, u: clampedU, v: clampedV, t: now }];
            }
        }

        // Require at least 3 verified colinear consecutive frames before confirming shuttle flight & speed!
        if (shuttleCandidateBuffer.length >= 3) {
            const recent3 = shuttleCandidateBuffer.slice(-3);
            // Compute median screen angular speed (normalized screen widths per second)
            const speedsScreenPerSec = [];
            for (let i = 1; i < recent3.length; i++) {
                const dScreen = Math.hypot(recent3[i].sx - recent3[i - 1].sx, recent3[i].sy - recent3[i - 1].sy);
                const dt = Math.max(0.015, (recent3[i].t - recent3[i - 1].t) / 1000);
                speedsScreenPerSec.push(dScreen / dt);
            }
            speedsScreenPerSec.sort((a, b) => a - b);
            const medScreenSpeed = speedsScreenPerSec[Math.floor(speedsScreenPerSec.length / 2)];

            // Convert screen velocity across the 13.4m court airspace + downward smash trajectory slope
            const dyScreen = recent3[recent3.length - 1].sy - recent3[0].sy;
            const dxScreen = recent3[recent3.length - 1].sx - recent3[0].sx;
            const isDownwardSteep = dyScreen > Math.abs(dxScreen) * 0.45; // Descending steep smash trajectory

            // Calibrated physical speed mapping (1 screen height/width traversal ~ 8.5m effective perspective chord)
            const effectiveChordMeters = isDownwardSteep ? 9.8 : 7.6;
            const physicalKmh = Math.round(medScreenSpeed * effectiveChordMeters * 3.6);
            const realisticKmh = Math.min(308, Math.max(58, physicalKmh));

            shuttle.speedKmh = shuttle.detected
                ? Math.round(shuttle.speedKmh * 0.5 + realisticKmh * 0.5)
                : realisticKmh;

            shuttle.screenX = cand.x;
            shuttle.screenY = cand.y;
            shuttle.u = clampedU;
            shuttle.v = clampedV;
            shuttle.detected = true;
            shuttle.lastSeenMs = now;
            shuttle.framesInFlight++;
            shuttle.stationaryFrames = 0;

            shuttle.trail.push({ sx: cand.x, sy: cand.y, u: clampedU, v: clampedV, t: now });
            if (shuttle.trail.length > 18) shuttle.trail.shift();

            // Record stroke at the start of a verified flight with a 1.1s cooldown
            if (now - lastStrokeRecordedMs > 1100) {
                lastStrokeRecordedMs = now;
                classifyRealStroke(clampedU, clampedV, shuttle.speedKmh);
            } else {
                const speedEl = document.getElementById('liveSpeedValue');
                if (speedEl) speedEl.textContent = shuttle.speedKmh;
            }

            if (scoreboard.rallyState !== 'RALLYING' && shuttle.framesInFlight >= 3) {
                scoreboard.rallyState = 'RALLYING';
                updateScoreboardUI();
            }
            return;
        }
    }

    if (shuttle.detected) {
        shuttle.stationaryFrames++;
        if (scoreboard.rallyState === 'RALLYING' && shuttle.stationaryFrames >= 18 && shuttle.framesInFlight >= 4) {
            evaluateRallyEndAndAutoScore();
            shuttle.detected = false;
            shuttle.framesInFlight = 0;
            shuttleCandidateBuffer = [];
        } else if (now - shuttle.lastSeenMs > 550) {
            shuttle.detected = false;
            shuttle.framesInFlight = 0;
            shuttleCandidateBuffer = [];
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
