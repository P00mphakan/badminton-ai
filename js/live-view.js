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

let videoRenderRect = { x: 0, y: 0, w: 800, h: 450 };
let isBottomDockHidden = false;
let lastAppliedPortraitState = null;

function detectAutoPortraitState() {
    if ((isUploadedVideoActive || isWebcamActive) && webcamVideo.videoWidth > 0 && webcamVideo.videoHeight > 0) {
        return webcamVideo.videoHeight >= webcamVideo.videoWidth;
    }
    if (window.matchMedia) {
        return window.matchMedia('(orientation: portrait)').matches;
    }
    return window.innerHeight >= window.innerWidth;
}

function applyOrientationLayout() {
    const badgeText = document.getElementById('orientationBadgeText');
    const icon = document.getElementById('orientationIcon');
    const btnLabel = document.getElementById('btnOrientationLabel');

    if (orientationSetting === 'auto') {
        isPortraitViewport = detectAutoPortraitState();
        const modeTxt = isPortraitViewport ? 'แนวตั้ง Auto' : 'แนวนอน Auto';
        if (btnLabel) btnLabel.textContent = `มุมมอง: ${modeTxt}`;
        if (badgeText) badgeText.textContent = modeTxt;
    } else if (orientationSetting === 'portrait') {
        isPortraitViewport = true;
        if (btnLabel) btnLabel.textContent = 'มุมมอง: แนวตั้ง';
        if (badgeText) badgeText.textContent = 'แนวตั้ง';
    } else {
        isPortraitViewport = false;
        if (btnLabel) btnLabel.textContent = 'มุมมอง: แนวนอน';
        if (badgeText) badgeText.textContent = 'แนวนอน';
    }

    if (icon) {
        icon.className = isPortraitViewport
            ? 'ph-bold ph-device-mobile-camera'
            : 'ph-bold ph-device-mobile-camera rotate-90';
    }

    if (lastAppliedPortraitState !== isPortraitViewport) {
        lastAppliedPortraitState = isPortraitViewport;
        if (window.ShuttleCV && ShuttleCV.resetCornersDefault) {
            ShuttleCV.resetCornersDefault(isPortraitViewport);
        }
    }
}

if (window.matchMedia) {
    window.matchMedia('(orientation: portrait)').addEventListener?.('change', () => {
        setTimeout(resizeCanvases, 80);
    });
}
webcamVideo.addEventListener('resize', () => {
    applyOrientationLayout();
});

function toggleBottomDockVisibility() {
    isBottomDockHidden = !isBottomDockHidden;
    const dock = document.getElementById('floatingBottomDock');
    const lbl = document.getElementById('lblToggleHudDock');
    if (dock) {
        dock.classList.toggle('hidden', isBottomDockHidden);
    }
    if (lbl) {
        lbl.textContent = isBottomDockHidden ? 'แสดงปุ่ม' : 'ซ่อนปุ่ม';
    }
}

function toggleBrowserFullscreen() {
    const icon = document.getElementById('fullscreenIcon');
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
        if (icon) icon.className = 'ph-bold ph-corners-in';
    } else {
        document.exitFullscreen?.().catch(() => {});
        if (icon) icon.className = 'ph-bold ph-corners-out';
    }
}

function cycleCameraOrientation() {
    if (orientationSetting === 'auto') orientationSetting = 'portrait';
    else if (orientationSetting === 'portrait') orientationSetting = 'landscape';
    else orientationSetting = 'auto';

    lastAppliedPortraitState = null;
    applyOrientationLayout();
    resizeCanvases();
    const labelMap = { auto: 'Auto (ตรวจจับอัตโนมัติ)', portrait: 'แนวตั้ง (Portrait)', landscape: 'แนวนอน (Landscape)' };
    showToast(`สลับโหมดมุมมองเป็น: ${labelMap[orientationSetting]}`);
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
            // Standard sensor resolution: iOS Safari automatically rotates the video track to Portrait
            // when the phone is held vertically (1080x1920) and Landscape when held horizontally (1920x1080).
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: 60 }
                },
                audio: false
            });
            webcamVideo.srcObject = stream;
            webcamVideo.loop = false;
            await webcamVideo.play();
            isWebcamActive = true;
            // Do NOT lock fake court overlay before a real court is detected or calibrated by the user
            ShuttleCV.setCourtLocked(false);
            if (btnText) btnText.textContent = 'ปิดกล้อง';
            initPoseDetectionModel();
            applyOrientationLayout();
            resizeCanvases();
            showToast('เปิดกล้องสดแล้ว • เล็งไปที่คอร์ทจริงแล้วกด "ตั้งเส้น" หรือ "สแกนเส้น"');
        } catch (err) {
            showToast('ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตสิทธิ์กล้อง หรืออัปโหลดคลิปสนามจริง');
        }
    } else {
        if (webcamVideo.srcObject) {
            webcamVideo.srcObject.getTracks().forEach(t => t.stop());
            webcamVideo.srcObject = null;
        }
        isWebcamActive = false;
        if (btnText) btnText.textContent = 'กล้องสด';
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
        const btnText = document.getElementById('cameraBtnText');
        if (btnText) btnText.textContent = 'กล้องสด';
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
        ShuttleCV.setCourtLocked(true);
        initPoseDetectionModel();
        resetMatchData(true);
        webcamVideo.play();
        resizeCanvases();
        setTimeout(() => {
            if (ShuttleCV.refineCourtToLines) {
                ShuttleCV.refineCourtToLines(webcamVideo, detectedHumanBoxes);
            }
        }, 250);
        showToast(`โหลดคลิป "${file.name}" สำเร็จ! ล็อกเส้นสนาม & ตรวจจับเฉพาะในคอร์ท`);
    };
}

