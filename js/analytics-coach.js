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

const GEMINI_FALLBACK_MODELS = [
    'gemini-3.5-flash',
    'gemini-flash-latest',
    'gemini-3.6-flash'
];

async function callGeminiAPIWithFallback(parts, expectJson = false) {
    let lastError = 'ไม่สามารถเชื่อมต่อ Gemini API ได้';
    for (const modelName of GEMINI_FALLBACK_MODELS) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
            const body = {
                contents: [{ parts }],
                generationConfig: {
                    thinkingConfig: { thinkingBudget: 0 }
                }
            };
            if (expectJson) {
                body.generationConfig.responseMimeType = 'application/json';
            }
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) {
                lastError = data?.error?.message || `HTTP ${res.status}`;
                continue;
            }
            const text = data?.candidates?.[0]?.content?.parts?.find(p => p.text)?.text || '';
            if (text) return { ok: true, text, model: modelName };
        } catch (err) {
            lastError = err.message || String(err);
        }
    }
    return { ok: false, error: lastError };
}

async function verifyFrameWithGeminiAI() {
    const videoEl = document.getElementById('webcamVideo');
    if ((!isWebcamActive && !isUploadedVideoActive) || !videoEl || videoEl.readyState < 2) {
        showToast('กรุณาเปิดกล้องสดหรือเปิดคลิปวิดีโอเพื่อส่งภาพให้ AI ตรวจสอบ');
        return;
    }

    showToast('กำลังส่งภาพเฟรมสนามจริงให้ Gemini Vision AI ตรวจสอบเส้นคอร์ท เน็ท และขานแต้ม...');
    try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 640;
        tempCanvas.height = 360;
        tempCanvas.getContext('2d').drawImage(videoEl, 0, 0, 640, 360);
        const base64Jpeg = tempCanvas.toDataURL('image/jpeg', 0.82).split(',')[1];

        const prompt = `คุณคือกรรมการแบดมินตัน BWF AI วิเคราะห์ภาพสนามแบดมินตันนี้และตอบเป็น JSON เท่านั้น:
{
  "courtDetected": true หรือ false,
  "tl": {"x": 0.0-1.0, "y": 0.0-1.0},
  "tr": {"x": 0.0-1.0, "y": 0.0-1.0},
  "br": {"x": 0.0-1.0, "y": 0.0-1.0},
  "bl": {"x": 0.0-1.0, "y": 0.0-1.0},
  "netY": 0.0-1.0,
  "playersCount": จำนวนผู้เล่นในสนาม,
  "refereeSummary": "สรุปสิ่งที่เห็นในสนาม ตำแหน่งผู้เล่น และคำแนะนำกรรมการสั้นๆ ภาษาไทย"
}`;
        const result = await callGeminiAPIWithFallback([
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: base64Jpeg } }
        ], true);

        if (!result.ok) throw new Error(result.error);
        const cleanedJson = result.text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleanedJson);

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
            showToast(`Gemini Vision (${result.model}) ล็อกพิกัดเส้นสนามสำเร็จ! ${parsed.refereeSummary || ''}`);
        } else {
            showToast(parsed.refereeSummary || 'Gemini Vision ไม่พบเส้นคอร์ทแบดมินตันที่ชัดเจนในเฟรมนี้');
        }
    } catch (e) {
        showToast(`Gemini Vision Error: ${e.message || 'กรุณาตรวจสอบ API Key'}`);
    }
}

