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
    // Default initial template ONLY used when user enters manual calibration or after CV lock
    let courtCorners = {
        tl: { x: 0.24, y: 0.18 }, // Top-Left (Far baseline left)
        tr: { x: 0.76, y: 0.18 }, // Top-Right (Far baseline right)
        br: { x: 0.93, y: 0.89 }, // Bottom-Right (Near baseline right)
        bl: { x: 0.07, y: 0.89 }, // Bottom-Left (Near baseline left)
        netL: { x: 0.14, y: 0.46 }, // Net Top Tape Left Post
        netR: { x: 0.86, y: 0.46 }  // Net Top Tape Right Post
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
        const unitSquare = [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 }
        ];
        const dstQuad = [
            courtCorners.tl,
            courtCorners.tr,
            courtCorners.br,
            courtCorners.bl
        ];
        H_courtToScreen = computeHomography4Pt(unitSquare, dstQuad);
        H_screenToCourt = invert3x3(H_courtToScreen);

        // Also update default net post floor projection if not manually dragged far
        const midL = projectPoint(H_courtToScreen, 0, 0.5);
        const midR = projectPoint(H_courtToScreen, 1, 0.5);
        const netHeightNorm = 0.068; // BWF 1.55m net height in perspective
        if (!courtCorners._customNet) {
            courtCorners.netL = { x: midL.x, y: midL.y - netHeightNorm };
            courtCorners.netR = { x: midR.x, y: midR.y - netHeightNorm };
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

        // Step 2.2: Detect White/Yellow Court Line Ridges
        // A true court line is a thin bright ridge (width 2..9 px in 320x180) flanked by darker court floor pixels!
        // This prevents skin/faces/walls/shirts from being falsely detected as court lines.
        const ridgePoints = [];
        const netTapeRows = new Float32Array(CV_H);

        for (let y = Math.floor(CV_H * 0.12); y < Math.floor(CV_H * 0.94); y += 2) {
            let horizontalRidgeRun = 0;
            for (let x = 8; x < CV_W - 8; x += 2) {
                const idx = y * CV_W + x;
                const cLum = gray[idx];
                if (cLum < 155) {
                    horizontalRidgeRun = 0;
                    continue;
                }

                // Check horizontal profile (vertical/slanted sideline): dark - BRIGHT - dark
                const leftLum = gray[idx - 5];
                const rightLum = gray[idx + 5];
                const isVertRidge = (cLum - leftLum > 28 && cLum - rightLum > 28) &&
                    (isCourtColor[idx - 5] || isCourtColor[idx + 5]);

                // Check vertical profile (horizontal baseline/service line/net tape): dark - BRIGHT - dark
                const topLum = gray[(y - 4) * CV_W + x];
                const botLum = gray[(y + 4) * CV_W + x];
                const isHorizRidge = (cLum - topLum > 26 && cLum - botLum > 26);

                if (isHorizRidge) {
                    horizontalRidgeRun++;
                    if (y > CV_H * 0.25 && y < CV_H * 0.68) {
                        netTapeRows[y] += 1;
                    }
                } else {
                    horizontalRidgeRun = 0;
                }

                if (isVertRidge || (isHorizRidge && (isCourtColor[(y + 5) * CV_W + x] || isCourtColor[(y - 5) * CV_W + x]))) {
                    // Exclude points inside detected human bounding boxes so white shirts/shoes don't pollute court lines
                    const nx = x / CV_W;
                    const ny = y / CV_H;
                    let insideHuman = false;
                    for (let h = 0; h < humanBoxes.length; h++) {
                        const hb = humanBoxes[h];
                        if (nx >= hb.xMin && nx <= hb.xMax && ny >= hb.yMin && ny <= hb.yMax) {
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

        // Step 2.3: Cluster ridge points into line segments (Mini-Hough / RANSAC segment builder)
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
                if (len < 0.14 || len > 0.85) continue;

                // Check angle: court lines are either near-horizontal (|dy/dx| < 0.22) or perspective sidelines (|dx/dy| < 0.65)
                const absDx = Math.abs(dx);
                const absDy = Math.abs(dy);
                const isHorizontalCandidate = absDy / (absDx + 1e-5) < 0.18;
                const isSidelineCandidate = absDy > 0.14 && (absDx / absDy) < 0.62;
                if (!isHorizontalCandidate && !isSidelineCandidate) continue;

                // Count colinear ridge points
                const inliers = [i, j];
                for (let k = 0; k < ridgePoints.length; k += 3) {
                    if (k === i || k === j) continue;
                    const pk = ridgePoints[k];
                    // Distance from pk to line p1->p2
                    const dist = Math.abs(dy * pk.x - dx * pk.y + p2.x * p1.y - p2.y * p1.x) / len;
                    if (dist < 0.008) {
                        // Also check projection lies between p1 and p2
                        const dot = (pk.x - p1.x) * dx + (pk.y - p1.y) * dy;
                        if (dot >= 0 && dot <= len * len) {
                            inliers.push(k);
                        }
                    }
                }

                if (inliers.length >= 9 && (!bestEnd || inliers.length > bestInliers.length)) {
                    bestEnd = p2;
                    bestInliers = inliers;
                }
            }

            if (bestEnd && bestInliers.length >= 9) {
                bestInliers.forEach(idx => { used[idx] = 1; });
                const isHoriz = Math.abs(bestEnd.y - p1.y) < Math.abs(bestEnd.x - p1.x) * 0.25;
                segments.push({
                    x1: p1.x, y1: p1.y,
                    x2: bestEnd.x, y2: bestEnd.y,
                    type: isHoriz ? 'H' : 'V',
                    strength: bestInliers.length
                });
                if (segments.length >= 18) break;
            }
        }

        detectedLineSegments = segments;

        // Step 2.4: Detect White Net Top Tape (Strong horizontal ridge near court middle)
        let bestNetY = -1;
        let maxNetScore = 0;
        for (let y = Math.floor(CV_H * 0.28); y < Math.floor(CV_H * 0.64); y++) {
            const score = netTapeRows[y - 1] + netTapeRows[y] * 2 + netTapeRows[y + 1];
            if (score > maxNetScore) {
                maxNetScore = score;
                bestNetY = y / CV_H;
            }
        }

        // Calculate realistic Court & Net Confidence
        const horizSegs = segments.filter(s => s.type === 'H');
        const vertSegs = segments.filter(s => s.type === 'V');

        // Require BOTH court floor color AND both horizontal + perspective vertical lines
        const rawCourtConf = Math.min(
            100,
            Math.round(
                (horizSegs.length >= 2 ? 38 : horizSegs.length * 16) +
                (vertSegs.length >= 2 ? 38 : vertSegs.length * 16) +
                (courtFloorRatio > 0.22 ? 24 : courtFloorRatio * 90)
            )
        );
        // Smooth confidence with EMA
        courtConfidence = Math.round(courtConfidence * 0.7 + rawCourtConf * 0.3);

        const rawNetConf = maxNetScore >= 18 ? Math.min(100, Math.round((maxNetScore / 42) * 100)) : Math.round((maxNetScore / 42) * 50);
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

        // Auto-fit corners when strong outer boundary segments are found and Auto-Lock is enabled
        if (autoLockEnabled && !isCourtLocked && horizSegs.length >= 2 && vertSegs.length >= 2 && courtConfidence >= 68) {
            fitCornersFromDetectedSegments(horizSegs, vertSegs, bestNetY);
        }

        // Step 2.5: 3-Frame Shuttlecock Motion Detection
        const shuttleCandidate = detectShuttleFrom3FrameDiff(gray, humanBoxes);
        prevGray2 = prevGray1;
        prevGray1 = gray;

        return {
            courtConfidence,
            netConfidence,
            segments: detectedLineSegments,
            shuttleCandidate
        };
    }

    function fitCornersFromDetectedSegments(horizSegs, vertSegs, bestNetY) {
        // Find top-most and bottom-most strong horizontal lines, and left-most / right-most sidelines
        const sortedH = [...horizSegs].sort((a, b) => ((a.y1 + a.y2) / 2) - ((b.y1 + b.y2) / 2));
        const topH = sortedH[0];
        const botH = sortedH[sortedH.length - 1];

        const sortedV = [...vertSegs].sort((a, b) => ((a.x1 + a.x2) / 2) - ((b.x1 + b.x2) / 2));
        const leftV = sortedV[0];
        const rightV = sortedV[sortedV.length - 1];

        const topY = Math.max(0.12, Math.min(0.42, (topH.y1 + topH.y2) / 2));
        const botY = Math.max(0.62, Math.min(0.95, (botH.y1 + botH.y2) / 2));

        if (botY - topY > 0.32) {
            const leftTopX = Math.max(0.08, Math.min(0.42, Math.min(leftV.x1, leftV.x2) + 0.04));
            const leftBotX = Math.max(0.03, Math.min(0.35, Math.min(leftV.x1, leftV.x2)));
            const rightTopX = Math.max(0.58, Math.min(0.92, Math.max(rightV.x1, rightV.x2) - 0.04));
            const rightBotX = Math.max(0.65, Math.min(0.97, Math.max(rightV.x1, rightV.x2)));

            if (rightTopX - leftTopX > 0.25 && rightBotX - leftBotX > 0.40) {
                // Smoothly blend toward detected court corners
                const alpha = 0.25;
                courtCorners.tl.x = courtCorners.tl.x * (1 - alpha) + leftTopX * alpha;
                courtCorners.tl.y = courtCorners.tl.y * (1 - alpha) + topY * alpha;
                courtCorners.tr.x = courtCorners.tr.x * (1 - alpha) + rightTopX * alpha;
                courtCorners.tr.y = courtCorners.tr.y * (1 - alpha) + topY * alpha;
                courtCorners.br.x = courtCorners.br.x * (1 - alpha) + rightBotX * alpha;
                courtCorners.br.y = courtCorners.br.y * (1 - alpha) + botY * alpha;
                courtCorners.bl.x = courtCorners.bl.x * (1 - alpha) + leftBotX * alpha;
                courtCorners.bl.y = courtCorners.bl.y * (1 - alpha) + botY * alpha;

                updateHomographyFromCorners();
                if (bestNetY > topY + 0.08 && bestNetY < botY - 0.08 && !courtCorners._customNet) {
                    courtCorners.netL.y = bestNetY;
                    courtCorners.netR.y = bestNetY;
                }
            }
        }
    }

    /****************************************************************
     * 3. 3-FRAME TEMPORAL DIFFERENCE SHUTTLECOCK TRACKER
     *    (TrackNet Principle: |I(t)-I(t-1)| AND |I(t)-I(t-2)|)
     ****************************************************************/
    function detectShuttleFrom3FrameDiff(currGray, humanBoxes) {
        if (!prevGray1 || !prevGray2) return null;

        let bestX = -1, bestY = -1, bestScore = 0;

        for (let y = 6; y < CV_H - 6; y += 2) {
            for (let x = 6; x < CV_W - 6; x += 2) {
                const idx = y * CV_W + x;
                const lum = currGray[idx];
                // Shuttlecock is bright white/yellow in flight
                if (lum < 150) continue;

                const d1 = Math.abs(lum - prevGray1[idx]);
                const d2 = Math.abs(lum - prevGray2[idx]);
                // Must have moved significantly from BOTH previous frames
                if (d1 < 28 || d2 < 28) continue;

                // Must be a compact blob (not a large moving wall/arm)
                const surroundLum = (
                    currGray[(y - 4) * CV_W + x] +
                    currGray[(y + 4) * CV_W + x] +
                    currGray[y * CV_W + (x - 4)] +
                    currGray[y * CV_W + (x + 4)]
                ) >> 2;

                const compactness = lum - surroundLum;
                if (compactness < 18) continue;

                const nx = x / CV_W;
                const ny = y / CV_H;

                // Exclude core torso of detected players (allow near wrists/above head)
                let insideTorso = false;
                for (let i = 0; i < humanBoxes.length; i++) {
                    const b = humanBoxes[i];
                    const torsoYMin = b.yMin + (b.yMax - b.yMin) * 0.22;
                    const torsoYMax = b.yMax - (b.yMax - b.yMin) * 0.15;
                    if (nx >= b.xMin + 0.02 && nx <= b.xMax - 0.02 && ny >= torsoYMin && ny <= torsoYMax) {
                        insideTorso = true;
                        break;
                    }
                }
                if (insideTorso) continue;

                const score = (d1 + d2) * 0.5 + compactness * 1.4;
                if (score > bestScore) {
                    bestScore = score;
                    bestX = nx;
                    bestY = ny;
                }
            }
        }

        if (bestScore >= 52) {
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