function setVideoSpeed(rate) {
    webcamVideo.playbackRate = rate;
    const btn = document.getElementById('btnVideoSpeed');
    if (btn) btn.textContent = `${rate.toFixed(1)}x`;
}

function cycleVideoSpeed() {
    const cur = webcamVideo.playbackRate || 1.0;
    const next = cur === 1.0 ? 0.5 : (cur === 0.5 ? 1.5 : 1.0);
    setVideoSpeed(next);
}

function toggleMoreSheet() {
    const sheet = document.getElementById('moreSheet');
    if (sheet) sheet.classList.toggle('hidden');
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
        showToast('กรุณาเปิดกล้องสดหรืออัปโหลดคลิปสนามก่อนตั้งเส้นสนาม');
        return;
    }
    isCalibratingCourt = !isCalibratingCourt;
    const icon = document.getElementById('calibIcon');
    const label = document.getElementById('calibLabel');
    if (isCalibratingCourt) {
        ShuttleCV.setCourtLocked(true);
        if (icon) icon.className = 'ph-fill ph-check-fat text-emerald-400';
        if (label) label.textContent = 'บันทึกเส้น';
        showToast('ลากจุดมุมคอร์ท 4 จุด และหัวเน็ท 2 ข้างให้ตรงเส้นจริง (มีแว่นขยาย 3x)');
    } else {
        if (ShuttleCV.refineCourtToLines) {
            ShuttleCV.refineCourtToLines(webcamVideo, detectedHumanBoxes);
        }
        ShuttleCV.setCourtLocked(true);
        if (icon) icon.className = 'ph-bold ph-crosshair text-amber-300';
        if (label) label.textContent = 'ตั้งเส้น';
        showToast('ล็อกพิกัดเส้นสนาม 13.40m × 6.10m เรียบร้อย (ไม่ตรวจจับคนนอกเส้น)');
    }
}

function triggerAutoSnapCourtCV() {
    if (!isWebcamActive && !isUploadedVideoActive) {
        showToast('กรุณาเปิดกล้องสดหรืออัปโหลดคลิปก่อนสแกนเส้นสนาม');
        return;
    }
    const refineRes = ShuttleCV.refineCourtToLines ? ShuttleCV.refineCourtToLines(webcamVideo, detectedHumanBoxes) : null;
    ShuttleCV.setCourtLocked(true);
    if (refineRes && refineRes.ok) {
        showToast(`ดูดเข้าหาเส้นขาวสนามจริงสำเร็จ! (ความคลาดเคลื่อนเฉลี่ย ${refineRes.rmsPx} px)`);
    } else {
        showToast('ล็อกเส้นสนามแล้ว • กดปุ่ม "ตั้งเส้น" เพื่อเล็งมุมคอร์ทด้วยแว่นขยาย 3x ได้ทันที');
    }
}

