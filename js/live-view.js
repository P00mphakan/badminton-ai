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

// Multi-Lens (0.5x, 1x, 2x, 5x) and Native Mobile Sensor Pixels State
let activeCameraZoom = 1.0;
let cameraResolutionPreference = 'native'; // 'native' (1080p/4K ideal) | '1080p' | '720p'
let currentDigitalZoom = 1.0;
let availableCameraLenses = [];
let activeVideoDeviceId = null;
let activeVideoTrack = null;
let currentNativePixels = { width: 0, height: 0, fps: 60 };

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
    toggleVerticalDockCollapse();
}

function toggleVerticalDockCollapse(forceCollapse) {
    const card = document.getElementById('verticalDockCard');
    const expandTab = document.getElementById('btnExpandVerticalDock');
    if (!card || !expandTab) return;

    isBottomDockHidden = typeof forceCollapse === 'boolean' ? forceCollapse : !isBottomDockHidden;
    if (isBottomDockHidden) {
        card.classList.add('is-collapsed');
        expandTab.classList.remove('hidden');
    } else {
        card.classList.remove('is-collapsed');
        expandTab.classList.add('hidden');
    }
}

(function initVerticalDockSwipeGesture() {
    let startX = 0;
    let startY = 0;
    window.addEventListener('DOMContentLoaded', () => {
        const card = document.getElementById('verticalDockCard');
        const expandTab = document.getElementById('btnExpandVerticalDock');
        if (card) {
            card.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }, { passive: true });
            card.addEventListener('touchend', (e) => {
                const dx = (e.changedTouches[0]?.clientX || 0) - startX;
                const dy = Math.abs((e.changedTouches[0]?.clientY || 0) - startY);
                if (dx < -35 && dy < 45) {
                    toggleVerticalDockCollapse(true);
                }
            }, { passive: true });
        }
        if (expandTab) {
            expandTab.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
            }, { passive: true });
            expandTab.addEventListener('touchend', (e) => {
                const dx = (e.changedTouches[0]?.clientX || 0) - startX;
                if (dx > 25) {
                    toggleVerticalDockCollapse(false);
                }
            }, { passive: true });
        }
    });
})();

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

let rawMediaRecorder = null;
let rawRecordedChunks = [];
let rawRecStartTime = 0;
let rawRecTimerInterval = null;
let isRecordingRawVideo = false;

function getResolutionConstraints(resMode) {
    if (resMode === '720p') {
        return {
            width: { ideal: 1280, max: 1280 },
            height: { ideal: 720, max: 720 },
            frameRate: { ideal: 60, min: 30 }
        };
    }
    if (resMode === '1080p') {
        return {
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 },
            frameRate: { ideal: 60, min: 30 }
        };
    }
    // 'native' mode: Request maximum native sensor pixels according to each mobile phone (1080p / 4K)
    return {
        width: { ideal: 1920, max: 3840, min: 640 },
        height: { ideal: 1080, max: 2160, min: 480 },
        frameRate: { ideal: 60, min: 30 }
    };
}

async function detectCameraLenses() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        availableCameraLenses = [];

        videoInputs.forEach((dev, idx) => {
            const label = (dev.label || '').toLowerCase();
            const isFront = label.includes('front') || label.includes('face') || label.includes('user');
            const isUltraWide = label.includes('ultra') || label.includes('0.5') || label.includes('wide-angle') || label.includes('มุมกว้าง');
            const isTele = label.includes('tele') || label.includes('zoom') || label.includes('2x') || label.includes('3x') || label.includes('5x');

            if (!isFront) {
                availableCameraLenses.push({
                    deviceId: dev.deviceId,
                    label: dev.label || `Camera ${idx + 1}`,
                    isUltraWide,
                    isTele,
                    suggestedZoom: isUltraWide ? 0.5 : (isTele ? 2.0 : 1.0)
                });
            }
        });
    } catch (e) {
        console.warn('Camera enumeration error:', e);
    }
}

function updateCameraLensUI() {
    const zoomKeys = [
        { z: 0.5, id: 'btnLens05', sheetId: 'sheetBtnLens05' },
        { z: 1.0, id: 'btnLens10', sheetId: 'sheetBtnLens10' },
        { z: 2.0, id: 'btnLens20', sheetId: 'sheetBtnLens20' },
        { z: 5.0, id: 'btnLens50', sheetId: 'sheetBtnLens50' }
    ];

    zoomKeys.forEach(item => {
        const btn = document.getElementById(item.id);
        const sBtn = document.getElementById(item.sheetId);
        const isActive = Math.abs(activeCameraZoom - item.z) < 0.05;
        if (btn) {
            if (isActive) btn.classList.add('is-active');
            else btn.classList.remove('is-active');
        }
        if (sBtn) {
            if (isActive) sBtn.classList.add('is-active');
            else sBtn.classList.remove('is-active');
        }
    });

    let resLabel = 'Auto';
    const w = currentNativePixels.width || webcamVideo.videoWidth || 0;
    const h = currentNativePixels.height || webcamVideo.videoHeight || 0;
    if (w >= 3800 || h >= 2100) resLabel = '4K UHD';
    else if (w >= 1900 || h >= 1000) resLabel = '1080p FHD';
    else if (w >= 1200 || h >= 700) resLabel = '720p HD';
    else if (w > 0) resLabel = `${w}p`;

    const lensText = activeCameraZoom === 0.5 ? '0.5x (Ultra Wide)'
        : (activeCameraZoom === 1.0 ? '1.0x (Standard)'
        : (activeCameraZoom === 2.0 ? '2.0x (Telephoto)' : '5.0x (Super Zoom)'));

    const hudCamText = document.getElementById('hudCamInfoText');
    if (hudCamText) {
        hudCamText.textContent = `${activeCameraZoom}x • ${resLabel}`;
    }

    const sheetLensBadge = document.getElementById('sheetActiveLensBadge');
    if (sheetLensBadge) {
        sheetLensBadge.textContent = `${activeCameraZoom}x • ${resLabel}`;
    }

    const sheetLensDesc = document.getElementById('sheetActiveLensDesc');
    if (sheetLensDesc) {
        sheetLensDesc.textContent = `${lensText}`;
    }

    const sheetResText = document.getElementById('sheetNativeResolutionText');
    if (sheetResText) {
        sheetResText.textContent = w > 0 ? `${w} × ${h} (${resLabel})` : 'Auto (Native)';
    }

    const sheetStatus = document.getElementById('sheetCamStatusDetail');
    if (sheetStatus) {
        if (w > 0) {
            sheetStatus.textContent = `ใช้งานเซนเซอร์จริง: ${w} × ${h} @ ${currentNativePixels.fps}fps (${resLabel})`;
        } else {
            sheetStatus.textContent = 'พร้อมตรวจจับและใช้ความละเอียดพิกเซลสูงสุดตามสเปกเซนเซอร์ของมือถือ';
        }
    }
}

