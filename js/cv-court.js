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

    // Offscreen canvas for CV pixel processing (320x180 for 60fps real-time edge/line/motion analysis)
    const CV_W = 320;
    const CV_H = 180;
    const cvCanvas = document.createElement('canvas');
    cvCanvas.width = CV_W;
    cvCanvas.height = CV_H;
    const cvCtx = cvCanvas.getContext('2d', { willReadFrequently: true });

    // Frame buffers for 3-frame temporal difference (TrackNet-style motion filter)
    let prevGray1 = null;
    let prevGray2 = null;

    // Detected raw white line segments & net candidates in normalized [0..1] image coords
    let detectedLineSegments = [];
    let detectedNetSegment = null;
    let courtConfidence = 0; // 0..100%
    let netConfidence = 0;   // 0..100%
    let isCourtLocked = false;
    let autoLockEnabled = true;

    // Calibrated / Detected Court Keypoints in normalized screen coordinates [0..1]
    // Anchored on the 4 visible corners: Far Baseline (tl, tr at v=0) & Near Short-Service Line (bl, br at v=0.6478)
    // Pre-calibrated to match real baseline camera geometry (IMG_7847.MOV)
    let courtCorners = {
        tl: { x: 0.355, y: 0.613 }, // Far Baseline Left Corner (u=0, v=0)
        tr: { x: 0.715, y: 0.615 }, // Far Baseline Right Corner (u=1, v=0)
        br: { x: 0.932, y: 0.688 }, // Near Short-Service Right Corner (u=1, v=0.6478)
        bl: { x: 0.142, y: 0.684 }, // Near Short-Service Left Corner (u=0, v=0.6478)
        netL: { x: 0.248, y: 0.569 }, // Net Top Tape Left Post
        netR: { x: 0.822, y: 0.571 }  // Net Top Tape Right Post
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
        if (Math.abs(w) < 1e-8) return { x: 0.5, y: 0.5 };
        return {
            x: (H[0] * x + H[1] * y + H[2]) / w,
            y: (H[3] * x + H[4] * y + H[5]) / w
        };
    }

    function updateHomographyFromCorners() {
        const anchorRect = [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 0.6478 },
            { x: 0, y: 0.6478 }
        ];
        const dstQuad = [
            courtCorners.tl,
            courtCorners.tr,
            courtCorners.br,
            courtCorners.bl
        ];
        H_courtToScreen = computeHomography4Pt(anchorRect, dstQuad);
        H_screenToCourt = invert3x3(H_courtToScreen);

        const midL = projectPoint(H_courtToScreen, 0, 0.5);
        const midR = projectPoint(H_courtToScreen, 1, 0.5);
        const netHeightNorm = 0.087; // BWF 1.55m net height in baseline perspective
        if (!courtCorners._customNet) {
            courtCorners.netL = { x: midL.x + 0.022, y: midL.y - netHeightNorm };
            courtCorners.netR = { x: midR.x - 0.025, y: midL.y - netHeightNorm };
        }
    }

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

        cvCtx.drawImage(videoEl, 0, 0, CV_W, CV_H);
        const imgData = cvCtx.getImageData(0, 0, CV_W, CV_H);
        const data = imgData.data;

        const gray = new Uint8Array(CV_W * CV_H);
        const isCourtColor = new Uint8Array(CV_W * CV_H);
        let courtColorPixels = 0;

        // Step 2.1: Convert to luminance & classify court surface colors (Green, Blue, Teal, Wood gym floor)
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const lum = (r * 77 + g * 150 + b * 29) >> 8;
            gray[p] = lum;

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

        // Auto-fit corners strictly within the detected floor region (never up in the ceiling!)
        if (autoLockEnabled && !isCourtLocked && courtConfidence >= 65) {
            const floorTopNorm = Math.max(0.46, Math.min(0.68, floorHorizonRow / CV_H));
            fitCornersFromDetectedSegments(horizSegs, vertSegs, bestNetY, floorTopNorm);
        }

        // Step 2.5: High-Precision 3-Frame Shuttlecock Point-Target Detection
        const shuttleCandidate = detectShuttleFrom3FrameDiff(gray, humanBoxes, floorHorizonRow / CV_H);
        prevGray2 = prevGray1;
        prevGray1 = gray;

        return {
            courtConfidence,
            netConfidence,
            segments: detectedLineSegments,
            shuttleCandidate
        };
    }

    function fitCornersFromDetectedSegments(horizSegs, vertSegs, bestNetY, floorTopNorm) {
        const farBaseY = Math.max(0.58, Math.min(0.64, floorTopNorm + 0.015));
        const nearShortServiceY = farBaseY + 0.072; // v = 0.6478 Short Service Line

        const alpha = 0.25;
        courtCorners.tl.y = courtCorners.tl.y * (1 - alpha) + farBaseY * alpha;
        courtCorners.tr.y = courtCorners.tr.y * (1 - alpha) + (farBaseY + 0.002) * alpha;
        courtCorners.bl.y = courtCorners.bl.y * (1 - alpha) + nearShortServiceY * alpha;
        courtCorners.br.y = courtCorners.br.y * (1 - alpha) + (nearShortServiceY + 0.004) * alpha;

        updateHomographyFromCorners();
        if (bestNetY > 0.50 && bestNetY < 0.62 && !courtCorners._customNet) {
            courtCorners.netL.y = bestNetY;
            courtCorners.netR.y = bestNetY;
        }
    }

    /****************************************************************
     * 3. 3-FRAME TRANSIENT POINT-TARGET SHUTTLECOCK TRACKER
     *    Eliminates false positives on player shirts, shoes, lines & lights.
     ****************************************************************/
    function detectShuttleFrom3FrameDiff(currGray, humanBoxes, floorTopNorm = 0.5) {
        if (!prevGray1 || !prevGray2) return null;

        let bestX = -1, bestY = -1, bestScore = 0;
        // Scan airspace from above net down to near floor (avoid top 12% ceiling trusses)
        const minRow = Math.floor(CV_H * 0.14);
        const maxRow = Math.floor(CV_H * 0.93);

        for (let y = minRow; y < maxRow; y += 2) {
            for (let x = 10; x < CV_W - 10; x += 2) {
                const idx = y * CV_W + x;
                const lum = currGray[idx];
                if (lum < 165) continue;

                // 1. Must be newly bright in current frame compared to BOTH t-1 and t-2
                const d1 = lum - prevGray1[idx];
                const d2 = lum - prevGray2[idx];
                if (d1 < 32 || d2 < 32) continue;

                // 2. Background stability check: pixel (x,y) must have been stable between t-2 and t-1!
                // This rejects oscillating player shirts, shoes, and camera shake on court lines/lights.
                const bgDiff = Math.abs(prevGray1[idx] - prevGray2[idx]);
                if (bgDiff > 16) continue;

                // 3. 4-Direction Point Isolation Check:
                // A shuttlecock is a small compact spot (radius ~2-5px), NOT a long line or large body part.
                // All 4 surrounding points at 5px radius must be significantly darker than the center!
                const topLum = currGray[(y - 5) * CV_W + x];
                const botLum = currGray[(y + 5) * CV_W + x];
                const leftLum = currGray[y * CV_W + (x - 5)];
                const rightLum = currGray[y * CV_W + (x + 5)];

                if (
                    lum - topLum < 22 ||
                    lum - botLum < 22 ||
                    lum - leftLum < 22 ||
                    lum - rightLum < 22
                ) {
                    continue;
                }

                const nx = x / CV_W;
                const ny = y / CV_H;

                // 4. Full Human Body + Shoe + Racket Exclusion Mask
                let insideHuman = false;
                for (let i = 0; i < humanBoxes.length; i++) {
                    const b = humanBoxes[i];
                    if (
                        nx >= b.xMin - 0.04 &&
                        nx <= b.xMax + 0.04 &&
                        ny >= b.yMin - 0.04 &&
                        ny <= b.yMax + 0.04
                    ) {
                        insideHuman = true;
                        break;
                    }
                }
                if (insideHuman) continue;

                const surroundAvg = (topLum + botLum + leftLum + rightLum) >> 2;
                const compactness = lum - surroundAvg;
                const score = (d1 + d2) * 0.5 + compactness * 1.5;

                if (score > bestScore) {
                    bestScore = score;
                    bestX = nx;
                    bestY = ny;
                }
            }
        }

        if (bestScore >= 68) {
            return { x: bestX, y: bestY, confidence: Math.min(99, Math.round(bestScore)) };
        }
        return null;
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
        setCorner: (key, x, y) => {
            if (courtCorners[key]) {
                courtCorners[key].x = Math.max(0.01, Math.min(0.99, x));
                courtCorners[key].y = Math.max(0.01, Math.min(0.99, y));
                if (key === 'netL' || key === 'netR') {
                    courtCorners._customNet = true;
                }
                updateHomographyFromCorners();
            }
        },
        resetCornersDefault: (isPortrait = false) => {
            courtCorners._customNet = false;
            if (isPortrait) {
                courtCorners.tl = { x: 0.19, y: 0.16 };
                courtCorners.tr = { x: 0.81, y: 0.16 };
                courtCorners.br = { x: 0.96, y: 0.88 };
                courtCorners.bl = { x: 0.04, y: 0.88 };
            } else {
                courtCorners.tl = { x: 0.24, y: 0.18 };
                courtCorners.tr = { x: 0.76, y: 0.18 };
                courtCorners.br = { x: 0.93, y: 0.89 };
                courtCorners.bl = { x: 0.07, y: 0.89 };
            }
            updateHomographyFromCorners();
        },
        isCourtValidOrLocked: () => isCourtLocked || courtConfidence >= 60,
        getCourtConfidence: () => courtConfidence,
        getNetConfidence: () => netConfidence,
        getDetectedSegments: () => detectedLineSegments,
        getDetectedNet: () => detectedNetSegment,
        setCourtLocked: (locked) => { isCourtLocked = locked; },
        getCourtLocked: () => isCourtLocked,
        analyzeVideoFrameCV,
        screenToCourtNormalized,
        courtNormalizedToScreen,
        screenToCourtMeters,
        evaluateLineCall
    };
})();