async function generateAICoachAdvice(focusTopic = 'full') {
    const outputBox = document.getElementById('aiCoachOutput');
    if (!outputBox) return;

    const statsSnapshot = Object.values(players).map(p =>
        `- ${p.name} (ทีม ${p.team}): วิ่งสะสม ${p.distanceMeters.toFixed(1)} ม., ความเร็ววิ่งสูงสุด ${p.maxSpeedKmh} km/h, ตบสูงสุด ${p.maxSmashKmh} km/h, ตบเฉลี่ย ${p.avgSmashKmh} km/h, ตีทั้งหมด ${p.shotsCount} ลูก`
    ).join('\n');

    const recentShotsText = shotHistory.length > 0
        ? shotHistory.slice(0, 8).map(s => `[${s.time}] ${s.player} (ทีม ${s.team}): ${s.type} ความเร็ว ${s.speed} km/h`).join('\n')
        : 'ยังไม่มีประวัติช็อตในแรลลี่นี้ (สามารถวิเคราะห์แผนการเล่นเริ่มต้นและการยืนตำแหน่งคู่/เดี่ยวได้)';

    if (!geminiApiKey) {
        outputBox.innerHTML = `
            <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
                <div class="font-bold text-emerald-400">สรุปสถิติจริงจากสนามปัจจุบัน (สกอร์ ${scoreboard.scoreA} - ${scoreboard.scoreB})</div>
                <pre class="text-slate-300 whitespace-pre-wrap font-sans">${statsSnapshot}</pre>
                <p class="text-amber-300 pt-2">💡 หากต้องการให้ Gemini AI วิเคราะห์เชิงลึกเพิ่มเติม กดปุ่มรูปกุญแจด้านบนเพื่อเชื่อมต่อ API Key ของคุณ</p>
            </div>
        `;
        return;
    }

    outputBox.innerHTML = `
        <div class="py-8 text-center text-xs text-emerald-300 flex flex-col items-center gap-2">
            <i class="ph-bold ph-spinner animate-spin text-2xl text-emerald-400"></i>
            <span>กำลังวิเคราะห์กลยุทธ์และสถิติสนามจริงด้วย Gemini AI Coach...</span>
        </div>
    `;
    try {
        const prompt = `คุณคือโค้ชแบดมินตันระดับโลก (BWF Pro Coach) วิเคราะห์แมตช์ "${matchTitle}" รูปแบบ ${isDoublesMatch ? 'ประเภทคู่ (Doubles)' : 'ประเภทเดี่ยว (Singles)'}
สกอร์ปัจจุบัน: ทีม A ${scoreboard.scoreA} - ${scoreboard.scoreB} ทีม B (เซต ${scoreboard.setsA}-${scoreboard.setsB})
หัวข้อที่เน้น: ${focusTopic}

สถิติผู้เล่นรายบุคคล:
${statsSnapshot}

บันทึกช็อตล่าสุด:
${recentShotsText}

กรุณาสรุปเป็นภาษาไทยที่อ่านง่าย แบ่งเป็น 3 หัวข้อสั้นๆ:
1. 📊 ภาพรวมรูปเกมและการเคลื่อนที่ (Footwork & Coverage)
2. 🏸 วิเคราะห์เกมรุก-เกมรับ และจังหวะตบ (Shot Selection & Smash Power)
3. 🎯 แผนกลยุทธ์แก้เกมในแต้มถัดไปสำหรับทีม A และทีม B`;

        const result = await callGeminiAPIWithFallback([{ text: prompt }], false);
        if (!result.ok) throw new Error(result.error);

        const formattedHtml = result.text
            .replace(/\*\*(.*?)\*\*/g, '<strong class="text-emerald-300">$1</strong>')
            .replace(/\n/g, '<br>');

        outputBox.innerHTML = `
            <div class="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-4 space-y-3 text-xs leading-relaxed">
                <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span class="font-bold text-emerald-400 flex items-center gap-1.5">
                        <i class="ph-fill ph-sparkle"></i> คำแนะนำกลยุทธ์จาก Gemini AI Coach
                    </span>
                    <span class="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">${result.model}</span>
                </div>
                <div class="text-slate-200">${formattedHtml}</div>
            </div>
        `;
    } catch (e) {
        outputBox.innerHTML = `
            <div class="bg-rose-950/40 border border-rose-500/40 rounded-xl p-4 text-rose-300 text-xs space-y-1">
                <div class="font-bold">เกิดข้อผิดพลาดในการเชื่อมต่อ Gemini API</div>
                <div class="text-[11px] text-rose-400/90">${e.message || 'กรุณาตรวจสอบ Gemini API Key หรือการเชื่อมต่ออินเทอร์เน็ต'}</div>
            </div>
        `;
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
    const clubInput = document.getElementById('clubCodeInput');
    if (modal) modal.classList.remove('hidden');
    if (clubInput) clubInput.value = clubCode || 'PUBLIC';
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
    document.querySelectorAll('.js-club-code').forEach(el => {
        el.textContent = clubCode || 'PUBLIC';
    });
}

function saveMatchTitleFromModal(alsoSaveRecord = false) {
    const input = document.getElementById('matchTitleInput');
    const clubInput = document.getElementById('clubCodeInput');
    if (input && input.value.trim()) {
        matchTitle = input.value.trim();
    } else if (!matchTitle) {
        matchTitle = buildDefaultMatchTitle();
    }
    const prevClub = clubCode;
    if (clubInput && clubInput.value.trim()) {
        clubCode = clubInput.value.trim().toUpperCase();
    } else {
        clubCode = 'PUBLIC';
    }
    localStorage.setItem('shuttlepro_match_title', matchTitle);
    localStorage.setItem('shuttlepro_club_code', clubCode);
    renderMatchTitleUI();
    closeMatchTitleModal();

    if (prevClub !== clubCode) {
        fetchCloudMatches(false);
    }

    if (alsoSaveRecord) {
        saveCurrentMatchRecord();
    } else {
        showToast(`ตั้งชื่อแมตช์ "${matchTitle}" (ห้องก๊วน ${clubCode}) เรียบร้อย`);
    }
}

function updateCloudSyncBadge(text, isOk = true) {
    const badge = document.getElementById('cloudSyncBadge');
    if (!badge) return;
    badge.textContent = `• ${text}`;
    badge.className = isOk ? 'ml-1 text-[10px] text-emerald-400' : 'ml-1 text-[10px] text-amber-400';
}

async function syncMatchRecordToSupabase(record) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
    try {
        const payload = {
            client_match_id: record.id,
            club_code: record.clubCode || clubCode || 'PUBLIC',
            title: record.title,
            saved_at_text: record.savedAt,
            duration_sec: record.durationSec || 0,
            format: record.format,
            score_a: record.scoreA || 0,
            score_b: record.scoreB || 0,
            sets_a: record.setsA || 0,
            sets_b: record.setsB || 0,
            max_smash_kmh: record.maxSmashKmh || 0,
            avg_smash_kmh: record.avgSmashKmh || 0,
            total_smashes: record.totalSmashes || 0,
            players_summary: record.playersSummary || [],
            recent_shots: record.recentShots || []
        };
        const res = await fetch(`${SUPABASE_URL}/rest/v1/matches`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation,resolution=merge-duplicates'
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.warn('Supabase insert warning:', err);
            updateCloudSyncBadge('บันทึกในเครื่องแล้ว (รอตั้งค่าสิทธิ์ตาราง Supabase)', false);
            return false;
        }
        const rows = await res.json();
        if (rows && rows[0] && rows[0].id) {
            record.cloudId = rows[0].id;
            localStorage.setItem('shuttlepro_match_history', JSON.stringify(matchHistory));
            renderSavedMatchesList();
        }
        isCloudSynced = true;
        updateCloudSyncBadge('ซิงค์ขึ้น Supabase Cloud แล้ว', true);
        return true;
    } catch (e) {
        updateCloudSyncBadge('ออฟไลน์ (เก็บในเครื่องอัตโนมัติ)', false);
        return false;
    }
}