async function setCameraZoomOrLens(targetZoom) {
    if (!isWebcamActive || !webcamVideo.srcObject) {
        showToast('กรุณากดเปิด "กล้องสด" ก่อนเลือกเลนส์กล้อง');
        return;
    }

    const track = webcamVideo.srcObject.getVideoTracks()[0];
    if (!track) return;

    let hardwareApplied = false;

    // 1. Try Hardware Optical/Sensor Zoom via MediaStreamTrack applyConstraints (Chrome Android & modern Safari)
    if (track.getCapabilities) {
        const caps = track.getCapabilities();
        if (caps && caps.zoom) {
            const minZ = caps.zoom.min || 1;
            const maxZ = caps.zoom.max || 1;
            if (targetZoom >= minZ && targetZoom <= maxZ) {
                try {
                    await track.applyConstraints({ advanced: [{ zoom: targetZoom }] });
                    hardwareApplied = true;
                    currentDigitalZoom = 1.0;
                } catch (e) {
                    console.warn('Hardware zoom error:', e);
                }
            }
        }
    }

    // 2. Physical device switching for 0.5x Ultra Wide or Telephoto (iOS Safari & multi-camera Android)
    if (!hardwareApplied && targetZoom === 0.5) {
        const ultraWideDev = availableCameraLenses.find(d => d.isUltraWide);
        if (ultraWideDev && ultraWideDev.deviceId !== activeVideoDeviceId) {
            await switchCameraDevice(ultraWideDev.deviceId, 0.5);
            hardwareApplied = true;
        }
    }

    if (!hardwareApplied && targetZoom === 1.0) {
        const standardDev = availableCameraLenses.find(d => !d.isUltraWide && !d.isTele);
        if (standardDev && standardDev.deviceId !== activeVideoDeviceId) {
            await switchCameraDevice(standardDev.deviceId, 1.0);
            hardwareApplied = true;
        } else {
            currentDigitalZoom = 1.0;
            hardwareApplied = true;
        }
    }

    if (!hardwareApplied && (targetZoom === 2.0 || targetZoom === 5.0)) {
        const teleDev = availableCameraLenses.find(d => d.isTele);
        if (teleDev && teleDev.deviceId !== activeVideoDeviceId) {
            await switchCameraDevice(teleDev.deviceId, targetZoom);
            hardwareApplied = true;
        }
    }

    // 3. Fallback to native high-pixel digital crop if hardware optical wasn't applied
    if (!hardwareApplied) {
        if (targetZoom === 0.5) {
            showToast('อุปกรณ์นี้ไม่มีโมดูลกล้อง Ultra Wide (0.5x) ในระดับฮาร์ดแวร์');
            activeCameraZoom = 1.0;
            currentDigitalZoom = 1.0;
        } else {
            currentDigitalZoom = targetZoom;
            activeCameraZoom = targetZoom;
        }
    } else {
        activeCameraZoom = targetZoom;
    }

    updateCameraLensUI();
    const zoomTitle = activeCameraZoom === 0.5 ? '0.5x (Ultra Wide)'
        : (activeCameraZoom === 1.0 ? '1.0x (มาตรฐาน)'
        : (activeCameraZoom === 2.0 ? '2.0x (ซูม)' : '5.0x (ซูมไกล)'));
    showToast(`สลับเลนส์: ${zoomTitle} • พิกเซล ${currentNativePixels.width || webcamVideo.videoWidth}×${currentNativePixels.height || webcamVideo.videoHeight}`);
}

async function switchCameraDevice(deviceId, targetZoom) {
    if (!webcamVideo.srcObject) return;
    try {
        webcamVideo.srcObject.getTracks().forEach(t => t.stop());

        const resConstraints = getResolutionConstraints(cameraResolutionPreference);
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: { exact: deviceId },
                    ...resConstraints
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
        } catch (e) {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: { exact: deviceId },
                    ...resConstraints
                },
                audio: false
            });
        }

        webcamVideo.srcObject = stream;
        await webcamVideo.play();
        activeVideoDeviceId = deviceId;
        activeVideoTrack = stream.getVideoTracks()[0];
        currentDigitalZoom = 1.0;

        const settings = activeVideoTrack.getSettings ? activeVideoTrack.getSettings() : {};
        currentNativePixels.width = settings.width || webcamVideo.videoWidth || 1920;
        currentNativePixels.height = settings.height || webcamVideo.videoHeight || 1080;
        currentNativePixels.fps = settings.frameRate ? Math.round(settings.frameRate) : 60;

        applyOrientationLayout();
        resizeCanvases();
    } catch (err) {
        console.error('switchCameraDevice error:', err);
        showToast('ไม่สามารถสลับกล้องที่เลือกได้');
    }
}

