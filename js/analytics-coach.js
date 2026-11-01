/********************************************************************
 * MODULE: js/analytics-coach.js
 * PURPOSE: Smash Statistics (Tab 2), 2D Homography Court Heatmap &
 *          Trails (Tab 3), Gemini AI Coach & Vision Referee (Tab 4),
 *          Tab Navigation, Reset, and JSON Export.
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

function openMatchTitleModal() {
    const modal = document.getElementById('matchTitleModal');
    const input = document.getElementById('matchTitleInput');
    if (modal) modal.classList.remove('hidden');
    if (input) {
        input.value = matchTitle;
        setTimeout(() => input.focus(), 50);
    }
}

function closeMatchTitleModal() {
    document.getElementById('matchTitleModal')?.classList.add('hidden');
}

function renderMatchTitleUI() {
    document.querySelectorAll('.js-match-title').forEach(el => {
        el.textContent = matchTitle;
    });
}

function saveMatchTitleFromModal(alsoSaveRecord = false) {
    const input = document.getElementById('matchTitleInput');
    if (input && input.value.trim()) {
        matchTitle = input.value.trim();
    } else if (!matchTitle) {
        matchTitle = buildDefaultMatchTitle();
    }
    localStorage.setItem('shuttlepro_match_title', matchTitle);
    renderMatchTitleUI();
    closeMatchTitleModal();
    if (alsoSaveRecord) {
        saveCurrentMatchRecord();
    } else {
        showToast(`ตั้งชื่อแมตช์เป็น "${matchTitle}" เรียบร้อย`);
    }
}

function saveCurrentMatchRecord() {
    const avgSmash = allSmashSpeeds.length > 0
        ? Math.round(allSmashSpeeds.reduce((a, b) => a + b, 0) / allSmashSpeeds.length)
        : 0;
    const record = {
        id: Date.now(),
        title: matchTitle || buildDefaultMatchTitle(),
        savedAt: new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }),
        isoDate: new Date().toISOString(),
        durationSec: matchSeconds,
        format: isDoublesMatch ? 'Doubles (6.10m)' : 'Singles (5.18m)',
        scoreA: scoreboard.scoreA,
        scoreB: scoreboard.scoreB,
        setsA: scoreboard.setsA,
        setsB: scoreboard.setsB,
        maxSmashKmh: maxRecordedSpeed,
        avgSmashKmh: avgSmash,
        totalSmashes: allSmashSpeeds.length,
        playersSummary: Object.values(players).map(p => ({
            id: p.id,
            name: p.name,
            team: p.team,
            distanceMeters: p.distanceMeters,
            maxSpeedKmh: p.maxSpeedKmh,
            maxSmashKmh: p.maxSmashKmh,
            shotsCount: p.shotsCount
        })),
        recentShots: shotHistory.slice(0, 20)
    };
    matchHistory.unshift(record);
    if (matchHistory.length > 25) matchHistory.pop();
    try {
        localStorage.setItem('shuttlepro_match_history', JSON.stringify(matchHistory));
    } catch (e) {}
    renderSavedMatchesList();
    document.getElementById('moreSheet')?.classList.add('hidden');
    showToast(`บันทึกแมตช์ "${record.title}" ลงประวัติเรียบร้อย!`);
}

function renderSavedMatchesList() {
    const container = document.getElementById('savedMatchesList');
    if (!container) return;
    if (!matchHistory || matchHistory.length === 0) {
        container.innerHTML = `<div class="text-center text-xs text-slate-500 py-5">ยังไม่มีแมตช์ที่บันทึกไว้ • กดปุ่ม "ตั้งชื่อ &amp; บันทึก" เพื่อเก็บสถิติแต่ละแมตช์</div>`;
        return;
    }
    container.innerHTML = matchHistory.map((m, idx) => `
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2">
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 min-w-0">
                    <span class="text-xs font-bold text-white truncate">${m.title}</span>
                    <span class="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold shrink-0">
                        A ${m.scoreA} - ${m.scoreB} B
                    </span>
                </div>
                <div class="text-[10px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                    <span>${m.savedAt}</span>
                    <span>•</span>
                    <span>เวลา ${formatTimeSec(m.durationSec || 0)}</span>
                    <span>•</span>
                    <span class="text-amber-300">ตบสูงสุด ${m.maxSmashKmh || 0} km/h</span>
                </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
                <button onclick="exportSavedMatchById(${idx})" class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 flex items-center justify-center" title="Export JSON">
                    <i class="ph-bold ph-download-simple text-xs"></i>
                </button>
                <button onclick="deleteSavedMatchById(${idx})" class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-rose-300 flex items-center justify-center" title="ลบรายการ">
                    <i class="ph-bold ph-trash text-xs"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function exportSavedMatchById(idx) {
    const rec = matchHistory[idx];
    if (!rec) return;
    const safeName = (rec.title || 'match').replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
    const blob = new Blob([JSON.stringify(rec, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shuttlepro-${safeName}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`ส่งออกไฟล์ "${rec.title}" สำเร็จ`);
}

function deleteSavedMatchById(idx) {
    matchHistory.splice(idx, 1);
    try {
        localStorage.setItem('shuttlepro_match_history', JSON.stringify(matchHistory));
    } catch (e) {}
    renderSavedMatchesList();
    showToast('ลบประวัติแมตช์แล้ว');
}

function startNewMatch() {
    document.getElementById('moreSheet')?.classList.add('hidden');
    matchTitle = buildDefaultMatchTitle();
    localStorage.setItem('shuttlepro_match_title', matchTitle);
    renderMatchTitleUI();
    resetMatchData(true);
    openMatchTitleModal();
}

function exportReportJSON() {
    const reportData = {
        matchTitle,
        exportedAt: new Date().toISOString(),
        durationSec: matchSeconds,
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
    const safeName = (matchTitle || 'match').replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shuttlepro-${safeName}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`ส่งออกข้อมูลแมตช์ "${matchTitle}" (.JSON) สำเร็จ`);
}

window.addEventListener('DOMContentLoaded', () => {
    renderMatchTitleUI();
    renderSavedMatchesList();
    resizeCanvases();
    updateScoreboardUI();
    updateLiveHUD();
    renderShotHistoryList();
    generateAICoachAdvice('full');
    animateLoop();
});