async function fetchCloudMatches(showNotification = false) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    try {
        updateCloudSyncBadge('กำลังซิงค์...', true);
        const code = encodeURIComponent(clubCode || 'PUBLIC');
        const url = `${SUPABASE_URL}/rest/v1/matches?club_code=eq.${code}&order=created_at.desc&limit=30`;
        const res = await fetch(url, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            if (err.code === '42501') {
                updateCloudSyncBadge('รอเปิดสิทธิ์ GRANT ตารางใน Supabase SQL', false);
            } else {
                updateCloudSyncBadge('ใช้ข้อมูลในเครื่อง', false);
            }
            if (showNotification) showToast('ยังไม่ได้เปิดสิทธิ์ GRANT SELECT/INSERT บนตาราง matches ใน Supabase');
            return;
        }
        const rows = await res.json();
        const cloudRecords = (rows || []).map(r => ({
            id: r.client_match_id || new Date(r.created_at).getTime(),
            cloudId: r.id,
            clubCode: r.club_code || 'PUBLIC',
            title: r.title,
            savedAt: r.saved_at_text || new Date(r.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }),
            isoDate: r.created_at,
            durationSec: r.duration_sec || 0,
            format: r.format || 'Doubles (6.10m)',
            scoreA: r.score_a || 0,
            scoreB: r.score_b || 0,
            setsA: r.sets_a || 0,
            setsB: r.sets_b || 0,
            maxSmashKmh: r.max_smash_kmh || 0,
            avgSmashKmh: r.avg_smash_kmh || 0,
            totalSmashes: r.total_smashes || 0,
            playersSummary: r.players_summary || [],
            recentShots: r.recent_shots || []
        }));

        // Merge unsynced local records for the current clubCode with cloud records
        const cloudIds = new Set(cloudRecords.map(c => c.id));
        const localUnsynced = matchHistory.filter(m => (!m.clubCode || m.clubCode === clubCode) && !cloudIds.has(m.id));
        matchHistory = [...localUnsynced, ...cloudRecords].slice(0, 35);
        try {
            localStorage.setItem('shuttlepro_match_history', JSON.stringify(matchHistory));
        } catch (e) {}
        renderSavedMatchesList();
        isCloudSynced = true;
        updateCloudSyncBadge(`ซิงค์ Cloud ล่าสุด (${cloudRecords.length} แมตช์)`, true);

        // Push any local unsynced matches up to Supabase automatically
        for (const unsynced of localUnsynced) {
            syncMatchRecordToSupabase(unsynced);
        }
        if (showNotification) showToast(`ซิงค์ข้อมูลห้องก๊วน "${clubCode}" จาก Supabase สำเร็จ (${cloudRecords.length} แมตช์)`);
    } catch (e) {
        updateCloudSyncBadge('ออฟไลน์ (ใช้ข้อมูลในเครื่อง)', false);
    }
}