async function setCameraResolutionPreference(mode) {
    cameraResolutionPreference = mode;
    ['native', '1080p', '720p'].forEach(m => {
        const btn = document.getElementById(`btnRes${m === 'native' ? 'Native' : m}`);
        if (btn) {
            if (m === mode) btn.classList.add('is-active');
            else btn.classList.remove('is-active');
        }
    });

    if (isWebcamActive && webcamVideo.srcObject && activeVideoTrack) {
        const resConstraints = getResolutionConstraints(mode);
        try {
            await activeVideoTrack.applyConstraints(resConstraints);
            const settings = activeVideoTrack.getSettings ? activeVideoTrack.getSettings() : {};
            currentNativePixels.width = settings.width || webcamVideo.videoWidth;
            currentNativePixels.height = settings.height || webcamVideo.videoHeight;
            currentNativePixels.fps = settings.frameRate ? Math.round(settings.frameRate) : 60;
            updateCameraLensUI();
            showToast(`ปรับความละเอียดกล้องเป็น: ${currentNativePixels.width}×${currentNativePixels.height} @ ${currentNativePixels.fps}fps`);
        } catch (e) {
            // Reinitialize webcam stream with new constraints
            await toggleWebcam();
            await toggleWebcam();
        }
    } else {
        updateCameraLensUI();
    }
}

async function toggleWebcam() {
    const btnText = document.getElementById('cameraBtnText');
    if (isUploadedVideoActive) exitUploadedVideoMode();

    if (!isWebcamActive) {
        try {
            const resConstraints = getResolutionConstraints(cameraResolutionPreference);
            const videoConstraints = {
                facingMode: { ideal: 'environment' },
                ...resConstraints
            };

            // Request video and audio (with fallback to video-only if mic permission is declined)
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: videoConstraints,
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });
            } catch (micErr) {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: videoConstraints,
                    audio: false
                });
            }
            webcamVideo.srcObject = stream;
            webcamVideo.muted = true; // Prevent speaker feedback loop while recording mic audio
            webcamVideo.loop = false;
            await webcamVideo.play();
            isWebcamActive = true;
            ShuttleCV.setCourtLocked(true);
            if (btnText) btnText.textContent = 'ปิดกล้อง';

            const track = stream.getVideoTracks()[0];
            activeVideoTrack = track;
            activeVideoDeviceId = track.getSettings?.().deviceId || null;
            const settings = track.getSettings ? track.getSettings() : {};
            currentNativePixels.width = settings.width || webcamVideo.videoWidth || 1920;
            currentNativePixels.height = settings.height || webcamVideo.videoHeight || 1080;
            currentNativePixels.fps = settings.frameRate ? Math.round(settings.frameRate) : 60;

            await detectCameraLenses();
            updateCameraLensUI();

            const lensSelector = document.getElementById('cameraLensSelector');
            if (lensSelector) lensSelector.classList.remove('hidden');
            const camBadge = document.getElementById('hudCamInfoBadge');
            if (camBadge) camBadge.classList.remove('hidden');

            initPoseDetectionModel();
            applyOrientationLayout();
            resizeCanvases();

            let resTitle = '1080p FHD';
            if (currentNativePixels.width >= 3800) resTitle = '4K UHD';
            else if (currentNativePixels.width <= 1280) resTitle = '720p HD';
            showToast(`เปิดกล้องสดแล้ว (${resTitle} • ${currentNativePixels.width}×${currentNativePixels.height}) • เลือกเลนส์ .5x, 1x, 2x, 5x ได้ทันที`);
        } catch (err) {
            showToast('ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตสิทธิ์กล้อง หรืออัปโหลดคลิปสนามจริง');
        }
    } else {
        if (isRecordingRawVideo) {
            stopRawVideoRecording();
        }
        if (webcamVideo.srcObject) {
            webcamVideo.srcObject.getTracks().forEach(t => t.stop());
            webcamVideo.srcObject = null;
        }
        activeVideoTrack = null;
        isWebcamActive = false;
        currentDigitalZoom = 1.0;
        if (btnText) btnText.textContent = 'Live';

        const lensSelector = document.getElementById('cameraLensSelector');
        if (lensSelector) lensSelector.classList.add('hidden');
        const camBadge = document.getElementById('hudCamInfoBadge');
        if (camBadge) camBadge.classList.add('hidden');

        showToast('ปิดกล้องสดแล้ว');
    }
}

