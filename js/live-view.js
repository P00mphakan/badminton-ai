/********************************************************************
 * MODULE: js/live-view.js
 * PURPOSE: Live Camera & Video Upload controls, 60 FPS Canvas Renderer,
 *          Homography Court Line & Net Overlay, 4-Corner + Net Calibration
 *          with 3x Magnifier Loupe, and Main Animation Loop.
 ********************************************************************/

const liveCanvas = document.getElementById('liveCanvas');
const liveCtx = liveCanvas.getContext('2d');
const webcamVideo = document.getElementById('webcamVideo');

let frameCount = 0;
let lastFpsUpdate = performance.now();
let currentFps = 0;

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
        if (typeof drawAnalyticsCourt === 'function') drawAnalyticsCourt();
    }
}
window.addEventListener('resize', resizeCanvases);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvases, 150));

async function toggleWebcam() {
    const btnText = document.getElementById('cameraBtnText');
    if (isUploadedVideoActive) exitUploadedVideoMode();

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

    if (uploadedVideoURL) URL.revokeObjectURL(uploadedVideoURL);
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
        showToast(`โหลดคลิปสนามจริง "${file.name}" สำเร็จ!`);
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
            btn.className = 'flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-400/20 transition-all';
            btn.innerHTML = '<i class="ph-fill ph-check-fat text-base"></i><span>บันทึกการล็อกเส้นสนาม & เน็ท</span>';
        }
        showToast('ลากจุดมุมคอร์ท 4 มุม และปลายเน็ท 2 ข้างให้ตรงกับสนามจริง (มีแว่นขยาย 3x ช่วยเล็ง)');
    } else {
        ShuttleCV.setCourtLocked(true);
        if (btn) {
            btn.className = 'flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-all';
            btn.innerHTML = '<i class="ph-bold ph-crosshair text-emerald-400 text-base"></i><span>ล็อกเส้นสนาม & เน็ทแล้ว (แก้ไข)</span>';
        }
        showToast('ล็อกพิกัดเส้นสนาม 13.40m × 6.10m และความสูงเน็ทเรียบร้อย!');
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
        showToast('กำลังสแกนหาเส้นขาวและขอบเน็ท... กดปุ่ม "ล็อกพิกัดเส้นสนาม & เน็ท" เพื่อเล็งด้วยแว่นขยายได้ทันที');
    }
}

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
    let minDist = 0.065;
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