async function saveCurrentMatchRecord() {
    const avgSmash = allSmashSpeeds.length > 0
        ? Math.round(allSmashSpeeds.reduce((a, b) => a + b, 0) / allSmashSpeeds.length)
        : 0;
    const record = {
        id: Date.now(),
        clubCode: clubCode || 'PUBLIC',
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
    if (matchHistory.length > 35) matchHistory.pop();
    try {
        localStorage.setItem('shuttlepro_match_history', JSON.stringify(matchHistory));
    } catch (e) {}
    renderSavedMatchesList();
    document.getElementById('moreSheet')?.classList.add('hidden');
    showToast(`กำลังบันทึกแมตช์ "${record.title}" ขึ้น Supabase Cloud...`);
    const ok = await syncMatchRecordToSupabase(record);
    if (ok) {
        showToast(`บันทึกแมตช์ "${record.title}" ขึ้น Supabase (ก๊วน ${clubCode}) สำเร็จ!`);
    }
}

function renderSavedMatchesList() {
    const container = document.getElementById('savedMatchesList');
    if (!container) return;
    if (!matchHistory || matchHistory.length === 0) {
        container.innerHTML = `<div class="text-center text-xs text-slate-500 py-5">ยังไม่มีแมตช์ในห้องก๊วน "${clubCode}" • กดปุ่ม "บันทึกแมตช์" เพื่อเก็บสถิติขึ้น Supabase Cloud</div>`;
        return;
    }
    container.innerHTML = matchHistory.map((m, idx) => {
        const cloudIcon = m.cloudId
            ? `<i class="ph-fill ph-cloud-check text-cyan-400 text-xs shrink-0" title="บันทึกบน Supabase Cloud แล้ว"></i>`
            : `<i class="ph-bold ph-device-mobile text-slate-500 text-xs shrink-0" title="บันทึกในเครื่อง"></i>`;
        return `
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2">
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 min-w-0">
                    ${cloudIcon}
                    <span class="text-xs font-bold text-white truncate">${m.title}</span>
                    <span class="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold shrink-0">
                        A ${m.scoreA} - ${m.scoreB} B
                    </span>
                </div>
                <div class="text-[10px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                    <span class="text-cyan-300/90 font-mono">[${m.clubCode || 'PUBLIC'}]</span>
                    <span>•</span>
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
    `}).join('');
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

async function deleteSavedMatchById(idx) {
    const rec = matchHistory[idx];
    matchHistory.splice(idx, 1);
    try {
        localStorage.setItem('shuttlepro_match_history', JSON.stringify(matchHistory));
    } catch (e) {}
    renderSavedMatchesList();

    if (rec && (rec.cloudId || rec.id) && SUPABASE_URL && SUPABASE_ANON_KEY) {
        const query = rec.cloudId ? `id=eq.${rec.cloudId}` : `client_match_id=eq.${rec.id}`;
        fetch(`${SUPABASE_URL}/rest/v1/matches?${query}`, {
            method: 'DELETE',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        }).catch(() => {});
    }
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
    fetchCloudMatches(false);
    resizeCanvases();
    updateScoreboardUI();
    updateLiveHUD();
    renderShotHistoryList();
    generateAICoachAdvice('full');
    animateLoop();
});