function getSupportedRecorderMimeType() {
    const candidates = [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
    ];
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
    return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function updateRawRecordUI(recording) {
    const iconWrap = document.getElementById('recRawIconWrap');
    const icon = document.getElementById('recRawIcon');
    const label = document.getElementById('recRawLabel');
    const sheetLabel = document.getElementById('sheetRecRawLabel');
    const topDot = document.getElementById('recDot');
    const collapsedDot = document.getElementById('collapsedDockRecDot');

    if (recording) {
        if (iconWrap) iconWrap.className = 'dock-icon !bg-rose-500 text-white animate-pulse';
        if (icon) icon.className = 'ph-fill ph-stop text-white';
        if (label) label.textContent = '00:00';
        if (sheetLabel) sheetLabel.textContent = 'หยุดอัดคลิป';
        if (topDot) topDot.className = 'w-2 h-2 rounded-full bg-rose-500 animate-ping';
        if (collapsedDot) collapsedDot.classList.remove('hidden');
    } else {
        if (iconWrap) iconWrap.className = 'dock-icon';
        if (icon) icon.className = 'ph-fill ph-record text-rose-400';
        if (label) label.textContent = 'Record';
        if (sheetLabel) sheetLabel.textContent = 'อัดคลิปสด';
        if (topDot) topDot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400';
        if (collapsedDot) collapsedDot.classList.add('hidden');
    }
}

async function toggleRawVideoRecording() {
    if (isRecordingRawVideo) {
        stopRawVideoRecording();
        return;
    }
    if (!isWebcamActive || !webcamVideo.srcObject) {
        showToast('กรุณากดปุ่ม "กล้องสด" ก่อนเริ่มอัดคลิปวิดีโอต้นฉบับ');
        return;
    }
    if (typeof MediaRecorder === 'undefined') {
        showToast('เบราว์เซอร์ของคุณไม่รองรับการอัดวิดีโอโดยตรง');
        return;
    }

    try {
        rawRecordedChunks = [];
        const mimeType = getSupportedRecorderMimeType();
        // Space-saving compressed bitrates: ~1.8 Mbps video + 64 kbps audio (~13 MB per minute, sharp 720p, zero graphic overlay)
        const options = {
            videoBitsPerSecond: 1800000,
            audioBitsPerSecond: 64000
        };
        if (mimeType) options.mimeType = mimeType;

        rawMediaRecorder = new MediaRecorder(webcamVideo.srcObject, options);
        rawMediaRecorder.ondataavailable = (evt) => {
            if (evt.data && evt.data.size > 0) {
                rawRecordedChunks.push(evt.data);
            }
        };
        rawMediaRecorder.onstop = () => {
            finalizeAndSaveRawVideo(mimeType);
        };

        rawMediaRecorder.start(1000);
        isRecordingRawVideo = true;
        rawRecStartTime = Date.now();
        updateRawRecordUI(true);

        clearInterval(rawRecTimerInterval);
        rawRecTimerInterval = setInterval(() => {
            const elapsedSec = Math.floor((Date.now() - rawRecStartTime) / 1000);
            const label = document.getElementById('recRawLabel');
            if (label) label.textContent = formatTimeSec(elapsedSec);
        }, 500);

        showToast('เริ่มอัดวิดีโอต้นฉบับ (ภาพ+เสียง ไม่มีกราฟิกทับ บีบอัดขนาดประหยัดพื้นที่)');
    } catch (err) {
        console.error('MediaRecorder start error:', err);
        showToast('ไม่สามารถเริ่มอัดวิดีโอได้บนอุปกรณ์นี้');
    }
}

function stopRawVideoRecording() {
    clearInterval(rawRecTimerInterval);
    isRecordingRawVideo = false;
    updateRawRecordUI(false);
    if (rawMediaRecorder && rawMediaRecorder.state !== 'inactive') {
        rawMediaRecorder.stop();
    }
}

async function finalizeAndSaveRawVideo(mimeType) {
    if (!rawRecordedChunks.length) return;
    const isMp4 = (mimeType || '').includes('mp4');
    const ext = isMp4 ? 'mp4' : 'webm';
    const blobType = mimeType || (isMp4 ? 'video/mp4' : 'video/webm');
    const blob = new Blob(rawRecordedChunks, { type: blobType });
    rawRecordedChunks = [];

    const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
    const safeTitle = (matchTitle || 'badminton-raw').replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
    const fileName = `${safeTitle}-${Date.now().toString().slice(-5)}.${ext}`;

    // On iPhone/Android mobile browsers supporting Web Share API with files, offer native "Save Video" sheet
    try {
        const file = new File([blob], fileName, { type: blobType });
        if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
            await navigator.share({
                files: [file],
                title: matchTitle || 'Badminton Raw Video',
                text: `คลิปต้นฉบับ (${sizeMB} MB) ไม่มีกราฟิกทับ`
            });
            showToast(`บันทึกคลิปต้นฉบับ (${sizeMB} MB) ลงมือถือเรียบร้อย!`);
            return;
        }
    } catch (shareErr) {
        // If user dismissed share sheet or share failed, fall back to direct download link
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast(`ดาวน์โหลดคลิปต้นฉบับ "${fileName}" (${sizeMB} MB) สำเร็จ!`);
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
    const panel = document.getElementById('moreSheetPanel');
    if (!sheet) return;
    const willOpen = sheet.classList.contains('hidden');
    if (willOpen) {
        sheet.classList.remove('hidden');
        if (panel) {
            panel.style.transition = 'none';
            panel.style.transform = 'translateY(100%)';
            requestAnimationFrame(() => {
                panel.style.transition = 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)';
                panel.style.transform = 'translateY(0px)';
            });
        }
    } else {
        closeMoreSheet();
    }
}

function closeMoreSheet() {
    const sheet = document.getElementById('moreSheet');
    const panel = document.getElementById('moreSheetPanel');
    if (!sheet || sheet.classList.contains('hidden')) return;
    if (panel) {
        panel.style.transition = 'transform 0.22s ease-in';
        panel.style.transform = 'translateY(100%)';
        setTimeout(() => {
            sheet.classList.add('hidden');
            panel.style.transform = 'translateY(0px)';
        }, 210);
    } else {
        sheet.classList.add('hidden');
    }
}