function getPointerNormPos(evt) {
    const rect = liveCanvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const rw = videoRenderRect.w || rect.width;
    const rh = videoRenderRect.h || rect.height;
    return {
        x: Math.max(0.01, Math.min(0.99, (px - videoRenderRect.x) / rw)),
        y: Math.max(0.01, Math.min(0.99, (py - videoRenderRect.y) / rh))
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

    // Keep orientation badge & court preset synced if stream dimensions changed
    const vW = webcamVideo.videoWidth || w;
    const vH = webcamVideo.videoHeight || h;
    if (orientationSetting === 'auto' && ((vH >= vW) !== isPortraitViewport)) {
        applyOrientationLayout();
    }

    // Fill background with clean web background (#090d16)
    liveCtx.fillStyle = '#090d16';
    liveCtx.fillRect(0, 0, w, h);

    // 100% Aspect-Ratio-Preserving Render (NEVER stretches vertically or horizontally):
    // - When camera orientation matches screen orientation in Live Camera mode: use cover scale so camera fills screen naturally.
    // - When video/camera orientation differs from screen, or in Uploaded Video mode: use contain scale so 100% of frame & court lines fit without distortion.
    const videoIsPortrait = vH >= vW;
    const screenIsPortrait = h >= w;
    const useCoverScale = isWebcamActive && !isCalibratingCourt && (videoIsPortrait === screenIsPortrait);
    const scale = useCoverScale
        ? Math.max(w / vW, h / vH)
        : Math.min(w / vW, h / vH);

    const rw = Math.round(vW * scale);
    const rh = Math.round(vH * scale);
    const rx = Math.round((w - rw) / 2);
    const ry = Math.round((h - rh) / 2);
    videoRenderRect = { x: rx, y: ry, w: rw, h: rh };
    liveCtx.drawImage(webcamVideo, rx, ry, rw, rh);

    if (!isTrackingPaused) {
        runRealPoseEstimation(webcamVideo);
        const cvRes = ShuttleCV.analyzeVideoFrameCV(webcamVideo, detectedHumanBoxes);
        processRealShuttleAndRally(cvRes);
        updateCVConfidenceBadges();
    }

    const chkCourtLines = document.getElementById('chkShowCourtLines')?.checked ?? true;
    const showCourtOverlay = isCalibratingCourt || (chkCourtLines && ShuttleCV.isCourtValidOrLocked());

    // Render all court, net, player, and shuttle graphics clipped strictly inside the video frame
    liveCtx.save();
    liveCtx.translate(videoRenderRect.x, videoRenderRect.y);
    liveCtx.beginPath();
    liveCtx.rect(0, 0, rw, rh);
    liveCtx.clip();

    if (showCourtOverlay) {
        drawHomographyCourtAndNet(liveCtx, rw, rh);
    } else if (!ShuttleCV.isCourtValidOrLocked()) {
        liveCtx.save();
        const boxW = Math.min(rw - 24, 420);
        const boxH = 36;
        const bx = (rw - boxW) / 2;
        const by = rh - 140;
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
        liveCtx.fillText('กดปุ่ม "ล็อกเส้น & เน็ท" เพื่อทาบเส้นคอร์ทให้ตรงกับมุมกล้องของคุณ', rw / 2, by + 22);
        liveCtx.restore();
    }

    drawRealDetectedPlayers(liveCtx, rw, rh);
    drawRealShuttleAndHawkeye(liveCtx, rw, rh);

    if (isCalibratingCourt) {
        drawCalibrationHandlesAndLoupe(liveCtx, rw, rh);
    }
    liveCtx.restore();
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
        tl: 'เส้นหลังซ้าย (TL)',
        tr: 'เส้นหลังขวา (TR)',
        br: 'เส้นเสิร์ฟขวา (SR)',
        bl: 'เส้นเสิร์ฟซ้าย (SL)',
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

        // Perspective scale factor based on court depth (far court v~0.25 -> 0.72x, near court v~0.75 -> 1.18x)
        const depthScale = 0.62 + Math.max(0, Math.min(1, p.v)) * 0.65;
        const ringRx = 18 * depthScale;
        const ringRy = 7 * depthScale;

        // Tactical torso bracket above the floor ring
        const boxW = 30 * depthScale;
        const boxH = 56 * depthScale;
        const bx = px - boxW / 2;
        const by = py - boxH;
        const cLen = 6 * depthScale;

        ctx.save();
        ctx.strokeStyle = p.color + 'aa';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(bx, by + cLen); ctx.lineTo(bx, by); ctx.lineTo(bx + cLen, by);
        ctx.moveTo(bx + boxW - cLen, by); ctx.lineTo(bx + boxW, by); ctx.lineTo(bx + boxW, by + cLen);
        ctx.moveTo(bx, by + boxH - cLen); ctx.lineTo(bx, by + boxH); ctx.lineTo(bx + cLen, by + boxH);
        ctx.moveTo(bx + boxW - cLen, by + boxH); ctx.lineTo(bx + boxW, by + boxH); ctx.lineTo(bx + boxW, by + boxH - cLen);
        ctx.stroke();

        // Dual concentric glowing floor rings (Pro Hawkeye / Broadcast style)
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.ellipse(px, py, ringRx, ringRy, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffffcc';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(px, py, ringRx * 0.48, ringRy * 0.48, 0, 0, Math.PI * 2);
        ctx.stroke();

        const label = `${p.id} • ${p.currentSpeedKmh} km/h`;
        ctx.font = 'bold 10px Prompt, sans-serif';
        const tw = ctx.measureText(label).width + 12;
        const labelY = py + ringRy + 4;
        ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
        ctx.beginPath();
        ctx.roundRect(px - tw / 2, labelY, tw, 16, 6);
        ctx.fill();
        ctx.strokeStyle = p.color + '66';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = p.color;
        ctx.textAlign = 'center';
        ctx.fillText(label, px, labelY + 11.5);
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
        if (pauseBtnText) pauseBtnText.textContent = 'เล่นต่อ';
        if (pauseIcon) pauseIcon.className = 'ph-fill ph-play text-emerald-400';
    } else {
        if (isUploadedVideoActive) webcamVideo.play();
        if (pauseBtnText) pauseBtnText.textContent = 'หยุด';
        if (pauseIcon) pauseIcon.className = 'ph-fill ph-pause';
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
        const tStr = formatTimeSec(matchSeconds);
        const el = document.getElementById('matchTimer');
        const liveEl = document.getElementById('liveMatchTimer');
        if (el) el.textContent = tStr;
        if (liveEl) liveEl.textContent = tStr;
    }
}, 1000);
