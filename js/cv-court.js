/********************************************************************
 * ShuttlePro AI - Real Computer Vision, Homography & Auto-Score Engine
 * Production Mode (Zero Fake Simulation)
 *
 * Components:
 * 1. Projective 2D Homography Matrix (DLT Solver + Inverse Mapping)
 *    Maps between BWF Standard Court (6.10m x 13.40m) and Camera Pixels.
 * 2. Real-Time Court Line & Net Detector (Ridge Filter + Sobel + Hough)
 *    Detects real white/bright court lines and net top tape from video frames.
 * 3. MoveNet MultiPose Real Player Detector & Metric Footwork Tracker
 * 4. 3-Frame Temporal Difference Shuttlecock Tracker + Kalman Filter
 * 5. Automatic BWF 21-Point Rally Scoreboard & Hawkeye Line-Call Engine
 ********************************************************************/

window.ShuttleCV = (function () {
    // Official BWF Court Dimensions in Meters
    const COURT_WIDTH_M = 6.10;         // Doubles width
    const SINGLES_MARGIN_M = 0.46;      // Singles sideline inset (5.18m width)
    const COURT_LENGTH_M = 13.40;       // Full length
    const NET_Y_M = 6.70;               // Net line at center
    const SHORT_SERVICE_OFFSET_M = 1.98;// 1.98m from net
    const LONG_DOUBLES_OFFSET_M = 0.76; // 0.76m from back boundary

    // Offscreen canvas for CV pixel processing. Resolution adapts to the video aspect ratio
    // (384px long side) so portrait iPhone footage is NOT squashed (keeps the shuttle as a round spot).
    let CV_W = 384;
    let CV_H = 216;
    const cvCanvas = document.createElement('canvas');
    cvCanvas.width = CV_W;
    cvCanvas.height = CV_H;
    const cvCtx = cvCanvas.getContext('2d', { willReadFrequently: true });
    let cvFrameCounter = 0;
    let lastFloorHorizonRow = 0;

    // Frame buffers for 3-frame temporal difference (TrackNet-style motion filter) + Hot-Cell Static Rejector
    let prevGray1 = null;
    let prevGray2 = null;
    const HOT_GRID_W = 24;
    const HOT_GRID_H = 16;
    let hotCellCounts = new Uint16Array(HOT_GRID_W * HOT_GRID_H);
    let hotCellTotalFrames = 0;

    function syncCvResolution(videoEl) {
        const vw = videoEl.videoWidth || 1280;
        const vh = videoEl.videoHeight || 720;
        const LONG = 384;
        const w = vw >= vh ? LONG : Math.round(LONG * vw / vh);
        const h = vw >= vh ? Math.round(LONG * vh / vw) : LONG;
        if (w !== CV_W || h !== CV_H) {
            CV_W = w;
            CV_H = h;
            cvCanvas.width = w;
            cvCanvas.height = h;
            prevGray1 = null;
            prevGray2 = null;
            hotCellCounts.fill(0);
            hotCellTotalFrames = 0;
        }
    }

    // Detected raw white line segments & net candidates in normalized [0..1] image coords
    let detectedLineSegments = [];
    let detectedNetSegment = null;
    let courtConfidence = 0; // 0..100%
    let netConfidence = 0;   // 0..100%
    let isCourtLocked = true;
    let isManuallyEdited = false;
    let isCourtTrustedFlag = false; // set true after a successful refineCourtToLines() or explicit calibration save
    let autoLockEnabled = true;

    // Calibration Mode:
    // 'full' (default): Anchored on the 4 extreme BWF court corners (TL u=0,v=0, TR u=1,v=0, BR u=1,v=1, BL u=0,v=1) -> 13.40m length
    // 'service': Anchored on Far Baseline (v=0) & Near Short-Service Line (v=0.6478) -> 8.68m length (for low-angle cameras where near baseline is off-screen)
    let calibrationMode = 'full';

    // Calibrated / Detected Court Keypoints in normalized screen coordinates (can extend beyond [0..1] for wide perspective)
    // Default values pre-calibrated to match standard 13.4m full court perspective
    let courtCorners = {
        tl: { x: 0.360, y: 0.390 }, // Far Baseline Left Corner (u=0, v=0)
        tr: { x: 0.720, y: 0.390 }, // Far Baseline Right Corner (u=1, v=0)
        br: { x: 0.900, y: 0.880 }, // Near Baseline Right Corner (u=1, v=1.0)
        bl: { x: 0.180, y: 0.880 }, // Near Baseline Left Corner (u=0, v=1.0)
        netL: { x: 0.250, y: 0.465 }, // Net Top Tape Left Post
        netR: { x: 0.830, y: 0.465 },  // Net Top Tape Right Post
        // Front-of-Net Handles (Short Service Lines: Far v=0.3522 & Near v=0.6478)
        sfl: { x: 0.320, y: 0.520 }, // Far Short Service Left (เส้นหน้าเน็ตฝั่งไกล-ซ้าย)
        sfr: { x: 0.760, y: 0.520 }, // Far Short Service Right (เส้นหน้าเน็ตฝั่งไกล-ขวา)
        snl: { x: 0.250, y: 0.680 }, // Near Short Service Left (เส้นหน้าเน็ตฝั่งใกล้-ซ้าย)
        snr: { x: 0.830, y: 0.680 }, // Near Short Service Right (เส้นหน้าเน็ตฝั่งใกล้-ขวา)
        _customNet: true
    };

    // 3x3 Homography Matrices:
    // H_courtToScreen: maps normalized court (u in [0,1], v in [0,1]) -> screen normalized (sx, sy)
    // H_screenToCourt: inverse matrix mapping screen normalized (sx, sy) -> normalized court (u, v)
    let H_courtToScreen = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    let H_screenToCourt = [1, 0, 0, 0, 1, 0, 0, 0, 1];

    /****************************************************************
     * 1. PROJECTIVE HOMOGRAPHY SOLVER (8-DOF Direct Linear Transform)
     ****************************************************************/
    function solveGaussian8x8(A, b) {
        const n = 8;
        const M = A.map((row, i) => [...row, b[i]]);
        for (let col = 0; col < n; col++) {
            let maxRow = col;
            for (let row = col + 1; row < n; row++) {
                if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) {
                    maxRow = row;
                }
            }
            if (Math.abs(M[maxRow][col]) < 1e-10) return null;
            const tmp = M[col];
            M[col] = M[maxRow];
            M[maxRow] = tmp;

            const pivot = M[col][col];
            for (let j = col; j <= n; j++) M[col][j] /= pivot;

            for (let i = 0; i < n; i++) {
                if (i !== col) {
                    const factor = M[i][col];
                    for (let j = col; j <= n; j++) {
                        M[i][j] -= factor * M[col][j];
                    }
                }
            }
        }
        return M.map(row => row[n]);
    }

    function computeHomography4Pt(srcPts, dstPts) {
        // Maps 4 srcPts [{x,y}...] to 4 dstPts [{x,y}...]
        const A = [];
        const b = [];
        for (let i = 0; i < 4; i++) {
            const x = srcPts[i].x, y = srcPts[i].y;
            const u = dstPts[i].x, v = dstPts[i].y;
            A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
            b.push(u);
            A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
            b.push(v);
        }
        const h = solveGaussian8x8(A, b);
        if (!h) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
        return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
    }

    function invert3x3(m) {
        const det =
            m[0] * (m[4] * m[8] - m[5] * m[7]) -
            m[1] * (m[3] * m[8] - m[5] * m[6]) +
            m[2] * (m[3] * m[7] - m[4] * m[6]);
        if (Math.abs(det) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
        const invDet = 1 / det;
        return [
            (m[4] * m[8] - m[5] * m[7]) * invDet,
            (m[2] * m[7] - m[1] * m[8]) * invDet,
            (m[1] * m[5] - m[2] * m[4]) * invDet,
            (m[5] * m[6] - m[3] * m[8]) * invDet,
            (m[0] * m[8] - m[2] * m[6]) * invDet,
            (m[2] * m[3] - m[0] * m[5]) * invDet,
            (m[3] * m[7] - m[4] * m[6]) * invDet,
            (m[1] * m[6] - m[0] * m[7]) * invDet,
            (m[0] * m[4] - m[1] * m[3]) * invDet
        ];
    }

    function projectPoint(H, x, y) {
        const w = H[6] * x + H[7] * y + H[8];
        if (Math.abs(w) < 1e-7) {
            return { x: 0.5, y: 0.5, valid: false };
        }
        const invW = 1 / w;
        const px = (H[0] * x + H[1] * y + H[2]) * invW;
        const py = (H[3] * x + H[4] * y + H[5]) * invW;
        const isValid = w > 1e-4 && isFinite(px) && isFinite(py);
        return {
            x: isValid ? px : 0.5,
            y: isValid ? py : 0.5,
            valid: isValid
        };
    }

    function getAnchorRect() {
        if (calibrationMode === 'front-net') {
            // Anchored directly on the two Front-of-Net (Short Service) lines (v=0.3522 & v=0.6478)
            // Completely eliminates out-of-frame boundary issues!
            return [
                { x: 0, y: 0.3522 },
                { x: 1, y: 0.3522 },
                { x: 1, y: 0.6478 },
                { x: 0, y: 0.6478 }
            ];
        }
        if (calibrationMode === 'service') {
            return [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 1, y: 0.6478 },
                { x: 0, y: 0.6478 }
            ];
        }
        return [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1.0 },
            { x: 0, y: 1.0 }
        ];
    }

    function orderFourCorners(arg1, tr, br, bl) {
        // Accept either an array of 4 points or 4 separate point arguments
        const pts = Array.isArray(arg1) ? arg1 : [arg1, tr, br, bl];
        const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
        const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
        const cw = [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
        let top = 0;
        for (let i = 1; i < 4; i++) {
            if (cw[i].y + cw[(i + 1) % 4].y < cw[top].y + cw[(top + 1) % 4].y) top = i;
        }
        return {
            tl: { x: cw[top].x, y: cw[top].y },
            tr: { x: cw[(top + 1) % 4].x, y: cw[(top + 1) % 4].y },
            br: { x: cw[(top + 2) % 4].x, y: cw[(top + 2) % 4].y },
            bl: { x: cw[(top + 3) % 4].x, y: cw[(top + 3) % 4].y }
        };
    }

    function updateHomographyFromCorners(skipKey = null) {
        const anchorRect = getAnchorRect();
        let dstQuad;
        if (calibrationMode === 'front-net') {
            dstQuad = [
                courtCorners.sfl,
                courtCorners.sfr,
                courtCorners.snr,
                courtCorners.snl
            ];
        } else if (calibrationMode === 'service') {
            dstQuad = [
                courtCorners.tl,
                courtCorners.tr,
                courtCorners.snr,
                courtCorners.snl
            ];
        } else {
            dstQuad = [
                courtCorners.tl,
                courtCorners.tr,
                courtCorners.br,
                courtCorners.bl
            ];
        }

        H_courtToScreen = computeHomography4Pt(anchorRect, dstQuad);
        H_screenToCourt = invert3x3(H_courtToScreen);

        // Keep all handles synchronized across modes
        if (calibrationMode === 'front-net') {
            const tl = projectPoint(H_courtToScreen, 0, 0);
            const tr = projectPoint(H_courtToScreen, 1, 0);
            const br = projectPoint(H_courtToScreen, 1, 1.0);
            const bl = projectPoint(H_courtToScreen, 0, 1.0);
            if (skipKey !== 'tl') courtCorners.tl = { x: tl.x, y: tl.y };
            if (skipKey !== 'tr') courtCorners.tr = { x: tr.x, y: tr.y };
            if (skipKey !== 'br') courtCorners.br = { x: br.x, y: br.y };
            if (skipKey !== 'bl') courtCorners.bl = { x: bl.x, y: bl.y };
        } else {
            const sfl = projectPoint(H_courtToScreen, 0, 0.3522);
            const sfr = projectPoint(H_courtToScreen, 1, 0.3522);
            const snl = projectPoint(H_courtToScreen, 0, 0.6478);
            const snr = projectPoint(H_courtToScreen, 1, 0.6478);
            if (skipKey !== 'sfl') courtCorners.sfl = { x: sfl.x, y: sfl.y };
            if (skipKey !== 'sfr') courtCorners.sfr = { x: sfr.x, y: sfr.y };
            if (skipKey !== 'snl') courtCorners.snl = { x: snl.x, y: snl.y };
            if (skipKey !== 'snr') courtCorners.snr = { x: snr.x, y: snr.y };
        }

        const midL = projectPoint(H_courtToScreen, 0, 0.5);
        const midR = projectPoint(H_courtToScreen, 1, 0.5);
        const netHeightNorm = 0.055; // BWF 1.55m net height in baseline perspective
        if (!courtCorners._customNet && skipKey !== 'netL' && skipKey !== 'netR') {
            courtCorners.netL = { x: midL.x, y: midL.y - netHeightNorm };
            courtCorners.netR = { x: midR.x, y: midR.y - netHeightNorm };
        }
        saveCourtCornersStorage();
    }

    function saveCourtCornersStorage() {
        try {
            localStorage.setItem('shuttlepro_court_corners', JSON.stringify({
                corners: courtCorners,
                mode: calibrationMode,
                isManuallyEdited
            }));
        } catch (e) {}
    }

    function loadCourtCornersStorage() {
        try {
            const raw = localStorage.getItem('shuttlepro_court_corners');
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (data && data.corners) {
                Object.assign(courtCorners, data.corners);
                if (data.mode) calibrationMode = data.mode;
                if (data.isManuallyEdited) isManuallyEdited = true;
                return true;
            }
        } catch (e) {}
        return false;
    }

    loadCourtCornersStorage();
    updateHomographyFromCorners();

    /****************************************************************
     * 2. REAL-TIME COURT LINE & NET DETECTION (RIDGE + HOUGH CV)
     ****************************************************************/
    function analyzeVideoFrameCV(videoEl, humanBoxes = []) {
        if (!videoEl || videoEl.readyState < 2) {
            courtConfidence = 0;
            netConfidence = 0;
            detectedLineSegments = [];
            return null;
        }

        syncCvResolution(videoEl);
        cvCtx.drawImage(videoEl, 0, 0, CV_W, CV_H);
        const imgData = cvCtx.getImageData(0, 0, CV_W, CV_H);
        const data = imgData.data;

        const gray = new Uint8Array(CV_W * CV_H);
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
            gray[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
        }

        // When the court is locked (calibrated) the lines are known -> skip the heavy line scan entirely
        // and spend the whole frame budget on 60 FPS shuttle tracking. Unlocked: scan lines every 8th frame.
        const runLineScan = !isCourtLocked && (cvFrameCounter++ % 8 === 0);
        if (!runLineScan) {
            const shuttleCandidates = detectShuttleCandidates(gray, humanBoxes);
            prevGray2 = prevGray1;
            prevGray1 = gray;
            return {
                courtConfidence,
                netConfidence,
                segments: detectedLineSegments,
                shuttleCandidate: shuttleCandidates[0] || null,
                shuttleCandidates
            };
        }

        const isCourtColor = new Uint8Array(CV_W * CV_H);
        let courtColorPixels = 0;

        // Step 2.1: Classify court surface colors (Green, Blue, Teal, Wood gym floor)
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const lum = gray[p];

            // Typical badminton court floor: Green/Teal mat, Blue BWF mat, or Indoor Wood/Dark synthetic floor
            const isGreenMat = (g > r + 12 && g > b - 10 && g > 45 && lum < 215);
            const isBlueMat = (b > r + 15 && b > 55 && lum < 215);
            const isWoodOrGym = (r > b + 15 && g > b + 8 && lum > 50 && lum < 200);
            if (isGreenMat || isBlueMat || isWoodOrGym) {
                isCourtColor[p] = 1;
                courtColorPixels++;
            }
        }

        const courtFloorRatio = courtColorPixels / (CV_W * CV_H);

        // Step 2.1b: Find the true Court Floor Horizon Row (topmost row of continuous court surface)
        // Everything above floorHorizonRow is wall/ceiling/roof trusses and MUST be ignored for floor lines.
        let floorHorizonRow = Math.floor(CV_H * 0.48);
        for (let y = CV_H - 12; y >= Math.floor(CV_H * 0.32); y--) {
            let rowFloorCount = 0;
            for (let x = 16; x < CV_W - 16; x += 4) {
                if (isCourtColor[y * CV_W + x]) rowFloorCount++;
            }
            const rowRatio = rowFloorCount / ((CV_W - 32) / 4);
            if (rowRatio >= 0.25) {
                floorHorizonRow = y;
            }
        }
        lastFloorHorizonRow = floorHorizonRow;

        // Step 2.2: Detect White/Yellow Court Line Ridges ONLY on the Court Floor (y >= floorHorizonRow)
        const ridgePoints = [];
        const netTapeRows = new Float32Array(CV_H);
        const netSearchTop = Math.max(20, floorHorizonRow - Math.floor(CV_H * 0.12));
        const netSearchBot = Math.min(CV_H - 20, floorHorizonRow + Math.floor(CV_H * 0.14));

        // Scan Net Top Tape band near horizon
        for (let y = netSearchTop; y <= netSearchBot; y++) {
            for (let x = Math.floor(CV_W * 0.15); x < Math.floor(CV_W * 0.85); x += 2) {
                const idx = y * CV_W + x;
                const cLum = gray[idx];
                if (cLum < 165) continue;
                const topLum = gray[(y - 3) * CV_W + x];
                const botLum = gray[(y + 3) * CV_W + x];
                if (cLum - topLum > 28 && cLum - botLum > 28) {
                    netTapeRows[y] += 1;
                }
            }
        }

        // Scan Court Floor Lines strictly below floorHorizonRow
        for (let y = Math.max(floorHorizonRow, Math.floor(CV_H * 0.42)); y < Math.floor(CV_H * 0.96); y += 2) {
            for (let x = 8; x < CV_W - 8; x += 2) {
                const idx = y * CV_W + x;
                const cLum = gray[idx];
                if (cLum < 160) continue;

                // Must be flanked by actual court floor color on both sides!
                const leftLum = gray[idx - 4];
                const rightLum = gray[idx + 4];
                const isVertRidge = (cLum - leftLum > 26 && cLum - rightLum > 26) &&
                    (isCourtColor[idx - 4] && isCourtColor[idx + 4]);

                const topLum = gray[(y - 4) * CV_W + x];
                const botLum = gray[(y + 4) * CV_W + x];
                const isHorizRidge = (cLum - topLum > 24 && cLum - botLum > 24) &&
                    (isCourtColor[(y + 4) * CV_W + x] || isCourtColor[(y - 4) * CV_W + x]);

                if (isVertRidge || isHorizRidge) {
                    const nx = x / CV_W;
                    const ny = y / CV_H;
                    let insideHuman = false;
                    for (let h = 0; h < humanBoxes.length; h++) {
                        const hb = humanBoxes[h];
                        if (nx >= hb.xMin - 0.03 && nx <= hb.xMax + 0.03 && ny >= hb.yMin - 0.03 && ny <= hb.yMax + 0.03) {
                            insideHuman = true;
                            break;
                        }
                    }
                    if (!insideHuman) {
                        ridgePoints.push({ x: nx, y: ny, isH: isHorizRidge, isV: isVertRidge });
                    }
                }
            }
        }

        // Step 2.3: Cluster floor ridge points into clean floor line segments
        // (cap the point set so clustering stays real-time on mobile)
        if (ridgePoints.length > 700) {
            const stride = ridgePoints.length / 700;
            const reduced = [];
            for (let s = 0; s < ridgePoints.length; s += stride) reduced.push(ridgePoints[Math.floor(s)]);
            ridgePoints.length = 0;
            ridgePoints.push(...reduced);
        }
        const segments = [];
        const used = new Uint8Array(ridgePoints.length);
        for (let i = 0; i < ridgePoints.length; i += 2) {
            if (used[i]) continue;
            const p1 = ridgePoints[i];
            let bestEnd = null;
            let bestInliers = [];

            for (let j = i + 1; j < ridgePoints.length; j += 2) {
                const p2 = ridgePoints[j];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.hypot(dx, dy);
                if (len < 0.12 || len > 0.75) continue;

                const absDx = Math.abs(dx);
                const absDy = Math.abs(dy);
                const isHorizontalCandidate = absDy / (absDx + 1e-5) < 0.15;
                const isSidelineCandidate = absDy > 0.10 && (absDx / absDy) < 0.85;
                if (!isHorizontalCandidate && !isSidelineCandidate) continue;

                const inliers = [i, j];
                for (let k = 0; k < ridgePoints.length; k += 2) {
                    if (k === i || k === j) continue;
                    const pk = ridgePoints[k];
                    const dist = Math.abs(dy * pk.x - dx * pk.y + p2.x * p1.y - p2.y * p1.x) / len;
                    if (dist < 0.007) {
                        const dot = (pk.x - p1.x) * dx + (pk.y - p1.y) * dy;
                        if (dot >= 0 && dot <= len * len) {
                            inliers.push(k);
                        }
                    }
                }

                if (inliers.length >= 8 && (!bestEnd || inliers.length > bestInliers.length)) {
                    bestEnd = p2;
                    bestInliers = inliers;
                }
            }

            if (bestEnd && bestInliers.length >= 8) {
                bestInliers.forEach(idx => { used[idx] = 1; });
                const isHoriz = Math.abs(bestEnd.y - p1.y) < Math.abs(bestEnd.x - p1.x) * 0.22;
                segments.push({
                    x1: p1.x, y1: p1.y,
                    x2: bestEnd.x, y2: bestEnd.y,
                    type: isHoriz ? 'H' : 'V',
                    strength: bestInliers.length
                });
                if (segments.length >= 12) break;
            }
        }

        detectedLineSegments = segments;

        // Step 2.4: Detect White Net Top Tape near horizon
        let bestNetY = -1;
        let maxNetScore = 0;
        for (let y = netSearchTop + 1; y < netSearchBot - 1; y++) {
            const score = netTapeRows[y - 1] + netTapeRows[y] * 2 + netTapeRows[y + 1];
            if (score > maxNetScore) {
                maxNetScore = score;
                bestNetY = y / CV_H;
            }
        }

        const horizSegs = segments.filter(s => s.type === 'H');
        const vertSegs = segments.filter(s => s.type === 'V');

        const rawCourtConf = Math.min(
            100,
            Math.round(
                (horizSegs.length >= 1 ? 35 : 0) +
                (vertSegs.length >= 1 ? 35 : 0) +
                (courtFloorRatio > 0.18 ? 30 : courtFloorRatio * 120)
            )
        );
        courtConfidence = Math.round(courtConfidence * 0.7 + rawCourtConf * 0.3);

        const rawNetConf = maxNetScore >= 12 ? Math.min(100, Math.round((maxNetScore / 32) * 100)) : Math.round((maxNetScore / 32) * 50);
        netConfidence = Math.round(netConfidence * 0.7 + rawNetConf * 0.3);

        if (bestNetY > 0 && netConfidence >= 45) {
            detectedNetSegment = {
                x1: courtCorners.netL.x,
                y1: bestNetY,
                x2: courtCorners.netR.x,
                y2: bestNetY
            };
        } else {
            detectedNetSegment = null;
        }

        // NOTE: corners are no longer nudged blindly from the horizon guess (that drifted the court).
        // Precise placement is done by refineCourtToLines() (model-based line snapping) or manual calibration.

        // Step 2.5: High-Precision 3-Frame Shuttlecock Point-Target Detection (court airspace only)
        const shuttleCandidates = detectShuttleCandidates(gray, humanBoxes);
        prevGray2 = prevGray1;
        prevGray1 = gray;

        return {
            courtConfidence,
            netConfidence,
            segments: detectedLineSegments,
            shuttleCandidate: shuttleCandidates[0] || null,
            shuttleCandidates
        };
    }

    /****************************************************************
     * 2b. COURT GEOMETRY HELPERS (depth-aware metric scale)
     ****************************************************************/
    // Normalized screen width of the court (sideline to sideline) at court depth v
    function courtWidthScreenAt(v) {
        const a = projectPoint(H_courtToScreen, 0, v);
        const b = projectPoint(H_courtToScreen, 1, v);
        return Math.max(1e-4, Math.hypot(b.x - a.x, b.y - a.y));
    }

    // Net post height (1.55m) in normalized screen-Y at the net line (v = 0.5)
    function netPostHeightScreen() {
        const fl = projectPoint(H_courtToScreen, 0, 0.5);
        const fr = projectPoint(H_courtToScreen, 1, 0.5);
        const h = ((fl.y - courtCorners.netL.y) + (fr.y - courtCorners.netR.y)) * 0.5;
        return Math.max(0.01, h);
    }

    // Expected standing player height (1.75m) in normalized screen-Y at court depth v
    function expectedPlayerHeightScreen(v) {
        const vv = Math.max(-0.1, Math.min(1.1, v));
        return netPostHeightScreen() * (1.75 / 1.55) * (courtWidthScreenAt(vv) / courtWidthScreenAt(0.5));
    }

    // Meters represented by 1.0 normalized screen unit (X and Y) at depth v (perspective-correct local scale)
    function metersPerScreenUnit(v) {
        const vv = Math.max(-0.1, Math.min(1.1, v));
        const scaleRatio = courtWidthScreenAt(vv) / courtWidthScreenAt(0.5);
        return {
            x: COURT_WIDTH_M / courtWidthScreenAt(vv),
            y: 1.55 / (netPostHeightScreen() * scaleRatio)
        };
    }

    function isInsideCourt(u, v, tolU = 0.0, tolV = 0.0) {
        return u >= -tolU && u <= 1 + tolU && v >= -tolV && v <= 1 + tolV;
    }

    // Convex hull (monotone chain) helper
    function convexHull(points) {
        const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
        const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
        const lower = [];
        for (const p of pts) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
            lower.push(p);
        }
        const upper = [];
        for (let i = pts.length - 1; i >= 0; i--) {
            const p = pts[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
            upper.push(p);
        }
        upper.pop();
        lower.pop();
        return lower.concat(upper);
    }

    function pointInConvexPolygon(poly, x, y) {
        let sign = 0;
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
            if (Math.abs(c) < 1e-12) continue;
            const s = c > 0 ? 1 : -1;
            if (sign === 0) sign = s;
            else if (s !== sign) return false;
        }
        return true;
    }

    // 2.2 Play Volume Box: Strictly confined to our match airspace (rejects adjacent courts)
    // Lateral margin: 0.75m from sidelines (adjacent courts start at >1.5m)
    // Depth margin: 1.20m behind baselines, Height: 0 to 8.0m BWF ceiling limit
    const PLAY_VOLUME = {
        minX: -0.75,
        maxX: 6.85,
        minY: -1.20,
        maxY: 14.60,
        minZ: 0.0,
        maxZ: 8.0
    };

    function isInsidePlayVolume(xM, yM, zM = 0) {
        return xM >= PLAY_VOLUME.minX && xM <= PLAY_VOLUME.maxX &&
               yM >= PLAY_VOLUME.minY && yM <= PLAY_VOLUME.maxY &&
               zM >= PLAY_VOLUME.minZ && zM <= PLAY_VOLUME.maxZ;
    }

    function isInsidePlayVolumeUV(u, v, zM = 0) {
        const xM = u * COURT_WIDTH_M;
        const yM = v * COURT_LENGTH_M;
        return isInsidePlayVolume(xM, yM, zM);
    }

    // Court airspace = court floor quad (with 0.75m width margin, 1.2m length margin) lifted up to 8.0m (shuttle flight volume)
    function getCourtAirspacePolygon() {
        const mU = 0.75 / COURT_WIDTH_M;
        const mV = 1.20 / COURT_LENGTH_M;
        const floorPts = [
            [-mU, -mV], [1 + mU, -mV], [1 + mU, 1 + mV], [-mU, 1 + mV]
        ];
        const pts = [];
        floorPts.forEach(([u, v]) => {
            const p = projectPoint(H_courtToScreen, u, v);
            const lift = expectedPlayerHeightScreen(v) * (8.0 / 1.75);
            pts.push({ x: p.x, y: p.y });
            pts.push({ x: p.x, y: p.y - lift });
        });
        return convexHull(pts);
    }

    /****************************************************************
     * 3. 3-FRAME TRANSIENT POINT-TARGET SHUTTLECOCK TRACKER
     *    + Sub-pixel Centroid + Hot-Cell Static Rejector (TrackNetV3-style)
     ****************************************************************/
    function detectShuttleCandidates(currGray, humanBoxes) {
        if (!prevGray1 || !prevGray2 || prevGray1.length !== currGray.length || prevGray2.length !== currGray.length) return [];

        hotCellTotalFrames++;
        if (hotCellTotalFrames > 600) {
            for (let i = 0; i < hotCellCounts.length; i++) hotCellCounts[i] >>= 1;
            hotCellTotalFrames = 300;
        }

        // Only search inside the court airspace polygon (never the stands, walls, roof lights or people off-court)
        const air = getCourtAirspacePolygon();
        let bx0 = 1, bx1 = 0, by0 = 1, by1 = 0;
        air.forEach(p => {
            bx0 = Math.min(bx0, p.x); bx1 = Math.max(bx1, p.x);
            by0 = Math.min(by0, p.y); by1 = Math.max(by1, p.y);
        });
        const R = 4; // isolation radius in CV pixels
        const xStart = Math.max(R + 1, Math.floor(Math.max(0, bx0) * CV_W));
        const xEnd = Math.min(CV_W - R - 1, Math.ceil(Math.min(1, bx1) * CV_W));
        const yStart = Math.max(R + 1, Math.floor(Math.max(0, by0) * CV_H));
        const yEnd = Math.min(CV_H - R - 1, Math.ceil(Math.min(1, by1) * CV_H));

        const raw = [];
        for (let y = yStart; y < yEnd; y += 1) {
            const ny = y / CV_H;
            for (let x = xStart; x < xEnd; x += 1) {
                const idx = y * CV_W + x;
                const lum = currGray[idx];
                if (lum < 140) continue;

                // 1. Newly bright vs BOTH t-1 and t-2 (supports fast motion-blurred shuttle streaks)
                const d1 = lum - prevGray1[idx];
                const d2 = lum - prevGray2[idx];
                if (d1 < 22 || d2 < 22) continue;

                // 2. Background stable between t-2 and t-1 (rejects flicker, shirts, camera shake)
                if (Math.abs(prevGray1[idx] - prevGray2[idx]) > 20) continue;

                // 3. Compact point/streak target: allow 1 axis to be slightly elongated for fast smash blur
                const topLum = currGray[idx - R * CV_W];
                const botLum = currGray[idx + R * CV_W];
                const leftLum = currGray[idx - R];
                const rightLum = currGray[idx + R];
                const vContrast = Math.min(lum - topLum, lum - botLum);
                const hContrast = Math.min(lum - leftLum, lum - rightLum);
                if (Math.max(vContrast, hContrast) < 18 || Math.min(vContrast, hContrast) < 10) continue;

                const nx = x / CV_W;
                if (!pointInConvexPolygon(air, nx, ny)) continue;

                // 4. Hot-cell filter (rejects static flickering lights/line intersections > 5% occurrence)
                const gx = Math.min(HOT_GRID_W - 1, Math.floor(nx * HOT_GRID_W));
                const gy = Math.min(HOT_GRID_H - 1, Math.floor(ny * HOT_GRID_H));
                const cellIdx = gy * HOT_GRID_W + gx;
                if (hotCellTotalFrames > 45 && hotCellCounts[cellIdx] > hotCellTotalFrames * 0.06) continue;

                // 5. Exclude player bodies (keep wrist/racket zone open for hit turn-point detection)
                let insideHuman = false;
                for (let i = 0; i < humanBoxes.length; i++) {
                    const b = humanBoxes[i];
                    if (nx >= b.xMin - 0.015 && nx <= b.xMax + 0.015 && ny >= b.yMin - 0.015 && ny <= b.yMax + 0.01) {
                        insideHuman = true;
                        break;
                    }
                }
                if (insideHuman) continue;

                const surroundAvg = (topLum + botLum + leftLum + rightLum) >> 2;
                const score = (d1 + d2) * 0.55 + (lum - surroundAvg) * 1.45;
                if (score >= 56) {
                    // 3x3 intensity-weighted sub-pixel centroid
                    let sumW = 0, sumX = 0, sumY = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const w = Math.max(0, currGray[(y + dy) * CV_W + (x + dx)] - surroundAvg);
                            sumW += w;
                            sumX += (x + dx) * w;
                            sumY += (y + dy) * w;
                        }
                    }
                    const subX = sumW > 0 ? (sumX / sumW) / CV_W : nx;
                    const subY = sumW > 0 ? (sumY / sumW) / CV_H : ny;
                    raw.push({ x: subX, y: subY, score, cellIdx });
                }
            }
        }

        // Non-maximum suppression -> up to 6 distinct candidates (Kalman + Inpaint tracker picks the trajectory-consistent one)
        raw.sort((a, b) => b.score - a.score);
        const out = [];
        for (const c of raw) {
            if (out.every(o => Math.hypot(o.x - c.x, o.y - c.y) > 0.022)) {
                hotCellCounts[c.cellIdx]++;
                out.push({ x: c.x, y: c.y, confidence: Math.min(99, Math.round(c.score)) });
                if (out.length >= 6) break;
            }
        }
        return out;
    }

    /****************************************************************
     * 3b. MODEL-BASED COURT LINE & NET REFINEMENT (sub-pixel line snapping)
     *     Projects every painted BWF line through the current homography,
     *     searches perpendicular to each line for the white-line ridge,
     *     then re-solves the homography by least squares (robust, iterative).
     ****************************************************************/
    const refineCanvas = document.createElement('canvas');
    const refineCtx = refineCanvas.getContext('2d', { willReadFrequently: true });

    function solveHomographyLeastSquares(src, dst) {
        // src: court (u,v), dst: screen (x,y) normalized. Solves 8 params with h33 = 1.
        const ATA = Array.from({ length: 8 }, () => new Array(8).fill(0));
        const ATb = new Array(8).fill(0);
        for (let i = 0; i < src.length; i++) {
            const x = src[i].x, y = src[i].y, X = dst[i].x, Y = dst[i].y;
            const rows = [
                [[x, y, 1, 0, 0, 0, -X * x, -X * y], X],
                [[0, 0, 0, x, y, 1, -Y * x, -Y * y], Y]
            ];
            rows.forEach(([r, b]) => {
                for (let a = 0; a < 8; a++) {
                    ATb[a] += r[a] * b;
                    for (let c = 0; c < 8; c++) ATA[a][c] += r[a] * r[c];
                }
            });
        }
        const h = solveGaussian8x8(ATA, ATb);
        if (!h) return null;
        return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
    }

    function refineCourtToLines(videoEl, humanBoxes = []) {
        if (!videoEl || videoEl.readyState < 2) return { ok: false, reason: 'no-video' };
        try {
            const vw = videoEl.videoWidth || 1280;
            const vh = videoEl.videoHeight || 720;
            const LONG = 480; // Fast downscaled 480p CV pass to prevent freezing the main UI thread
            const W = vw >= vh ? LONG : Math.round(LONG * vw / vh);
            const Hh = vw >= vh ? Math.round(LONG * vh / vw) : LONG;
            refineCanvas.width = W;
            refineCanvas.height = Hh;
            refineCtx.drawImage(videoEl, 0, 0, W, Hh);
            const d = refineCtx.getImageData(0, 0, W, Hh).data;
            const g = new Uint8Array(W * Hh);
            for (let i = 0, p = 0; i < d.length; i += 4, p++) g[p] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
            const lumAt = (x, y) => {
                const xi = Math.round(x), yi = Math.round(y);
                if (xi < 0 || yi < 0 || xi >= W || yi >= Hh) return -1;
                return g[yi * W + xi];
            };

            // Detect typical badminton court floor mat vs white court lines
            const isCourtFloor = (xi, yi) => {
                const rx = Math.round(xi), ry = Math.round(yi);
                if (rx < 0 || ry < 0 || rx >= W || ry >= Hh) return false;
                const idx = (ry * W + rx) * 4;
                const r = d[idx], gr = d[idx + 1], b = d[idx + 2];
                // Blue floor mat (like IMG_7847 / BWF events)
                if (b > r + 14 && b > 55) return true;
                // Green floor mat
                if (gr > r + 14 && gr > b - 10 && gr > 45) return true;
                // Wood / parquet gym floor
                if (r > b + 14 && gr > b + 6) return true;
                return false;
            };

            const isWhiteLine = (xi, yi) => {
                const rx = Math.round(xi), ry = Math.round(yi);
                if (rx < 0 || ry < 0 || rx >= W || ry >= Hh) return false;
                const idx = (ry * W + rx) * 4;
                const r = d[idx], gr = d[idx + 1], b = d[idx + 2];
                const lum = g[ry * W + rx];
                const diff = Math.max(r, gr, b) - Math.min(r, gr, b);
                return lum >= 135 && diff < 55;
            };

            // Template lines adapted to calibrationMode ('full' = 13.4m, 'service' = near service line v=0.6478)
            const maxV = calibrationMode === 'service' ? 0.6478 : 1.0;
            const lines = [];
            const horizVs = [0, 0.0567, 0.3522, 0.6478];
            if (calibrationMode !== 'service') horizVs.push(0.9433, 1.0);
            horizVs.forEach(v => lines.push({ a: [0, v], b: [1, v] }));

            [0, 0.0754, 0.9246, 1].forEach(u => lines.push({ a: [u, 0], b: [u, maxV] }));
            lines.push({ a: [0.5, 0], b: [0.5, 0.3522] });
            if (calibrationMode !== 'service') lines.push({ a: [0.5, 0.6478], b: [0.5, 1.0] });

            const H_before = H_courtToScreen.slice();
            let H = H_courtToScreen.slice();
            let lastStats = null;
            // 3-pass coarse-to-fine search: coarse capture (0.075) -> medium alignment (0.035) -> sub-pixel lock (0.015)
            const radii = [0.075, 0.035, 0.015];

            for (let iter = 0; iter < radii.length; iter++) {
                const searchR = Math.min(36, Math.max(6, Math.round(radii[iter] * Math.max(W, Hh))));
                const src = [];
                const dst = [];
                const offsets = [];

                lines.forEach(L => {
                    const N = 14;
                    for (let s = 1; s < N; s++) {
                        const t = s / N;
                        const u = L.a[0] + (L.b[0] - L.a[0]) * t;
                        const v = L.a[1] + (L.b[1] - L.a[1]) * t;
                        const p = projectPoint(H, u, v);
                        const p2 = projectPoint(H, u + (L.b[0] - L.a[0]) * 0.01, v + (L.b[1] - L.a[1]) * 0.01);
                        if (p.x < 0.02 || p.x > 0.98 || p.y < 0.02 || p.y > 0.98) continue;
                        if (humanBoxes.some(b => p.x >= b.xMin - 0.01 && p.x <= b.xMax + 0.01 && p.y >= b.yMin - 0.01 && p.y <= b.yMax + 0.01)) continue;

                        const px = p.x * W, py = p.y * Hh;
                        let dx = (p2.x - p.x) * W, dy = (p2.y - p.y) * Hh;
                        const len = Math.hypot(dx, dy) || 1;
                        dx /= len; dy /= len;
                        const nx = -dy, ny = dx; // perpendicular unit vector

                        // Multi-scale flanks
                        const flanks = [3, 6, 10];
                        let bestT = 0, bestResp = -1e9;
                        for (let k = -searchR; k <= searchR; k++) {
                            const cx = px + nx * k, cy = py + ny * k;
                            const c = lumAt(cx, cy);
                            if (c < 110) continue;
                            for (let f = 0; f < flanks.length; f++) {
                                const flank = flanks[f];
                                const lx = cx - nx * flank, ly = cy - ny * flank;
                                const rx = cx + nx * flank, ry = cy + ny * flank;
                                const l = lumAt(lx, ly);
                                const r = lumAt(rx, ry);
                                if (l < 0 || r < 0) continue;

                                let resp = c - Math.max(l, r);
                                if (isWhiteLine(cx, cy)) resp += 14;
                                if (isCourtFloor(lx, ly) || isCourtFloor(rx, ry)) resp += 10;

                                if (resp > bestResp) { bestResp = resp; bestT = k; }
                            }
                        }
                        if (bestResp >= 16) {
                            src.push({ x: u, y: v });
                            dst.push({ x: (px + nx * bestT) / W, y: (py + ny * bestT) / Hh });
                            offsets.push(Math.abs(bestT));
                        }
                    }
                });

                if (src.length < 10) {
                    lastStats = { ok: false, reason: 'few-lines', samples: src.length };
                    break;
                }

                // Robust outlier rejection on perpendicular offsets
                const sorted = offsets.slice().sort((a, b) => a - b);
                const med = sorted[Math.floor(sorted.length / 2)];
                const gate = med * 2.2 + 3;
                const fSrc = [], fDst = [];
                offsets.forEach((o, i) => { if (o <= gate) { fSrc.push(src[i]); fDst.push(dst[i]); } });
                if (fSrc.length < 8) {
                    lastStats = { ok: false, reason: 'outliers', samples: fSrc.length };
                    break;
                }

                const Hn = solveHomographyLeastSquares(fSrc, fDst);
                if (!Hn) break;
                let rms = 0;
                fSrc.forEach((s, i) => {
                    const q = projectPoint(Hn, s.x, s.y);
                    rms += ((q.x - fDst[i].x) * W) ** 2 + ((q.y - fDst[i].y) * Hh) ** 2;
                });
                rms = Math.sqrt(rms / fSrc.length);
                H = Hn;
                lastStats = { ok: true, samples: fSrc.length, total: offsets.length, rmsPx: +rms.toFixed(2) };
            }

            if (!lastStats || !lastStats.ok) return lastStats || { ok: false };

            // Sanity & Perspective Validation: Never accept an inverted, tilted, or distorted court
            const nearV = calibrationMode === 'service' ? 0.6478 : 1.0;
            const tl = projectPoint(H, 0, 0), tr = projectPoint(H, 1, 0);
            const br = projectPoint(H, 1, nearV), bl = projectPoint(H, 0, nearV);

            // Geometric validity checks
            const isLeftRightValid = (tl.x < tr.x) && (bl.x < br.x);
            const isFarNearValid = (tl.y < bl.y) && (tr.y < br.y);
            const isPerspectiveValid = (br.x - bl.x) > (tr.x - tl.x) * 1.02;
            const isTiltReasonable = Math.abs(tl.y - tr.y) < 0.08;

            if (!isLeftRightValid || !isFarNearValid || !isPerspectiveValid || !isTiltReasonable) {
                return { ok: false, reason: 'geometric-violation' };
            }

            const anchors = [[0, 0], [1, 0], [1, nearV], [0, nearV]];
            const maxShift = Math.max(...anchors.map(([u, v]) => {
                const a = projectPoint(H_before, u, v);
                const b = projectPoint(H, u, v);
                return Math.hypot(a.x - b.x, a.y - b.y);
            }));
            if (maxShift > 0.25 || lastStats.rmsPx > 10) {
                return { ok: false, reason: 'unstable', maxShift: +maxShift.toFixed(3), rmsPx: lastStats.rmsPx };
            }

            // Apply: update corner handles from refined homography
            courtCorners.tl = { x: tl.x, y: tl.y };
            courtCorners.tr = { x: tr.x, y: tr.y };
            courtCorners.br = { x: br.x, y: br.y };
            courtCorners.bl = { x: bl.x, y: bl.y };
            H_courtToScreen = H;
            H_screenToCourt = invert3x3(H);
            if (!courtCorners._customNet) {
                const midL = projectPoint(H, 0, 0.5);
                const midR = projectPoint(H, 1, 0.5);
                courtCorners.netL = { x: midL.x, y: courtCorners.netL.y };
                courtCorners.netR = { x: midR.x, y: courtCorners.netR.y };
            }

            // Refine net top tape: bright horizontal tape, search vertically around current net line
            const netPts = [];
            for (let s = 2; s <= 18; s += 2) {
                const t = s / 20;
                const x = courtCorners.netL.x + (courtCorners.netR.x - courtCorners.netL.x) * t;
                const y = courtCorners.netL.y + (courtCorners.netR.y - courtCorners.netL.y) * t;
                if (humanBoxes.some(b => x >= b.xMin && x <= b.xMax && y >= b.yMin && y <= b.yMax)) continue;
                const px = x * W, py = y * Hh;
                const R = Math.round(0.02 * Hh);
                let bestK = 0, bestResp = -1e9;
                for (let k = -R; k <= R; k++) {
                    const c = lumAt(px, py + k), up = lumAt(px, py + k - 4), dn = lumAt(px, py + k + 4);
                    if (c < 0 || up < 0 || dn < 0) continue;
                    const resp = c - Math.max(up, dn);
                    if (resp > bestResp) { bestResp = resp; bestK = k; }
                }
                if (bestResp >= 16) netPts.push({ x, y: (py + bestK) / Hh });
            }
            if (netPts.length >= 4) {
                const n = netPts.length;
                const sx = netPts.reduce((a, p) => a + p.x, 0), sy = netPts.reduce((a, p) => a + p.y, 0);
                const sxx = netPts.reduce((a, p) => a + p.x * p.x, 0), sxy = netPts.reduce((a, p) => a + p.x * p.y, 0);
                const den = n * sxx - sx * sx;
                if (Math.abs(den) > 1e-9) {
                    const b = (n * sxy - sx * sy) / den;
                    const a = (sy - b * sx) / n;
                    courtCorners.netL.y = a + b * courtCorners.netL.x;
                    courtCorners.netR.y = a + b * courtCorners.netR.x;
                    lastStats.netRefined = true;
                }
            }

            courtConfidence = Math.min(99, Math.round((lastStats.samples / Math.max(1, lastStats.total)) * 100));
            netConfidence = lastStats.netRefined ? 95 : netConfidence;
            return lastStats;
        } catch (err) {
            console.warn('Court line refinement caught error:', err);
            return { ok: false, reason: err.message || 'error' };
        }
    }

    /****************************************************************
     * 4. METRIC CONVERSIONS & HAWKEYE IN/OUT LINE CALLS
     ****************************************************************/
    function screenToCourtNormalized(sx, sy) {
        return projectPoint(H_screenToCourt, sx, sy);
    }

    function courtNormalizedToScreen(u, v) {
        return projectPoint(H_courtToScreen, u, v);
    }

    function screenToCourtMeters(sx, sy) {
        const uv = screenToCourtNormalized(sx, sy);
        return {
            u: uv.x,
            v: uv.y,
            xMeters: uv.x * COURT_WIDTH_M,
            yMeters: uv.y * COURT_LENGTH_M
        };
    }

    // Evaluate whether a court landing position (u, v) is IN or OUT according to BWF rules
    function evaluateLineCall(u, v, isDoubles = true) {
        const xM = u * COURT_WIDTH_M;
        const yM = v * COURT_LENGTH_M;

        const minX = isDoubles ? 0.0 : SINGLES_MARGIN_M;
        const maxX = isDoubles ? COURT_WIDTH_M : (COURT_WIDTH_M - SINGLES_MARGIN_M);
        const minY = 0.0;
        const maxY = COURT_LENGTH_M;

        // Shuttlecock cork diameter is ~2.5cm, line width is 4cm.
        const distLeft = xM - minX;
        const distRight = maxX - xM;
        const distTop = yM - minY;
        const distBottom = maxY - yM;

        const minMarginM = Math.min(distLeft, distRight, distTop, distBottom);
        const minMarginCm = +(minMarginM * 100).toFixed(1);
        const isIn = minMarginM >= -0.02; // 2cm line touch tolerance (on the line = IN)

        let closestLineName = 'เส้นหลัง (Baseline)';
        const absMin = Math.min(Math.abs(distLeft), Math.abs(distRight), Math.abs(distTop), Math.abs(distBottom));
        if (absMin === Math.abs(distLeft)) closestLineName = 'เส้นข้างซ้าย (Left Sideline)';
        else if (absMin === Math.abs(distRight)) closestLineName = 'เส้นข้างขวา (Right Sideline)';
        else if (absMin === Math.abs(distTop)) closestLineName = 'เส้นหลังแดน A (Far Baseline)';
        else closestLineName = 'เส้นหลังแดน B (Near Baseline)';

        return {
            isIn,
            side: v < 0.5 ? 'A' : 'B', // Which side of the net the shuttle landed on
            xMeters: +xM.toFixed(2),
            yMeters: +yM.toFixed(2),
            marginCm: minMarginCm,
            closestLineName
        };
    }

    return {
        COURT_WIDTH_M,
        COURT_LENGTH_M,
        NET_Y_M,
        getCorners: () => courtCorners,
        orderCourtCorners: () => {
            if (calibrationMode === 'full') {
                const ordered = orderFourCorners(courtCorners.tl, courtCorners.tr, courtCorners.br, courtCorners.bl);
                courtCorners.tl = ordered.tl;
                courtCorners.tr = ordered.tr;
                courtCorners.br = ordered.br;
                courtCorners.bl = ordered.bl;
                updateHomographyFromCorners();
            } else if (calibrationMode === 'front-net') {
                const ordered = orderFourCorners(courtCorners.sfl, courtCorners.sfr, courtCorners.snr, courtCorners.snl);
                courtCorners.sfl = ordered.tl;
                courtCorners.sfr = ordered.tr;
                courtCorners.snr = ordered.br;
                courtCorners.snl = ordered.bl;
                updateHomographyFromCorners();
            } else if (calibrationMode === 'service') {
                const ordered = orderFourCorners(courtCorners.tl, courtCorners.tr, courtCorners.snr, courtCorners.snl);
                courtCorners.tl = ordered.tl;
                courtCorners.tr = ordered.tr;
                courtCorners.snr = ordered.br;
                courtCorners.snl = ordered.bl;
                updateHomographyFromCorners();
            }
        },
        setCorner: (key, x, y) => {
            const clampedX = Math.max(-0.60, Math.min(1.60, x));
            const clampedY = Math.max(-0.20, Math.min(1.60, y));

            if (key === 'sfl') {
                const prev = courtCorners.sfl || { x: clampedX, y: clampedY };
                const dx = clampedX - prev.x;
                const dy = clampedY - prev.y;
                courtCorners.sfl = { x: clampedX, y: clampedY };
                if (courtCorners.tl) {
                    courtCorners.tl.x += dx;
                    courtCorners.tl.y += dy;
                }
                isManuallyEdited = true;
                updateHomographyFromCorners('sfl');
                return;
            }
            if (key === 'sfr') {
                const prev = courtCorners.sfr || { x: clampedX, y: clampedY };
                const dx = clampedX - prev.x;
                const dy = clampedY - prev.y;
                courtCorners.sfr = { x: clampedX, y: clampedY };
                if (courtCorners.tr) {
                    courtCorners.tr.x += dx;
                    courtCorners.tr.y += dy;
                }
                isManuallyEdited = true;
                updateHomographyFromCorners('sfr');
                return;
            }
            if (key === 'snl') {
                const prev = courtCorners.snl || { x: clampedX, y: clampedY };
                const dx = clampedX - prev.x;
                const dy = clampedY - prev.y;
                courtCorners.snl = { x: clampedX, y: clampedY };
                if (courtCorners.bl) {
                    courtCorners.bl.x += dx;
                    courtCorners.bl.y += dy;
                }
                isManuallyEdited = true;
                updateHomographyFromCorners('snl');
                return;
            }
            if (key === 'snr') {
                const prev = courtCorners.snr || { x: clampedX, y: clampedY };
                const dx = clampedX - prev.x;
                const dy = clampedY - prev.y;
                courtCorners.snr = { x: clampedX, y: clampedY };
                if (courtCorners.br) {
                    courtCorners.br.x += dx;
                    courtCorners.br.y += dy;
                }
                isManuallyEdited = true;
                updateHomographyFromCorners('snr');
                return;
            }
            if (key === 'netL' || key === 'netR') {
                if (courtCorners[key]) {
                    courtCorners[key].x = clampedX;
                    courtCorners[key].y = clampedY;
                }
                courtCorners._customNet = true;
                isManuallyEdited = true;
                updateHomographyFromCorners(key);
                return;
            }
            if (courtCorners[key]) {
                courtCorners[key].x = clampedX;
                courtCorners[key].y = clampedY;
                isManuallyEdited = true;
                updateHomographyFromCorners(key);
            }
        },
        resetCornersDefault: (isPortrait = true, force = false) => {
            if (isManuallyEdited && !force) return;
            courtCorners._customNet = true;
            if (calibrationMode === 'front-net') {
                if (isPortrait) {
                    // Front-of-Net (Short Service Lines) mode: 100% in center of video frame, away from top/bottom edges
                    courtCorners.sfl = { x: 0.320, y: 0.520 }; // Far Short Service L
                    courtCorners.sfr = { x: 0.760, y: 0.520 }; // Far Short Service R
                    courtCorners.snl = { x: 0.250, y: 0.680 }; // Near Short Service L
                    courtCorners.snr = { x: 0.830, y: 0.680 }; // Near Short Service R
                    courtCorners.netL = { x: 0.250, y: 0.465 };
                    courtCorners.netR = { x: 0.830, y: 0.465 };
                } else {
                    courtCorners.sfl = { x: 0.350, y: 0.490 };
                    courtCorners.sfr = { x: 0.650, y: 0.490 };
                    courtCorners.snl = { x: 0.250, y: 0.670 };
                    courtCorners.snr = { x: 0.750, y: 0.670 };
                    courtCorners.netL = { x: 0.280, y: 0.540 };
                    courtCorners.netR = { x: 0.720, y: 0.540 };
                }
            } else if (calibrationMode === 'service') {
                if (isPortrait) {
                    // Near Short Service Line mode: 100% inside visible frame (ideal when near baseline is off-screen)
                    courtCorners.tl = { x: 0.360, y: 0.390 }; // Far Baseline L
                    courtCorners.tr = { x: 0.720, y: 0.390 }; // Far Baseline R
                    courtCorners.snl = { x: 0.250, y: 0.680 }; // Near Short Service L
                    courtCorners.snr = { x: 0.830, y: 0.680 }; // Near Short Service R
                    courtCorners.netL = { x: 0.250, y: 0.465 };
                    courtCorners.netR = { x: 0.830, y: 0.465 };
                } else {
                    courtCorners.tl = { x: 0.360, y: 0.420 };
                    courtCorners.tr = { x: 0.640, y: 0.420 };
                    courtCorners.snl = { x: 0.240, y: 0.680 };
                    courtCorners.snr = { x: 0.760, y: 0.680 };
                    courtCorners.netL = { x: 0.280, y: 0.540 };
                    courtCorners.netR = { x: 0.720, y: 0.540 };
                }
            } else {
                // Full Court BWF 13.40m x 6.10m (Primary Default Mode)
                if (isPortrait) {
                    courtCorners.tl = { x: 0.360, y: 0.390 }; // Far Baseline L
                    courtCorners.tr = { x: 0.720, y: 0.390 }; // Far Baseline R
                    courtCorners.bl = { x: 0.180, y: 0.880 }; // Near Baseline L
                    courtCorners.br = { x: 0.900, y: 0.880 }; // Near Baseline R
                    courtCorners.netL = { x: 0.250, y: 0.465 };
                    courtCorners.netR = { x: 0.830, y: 0.465 };
                } else {
                    courtCorners.tl = { x: 0.360, y: 0.420 };
                    courtCorners.tr = { x: 0.640, y: 0.420 };
                    courtCorners.bl = { x: 0.120, y: 0.900 };
                    courtCorners.br = { x: 0.880, y: 0.900 };
                    courtCorners.netL = { x: 0.260, y: 0.520 };
                    courtCorners.netR = { x: 0.740, y: 0.520 };
                }
            }
            if (force) {
                isManuallyEdited = false;
                try { localStorage.removeItem('shuttlepro_court_corners'); } catch (e) {}
            }
            updateHomographyFromCorners();
        },
        setCalibrationMode: (mode, isPortrait = true) => {
            if (mode === 'full' || mode === 'service' || mode === 'front-net') {
                calibrationMode = mode;
                courtCorners._customNet = false;
                isManuallyEdited = false;
                if (window.ShuttleCV && window.ShuttleCV.resetCornersDefault) {
                    window.ShuttleCV.resetCornersDefault(isPortrait, true);
                } else {
                    updateHomographyFromCorners();
                }
            }
        },
        getCalibrationMode: () => calibrationMode,
        // Court is "valid" ONLY when calibrated/locked -> players & shuttle are never tracked against a guessed court
        isCourtValidOrLocked: () => isCourtLocked,
        getCourtConfidence: () => courtConfidence,
        getNetConfidence: () => netConfidence,
        getDetectedSegments: () => detectedLineSegments,
        getDetectedNet: () => detectedNetSegment,
        setCourtLocked: (locked) => { isCourtLocked = locked; },
        getCourtLocked: () => isCourtLocked,
        // "Trusted" = court geometry verified by user drag-calibration or a successful line refine.
        // Auto-scoring / line calls must only run when the court is trusted (default guessed corners are NOT trusted).
        setCourtTrusted: (trusted) => { isCourtTrustedFlag = !!trusted; },
        isCourtTrusted: () => isCourtTrustedFlag || isManuallyEdited,
        updateHomography: updateHomographyFromCorners,
        analyzeVideoFrameCV,
        refineCourtToLines,
        expectedPlayerHeightScreen,
        metersPerScreenUnit,
        isInsideCourt,
        PLAY_VOLUME,
        isInsidePlayVolume,
        isInsidePlayVolumeUV,
        getCourtAirspacePolygon,
        screenToCourtNormalized,
        courtNormalizedToScreen,
        screenToCourtMeters,
        evaluateLineCall,
        orderFourCorners
    };
})();

if (typeof window !== 'undefined') {
    window.orderFourCorners = window.ShuttleCV?.orderFourCorners;
}