// Mobile Touch Swipe-Down / Slide-to-Close Gesture for Hamburger Menu Card
(function initMoreSheetSwipeGesture() {
    let startY = 0;
    let startX = 0;
    let currentDY = 0;
    let isDraggingSheet = false;

    window.addEventListener('DOMContentLoaded', () => {
        const panel = document.getElementById('moreSheetPanel');
        const dragZone = document.getElementById('moreSheetDragZone');
        if (!panel) return;

        const onTouchStart = (e) => {
            const touch = e.touches ? e.touches[0] : e;
            // Allow swipe-to-close from the top drag handle OR anywhere when panel is scrolled to top
            const fromHandle = dragZone && dragZone.contains(e.target);
            if (!fromHandle && panel.scrollTop > 4) return;
            startY = touch.clientY;
            startX = touch.clientX;
            currentDY = 0;
            isDraggingSheet = true;
            panel.style.transition = 'none';
        };

        const onTouchMove = (e) => {
            if (!isDraggingSheet) return;
            const touch = e.touches ? e.touches[0] : e;
            const dy = touch.clientY - startY;
            const dx = touch.clientX - startX;
            if (dy > 0) {
                currentDY = dy;
                panel.style.transform = `translateY(${dy}px)`;
                if (e.cancelable) e.preventDefault();
            } else if (dx < -65 && Math.abs(dy) < 40) {
                // Also allow horizontal left-swipe to dismiss on mobile
                currentDY = 120;
            }
        };

        const onTouchEnd = () => {
            if (!isDraggingSheet) return;
            isDraggingSheet = false;
            panel.style.transition = 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)';
            if (currentDY > 70) {
                closeMoreSheet();
            } else {
                panel.style.transform = 'translateY(0px)';
            }
            currentDY = 0;
        };

        panel.addEventListener('touchstart', onTouchStart, { passive: true });
        panel.addEventListener('touchmove', onTouchMove, { passive: false });
        panel.addEventListener('touchend', onTouchEnd);
    });
})();

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
    const floatSaveBtn = document.getElementById('floatingSaveCalibBtn');
    if (isCalibratingCourt) {
        if (icon) icon.className = 'ph-fill ph-check-fat text-emerald-400 text-lg shrink-0';
        if (label) label.textContent = 'บันทึกเส้นสนาม';
        if (floatSaveBtn) floatSaveBtn.classList.remove('hidden');
        showToast('ลากจุดมุมคอร์ท 4 จุด และหัวเน็ท 2 ข้างให้ตรงเส้นจริง แล้วกด "บันทึกเส้นสนาม"');
    } else {
        if (ShuttleCV.updateHomography) {
            ShuttleCV.updateHomography();
        }
        ShuttleCV.setCourtLocked(true);
        if (icon) icon.className = 'ph-bold ph-crosshair text-amber-300 text-lg shrink-0';
        if (label) label.textContent = 'ตั้งเส้นสนาม';
        if (floatSaveBtn) floatSaveBtn.classList.add('hidden');
        showToast('ล็อกพิกัดเส้นสนาม 13.40m × 6.10m เรียบร้อยแล้ว');
    }
}