function renderLiveScene() {
    // Keep canvas internal resolution strictly synced with rendered container box (prevents aspect ratio squishing)
    const rect = liveCanvas.parentElement.getBoundingClientRect();
    const targetW = Math.max(320, Math.round(rect.width));
    const targetH = Math.max(240, Math.round(rect.height));
    if (liveCanvas.width !== targetW || liveCanvas.height !== targetH) {
        liveCanvas.width = targetW;
        liveCanvas.height = targetH;
    }

    const w = liveCanvas.width;
    const h = liveCanvas.height;
    liveCtx.clearRect(0, 0, w, h);

    const hasVideoFeed = (isWebcamActive || isUploadedVideoActive) && webcamVideo.readyState >= 2;

    if (!hasVideoFeed) {
        const grad = liveCtx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#090d16');
        grad.addColorStop(1, '#0f172a');
        liveCtx.fillStyle = grad;
        liveCtx.fillRect(0, 0, w, h);

        liveCtx.strokeStyle = 'rgba(51, 65, 85, 0.25)';
        liveCtx.lineWidth = 1;
        for (let gx = 0; gx < w; gx += 48) {
            liveCtx.beginPath(); liveCtx.moveTo(gx, 0); liveCtx.lineTo(gx, h); liveCtx.stroke();
        }
        for (let gy = 0; gy < h; gy += 48) {
            liveCtx.beginPath(); liveCtx.moveTo(0, gy); liveCtx.lineTo(w, gy); liveCtx.stroke();
        }

        liveCtx.fillStyle = '#34d399';
        liveCtx.font = 'bold 16px Prompt, sans-serif';
        liveCtx.textAlign = 'center';
        liveCtx.fillText('โหมดใช้งานจริง 100% (ปิดระบบจำลองแล้ว)', w / 2, h / 2 - 22);

        liveCtx.fillStyle = '#cbd5e1';
        liveCtx.font = '13px Prompt, sans-serif';
        liveCtx.fillText('กดปุ่ม "เปิดกล้องสด" หรือ "อัปโหลดคลิปสนามจริง" ด้านล่าง', w / 2, h / 2 + 6);

        liveCtx.fillStyle = '#64748b';
        liveCtx.font = '11px Prompt, sans-serif';
        liveCtx.fillText('AI จะตรวจจับเส้นคอร์ทจริง ตาข่าย (Net) ผู้เล่น ความเร็วลูกตบ และนับแต้มอัตโนมัติ', w / 2, h / 2 + 30);
        return;
    }

    liveCtx.drawImage(webcamVideo, 0, 0, w, h);

    if (!isTrackingPaused) {
        runRealPoseEstimation(webcamVideo);
        const cvRes = ShuttleCV.analyzeVideoFrameCV(webcamVideo, detectedHumanBoxes);
        processRealShuttleAndRally(cvRes);
        updateCVConfidenceBadges();
    }

    const chkCourtLines = document.getElementById('chkShowCourtLines')?.checked ?? true;
    const showCourtOverlay = isCalibratingCourt || (chkCourtLines && ShuttleCV.isCourtValidOrLocked());

    if (showCourtOverlay) {
        drawHomographyCourtAndNet(liveCtx, w, h);
    } else if (!ShuttleCV.isCourtValidOrLocked()) {
        liveCtx.save();
        const boxW = Math.min(w - 24, 420);
        const boxH = 36;
        const bx = (w - boxW) / 2;
        const by = h - 68;
        liveCtx.fillStyle = 'rgba(9, 13, 22, 0.85)';
        liveCtx.beginPath();
        liveCtx.roundRect(bx, by, boxW, boxH, 10);
        liveCtx.fill();
        liveCtx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
        liveCtx.lineWidth = 1.2;
        liveCtx.stroke();

        liveCtx.fillStyle = '#fbbf24';
        liveCtx.font = '600 11px Prompt, sans-serif';
        liveCtx.textAlign = 'center';
        liveCtx.fillText('กดปุ่ม "ล็อกพิกัดเส้นสนาม & เน็ท" เพื่อทาบเส้นคอร์ทให้ตรงกับมุมกล้องของคุณ', w / 2, by + 22);
        liveCtx.restore();
    }

    drawRealDetectedPlayers(liveCtx, w, h);
    drawRealShuttleAndHawkeye(liveCtx, w, h);

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

    const sInset = 0.0754;
    const lService = 0.0567;
    const sServiceTop = 0.3522;
    const sServiceBot = 0.6478;

    drawMetricLine(0, 0, 1, 0);
    drawMetricLine(1, 0, 1, 1);
    drawMetricLine(1, 1, 0, 1);
    drawMetricLine(0, 1, 0, 0);

    const singlesColor = !isDoublesMatch ? 'rgba(34, 211, 238, 0.95)' : null;
    drawMetricLine(sInset, 0, sInset, 1, false, singlesColor);
    drawMetricLine(1 - sInset, 0, 1 - sInset, 1, false, singlesColor);

    drawMetricLine(0, sServiceTop, 1, sServiceTop);
    drawMetricLine(0, sServiceBot, 1, sServiceBot);
    drawMetricLine(0, lService, 1, lService);
    drawMetricLine(0, 1 - lService, 1, 1 - lService);
    drawMetricLine(0.5, 0, 0.5, sServiceTop);
    drawMetricLine(0.5, sServiceBot, 0.5, 1);

    const netFloorL = ShuttleCV.courtNormalizedToScreen(0, 0.5);
    const netFloorR = ShuttleCV.courtNormalizedToScreen(1, 0.5);
    const corners = ShuttleCV.getCorners();
    const netTopL = corners.netL;
    const netTopR = corners.netR;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.beginPath();
    ctx.moveTo(netFloorL.x * w, netFloorL.y * h);
    ctx.lineTo(netFloorR.x * w, netFloorR.y * h);
    ctx.lineTo(netTopR.x * w, netTopR.y * h);
    ctx.lineTo(netTopL.x * w, netTopL.y * h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(netFloorL.x * w, netFloorL.y * h);
    ctx.lineTo(netTopL.x * w, netTopL.y * h);
    ctx.moveTo(netFloorR.x * w, netFloorR.y * h);
    ctx.lineTo(netTopR.x * w, netTopR.y * h);
    ctx.stroke();

    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(netTopL.x * w, netTopL.y * h);
    ctx.lineTo(netTopR.x * w, netTopR.y * h);
    ctx.stroke();
    ctx.shadowBlur = 0;

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

        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

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

    if (draggingHandleKey && dragPointerPos && webcamVideo.readyState >= 2) {
        const loupeRadius = 56;
        const zoom = 3.0;
        const targetX = dragPointerPos.x * w;
        const targetY = dragPointerPos.y * h;
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
        if (!p.detected) return;

        const px = p.screenX * w;
        const py = p.screenY * h;

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

        ctx.save();
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(px, py, 20, 8, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

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
        courtConfEl.textContent = locked ? `คอร์ท: ล็อกแล้ว` : `คอร์ท: ${cConf}%`;
        courtConfEl.className = (locked || cConf >= 60)
            ? 'text-[10px] font-semibold text-emerald-300'
            : 'text-[10px] font-semibold text-amber-300';
    }
    if (netConfEl) {
        netConfEl.textContent = locked ? `เน็ท: ล็อกแล้ว` : `เน็ท: ${nConf}%`;
    }
}

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