function triggerAutoSnapCourtCV() {
    if (!isWebcamActive && !isUploadedVideoActive) {
        showToast('กรุณาเปิดกล้องสดหรืออัปโหลดคลิปก่อนสแกนเส้นสนาม');
        return;
    }
    showToast('กำลังตรวจจับเส้นสนามอัตโนมัติ...');
    setTimeout(() => {
        try {
            const videoEl = isUploadedVideoActive ? uploadedVideo : webcamVideo;
            const refineRes = ShuttleCV.refineCourtToLines ? ShuttleCV.refineCourtToLines(videoEl, detectedHumanBoxes) : null;
            ShuttleCV.setCourtLocked(true);
            if (refineRes && refineRes.ok) {
                showToast(`ดูดเข้าหาเส้นขาวสนามจริงสำเร็จ! (ความคลาดเคลื่อน ${refineRes.rmsPx} px)`);
            } else {
                showToast('ล็อกเส้นสนามแล้ว • สามารถกด "ตั้งเส้น" เพื่อปรับแต่งมุมคอร์ท 4 จุดได้');
            }
        } catch (e) {
            ShuttleCV.setCourtLocked(true);
            showToast('ล็อกเส้นสนามตามพิกัดมาตรฐานเรียบร้อย');
        }
    }, 40);
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

/**
 * Original 3D Perspective Badminton Court & AI Analysis Hologram Graphic
 * Blends smoothly into #090d16 background without hard borders.
 */
function drawHomeBadmintonGraphic(ctx, w, h) {
    // 1. Background Fill with subtle digital grid
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#090d16');
    grad.addColorStop(0.5, '#0c1322');
    grad.addColorStop(1, '#090d16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(51, 65, 85, 0.18)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < w; gx += 48) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
    }
    for (let gy = 0; gy < h; gy += 48) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }

    const cx = w / 2;
    // Calculate vertical center so the graphic sits nicely above the text
    const cy = Math.max(h * 0.42, 160);
    const s = Math.min(Math.max(w / 440, 0.62), 1.05);

    ctx.save();

    // 2. Soft glowing aura behind court (Blends seamlessly into #090d16)
    const aura = ctx.createRadialGradient(cx, cy, 10 * s, cx, cy, 185 * s);
    aura.addColorStop(0, 'rgba(6, 182, 212, 0.14)');
    aura.addColorStop(0.4, 'rgba(14, 165, 233, 0.07)');
    aura.addColorStop(0.75, 'rgba(16, 185, 129, 0.02)');
    aura.addColorStop(1, 'rgba(9, 13, 22, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, cy, 195 * s, 0, Math.PI * 2);
    ctx.fill();

    // 3. 3D Perspective Court Geometry
    const farY = cy - 48 * s;
    const nearY = cy + 58 * s;
    const netY = cy + 6 * s;
    const farW = 90 * s;
    const nearW = 158 * s;

    // Court Surface Fill
    ctx.beginPath();
    ctx.moveTo(cx - farW, farY);
    ctx.lineTo(cx + farW, farY);
    ctx.lineTo(cx + nearW, nearY);
    ctx.lineTo(cx - nearW, nearY);
    ctx.closePath();
    const courtGrad = ctx.createLinearGradient(0, farY, 0, nearY);
    courtGrad.addColorStop(0, 'rgba(6, 182, 212, 0.03)');
    courtGrad.addColorStop(1, 'rgba(6, 182, 212, 0.08)');
    ctx.fillStyle = courtGrad;
    ctx.fill();

    // Court Boundary Lines with Neon Cyan Glow
    ctx.shadowBlur = 8 * s;
    ctx.shadowColor = 'rgba(34, 211, 238, 0.85)';
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = Math.max(1.2 * s, 1);
    ctx.stroke();

    // Center Longitude Line (dividing left/right court)
    ctx.beginPath();
    ctx.moveTo(cx, farY);
    ctx.lineTo(cx, nearY);
    ctx.stroke();

    // Singles Sidelines (insets)
    const farSingleW = farW * 0.85;
    const nearSingleW = nearW * 0.85;
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
    ctx.beginPath();
    ctx.moveTo(cx - farSingleW, farY);
    ctx.lineTo(cx - nearSingleW, nearY);
    ctx.moveTo(cx + farSingleW, farY);
    ctx.lineTo(cx + nearSingleW, nearY);
    ctx.stroke();

    // Short Service Lines (Front)
    const frontNearY = netY + 18 * s;
    const frontNearW = nearW * 0.58;
    const frontFarY = netY - 14 * s;
    const frontFarW = farW * 1.15;
    ctx.beginPath();
    ctx.moveTo(cx - frontFarW, frontFarY);
    ctx.lineTo(cx + frontFarW, frontFarY);
    ctx.moveTo(cx - frontNearW, frontNearY);
    ctx.lineTo(cx + frontNearW, frontNearY);
    ctx.stroke();

    // 4. Badminton Net (3D Perspective Barrier)
    const netTapeY = netY - 26 * s;
    const netPostW = (nearW + farW) * 0.52;

    // Semi-transparent Net Mesh
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.beginPath();
    ctx.moveTo(cx - netPostW, netTapeY);
    ctx.lineTo(cx + netPostW, netTapeY);
    ctx.lineTo(cx + netPostW, netY);
    ctx.lineTo(cx - netPostW, netY);
    ctx.closePath();
    ctx.fill();

    // Net Vertical Mesh Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 0.8;
    for (let x = -netPostW + 10 * s; x < netPostW; x += 12 * s) {
        ctx.beginPath();
        ctx.moveTo(cx + x, netTapeY);
        ctx.lineTo(cx + x, netY);
        ctx.stroke();
    }

    // Net Top Tape (White/Cyan Glow)
    ctx.shadowBlur = 6 * s;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(cx - netPostW, netTapeY);
    ctx.lineTo(cx + netPostW, netTapeY);
    ctx.stroke();

    // Net Posts
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.moveTo(cx - netPostW, netY + 4 * s);
    ctx.lineTo(cx - netPostW, netTapeY - 2 * s);
    ctx.moveTo(cx + netPostW, netY + 4 * s);
    ctx.lineTo(cx + netPostW, netTapeY - 2 * s);
    ctx.stroke();

    // 5. Opponent Silhouette in Far Court
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
    const oppX = cx + 42 * s;
    const oppY = farY + 12 * s;
    ctx.beginPath();
    ctx.arc(oppX, oppY - 18 * s, 4 * s, 0, Math.PI * 2); // Head
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(oppX - 6 * s, oppY - 14 * s); // Shoulders
    ctx.lineTo(oppX + 6 * s, oppY - 14 * s);
    ctx.lineTo(oppX + 4 * s, oppY);
    ctx.lineTo(oppX + 8 * s, oppY + 10 * s); // Legs
    ctx.lineTo(oppX + 3 * s, oppY + 10 * s);
    ctx.lineTo(oppX, oppY + 2 * s);
    ctx.lineTo(oppX - 4 * s, oppY + 10 * s);
    ctx.lineTo(oppX - 8 * s, oppY + 10 * s);
    ctx.closePath();
    ctx.fill();

    // 6. Hawk-Eye Parabolic Flight Trajectory Arc
    const startX = oppX;
    const startY = oppY - 12 * s;
    const apexX = cx + 58 * s;
    const apexY = cy - 98 * s;
    const landX = cx + 88 * s;
    const landY = cy + 44 * s;

    // Glowing Trajectory
    const trajGrad = ctx.createLinearGradient(startX, startY, landX, landY);
    trajGrad.addColorStop(0, '#38bdf8');
    trajGrad.addColorStop(0.4, '#fb923c');
    trajGrad.addColorStop(1, '#f97316');

    ctx.shadowBlur = 12 * s;
    ctx.shadowColor = 'rgba(249, 115, 22, 0.9)';
    ctx.strokeStyle = trajGrad;
    ctx.lineWidth = 2.5 * s;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(apexX, apexY, landX, landY);
    ctx.stroke();

    // 7. Hawk-Eye Landing Target Ring on Court Floor
    const now = Date.now();
    const pulsePhase = (now % 1400) / 1400;
    const ringR = (8 + pulsePhase * 14) * s;

    ctx.shadowBlur = 10 * s;
    ctx.shadowColor = 'rgba(249, 115, 22, 0.8)';
    ctx.strokeStyle = `rgba(249, 115, 22, ${1 - pulsePhase * 0.8})`;
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.ellipse(landX, landY, ringR * 1.5, ringR * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Inner Target Bullseye
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.ellipse(landX, landY, 5 * s, 2.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Holographic Call Tag ("IN • 186 km/h")
    ctx.shadowBlur = 6 * s;
    ctx.shadowColor = 'rgba(16, 185, 129, 0.6)';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.7)';
    ctx.lineWidth = 1;
    const tagX = landX + 16 * s;
    const tagY = landY - 22 * s;
    const tagW = 74 * s;
    const tagH = 18 * s;
    ctx.beginPath();
    ctx.roundRect(tagX, tagY, tagW, tagH, 5 * s);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#34d399';
    ctx.font = `bold ${Math.round(9 * s)}px Prompt, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('IN • 186 km/h', tagX + tagW / 2, tagY + tagH / 2 + 3 * s);

    // 8. Shuttlecock (Mid-flight heading down towards target)
    const shutX = cx + 76 * s;
    const shutY = cy - 20 * s;
    ctx.save();
    ctx.translate(shutX, shutY);
    ctx.rotate(0.95); // Angled downward along flight path
    // Skirt
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.moveTo(-4 * s, -8 * s);
    ctx.lineTo(4 * s, -8 * s);
    ctx.lineTo(2 * s, 2 * s);
    ctx.lineTo(-2 * s, 2 * s);
    ctx.closePath();
    ctx.fill();
    // Cork Head
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, 4 * s, 2.8 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 9. Near Player (MoveNet AI Pose Tracking Keypoints & Silhouette)
    const pX = cx - 36 * s;
    const pY = cy + 42 * s;

    // Athletic Ready Stance Silhouette (Translucent Emerald)
    ctx.shadowBlur = 10 * s;
    ctx.shadowColor = 'rgba(52, 211, 153, 0.6)';
    ctx.fillStyle = 'rgba(16, 185, 129, 0.78)';

    // Head
    ctx.beginPath();
    ctx.arc(pX, pY - 32 * s, 6 * s, 0, Math.PI * 2);
    ctx.fill();

    // Torso & Limbs
    ctx.beginPath();
    ctx.moveTo(pX - 9 * s, pY - 24 * s); // Left shoulder
    ctx.lineTo(pX + 9 * s, pY - 24 * s); // Right shoulder
    ctx.lineTo(pX + 7 * s, pY - 4 * s);  // Right hip
    ctx.lineTo(pX + 16 * s, pY + 18 * s); // Right ankle (wide base)
    ctx.lineTo(pX + 10 * s, pY + 18 * s);
    ctx.lineTo(pX + 2 * s, pY - 2 * s);
    ctx.lineTo(pX - 10 * s, pY + 18 * s); // Left ankle (wide base)
    ctx.lineTo(pX - 16 * s, pY + 18 * s);
    ctx.lineTo(pX - 7 * s, pY - 4 * s);  // Left hip
    ctx.closePath();
    ctx.fill();

    // Arms & Racket (Right arm extended holding racket up towards shuttle)
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    // Left arm (balance)
    ctx.moveTo(pX - 9 * s, pY - 24 * s);
    ctx.lineTo(pX - 18 * s, pY - 14 * s);
    ctx.lineTo(pX - 14 * s, pY - 4 * s);
    // Right arm (holding racket)
    ctx.moveTo(pX + 9 * s, pY - 24 * s);
    ctx.lineTo(pX + 20 * s, pY - 28 * s); // Elbow
    ctx.lineTo(pX + 30 * s, pY - 34 * s); // Hand/grip
    ctx.stroke();

    // Badminton Racket
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.2 * s;
    // Shaft
    ctx.beginPath();
    ctx.moveTo(pX + 30 * s, pY - 34 * s);
    ctx.lineTo(pX + 42 * s, pY - 44 * s);
    ctx.stroke();
    // Racket Head (Oval)
    ctx.save();
    ctx.translate(pX + 48 * s, pY - 50 * s);
    ctx.rotate(-0.7);
    ctx.beginPath();
    ctx.ellipse(0, 0, 9 * s, 6.5 * s, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Subtle Strings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 0.6 * s;
    ctx.beginPath();
    ctx.moveTo(-9 * s, 0); ctx.lineTo(9 * s, 0);
    ctx.moveTo(0, -6.5 * s); ctx.lineTo(0, 6.5 * s);
    ctx.stroke();
    ctx.restore();

    // AI Pose Skeleton Keypoints (MoveNet Joint Circles)
    const joints = [
        [pX, pY - 32 * s],          // Nose/Head
        [pX - 9 * s, pY - 24 * s],  // L Shoulder
        [pX + 9 * s, pY - 24 * s],  // R Shoulder
        [pX + 20 * s, pY - 28 * s], // R Elbow
        [pX + 30 * s, pY - 34 * s], // R Wrist
        [pX - 18 * s, pY - 14 * s], // L Elbow
        [pX - 14 * s, pY - 4 * s],  // L Wrist
        [pX - 6 * s, pY - 4 * s],   // L Hip
        [pX + 6 * s, pY - 4 * s],   // R Hip
        [pX - 12 * s, pY + 8 * s],  // L Knee
        [pX + 12 * s, pY + 8 * s],  // R Knee
        [pX - 14 * s, pY + 18 * s], // L Ankle
        [pX + 14 * s, pY + 18 * s]  // R Ankle
    ];
    ctx.shadowBlur = 6 * s;
    ctx.shadowColor = '#06b6d4';
    ctx.fillStyle = '#22d3ee';
    joints.forEach(([jx, jy]) => {
        ctx.beginPath();
        ctx.arc(jx, jy, 2.2 * s, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.restore();

    // 10. Text Below Graphic (Positioned comfortably below the court)
    const textBaseY = cy + 96 * s;
    ctx.save();
    ctx.textAlign = 'center';

    ctx.fillStyle = '#34d399';
    ctx.font = `bold ${Math.round(16 * s)}px Prompt, sans-serif`;
    ctx.shadowBlur = 8 * s;
    ctx.shadowColor = 'rgba(52, 211, 153, 0.4)';
    ctx.fillText('Badminton AI Analysis', cx, textBaseY);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#cbd5e1';
    ctx.font = `${Math.round(12.5 * s)}px Prompt, sans-serif`;
    ctx.fillText('กดปุ่ม "เปิดกล้องสด" หรือ "อัปโหลดคลิปสนามจริง" ด้านล่าง', cx, textBaseY + 24 * s);

    ctx.fillStyle = '#64748b';
    ctx.font = `${Math.round(10.5 * s)}px Prompt, sans-serif`;
    ctx.fillText('AI จะตรวจจับเส้นคอร์ทจริง ตาข่าย (Net) ผู้เล่น ความเร็วลูกตบ และนับแต้มอัตโนมัติ', cx, textBaseY + 44 * s);

    ctx.restore();
}

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
        drawHomeBadmintonGraphic(liveCtx, w, h);
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
    if (currentDigitalZoom > 1.0) {
        const sW = Math.round(vW / currentDigitalZoom);
        const sH = Math.round(vH / currentDigitalZoom);
        const sx = Math.round((vW - sW) / 2);
        const sy = Math.round((vH - sH) / 2);
        liveCtx.drawImage(webcamVideo, sx, sy, sW, sH, rx, ry, rw, rh);
    } else {
        liveCtx.drawImage(webcamVideo, rx, ry, rw, rh);
    }

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
        const isDockShowing = typeof isBottomDockHidden !== 'undefined' ? !isBottomDockHidden : true;
        const leftOffset = isDockShowing ? 74 : 16;
        const rightOffset = 16;
        const availW = Math.max(160, rw - leftOffset - rightOffset);
        const boxW = Math.min(availW, 340);
        const bx = leftOffset + (availW - boxW) / 2;
        const by = Math.max(110, rh - 96);
        liveCtx.fillStyle = 'rgba(9, 13, 22, 0.78)';
        liveCtx.beginPath();
        liveCtx.roundRect(bx, by, boxW, 30, 10);
        liveCtx.fill();
        liveCtx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
        liveCtx.lineWidth = 1;
        liveCtx.stroke();

        liveCtx.fillStyle = '#fbbf24';
        liveCtx.font = '600 10.5px Prompt, sans-serif';
        liveCtx.textAlign = 'center';
        liveCtx.fillText('เปิดเมนู ☰ > กด "ตั้งเส้นสนาม" เพื่อทาบเส้นคอร์ท', bx + boxW / 2, by + 19);
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

    if (draggingHandleKey && dragPointerPos && (webcamVideo.readyState >= 2 || (isUploadedVideoActive && uploadedVideo.readyState >= 2))) {
        const activeVideo = isUploadedVideoActive ? uploadedVideo : webcamVideo;
        const loupeRadius = 56;
        const zoom = 3.0;
        const targetX = dragPointerPos.x * w;
        const targetY = dragPointerPos.y * h;
        const loupeX = Math.max(loupeRadius + 12, Math.min(w - loupeRadius - 12, targetX));
        const loupeY = targetY > loupeRadius * 2.4 ? targetY - loupeRadius - 28 : targetY + loupeRadius + 28;

        const vW = activeVideo.videoWidth || w;
        const vH = activeVideo.videoHeight || h;
        const srcW = (loupeRadius * 2 / zoom) * (vW / w);
        const srcH = (loupeRadius * 2 / zoom) * (vH / h);
        const rawSrcX = dragPointerPos.x * vW - srcW / 2;
        const rawSrcY = dragPointerPos.y * vH - srcH / 2;
        // Strict boundary clamping prevents Canvas IndexSizeError crash when dragging near edges
        const safeSrcX = Math.max(0, Math.min(vW - 10, rawSrcX));
        const safeSrcY = Math.max(0, Math.min(vH - 10, rawSrcY));
        const safeSrcW = Math.max(4, Math.min(vW - safeSrcX, srcW));
        const safeSrcH = Math.max(4, Math.min(vH - safeSrcY, srcH));

        ctx.save();
        ctx.beginPath();
        ctx.arc(loupeX, loupeY, loupeRadius, 0, Math.PI * 2);
        ctx.clip();

        ctx.fillStyle = '#090d16';
        ctx.fillRect(loupeX - loupeRadius, loupeY - loupeRadius, loupeRadius * 2, loupeRadius * 2);
        try {
            ctx.drawImage(
                activeVideo,
                safeSrcX, safeSrcY, safeSrcW, safeSrcH,
                loupeX - loupeRadius, loupeY - loupeRadius, loupeRadius * 2, loupeRadius * 2
            );
        } catch (err) {
            // Silently protect live loop if video source dimension shifts momentarily
        }

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
