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
    const nowMs = (typeof trackerNow === 'function') ? trackerNow() : performance.now();
    const isRecent = shuttle.speedKmh > 0 && (nowMs - (shuttle.lastSpeedAtMs || 0) < 5000);

    if (speedEl) {
        speedEl.textContent = shuttle.speedKmh;
        if (shuttle.speedKmh > 0 && !isRecent) {
            speedEl.classList.add('opacity-40');
        } else {
            speedEl.classList.remove('opacity-40');
        }
    }
    if (badgeEl) {
        badgeEl.textContent = (shuttle.speedKmh > 0 && !isRecent) ? `${shuttle.shotType} (ล่าสุด)` : shuttle.shotType;
    }

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

// Multi-model automatic failover chain (prioritizes high-quota Lite & Gemma 4 models, skips exhausted models automatically)
const GEMINI_FALLBACK_MODELS = [
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite',
    'gemma-4-31b-it',
    'gemma-4-26b-a4b-it',
    'gemini-2.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-flash-latest'
];
const exhaustedModelsUntil = {}; // { modelName: timestampMs }
let lastAnalyzedSnapshotKey = '';

// Modular Knowledge Base Cache (loaded from /knowledge/* with built-in deterministic fallbacks)
const ShuttleKB = {
    loaded: false,
    masterKnowledge: '',
    systemPrompt: `คุณคือ BWF-Informed Badminton Performance Coach, Technical Analyst, Tactical Analyst และ Match Performance Analyst ประจำระบบ ShuttlePro AI
กฎเหล็กป้องกันการมโนข้อมูล (Strict Anti-Hallucination Rules):
1. วิเคราะห์จากข้อมูลใน Match Data JSON ที่ส่งให้เท่านั้น ห้ามสมมติตัวเลข ความเร็วลูกตบ จำนวนแรลลี่ หรือเหตุการณ์ที่ไม่ได้เกิดขึ้นจริงโดยเด็ดขาด
2. แยกข้อเท็จจริงออกจากข้อสังเกตเชิงกลยุทธ์อย่างชัดเจน โดยติดป้าย [ข้อเท็จจริงจากข้อมูลจริง] และ [ข้อสังเกตและคำแนะนำโค้ช]
3. ระบุระดับความเชื่อมั่น [Confidence: High / Medium / Low] ในแต่ละหัวข้อตามความสมบูรณ์ของข้อมูล
4. หากตัวชี้วัดใดไม่มีข้อมูลบันทึกไว้ ให้ระบุตรงไปตรงมาว่า "ข้อมูลไม่เพียงพอในการประเมินจากกล้องสนามปัจจุบัน (Insufficient Data)" ห้ามคาดเดา
5. อ้างอิง [เวลา MM:SS] จาก shots_log หรือ point_log เสมอเมื่อกล่าวถึงช็อตสำคัญหรือแต้มที่ได้/เสีย
6. แยกประเภทความผิดพลาดตามหลักวิชาการ: Technical Error (เทคนิคหน้าไม้/ตีติดเน็ต NET/ตีออกเส้น OUT), Tactical Error (การเลือกช็อต), Movement Error (การเคลื่อนที่/การกลับ Base Position)
7. ใช้กติกา BWF 2025-2026 (21 คะแนน, ดิวซ์ชนะห่าง 2 สูงสุด 30, เสิร์ฟต่ำกว่า 1.15m, สนามเดี่ยว 5.18x13.40m / คู่ 6.10x13.40m) และห้ามวินิจฉัยทางการแพทย์`,
    reportTemplate: `กรุณาเขียนรายงานวิเคราะห์การแข่งขันเป็นภาษาไทยตามโครงสร้างมาตรฐาน 7 หมวดหมู่ดังนี้:
1. 🏆 สรุปผลการแข่งขันและภาพรวม (Match Summary & Executive Overview) [ระบุ Confidence Level]
2. 📊 ตารางคะแนนสมรรถนะ 100 คะแนน (100-Point Performance Scoring Rubric: Technical 20, Tactical 20, Footwork 15, Offensive 15, Defensive 10, Consistency 10, Mental 10 พร้อมระดับ Rating)
3. 🏸 วิเคราะห์ทักษะเทคนิคและพลังเกมบุก (Technical & Offensive Shot Analysis พร้อมอ้างอิง [เวลา MM:SS])
4. 🗺️ วิเคราะห์การเคลื่อนที่และพื้นที่สนาม 9 โซน (Footwork, Base Recovery & 9-Zone Coverage แยกตาม Singles 5.18m หรือ Doubles 6.10m)
5. ⚠️ วิเคราะห์ข้อผิดพลาดและแต้มสำคัญ (Error Taxonomy: IN/OUT/NET, Technical/Tactical/Movement Error & Pressure Points)
6. 🏋️ แผนการฝึกซ้อมเพื่อพัฒนาเฉพาะจุด (Training Plan: Objective, Identified Weakness, Drill Description, Duration/Reps, Success Criteria)
7. 🎯 แผนกลยุทธ์สำหรับการแข่งขันนัดถัดไป (Next Match Tactical Strategy สำหรับทีม A และทีม B)`,
    dataSchema: null
};

async function ensureKnowledgeBaseLoaded() {
    if (ShuttleKB.loaded) return;
    try {
        const [sysRes, tplRes, masterRes, schemaRes] = await Promise.allSettled([
            fetch('knowledge/system-prompt.md'),
            fetch('knowledge/match-report-template.md'),
            fetch('knowledge/master-knowledge.md'),
            fetch('knowledge/match-data-schema.json')
        ]);
        if (sysRes.status === 'fulfilled' && sysRes.value.ok) {
            ShuttleKB.systemPrompt = await sysRes.value.text();
        }
        if (tplRes.status === 'fulfilled' && tplRes.value.ok) {
            ShuttleKB.reportTemplate = await tplRes.value.text();
        }
        if (masterRes.status === 'fulfilled' && masterRes.value.ok) {
            ShuttleKB.masterKnowledge = await masterRes.value.text();
        }
        if (schemaRes.status === 'fulfilled' && schemaRes.value.ok) {
            ShuttleKB.dataSchema = await schemaRes.value.json();
        }
    } catch (e) {
        // Fallback constants in ShuttleKB remain active when running offline or via file://
    }
    ShuttleKB.loaded = true;
}

// Compute 9-zone court coverage (Front/Mid/Rear x Left/Center/Right) from normalized player positions
function computePlayer9ZoneCoverage(positions = [], team = 'A') {
    const total = positions.length;
    const emptyGrid = {
        front_left: 0, front_center: 0, front_right: 0,
        mid_left: 0, mid_center: 0, mid_right: 0,
        rear_left: 0, rear_center: 0, rear_right: 0
    };
    if (total === 0) {
        return {
            front_court_pct: 0,
            mid_court_base_pct: 0,
            rear_court_pct: 0,
            left_side_pct: 0,
            center_lane_pct: 0,
            right_side_pct: 0,
            zones_9_grid: emptyGrid
        };
    }

    const counts = { ...emptyGrid };
    positions.forEach(pt => {
        // Normalized court coordinates: y in [0..1] along 13.4m length (net at 0.5), x in [0..1] across width
        const distFromNet = team === 'A' ? Math.abs(0.5 - Math.min(0.5, pt.y)) / 0.5 : Math.abs(Math.max(0.5, pt.y) - 0.5) / 0.5;
        const depthBand = distFromNet < 0.33 ? 'front' : (distFromNet < 0.68 ? 'mid' : 'rear');
        const sideBand = pt.x < 0.33 ? 'left' : (pt.x <= 0.67 ? 'center' : 'right');
        const key = `${depthBand}_${sideBand}`;
        if (counts[key] !== undefined) counts[key]++;
    });

    const pct = k => Math.round((counts[k] / total) * 100);
    const gridPct = {};
    Object.keys(counts).forEach(k => { gridPct[k] = pct(k); });

    return {
        front_court_pct: gridPct.front_left + gridPct.front_center + gridPct.front_right,
        mid_court_base_pct: gridPct.mid_left + gridPct.mid_center + gridPct.mid_right,
        rear_court_pct: gridPct.rear_left + gridPct.rear_center + gridPct.rear_right,
        left_side_pct: gridPct.front_left + gridPct.mid_left + gridPct.rear_left,
        center_lane_pct: gridPct.front_center + gridPct.mid_center + gridPct.rear_center,
        right_side_pct: gridPct.front_right + gridPct.mid_right + gridPct.rear_right,
        zones_9_grid: gridPct
    };
}

// Build canonical Match Data JSON following knowledge/match-data-schema.json (Part 16)
function buildStructuredMatchDataJSON() {
    const avgSmash = allSmashSpeeds.length > 0
        ? Math.round(allSmashSpeeds.reduce((a, b) => a + b, 0) / allSmashSpeeds.length)
        : 0;
    const teamADist = +(players.A1.distanceMeters + players.A2.distanceMeters).toFixed(1);
    const teamBDist = +(players.B1.distanceMeters + players.B2.distanceMeters).toFixed(1);

    const pointLog = Array.isArray(scoreboard.pointLog) ? scoreboard.pointLog : [];
    const inCalls = pointLog.filter(p => p.callType === 'IN').length;
    const outErrors = pointLog.filter(p => p.callType === 'OUT').length;
    const netErrors = pointLog.filter(p => p.callType === 'NET').length;
    const totalPointsLogged = pointLog.length;

    const maxScore = Math.max(scoreboard.scoreA, scoreboard.scoreB);
    let pressurePhase = 'Opening (0-5)';
    if (scoreboard.scoreA >= 20 && scoreboard.scoreB >= 20) pressurePhase = 'Deuce / GamePoint (20+)';
    else if (maxScore >= 16) pressurePhase = 'Late-Game (16-19)';
    else if (maxScore >= 11) pressurePhase = 'Mid-Game (11-15)';
    else if (maxScore >= 6) pressurePhase = 'Pre-Interval (6-10)';

    const hasScore = (scoreboard.scoreA + scoreboard.scoreB + scoreboard.setsA + scoreboard.setsB) > 0;
    const hasMovement = (teamADist + teamBDist) > 0;
    const hasSmash = allSmashSpeeds.length > 0 || shotHistory.length > 0;
    const hasLineCalls = totalPointsLogged > 0;
    const evidenceCount = [hasScore, hasMovement, hasSmash, hasLineCalls].filter(Boolean).length;
    const overallConfidence = evidenceCount >= 3 ? 'High' : (evidenceCount >= 1 ? 'Medium' : 'Low');

    return {
        schema_version: '2026.11.1',
        match_info: {
            match_title: matchTitle || 'แมตช์ซ้อม/แข่งขัน',
            club_code: clubCode || 'PUBLIC',
            match_date_iso: new Date().toISOString(),
            category: isDoublesMatch ? 'Doubles (6.10m x 13.40m)' : 'Singles (5.18m x 13.40m)',
            is_doubles: isDoublesMatch,
            duration_seconds: matchSeconds,
            duration_formatted: formatTimeSec(matchSeconds),
            bwf_rules_standard: 'BWF Laws of Badminton 2025-2026 (21-point rally scoring, max 30, 1.15m service height)'
        },
        score_summary: {
            score_team_a: scoreboard.scoreA,
            score_team_b: scoreboard.scoreB,
            sets_team_a: scoreboard.setsA,
            sets_team_b: scoreboard.setsB,
            current_set: scoreboard.currentSet,
            serving_team: scoreboard.servingTeam,
            service_court: scoreboard.serviceCourt === 'R' ? 'Right (Even)' : 'Left (Odd)',
            pressure_phase: pressurePhase
        },
        match_kpis: {
            total_rallies_logged: totalPointsLogged,
            total_shots_detected: shotHistory.length,
            total_smashes_detected: allSmashSpeeds.length,
            max_smash_speed_kmh: maxRecordedSpeed,
            max_smash_holder: maxSpeedHolder,
            min_smash_speed_kmh: minRecordedSmashSpeed,
            min_smash_holder: minSmashHolder,
            avg_smash_speed_kmh: avgSmash,
            team_a_total_distance_m: teamADist,
            team_b_total_distance_m: teamBDist,
            line_call_summary: {
                in_calls: inCalls,
                out_errors: outErrors,
                net_errors: netErrors,
                error_rate_pct: totalPointsLogged > 0 ? Math.round(((outErrors + netErrors) / totalPointsLogged) * 100) : 0
            }
        },
        players_telemetry: Object.values(players).map(p => ({
            player_id: p.id,
            name: p.name,
            team: p.team,
            distance_meters: +p.distanceMeters.toFixed(1),
            max_movement_speed_kmh: p.maxSpeedKmh,
            shots_count: p.shotsCount,
            max_smash_kmh: p.maxSmashKmh,
            min_smash_kmh: p.minSmashKmh,
            avg_smash_kmh: p.avgSmashKmh,
            tracked_samples: p.positions.length,
            court_zone_coverage_pct: computePlayer9ZoneCoverage(p.positions, p.team)
        })),
        point_log: pointLog.slice(0, 15).map(pt => ({
            timestamp: pt.time || '00:00',
            winner_team: pt.winnerTeam,
            call_type: pt.callType,
            reason: pt.reason,
            margin_cm: pt.marginCm || 0,
            score_after: pt.scoreAfter
        })),
        shots_log: shotHistory.slice(0, 15).map(s => ({
            timestamp: s.time,
            player_name: s.player,
            team: s.team,
            shot_type: s.type,
            speed_kmh: s.speed
        })),
        data_quality: {
            court_calibrated_and_trusted: ShuttleCV.isCourtTrusted(),
            telemetry_data_valid: ShuttleCV.isCourtTrusted() && matchSeconds > 10,
            warnings: (() => {
                const w = [];
                if (!ShuttleCV.isCourtTrusted()) {
                    w.push('พิกัดเส้นสนามยังไม่ได้รับการตั้งเส้น (Uncalibrated Court) ข้อมูลพื้นที่และระยะวิ่งเป็นเพียงค่าประมาณการ');
                }
                const matchMin = Math.max(0.5, matchSeconds / 60);
                Object.values(players).forEach(p => {
                    if (p.distanceMeters / matchMin > 110) {
                        w.push(`ระยะวิ่งของ ${p.name} (${p.distanceMeters} ม.) สูงผิดปกติเมื่อเทียบกับเวลาแมตช์`);
                    }
                });
                if (maxRecordedSpeed > 265) {
                    w.push(`ความเร็วลูกตบสูงสุด (${maxRecordedSpeed} km/h) สูงเกินเกณฑ์มาตรฐาน`);
                }
                return w;
            })()
        },
        data_completeness: {
            overall_confidence: overallConfidence,
            has_score_data: hasScore,
            has_movement_tracking: hasMovement,
            has_smash_telemetry: hasSmash,
            has_line_call_log: hasLineCalls,
            missing_metrics_note: 'วิเคราะห์จากข้อมูลจริงใน JSON นี้เท่านั้น ห้ามสมมติค่าที่ไม่มีในระบบตรวจจับ'
        }
    };
}

// Retrieve targeted sections from Master Knowledge (Part 5 Singles vs Part 6 Doubles + Error/Pressure/Rubric rules)
function retrieveMasterKnowledgeContext(matchData) {
    const raw = ShuttleKB.masterKnowledge || '';
    const extracted = [];

    if (raw) {
        const extractPart = (startMarker, endMarker) => {
            const sIdx = raw.indexOf(startMarker);
            if (sIdx === -1) return '';
            const eIdx = endMarker ? raw.indexOf(endMarker, sIdx) : -1;
            return raw.slice(sIdx, eIdx !== -1 ? eIdx : sIdx + 2200).trim();
        };

        if (matchData.match_info.is_doubles) {
            const part6 = extractPart('PART 6: DOUBLES ANALYSIS', 'PART 7:');
            if (part6) extracted.push(part6);
        } else {
            const part5 = extractPart('PART 5: SINGLES ANALYSIS', 'PART 6:');
            if (part5) extracted.push(part5);
        }

        const part8 = extractPart('8.2 Pressure Point Analysis', 'PART 9:');
        if (part8) extracted.push(part8);

        const part12 = extractPart('PART 12: PERFORMANCE SCORING MODEL', 'PART 13:');
        if (part12) extracted.push(part12);
    }

    if (extracted.length === 0) {
        return matchData.match_info.is_doubles
            ? 'กรอบความรู้ประเภทคู่ (PART 6 Doubles): วิเคราะห์ระบบยืน Front-Back (เกมรุก), Side-by-Side (เกมรับ), การหมุนตำแหน่ง (Rotation), ช่องว่างระหว่างคู่ขา และความสมดุลของระยะวิ่งระหว่างผู้เล่น A1-A2 และ B1-B2'
            : 'กรอบความรู้ประเภทเดี่ยว (PART 5 Singles): วิเคราะห์การครอบคลุมพื้นที่ 4 มุมสนาม (Court Coverage), การกลับสู่จุดศูนย์กลาง (Base Position Recovery), ความแม่นยำลูก Clear/Drop/Smash และความทนทานในการเล่นแรลลี่';
    }
    return extracted.join('\n\n---\n\n');
}

const LOCAL_AI_FALLBACK_MODELS = [
    'qwen2.5:7b',
    'hermes3:latest',
    'qwen2.5:3b',
    'qwen2.5-coder:7b'
];

async function callLocalAIFallback(parts, systemPromptText = '', actionToken = '') {
    const userPrompt = (parts || []).map(p => p.text || '').filter(Boolean).join('\n\n');
    if (!userPrompt) return { ok: false, error: 'ไม่มีข้อความส่งให้ Local AI' };

    const messages = [];
    if (systemPromptText) {
        messages.push({ role: 'system', content: systemPromptText });
    }
    messages.push({ role: 'user', content: userPrompt });

    let lastErr = 'Local AI ไม่ตอบสนอง';
    for (const localModel of LOCAL_AI_FALLBACK_MODELS) {
        const res = await ShuttleSecurity.fetchLocalAITunnel(localModel, messages, actionToken);
        if (res.ok && res.text) {
            return { ok: true, text: res.text, model: `Local AI (${localModel})` };
        }
        lastErr = res.error || lastErr;
    }
    return { ok: false, error: lastErr };
}

async function callGeminiAPIWithFallback(parts, expectJson = false, systemPromptText = '', actionToken = '') {
    let lastError = 'ไม่สามารถเชื่อมต่อ AI ได้';
    const now = Date.now();

    for (const modelName of GEMINI_FALLBACK_MODELS) {
        if (exhaustedModelsUntil[modelName] && now < exhaustedModelsUntil[modelName]) {
            continue; // Skip model currently in rate-limit cooldown
        }
        const isGemma = modelName.startsWith('gemma-');
        const effectiveParts = (isGemma && systemPromptText)
            ? [{ text: `[SYSTEM INSTRUCTION - STRICT BWF KNOWLEDGE BASE]\n${systemPromptText}\n\n---\n` }, ...parts]
            : parts;

        const body = { contents: [{ parts: effectiveParts }] };
        if (!isGemma) {
            if (systemPromptText) {
                body.systemInstruction = { parts: [{ text: systemPromptText }] };
            }
            body.generationConfig = { thinkingConfig: { thinkingBudget: 0 }, temperature: 0.2 };
            if (expectJson) body.generationConfig.responseMimeType = 'application/json';
        }

        const res = await ShuttleSecurity.fetchGeminiModel(modelName, body, actionToken);
        if (!res.ok) {
            const msg = res.error || `HTTP ${res.status}`;
            lastError = msg;
            if (res.status === 403) {
                return { ok: false, error: msg };
            }
            if (res.status === 429 || msg.includes('quota') || msg.includes('Quota')) {
                exhaustedModelsUntil[modelName] = now + 15 * 60 * 1000;
            } else if (res.status === 404) {
                exhaustedModelsUntil[modelName] = now + 24 * 60 * 60 * 1000;
            }
            continue;
        }
        if (res.text) {
            ShuttleSecurity.consumeActionToken();
            return { ok: true, text: res.text, model: modelName };
        }
    }

    // Automatic Fallback to Protected Local AI Tunnel when Gemini token/quota is exhausted
    const localRes = await callLocalAIFallback(parts, systemPromptText, actionToken);
    if (localRes.ok) {
        ShuttleSecurity.consumeActionToken();
        return localRes;
    }

    return { ok: false, error: `${lastError} | ${localRes.error}` };
}

function buildLocalTacticalCoachReport() {
    const matchData = buildStructuredMatchDataJSON();
    const kpis = matchData.match_kpis;
    const pList = matchData.players_telemetry;
    const topRunner = [...pList].sort((a, b) => b.distance_meters - a.distance_meters)[0];
    const topHitter = [...pList].sort((a, b) => b.shots_count - a.shots_count)[0];

    const leadText = scoreboard.scoreA === scoreboard.scoreB
        ? `สกอร์เสมอกันที่ ${scoreboard.scoreA}-${scoreboard.scoreB} แต้ม`
        : (scoreboard.scoreA > scoreboard.scoreB
            ? `ทีม A นำอยู่ ${scoreboard.scoreA}-${scoreboard.scoreB} แต้ม`
            : `ทีม B นำอยู่ ${scoreboard.scoreB}-${scoreboard.scoreA} แต้ม`);

    const lineCallText = kpis.total_rallies_logged > 0
        ? `บันทึกแต้มจากสายตาเหยี่ยว ${kpis.total_rallies_logged} แต้ม (ลงในเส้น IN ${kpis.line_call_summary.in_calls} ครั้ง, ออกเส้น OUT ${kpis.line_call_summary.out_errors} ครั้ง, ติดเน็ต NET ${kpis.line_call_summary.net_errors} ครั้ง)`
        : `ยังไม่มีประวัติแต้มจากสายตาเหยี่ยว (Insufficient Line-Call Data)`;

    return [
        `**1. 🏆 สรุปผลการแข่งขันและภาพรวม (Match Summary)** [Confidence: ${matchData.data_completeness.overall_confidence}]`,
        `- **[ข้อเท็จจริงจากข้อมูลจริง]** แมตช์ "${matchData.match_info.match_title}" (${matchData.match_info.category}) • ${leadText} (เซต ${scoreboard.setsA}-${scoreboard.setsB}) • ช่วงเกม: ${matchData.score_summary.pressure_phase}`,
        `- **[ข้อเท็จจริงจากข้อมูลจริง]** ${lineCallText}`,
        ``,
        `**2. 🗺️ การเคลื่อนที่และพื้นที่สนาม 9 โซน (Footwork & 9-Zone Coverage)**`,
        `- **[ข้อเท็จจริงจากข้อมูลจริง]** ระยะวิ่งสะสม: ทีม A รวม ${kpis.team_a_total_distance_m} ม. vs ทีม B รวม ${kpis.team_b_total_distance_m} ม. (${topRunner && topRunner.distance_meters > 0 ? `${topRunner.name} เคลื่อนที่สูงสุด ${topRunner.distance_meters} ม. • โซนหน้า ${topRunner.court_zone_coverage_pct.front_court_pct}% / โซนกลาง Base ${topRunner.court_zone_coverage_pct.mid_court_base_pct}% / โซนหลัง ${topRunner.court_zone_coverage_pct.rear_court_pct}%` : 'รอสะสมระยะวิ่งจากแรลลี่จริง'})`,
        ``,
        `**3. 🏸 วิเคราะห์ทักษะเทคนิคและพลังเกมบุก (Technical & Smash Analysis)**`,
        `- **[ข้อเท็จจริงจากข้อมูลจริง]** ความเร็วลูกตบสูงสุด: **${kpis.max_smash_speed_kmh} km/h** (โดย ${kpis.max_smash_holder}) • ค่าเฉลี่ยลูกตบ **${kpis.avg_smash_speed_kmh} km/h** จากทั้งหมด ${kpis.total_smashes_detected} ลูกตบ`,
        `- **[ข้อเท็จจริงจากข้อมูลจริง]** ผู้เล่นที่ออกลูกมากที่สุด: ${topHitter && topHitter.shots_count > 0 ? `${topHitter.name} (${topHitter.shots_count} ลูก)` : 'ยังไม่มีจังหวะตีที่บันทึกไว้'}`,
        ``,
        `**4. 🎯 แผนการฝึกซ้อมและกลยุทธ์แก้เกม (BWF Knowledge Base Recommendations)**`,
        `- **[ข้อสังเกตและคำแนะนำโค้ช - ทีม A]:** ${isDoublesMatch ? 'เน้นระบบยืน Front-Back เมื่อได้บุก ให้มือหน้าดักตัดลูกหยอดและมือหลังตบจี้ช่องว่างระหว่างผู้เล่นทีม B' : 'เน้นดึงลูก Clear ลึกไปมุมแบ็คแฮนด์สลับตัดหยอดหน้าเน็ต แล้วกลับเข้าจุด Base (Mid Center) ทันที'}`,
        `- **[ข้อสังเกตและคำแนะนำโค้ช - ทีม B]:** ${isDoublesMatch ? 'กางโซนรับ Side-by-Side ลดการตีเสียเอง (Unforced Errors) และบีบจังหวะรับเสิร์ฟลูกที่ 2-3 ให้เข้าทำก่อน' : 'เพิ่มความเหนียวแน่นในเกมรับบล็อกลูกตบขนานเส้นข้าง และใช้ลูกดาดเร็วเปลี่ยนจากรับเป็นรุก'}`
    ].join('\n');
}

function renderMarkdownSafe(mdText) {
    if (!mdText) return '';
    const lines = String(mdText).split(/\r?\n/);
    const htmlParts = [];
    let inList = null; // 'ul' | 'ol'
    let inTable = false;
    let tableHeaderDone = false;

    function closeList() {
        if (inList) {
            htmlParts.push(inList === 'ul' ? '</ul>' : '</ol>');
            inList = null;
        }
    }
    function closeTable() {
        if (inTable) {
            htmlParts.push('</tbody></table></div>');
            inTable = false;
            tableHeaderDone = false;
        }
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/\x27/g, '&#39;');
    }

    function formatInline(str) {
        return str
            .replace(/\*\*(.*?)\*\*/g, '<strong class="text-emerald-300 font-semibold">$1</strong>')
            .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[10.5px] border border-slate-700/50">$1</code>')
            .replace(/(^|[^\*])\*([^\*]+)\*([^\*]|$)/g, '$1<em class="text-slate-300 italic">$2</em>$3');
    }

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();

        if (!trimmed) {
            closeList();
            closeTable();
            continue;
        }

        // Table row
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            closeList();
            // Separator row e.g. |---|---|
            if (/^\|(\s*:?-+:?\s*\|)+$/.test(trimmed)) {
                tableHeaderDone = true;
                continue;
            }
            const rawCells = trimmed.slice(1, -1).split('|').map(c => c.trim());
            const cells = rawCells.map(c => formatInline(escapeHtml(c)));

            if (!inTable) {
                inTable = true;
                tableHeaderDone = false;
                htmlParts.push('<div class="overflow-x-auto my-3 rounded-lg border border-slate-800"><table class="w-full text-[11px] border-collapse bg-slate-900/60">');
                htmlParts.push('<thead><tr class="bg-slate-800/80 border-b border-slate-700/60">');
                cells.forEach(c => htmlParts.push(`<th class="text-emerald-300 font-semibold p-2 text-left border border-slate-700/50">${c}</th>`));
                htmlParts.push('</tr></thead><tbody>');
            } else if (!tableHeaderDone) {
                htmlParts.push('<tr class="bg-slate-800/80 border-b border-slate-700/60">');
                cells.forEach(c => htmlParts.push(`<th class="text-emerald-300 font-semibold p-2 text-left border border-slate-700/50">${c}</th>`));
                htmlParts.push('</tr>');
            } else {
                htmlParts.push('<tr class="border-b border-slate-800/60 hover:bg-slate-800/30">');
                cells.forEach(c => htmlParts.push(`<td class="p-2 border border-slate-800 text-slate-200">${c}</td>`));
                htmlParts.push('</tr>');
            }
            continue;
        } else {
            closeTable();
        }

        // Horizontal line
        if (/^---+$|^===+$/.test(trimmed)) {
            closeList();
            htmlParts.push('<hr class="border-slate-800 my-3" />');
            continue;
        }

        // Headings
        const hMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
        if (hMatch) {
            closeList();
            const level = hMatch[1].length;
            const text = formatInline(escapeHtml(hMatch[2]));
            if (level === 1) {
                htmlParts.push(`<h2 class="text-base font-bold text-white mt-4 mb-2 pb-1 border-b border-slate-700">${text}</h2>`);
            } else if (level === 2) {
                htmlParts.push(`<h3 class="text-sm font-bold text-emerald-300 mt-4 mb-2 pb-1 border-b border-slate-800/80 flex items-center gap-1.5">${text}</h3>`);
            } else if (level === 3) {
                htmlParts.push(`<h4 class="text-xs font-bold text-cyan-300 mt-3 mb-1 flex items-center gap-1.5">${text}</h4>`);
            } else {
                htmlParts.push(`<h5 class="text-xs font-bold text-slate-300 mt-2 mb-1">${text}</h5>`);
            }
            continue;
        }

        // Unordered list
        const ulMatch = trimmed.match(/^[\*\-]\s+(.*)$/);
        if (ulMatch) {
            if (inList !== 'ul') {
                closeList();
                inList = 'ul';
                htmlParts.push('<ul class="space-y-1.5 my-2 pl-1">');
            }
            const itemContent = formatInline(escapeHtml(ulMatch[1]));
            htmlParts.push(`<li class="flex items-start gap-2 text-slate-200"><span class="text-emerald-400 font-bold select-none">•</span><span>${itemContent}</span></li>`);
            continue;
        }

        // Ordered list
        const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (olMatch) {
            if (inList !== 'ol') {
                closeList();
                inList = 'ol';
                htmlParts.push('<ol class="space-y-1 my-2 pl-4 list-decimal text-slate-200">');
            }
            const itemContent = formatInline(escapeHtml(olMatch[2]));
            htmlParts.push(`<li class="pl-1">${itemContent}</li>`);
            continue;
        }

        closeList();
        // Regular paragraph line
        const pText = formatInline(escapeHtml(trimmed));
        htmlParts.push(`<p class="my-1.5 text-slate-200 leading-relaxed">${pText}</p>`);
    }

    closeList();
    closeTable();
    return htmlParts.join('');
}

function renderCoachPreviewStandby() {
    const outputBox = document.getElementById('aiCoachOutput');
    if (!outputBox) return;
    const localReport = buildLocalTacticalCoachReport();
    const formatted = renderMarkdownSafe(localReport);

    outputBox.innerHTML = `
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3 text-xs leading-relaxed">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <span class="font-bold text-cyan-300 flex items-center gap-1.5">
                    <i class="ph-fill ph-book-open-text"></i> สรุปสถิติตามฐานความรู้ BWF Master Knowledge (โหมดประหยัดโควตา)
                </span>
                <span class="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">Zero-Hallucination Mode</span>
            </div>
            <div class="text-slate-200">${formatted}</div>
            <div class="pt-1 text-[11px] text-amber-300/90 flex items-center gap-1.5">
                <i class="ph-fill ph-info"></i>
                <span>เมื่อจบเกม กดปุ่ม <b>"วิเคราะห์ผลเกมนี้ด้วย AI"</b> ด้านบน ระบบจะค้นคืนข้อมูลจาก <b>Master Knowledge + System Prompt + Match Data JSON</b> เพื่อสร้างรายงานวิเคราะห์เชิงลึก 7 หมวดหมู่</span>
            </div>
        </div>
    `;
}

async function generateAICoachAdvice(focusTopic = 'full', userTriggered = false) {
    const outputBox = document.getElementById('aiCoachOutput');
    if (!outputBox) return;

    // Strictly restrict external AI & Tunnel execution to genuine user clicks on the AI Coach tab (Tab 4)
    if (!userTriggered || activeTab !== 'coach') {
        renderCoachPreviewStandby();
        return;
    }

    await ensureKnowledgeBaseLoaded();
    const matchDataJSON = buildStructuredMatchDataJSON();

    const snapshotKey = `${scoreboard.scoreA}-${scoreboard.scoreB}-${maxRecordedSpeed}-${shotHistory.length}-${scoreboard.pointLog?.length || 0}-${focusTopic}`;
    if (snapshotKey === lastAnalyzedSnapshotKey && latestAICoachReportText) {
        const cachedHtml = renderMarkdownSafe(latestAICoachReportText);
        outputBox.innerHTML = `
            <div class="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-4 space-y-3 text-xs leading-relaxed">
                <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span class="font-bold text-emerald-400 flex items-center gap-1.5">
                        <i class="ph-fill ph-sparkle"></i> รายงานวิเคราะห์หลังจบเกม (BWF Knowledge Base AI)
                    </span>
                    <span class="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">Cached (ประหยัดโควตา)</span>
                </div>
                <div class="text-slate-200">${cachedHtml}</div>
            </div>
        `;
        return;
    }

    // Issue one-time security token & enforce rate-limit guard before contacting API / Tunnel
    const tokenRes = ShuttleSecurity.issueActionToken();
    if (!tokenRes.ok) {
        showToast(tokenRes.error);
        return;
    }

    outputBox.innerHTML = `
        <div class="py-8 text-center text-xs text-emerald-300 flex flex-col items-center gap-2">
            <i class="ph-bold ph-spinner animate-spin text-2xl text-emerald-400"></i>
            <span>กำลังค้นคืนฐานความรู้ BWF Master Knowledge และส่ง Match Data JSON ให้ AI วิเคราะห์...</span>
        </div>
    `;
    try {
        const retrievedMasterContext = retrieveMasterKnowledgeContext(matchDataJSON);
        const userPrompt = [
            `### 1. ข้อมูลการแข่งขันจริงจากสนาม (MATCH DATA JSON - ห้ามสมมติข้อมูลนอกเหนือจาก JSON นี้เด็ดขาด):`,
            '```json',
            JSON.stringify(matchDataJSON, null, 2),
            '```',
            ``,
            `### 2. ความรู้เฉพาะทางที่ค้นคืนจาก BWF Master Knowledge สำหรับแมตช์นี้:`,
            retrievedMasterContext,
            ``,
            `### 3. โครงสร้างรายงานที่ต้องส่งออก (MATCH REPORT TEMPLATE):`,
            ShuttleKB.reportTemplate
        ].join('\n');

        const result = await callGeminiAPIWithFallback(
            [{ text: userPrompt }],
            false,
            ShuttleKB.systemPrompt,
            tokenRes.token
        );
        const finalReportText = result.ok ? result.text.trim() : buildLocalTacticalCoachReport();
        const badgeLabel = result.ok ? `BWF Knowledge AI (${result.model})` : 'On-Device BWF Knowledge AI';

        latestAICoachReportText = finalReportText;
        lastAnalyzedSnapshotKey = snapshotKey;

        const formattedHtml = renderMarkdownSafe(finalReportText);

        outputBox.innerHTML = `
            <div class="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-4 space-y-3 text-xs leading-relaxed">
                <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span class="font-bold text-emerald-400 flex items-center gap-1.5">
                        <i class="ph-fill ph-sparkle"></i> รายงานวิเคราะห์หลังจบเกม (BWF Knowledge Base)
                    </span>
                    <span class="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">${badgeLabel}</span>
                </div>
                <div class="text-slate-200">${formattedHtml}</div>
            </div>
        `;
    } catch (e) {
        renderCoachPreviewStandby();
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
    latestAICoachReportText = '';
    lastAnalyzedSnapshotKey = '';

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
        p.isLocked = false;
        p._posWindow = [];
        p._anchor = null;
    });

    if (typeof window.resetPlayerLockState === 'function') {
        window.resetPlayerLockState();
    }

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
    ['live', 'stats', 'analytics', 'coach', 'reviews'].forEach(t => {
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
    } else if (tabId === 'coach' && !latestAICoachReportText) {
        renderCoachPreviewStandby();
    } else if (tabId === 'reviews') {
        if (!communityReviews || communityReviews.length === 0) {
            communityReviews = loadLocalCommunityReviews();
        }
        updateReviewIdentityPreview();
        updateReviewScorecardUI();
        renderCommunityReviews();
        fetchCommunityReviewsFromSupabase();
    }
}

function toggleAuthModal() {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    modal.classList.toggle('hidden');
    const msg = document.getElementById('authStatusMsg');
    if (msg) msg.classList.add('hidden');
    loadRememberedCredentials();
    updateAuthUI();
}

function togglePasswordVisibility() {
    const passInput = document.getElementById('authPasswordInput');
    const eyeIcon = document.getElementById('authPasswordEyeIcon');
    if (!passInput) return;
    const isHidden = passInput.type === 'password';
    passInput.type = isHidden ? 'text' : 'password';
    if (eyeIcon) {
        eyeIcon.className = isHidden ? 'ph-bold ph-eye-slash text-base text-emerald-400' : 'ph-bold ph-eye text-base';
    }
}

function loadRememberedCredentials() {
    try {
        const savedRemember = localStorage.getItem('shuttlepro_remember_me');
        const rememberChk = document.getElementById('authRememberMe');
        const emailInput = document.getElementById('authEmailInput');
        if (rememberChk) rememberChk.checked = savedRemember !== 'false';
        if (savedRemember !== 'false' && emailInput && !emailInput.value) {
            const savedEmail = localStorage.getItem('shuttlepro_remember_email') || '';
            if (savedEmail) emailInput.value = savedEmail;
        }
    } catch (e) {}
}

function switchAuthMode(mode) {
    currentAuthMode = mode === 'signup' ? 'signup' : 'signin';
    const tabIn = document.getElementById('tabAuthSignIn');
    const tabUp = document.getElementById('tabAuthSignUp');
    const btnTxt = document.getElementById('btnSubmitEmailAuthText');
    const msg = document.getElementById('authStatusMsg');
    if (msg) msg.classList.add('hidden');

    if (currentAuthMode === 'signin') {
        if (tabIn) tabIn.className = 'py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 transition-all';
        if (tabUp) tabUp.className = 'py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-all';
        if (btnTxt) btnTxt.textContent = 'เข้าสู่ระบบด้วย Email';
    } else {
        if (tabUp) tabUp.className = 'py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 transition-all';
        if (tabIn) tabIn.className = 'py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-all';
        if (btnTxt) btnTxt.textContent = 'สมัครสมาชิกด้วย Email';
    }
}

function showAuthMessage(text, isError = true) {
    const msg = document.getElementById('authStatusMsg');
    if (!msg) return;
    msg.textContent = text;
    msg.className = isError
        ? 'text-[11px] px-3 py-2 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300'
        : 'text-[11px] px-3 py-2 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300';
    msg.classList.remove('hidden');
}

function updateAuthUI() {
    const loggedInView = document.getElementById('authLoggedInView');
    const formView = document.getElementById('authFormView');
    const emailEl = document.getElementById('authUserEmail');
    const headerLabel = document.getElementById('headerAuthLabel');
    const headerIcon = document.getElementById('headerAuthIcon');
    const headerBtn = document.getElementById('btnHeaderAuth');
    const sheetLabel = document.getElementById('sheetAuthLabel');
    const sheetStatusSub = document.getElementById('sheetUserStatusSub');
    const hudUserBtn = document.getElementById('hudUserAuthBtn');
    const hudUserIcon = document.getElementById('hudUserAuthIcon');
    const hudUserLabel = document.getElementById('hudUserAuthLabel');

    if (currentAuthUser) {
        const email = currentAuthUser.email || 'ผู้ใช้งาน Cloud';
        const displayName = currentAuthUser.user_metadata?.full_name || currentAuthUser.user_metadata?.name || email.split('@')[0];
        if (loggedInView) loggedInView.classList.remove('hidden');
        if (formView) formView.classList.add('hidden');
        if (emailEl) emailEl.textContent = email;
        if (headerLabel) headerLabel.textContent = displayName;
        if (headerIcon) headerIcon.className = 'ph-fill ph-check-circle text-emerald-400 text-sm';
        if (headerBtn) headerBtn.className = 'h-8 px-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 text-[11px] font-semibold';
        if (sheetLabel) sheetLabel.textContent = `${displayName} (${email})`;
        if (sheetStatusSub) sheetStatusSub.textContent = 'เข้าสู่ระบบ Cloud แล้ว';
        if (hudUserLabel) hudUserLabel.textContent = displayName;
        if (hudUserIcon) hudUserIcon.className = 'ph-fill ph-user-check text-emerald-400 text-xs';
        if (hudUserBtn) hudUserBtn.className = 'hud-glass rounded-full px-2.5 py-[3px] flex items-center gap-1 shrink-0 text-[10px] text-emerald-300 font-semibold pointer-events-auto border border-emerald-500/40';
    } else {
        if (loggedInView) loggedInView.classList.add('hidden');
        if (formView) formView.classList.remove('hidden');
        if (headerLabel) headerLabel.textContent = 'เข้าสู่ระบบ';
        if (headerIcon) headerIcon.className = 'ph-bold ph-user-circle text-sm';
        if (headerBtn) headerBtn.className = 'h-8 px-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-cyan-300 border border-slate-700 flex items-center gap-1 text-[11px] font-semibold';
        if (sheetLabel) sheetLabel.textContent = 'ยังไม่ได้เข้าสู่ระบบ (แตะเพื่อล็อกอิน)';
        if (sheetStatusSub) sheetStatusSub.textContent = 'สถานะบัญชีผู้ใช้';
        if (hudUserLabel) hudUserLabel.textContent = 'เข้าสู่ระบบ';
        if (hudUserIcon) hudUserIcon.className = 'ph-bold ph-user-circle text-cyan-300 text-xs';
        if (hudUserBtn) hudUserBtn.className = 'hud-glass rounded-full px-2.5 py-[3px] flex items-center gap-1 shrink-0 text-[10px] text-cyan-300 font-semibold pointer-events-auto border border-cyan-500/30';
    }
}

async function initSupabaseAuth() {
    loadRememberedCredentials();
    if (!supabaseClient) return;
    try {
        const savedRemember = localStorage.getItem('shuttlepro_remember_me');
        const isSessionStillActive = sessionStorage.getItem('shuttlepro_active_session') === '1';
        if (savedRemember === 'false' && !isSessionStillActive) {
            await supabaseClient.auth.signOut();
            currentAuthUser = null;
            updateAuthUI();
            return;
        }

        const { data } = await supabaseClient.auth.getSession();
        currentAuthUser = data?.session?.user || null;
        if (currentAuthUser) {
            sessionStorage.setItem('shuttlepro_active_session', '1');
        }
        updateAuthUI();

        supabaseClient.auth.onAuthStateChange(async (_event, session) => {
            const prevUser = currentAuthUser?.id;
            currentAuthUser = session?.user || null;
            if (currentAuthUser) {
                sessionStorage.setItem('shuttlepro_active_session', '1');
            }
            updateAuthUI();
            if (prevUser !== currentAuthUser?.id) {
                if (currentAuthUser) {
                    await autoSyncCachedMatchesToAccount();
                }
                fetchCloudMatches(false);
            }
        });
    } catch (e) {
        console.warn('Supabase Auth init warning:', e);
    }
}

async function handleEmailAuthSubmit() {
    if (!supabaseClient) {
        showAuthMessage('ไม่สามารถเชื่อมต่อบริการ Supabase Auth ได้');
        return;
    }
    const email = document.getElementById('authEmailInput')?.value.trim();
    const password = document.getElementById('authPasswordInput')?.value;
    const rememberMe = document.getElementById('authRememberMe')?.checked ?? true;
    if (!email || !password) {
        showAuthMessage('กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน');
        return;
    }
    if (password.length < 6) {
        showAuthMessage('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
        return;
    }

    try {
        localStorage.setItem('shuttlepro_remember_me', rememberMe ? 'true' : 'false');
        if (rememberMe) {
            localStorage.setItem('shuttlepro_remember_email', email);
        } else {
            localStorage.removeItem('shuttlepro_remember_email');
        }
        sessionStorage.setItem('shuttlepro_active_session', '1');
    } catch (e) {}

    const btnTxt = document.getElementById('btnSubmitEmailAuthText');
    const origText = btnTxt ? btnTxt.textContent : '';
    if (btnTxt) btnTxt.textContent = 'กำลังดำเนินการ...';

    try {
        if (currentAuthMode === 'signup') {
            const { data, error } = await supabaseClient.auth.signUp({ email, password });
            if (error) throw error;
            if (data?.session) {
                currentAuthUser = data.session.user;
                updateAuthUI();
                toggleAuthModal();
                showToast(`เข้าสู่ระบบสำเร็จ (${email})`);
                await autoSyncCachedMatchesToAccount();
                fetchCloudMatches(false);
            } else {
                showAuthMessage('สมัครสมาชิกสำเร็จ! หากระบบตั้งค่ายืนยันอีเมลไว้ กรุณาตรวจสอบกล่องจดหมายของคุณ หรือกดเข้าสู่ระบบได้เลย', false);
            }
        } else {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            currentAuthUser = data?.user || null;
            updateAuthUI();
            toggleAuthModal();
            showToast(`เข้าสู่ระบบสำเร็จ (${email})`);
            await autoSyncCachedMatchesToAccount();
            fetchCloudMatches(true);
        }
    } catch (err) {
        showAuthMessage(err.message || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    } finally {
        if (btnTxt) btnTxt.textContent = origText;
    }
}

async function handleGoogleSignIn() {
    if (!supabaseClient) {
        showAuthMessage('ไม่สามารถเชื่อมต่อบริการ Supabase Auth ได้');
        return;
    }
    try {
        const redirectTo = window.location.origin + window.location.pathname;
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo }
        });
        if (error) throw error;
    } catch (err) {
        showAuthMessage(`ไม่สามารถเข้าสู่ระบบด้วย Google ได้: ${err.message || 'กรุณาเปิด Google Provider ในหน้า Supabase Auth'}`);
    }
}

async function handleSignOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    currentAuthUser = null;
    updateAuthUI();
    toggleAuthModal();
    showToast('ออกจากระบบเรียบร้อยแล้ว');
    fetchCloudMatches(false);
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

let currentDetailMatchIndex = -1;

function openAuthModalForSignIn() {
    currentAuthMode = 'signin';
    const tabSignin = document.getElementById('authTabSignin');
    const tabSignup = document.getElementById('authTabSignup');
    const submitBtnTxt = document.getElementById('btnSubmitEmailAuthText');
    if (tabSignin) tabSignin.classList.add('bg-cyan-500/20', 'text-cyan-300', 'border', 'border-cyan-500/40');
    if (tabSignup) tabSignup.classList.remove('bg-cyan-500/20', 'text-cyan-300', 'border', 'border-cyan-500/40');
    if (submitBtnTxt) submitBtnTxt.textContent = 'เข้าสู่ระบบด้วยอีเมล';
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.remove('hidden');
}

async function autoSyncCachedMatchesToAccount() {
    if (!currentAuthUser?.id) return;
    try {
        let unsyncedMatches = matchHistory.filter(m => !m.cloudId || !m.userId || m.userId !== currentAuthUser.id);
        if (unsyncedMatches.length === 0) return;

        let syncedCount = 0;
        for (const m of unsyncedMatches) {
            m.userId = currentAuthUser.id;
            const ok = await syncMatchRecordToSupabase(m);
            if (ok) syncedCount++;
        }
        if (syncedCount > 0) {
            try {
                localStorage.setItem('shuttlepro_match_history', JSON.stringify(matchHistory));
            } catch (e) {}
            renderSavedMatchesList();
            showToast(`Saved ✓ ซิงค์แมตช์ที่บันทึกไว้ในเครื่อง (${syncedCount} รายการ) เข้าบัญชีของคุณเรียบร้อย`);
        }
    } catch (e) {
        console.warn('Auto sync cached matches warning:', e);
    }
}

async function syncMatchRecordToSupabase(record) {
    try {
        // Store AI text summary inside players_summary JSONB or as a dedicated metadata entry (NEVER upload video files)
        const playersPayload = (record.playersSummary || []).map((p, idx) =>
            idx === 0 && record.aiAnalysisText ? { ...p, aiAnalysisText: record.aiAnalysisText } : p
        );
        const payload = {
            client_match_id: record.id,
            club_code: record.clubCode || clubCode || 'PUBLIC',
            user_id: currentAuthUser?.id || record.userId || null,
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
            players_summary: playersPayload,
            recent_shots: record.recentShots || []
        };

        if (supabaseClient) {
            const { data, error } = await supabaseClient
                .from('matches')
                .upsert(payload, { onConflict: 'club_code,client_match_id' })
                .select();
            if (error) throw error;
            if (data && data[0] && data[0].id) {
                record.cloudId = data[0].id;
                try {
                    localStorage.setItem('shuttlepro_match_history', JSON.stringify(matchHistory));
                } catch (e) {}
                renderSavedMatchesList();
            }
        } else {
            const res = await ShuttleSecurity.fetchSupabaseRest('matches', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation,resolution=merge-duplicates'
                },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const rows = await res.json();
            if (rows && rows[0] && rows[0].id) {
                record.cloudId = rows[0].id;
                try {
                    localStorage.setItem('shuttlepro_match_history', JSON.stringify(matchHistory));
                } catch (e) {}
                renderSavedMatchesList();
            }
        }
        isCloudSynced = true;
        updateCloudSyncBadge('Saved ✓', true);
        return true;
    } catch (e) {
        updateCloudSyncBadge('Saved ✓ (ในเครื่อง)', false);
        return false;
    }
}

async function fetchCloudMatches(showNotification = false) {
    try {
        updateCloudSyncBadge(currentAuthUser ? 'Saved ✓' : 'Saved ✓ (ในเครื่อง)', true);
        if (!currentAuthUser?.id) {
            // Unauthenticated: Only display what's in local browser cache, strictly isolating personal accounts
            renderSavedMatchesList();
            return;
        }

        let rows = [];
        if (supabaseClient) {
            let query = supabaseClient
                .from('matches')
                .select('*')
                .eq('user_id', currentAuthUser.id)
                .order('created_at', { ascending: false })
                .limit(35);
            const { data, error } = await query;
            if (error) throw error;
            rows = data || [];
        } else {
            const userId = encodeURIComponent(currentAuthUser.id);
            const res = await ShuttleSecurity.fetchSupabaseRest(`matches?user_id=eq.${userId}&order=created_at.desc&limit=35`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            rows = await res.json();
        }

        const cloudRecords = (rows || []).map(r => {
            const pSum = r.players_summary || [];
            const savedAiText = (pSum[0] && pSum[0].aiAnalysisText) ? pSum[0].aiAnalysisText : '';
            return {
                id: r.client_match_id || new Date(r.created_at).getTime(),
                cloudId: r.id,
                userId: r.user_id || currentAuthUser?.id || null,
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
                playersSummary: pSum,
                recentShots: r.recent_shots || [],
                aiAnalysisText: savedAiText
            };
        });

        const cloudIds = new Set(cloudRecords.map(c => c.id));
        const localUnsynced = matchHistory.filter(m => (!m.userId || m.userId === currentAuthUser.id) && !cloudIds.has(m.id));
        matchHistory = [...localUnsynced, ...cloudRecords].slice(0, 35);
        try {
            localStorage.setItem('shuttlepro_match_history', JSON.stringify(matchHistory));
        } catch (e) {}
        renderSavedMatchesList();
        isCloudSynced = true;
        updateCloudSyncBadge('Saved ✓', true);

        for (const unsynced of localUnsynced) {
            syncMatchRecordToSupabase(unsynced);
        }
        if (showNotification) showToast(`Saved ✓ ซิงค์ประวัติแมตช์ล่าสุด (${cloudRecords.length} แมตช์)`);
    } catch (e) {
        updateCloudSyncBadge('Saved ✓ (ในเครื่อง)', false);
    }
}

async function saveCurrentMatchRecord() {
    const avgSmash = allSmashSpeeds.length > 0
        ? Math.round(allSmashSpeeds.reduce((a, b) => a + b, 0) / allSmashSpeeds.length)
        : 0;

    // Ensure we have a tactical text summary for the match
    if (!latestAICoachReportText) {
        latestAICoachReportText = buildLocalTacticalCoachReport();
    }

    const record = {
        id: Date.now(),
        userId: currentAuthUser?.id || null,
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
        aiAnalysisText: latestAICoachReportText,
        playersSummary: Object.values(players).map(p => ({
            id: p.id,
            name: p.name,
            team: p.team,
            color: p.color,
            distanceMeters: p.distanceMeters,
            maxSpeedKmh: p.maxSpeedKmh,
            maxSmashKmh: p.maxSmashKmh,
            shotsCount: p.shotsCount,
            positions: (p.positions || []).slice(-150)
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

    if (!currentAuthUser) {
        showToast(`Saved ✓ บันทึกในเบราว์เซอร์แล้ว (เข้าสู่ระบบเพื่อสำรองข้อมูลออนไลน์)`);
    } else {
        showToast(`กำลังบันทึกข้อมูลและสถิติ "${record.title}"...`);
        const ok = await syncMatchRecordToSupabase(record);
        if (ok) {
            showToast(`Saved ✓ บันทึกบทวิเคราะห์ "${record.title}" เรียบร้อย`);
        }
    }
}

function renderSavedMatchesList() {
    const container = document.getElementById('savedMatchesList');
    if (!container) return;

    // Show or hide unauthenticated warning banner
    const unauthBox = document.getElementById('unauthenticatedWarningBox');
    if (unauthBox) {
        if (!currentAuthUser) {
            unauthBox.classList.remove('hidden');
        } else {
            unauthBox.classList.add('hidden');
        }
    }

    // Display records strictly belonging to current signed-in account, or all local cache if guest
    const displayList = currentAuthUser
        ? matchHistory.filter(m => !m.userId || m.userId === currentAuthUser.id)
        : matchHistory;

    if (!displayList || displayList.length === 0) {
        container.innerHTML = `<div class="text-center text-xs text-slate-500 py-6">ยังไม่มีประวัติแมตช์ • กดบันทึกแมตช์เพื่อดูสถิติ, Heatmap และบทวิเคราะห์ย้อนหลัง</div>`;
        return;
    }

    container.innerHTML = displayList.map((m, idx) => {
        const cloudIcon = m.cloudId
            ? `<span class="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[9px] font-bold shrink-0 flex items-center gap-1"><i class="ph-fill ph-check-circle text-[10px]"></i> Saved ✓</span>`
            : `<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[9px] font-medium shrink-0 flex items-center gap-1"><i class="ph-bold ph-hard-drive text-[10px]"></i> ในเครื่อง</span>`;
        const aiSnippet = m.aiAnalysisText || (m.playersSummary?.[0]?.aiAnalysisText) || '';
        const cleanSnippet = aiSnippet.replace(/[#*`|\-_]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
        return `
        <div onclick="openMatchDetailModal(${idx})" class="group cursor-pointer bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-3.5 space-y-2 transition-all shadow-sm hover:shadow-lg active:scale-[0.99]">
            <div class="flex items-center justify-between gap-2">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors truncate">${m.title}</span>
                        <button onclick="event.stopPropagation(); editSavedMatchTitle(${idx})" class="p-1 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-white/10 transition-colors" title="แก้ไขชื่อแมตช์">
                            <i class="ph-bold ph-pencil-simple text-xs"></i>
                        </button>
                        <span class="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold shrink-0">
                            A ${m.scoreA} - ${m.scoreB} B
                        </span>
                        ${cloudIcon}
                    </div>
                    <div class="text-[10px] text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                        <span>${m.savedAt}</span>
                        <span>•</span>
                        <span>เวลา ${formatTimeSec(m.durationSec || 0)}</span>
                        <span>•</span>
                        <span class="text-amber-300">ตบสูงสุด ${m.maxSmashKmh || 0} km/h</span>
                        <span>•</span>
                        <span class="text-cyan-400 font-medium flex items-center gap-0.5"><i class="ph-bold ph-eye"></i> แตะเพื่อดูสถิติ &amp; Heatmap</span>
                    </div>
                </div>
                <div class="flex items-center gap-1 shrink-0" onclick="event.stopPropagation()">
                    <button onclick="exportSavedMatchById(${idx})" class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 flex items-center justify-center transition-colors" title="Export JSON">
                        <i class="ph-bold ph-download-simple text-xs"></i>
                    </button>
                    <button onclick="deleteSavedMatchById(${idx})" class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-rose-300 flex items-center justify-center transition-colors" title="ลบรายการ">
                        <i class="ph-bold ph-trash text-xs"></i>
                    </button>
                </div>
            </div>
            ${cleanSnippet ? `<div class="text-[11px] text-slate-300 bg-slate-950/70 border border-slate-800/80 rounded-xl px-3 py-2 line-clamp-2">📝 ${cleanSnippet}${aiSnippet.length > 120 ? '...' : ''}</div>` : ''}
        </div>
    `}).join('');
}

async function editSavedMatchTitle(idx) {
    const record = matchHistory[idx];
    if (!record) return;
    const currentName = record.title || '';
    const newTitle = prompt('แก้ไขชื่อแมตช์:', currentName);
    if (!newTitle || !newTitle.trim() || newTitle.trim() === currentName) return;

    record.title = newTitle.trim();
    try {
        localStorage.setItem('shuttlepro_match_history', JSON.stringify(matchHistory));
    } catch (e) {}
    renderSavedMatchesList();

    // If detail modal is open for this record, update title in modal
    if (currentDetailMatchIndex === idx) {
        const titleEl = document.getElementById('detailMatchTitle');
        if (titleEl) titleEl.textContent = record.title;
    }

    if (record.cloudId && supabaseClient) {
        try {
            await supabaseClient.from('matches').update({ title: record.title }).eq('id', record.cloudId);
        } catch (e) {
            console.warn('Update match title in cloud warning:', e);
        }
    }
    showToast(`Saved ✓ แก้ไขชื่อแมตช์เป็น "${record.title}" เรียบร้อย`);
}

function editCurrentDetailMatchTitle() {
    if (currentDetailMatchIndex >= 0) {
        editSavedMatchTitle(currentDetailMatchIndex);
    }
}

function openMatchDetailModal(idx) {
    const record = matchHistory[idx];
    if (!record) return;
    currentDetailMatchIndex = idx;

    const modal = document.getElementById('matchDetailModal');
    if (!modal) return;

    // Header info
    const titleEl = document.getElementById('detailMatchTitle');
    const scoreEl = document.getElementById('detailMatchScore');
    const dateEl = document.getElementById('detailMatchDate');
    const durEl = document.getElementById('detailMatchDuration');
    const spdEl = document.getElementById('detailMatchSpeed');

    if (titleEl) titleEl.textContent = record.title || 'แมตช์ไม่มีชื่อ';
    if (scoreEl) scoreEl.textContent = `A ${record.scoreA || 0} - ${record.scoreB || 0} B`;
    if (dateEl) dateEl.textContent = record.savedAt || '-';
    if (durEl) durEl.textContent = `เวลา ${formatTimeSec(record.durationSec || 0)}`;
    if (spdEl) spdEl.textContent = `ตบสูงสุด ${record.maxSmashKmh || 0} km/h`;

    // Tab 1: Stats & Overview
    const elMaxSmash = document.getElementById('detailStatMaxSmash');
    const elAvgSmash = document.getElementById('detailStatAvgSmash');
    const elTotalSmashes = document.getElementById('detailStatTotalSmashes');
    const elDuration = document.getElementById('detailStatDuration');

    if (elMaxSmash) elMaxSmash.textContent = `${record.maxSmashKmh || 0} km/h`;
    if (elAvgSmash) elAvgSmash.textContent = `${record.avgSmashKmh || 0} km/h`;
    if (elTotalSmashes) elTotalSmashes.textContent = `${record.totalSmashes || 0} ครั้ง`;
    if (elDuration) elDuration.textContent = formatTimeSec(record.durationSec || 0);

    // Player Cards
    const playerCardsContainer = document.getElementById('detailPlayerCardsList');
    if (playerCardsContainer) {
        const pSummary = record.playersSummary || [];
        if (pSummary.length === 0) {
            playerCardsContainer.innerHTML = `<div class="text-slate-500 text-xs col-span-2 py-3 text-center">ไม่มีข้อมูลสถิติผู้เล่นสำหรับแมตช์นี้</div>`;
        } else {
            playerCardsContainer.innerHTML = pSummary.map(p => `
                <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-1.5">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="w-3 h-3 rounded-full" style="background-color: ${p.color || (p.team === 'A' ? '#38bdf8' : '#f97316')}"></span>
                            <span class="text-xs font-bold text-white">${p.name || p.id}</span>
                            <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">ทีม ${p.team || 'A'}</span>
                        </div>
                        <span class="text-xs font-mono font-bold text-emerald-400">${(p.distanceMeters || 0).toFixed(1)} ม.</span>
                    </div>
                    <div class="grid grid-cols-3 gap-1 text-[10px] bg-slate-950/60 p-2 rounded-lg text-center">
                        <div>
                            <span class="text-slate-400 block">ตบสูงสุด</span>
                            <span class="font-mono font-bold text-amber-300">${p.maxSmashKmh || 0} km/h</span>
                        </div>
                        <div>
                            <span class="text-slate-400 block">สปีดวิ่งสูงสุด</span>
                            <span class="font-mono font-bold text-cyan-300">${(p.maxSpeedKmh || 0).toFixed(1)} km/h</span>
                        </div>
                        <div>
                            <span class="text-slate-400 block">จำนวนช็อต</span>
                            <span class="font-mono font-bold text-emerald-300">${p.shotsCount || 0}</span>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    }

    // Recent Shots List
    const shotsContainer = document.getElementById('detailRecentShotsList');
    if (shotsContainer) {
        const shots = record.recentShots || [];
        if (shots.length === 0) {
            shotsContainer.innerHTML = `<div class="text-slate-500 text-xs py-2 text-center">ไม่มีบันทึกช็อตสำคัญ</div>`;
        } else {
            shotsContainer.innerHTML = shots.map((s, sIdx) => `
                <div class="flex items-center justify-between bg-slate-900/80 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs">
                    <div class="flex items-center gap-2">
                        <span class="text-slate-500 font-mono text-[10px]">#${sIdx + 1}</span>
                        <span class="font-semibold text-slate-200">${s.type || 'Shot'}</span>
                        <span class="text-[10px] text-slate-400">${s.player || ''}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-mono font-bold text-amber-300">${s.speed || 0} km/h</span>
                        <span class="text-[10px] text-slate-500">${s.time || ''}</span>
                    </div>
                </div>
            `).join('');
        }
    }

    // Tab 2: 2D Heatmap & Trails
    renderDetailHeatmap(record);

    // Tab 3: AI Coach Report
    const coachContainer = document.getElementById('detailCoachReportContent');
    if (coachContainer) {
        const aiText = record.aiAnalysisText || (record.playersSummary?.[0]?.aiAnalysisText) || 'ไม่มีบทวิเคราะห์โค้ช AI สำหรับแมตช์นี้';
        coachContainer.innerHTML = renderMarkdownSafe(aiText);
    }

    modal.classList.remove('hidden');
    switchDetailTab('stats');
}

function closeMatchDetailModal() {
    document.getElementById('matchDetailModal')?.classList.add('hidden');
    currentDetailMatchIndex = -1;
}

function switchDetailTab(tabKey) {
    const tabs = ['stats', 'heatmap', 'coach'];
    tabs.forEach(t => {
        const view = document.getElementById(`detailView-${t}`);
        const btn = document.getElementById(`btnDetailTab-${t}`);
        if (view) {
            if (t === tabKey) view.classList.remove('hidden');
            else view.classList.add('hidden');
        }
        if (btn) {
            if (t === tabKey) {
                btn.className = 'py-2.5 px-3 text-xs font-bold border-b-2 border-emerald-400 text-emerald-400 flex items-center gap-1.5 transition-all';
            } else {
                btn.className = 'py-2.5 px-3 text-xs font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-all';
            }
        }
    });

    if (tabKey === 'heatmap' && currentDetailMatchIndex >= 0) {
        setTimeout(() => {
            renderDetailHeatmap(matchHistory[currentDetailMatchIndex]);
        }, 50);
    }
}

function renderDetailHeatmap(record) {
    if (!record) return;
    const canvas = document.getElementById('detailHeatmapCanvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width > 0 ? Math.floor(rect.width) : 600;
    const h = rect.height > 0 ? Math.floor(rect.height) : 375;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const padX = w * 0.08;
    const padY = h * 0.08;
    const cw = w - padX * 2;
    const ch = h - padY * 2;

    function normTo2DCourt(nx, ny) {
        return { x: padX + ny * cw, y: padY + nx * ch };
    }

    // Badminton Court Green Background
    ctx.fillStyle = '#064e3b';
    ctx.fillRect(padX, padY, cw, ch);

    // Court Boundary Lines (Standard BWF)
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(padX, padY, cw, ch);
    ctx.strokeRect(padX, padY + ch * 0.0754, cw, ch * (1 - 0.1508));

    ctx.beginPath();
    // Short Service Lines
    ctx.moveTo(padX + cw * 0.352, padY);
    ctx.lineTo(padX + cw * 0.352, padY + ch);
    ctx.moveTo(padX + cw * 0.648, padY);
    ctx.lineTo(padX + cw * 0.648, padY + ch);
    // Center Lines
    ctx.moveTo(padX, padY + ch * 0.5);
    ctx.lineTo(padX + cw * 0.352, padY + ch * 0.5);
    ctx.moveTo(padX + cw * 0.648, padY + ch * 0.5);
    ctx.lineTo(padX + cw, padY + ch * 0.5);
    ctx.stroke();

    // Center Net Line
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(padX + cw * 0.5, padY - 8);
    ctx.lineTo(padX + cw * 0.5, padY + ch + 8);
    ctx.stroke();
    ctx.restore();

    const pSummary = record.playersSummary || [];
    const legend = document.getElementById('detailHeatmapLegend');
    if (legend) {
        legend.innerHTML = pSummary.map(p => {
            const color = p.color || (p.team === 'A' ? '#38bdf8' : '#f97316');
            return `
                <div class="flex items-center gap-1.5">
                    <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${color}"></span>
                    <span class="font-medium text-slate-200">${p.name || p.id}</span>
                    <span class="text-slate-400 font-mono text-[10px]">(${(p.distanceMeters || 0).toFixed(1)} ม.)</span>
                </div>
            `;
        }).join('');
    }

    // Draw Heatmap and Trails
    pSummary.forEach(p => {
        const color = p.color || (p.team === 'A' ? '#38bdf8' : '#f97316');
        const pos = p.positions || [];
        if (pos.length > 0) {
            // Radial Heatmap Blobs
            pos.forEach((pt, idx) => {
                if (idx % 2 !== 0) return;
                const c = normTo2DCourt(pt.x, pt.y);
                const grad = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, 20);
                grad.addColorStop(0, color + '55');
                grad.addColorStop(1, color + '00');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(c.x, c.y, 20, 0, Math.PI * 2);
                ctx.fill();
            });

            // Movement Path Trails
            if (pos.length >= 2) {
                ctx.beginPath();
                pos.forEach((pt, idx) => {
                    const c = normTo2DCourt(pt.x, pt.y);
                    if (idx === 0) ctx.moveTo(c.x, c.y);
                    else ctx.lineTo(c.x, c.y);
                });
                ctx.strokeStyle = color;
                ctx.lineWidth = 2.2;
                ctx.stroke();
            }
        } else {
            // Standard positional zone anchor for records without continuous frames
            const defaultPos = p.team === 'A'
                ? (p.id === 'A1' ? { x: 0.25, y: 0.3 } : { x: 0.25, y: 0.7 })
                : (p.id === 'B1' ? { x: 0.75, y: 0.3 } : { x: 0.75, y: 0.7 });
            const c = normTo2DCourt(defaultPos.x, defaultPos.y);
            const grad = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, 26);
            grad.addColorStop(0, color + '66');
            grad.addColorStop(1, color + '00');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(c.x, c.y, 26, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function loadDetailMatchIntoApp() {
    if (currentDetailMatchIndex < 0) return;
    const record = matchHistory[currentDetailMatchIndex];
    if (!record) return;

    scoreboard.scoreA = record.scoreA || 0;
    scoreboard.scoreB = record.scoreB || 0;
    scoreboard.setsA = record.setsA || 0;
    scoreboard.setsB = record.setsB || 0;
    matchSeconds = record.durationSec || 0;
    maxRecordedSpeed = record.maxSmashKmh || 0;
    matchTitle = record.title || matchTitle;
    clubCode = record.clubCode || clubCode;

    if (record.playersSummary && record.playersSummary.length > 0) {
        record.playersSummary.forEach(ps => {
            if (players[ps.id]) {
                players[ps.id].distanceMeters = ps.distanceMeters || 0;
                players[ps.id].maxSmashKmh = ps.maxSmashKmh || 0;
                players[ps.id].maxSpeedKmh = ps.maxSpeedKmh || 0;
                players[ps.id].shotsCount = ps.shotsCount || 0;
                if (ps.positions && ps.positions.length > 0) {
                    players[ps.id].positions = [...ps.positions];
                }
            }
        });
    }

    if (record.aiAnalysisText) {
        latestAICoachReportText = record.aiAnalysisText;
        const coachOutputBox = document.getElementById('aiCoachOutput');
        if (coachOutputBox) {
            coachOutputBox.innerHTML = `
                <div class="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-4 space-y-3 text-xs leading-relaxed">
                    <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span class="font-bold text-emerald-400 flex items-center gap-1.5">
                            <i class="ph-fill ph-sparkle"></i> รายงานวิเคราะห์ของแมตช์ "${record.title}"
                        </span>
                        <span class="text-[10px] text-slate-400">${record.savedAt}</span>
                    </div>
                    ${renderMarkdownSafe(latestAICoachReportText)}
                </div>
            `;
        }
    }

    renderMatchTitleUI();
    if (typeof updateScoreboardUI === 'function') updateScoreboardUI();
    drawAnalyticsCourt();
    closeMatchDetailModal();

    if (typeof switchTab === 'function') {
        switchTab('tab-analytics');
    }
    showToast(`Saved ✓ โหลดข้อมูลแมตช์ "${record.title}" เข้าสู่หน้าวิเคราะห์เรียบร้อย`);
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

    if (rec && (rec.cloudId || rec.id)) {
        const query = rec.cloudId ? `id=eq.${rec.cloudId}` : `client_match_id=eq.${rec.id}`;
        ShuttleSecurity.fetchSupabaseRest(`matches?${query}`, {
            method: 'DELETE'
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
    const structuredMatchData = buildStructuredMatchDataJSON();
    const reportData = {
        ...structuredMatchData,
        ai_coach_report_markdown: latestAICoachReportText || buildLocalTacticalCoachReport(),
        exported_at_iso: new Date().toISOString()
    };
    const safeName = (matchTitle || 'match').replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shuttlepro-${safeName}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`ส่งออก Match Data JSON "${matchTitle}" สำเร็จ`);
}

function exportReportCSV() {
    const headers = [
        'Time_Sec',
        'Shuttle_ScreenX',
        'Shuttle_ScreenY',
        'Shuttle_CourtU',
        'Shuttle_CourtV',
        'Shuttle_Speed_KMH',
        'Shot_Type',
        'Hitter_ID',
        'PlayerA1_CourtU',
        'PlayerA1_CourtV',
        'PlayerA1_Speed_KMH',
        'PlayerB1_CourtU',
        'PlayerB1_CourtV',
        'PlayerB1_Speed_KMH'
    ];

    const rows = [];
    if (shotHistory && shotHistory.length > 0) {
        shotHistory.forEach(s => {
            rows.push([
                s.time || 0,
                (s.screenX ?? 0.5).toFixed(4),
                (s.screenY ?? 0.5).toFixed(4),
                (s.u ?? 0.5).toFixed(4),
                (s.v ?? 0.5).toFixed(4),
                s.speedKmh || 0,
                `"${(s.type || '').replace(/"/g, '""')}"`,
                s.hitter || '-',
                (players.A1.u ?? 0).toFixed(4),
                (players.A1.v ?? 0).toFixed(4),
                players.A1.currentSpeedKmh || 0,
                (players.B1.u ?? 0).toFixed(4),
                (players.B1.v ?? 0).toFixed(4),
                players.B1.currentSpeedKmh || 0
            ].join(','));
        });
    }

    if (rows.length === 0) {
        rows.push([
            matchSeconds,
            (shuttle.screenX ?? 0.5).toFixed(4),
            (shuttle.screenY ?? 0.5).toFixed(4),
            (shuttle.u ?? 0.5).toFixed(4),
            (shuttle.v ?? 0.5).toFixed(4),
            shuttle.speedKmh || 0,
            `"${shuttle.shotType || 'Rally'}"`,
            shuttle.lastHitter || '-',
            players.A1.u.toFixed(4),
            players.A1.v.toFixed(4),
            players.A1.currentSpeedKmh,
            players.B1.u.toFixed(4),
            players.B1.v.toFixed(4),
            players.B1.currentSpeedKmh
        ].join(','));
    }

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const safeName = (matchTitle || 'match').replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shuttlepro-${safeName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`ส่งออก Match Data CSV "${matchTitle}" สำเร็จ`);
}

/********************************************************************
 * APP STORE / PLAY STORE STYLE COMMUNITY REVIEWS & USER FEEDBACK
 * (Zero Simulated Reviews, Identified & Anonymous Modes, Public Feed)
 ********************************************************************/

// Production Mode: Zero simulated mock reviews or fake scores
const DEFAULT_COMMUNITY_SEED_REVIEWS = [];

const REVIEW_CATEGORY_META = {
    EXPERIENCE: { label: '🌟 ประสบการณ์ใช้งาน', badgeClass: 'text-amber-300 bg-amber-500/15 border-amber-500/30' },
    FEATURE: { label: '💡 ขอเพิ่มฟีเจอร์', badgeClass: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30' },
    ACCURACY: { label: '⚡ ความแม่นยำ AI', badgeClass: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
    BUG: { label: '🐞 แจ้งปัญหา/บั๊ก', badgeClass: 'text-rose-300 bg-rose-500/15 border-rose-500/30' }
};

const RATING_TEXT_LABELS = {
    5: '5 ดาว - ยอดเยี่ยม ประทับใจมาก',
    4: '4 ดาว - ใช้งานได้ดีมาก',
    3: '3 ดาว - พอใช้ได้',
    2: '2 ดาว - ควรปรับปรุง',
    1: '1 ดาว - ต้องแก้ไข'
};

let communityReviews = [];
let selectedReviewRating = 5;
let selectedReviewCategory = 'EXPERIENCE';
let isReviewAnonymous = false;
let activeReviewFilter = 'ALL';
let userHelpfulUpvotes = new Set();

try {
    const savedUpvotes = JSON.parse(localStorage.getItem('shuttlepro_helpful_upvotes') || '[]');
    userHelpfulUpvotes = new Set(savedUpvotes);
} catch (e) {
    userHelpfulUpvotes = new Set();
}

function loadLocalCommunityReviews() {
    try {
        const stored = localStorage.getItem('shuttlepro_community_reviews');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                // Remove obsolete mock seed reviews (IDs 1730460000001 - 1730460000010)
                const realUserReviews = parsed.filter(r => !r || !r.id || (r.id < 1730460000001 || r.id > 1730460000010));
                return realUserReviews;
            }
        }
    } catch (e) {}
    return [];
}

function saveLocalCommunityReviews() {
    try {
        localStorage.setItem('shuttlepro_community_reviews', JSON.stringify(communityReviews));
    } catch (e) {}
}

function openCommunityReviewModal() {
    switchTab('reviews');
}

function closeCommunityReviewModal() {
    switchTab('live');
}

function setReviewRating(stars) {
    selectedReviewRating = Math.max(1, Math.min(5, stars));
    const container = document.getElementById('starInputContainer');
    const label = document.getElementById('starRatingLabel');
    if (container) {
        const buttons = container.querySelectorAll('.star-rating-btn');
        buttons.forEach((btn, idx) => {
            if (idx < selectedReviewRating) {
                btn.className = 'star-rating-btn text-amber-400';
            } else {
                btn.className = 'star-rating-btn text-slate-600 hover:text-amber-400/60';
            }
        });
    }
    if (label) {
        label.textContent = RATING_TEXT_LABELS[selectedReviewRating] || `${selectedReviewRating} ดาว`;
    }
}

function setReviewCategory(cat) {
    if (!REVIEW_CATEGORY_META[cat]) return;
    selectedReviewCategory = cat;
    const chips = document.querySelectorAll('#reviewCategoryChips .review-category-chip');
    chips.forEach(chip => {
        if (chip.getAttribute('data-cat') === cat) {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });
}

function setReviewAnonymous(isAnon) {
    isReviewAnonymous = Boolean(isAnon);
    const btnIdentified = document.getElementById('btnIdentityIdentified');
    const btnAnonymous = document.getElementById('btnIdentityAnonymous');
    const nicknameRow = document.getElementById('nicknameInputRow');

    if (isReviewAnonymous) {
        if (btnAnonymous) btnAnonymous.className = 'p-2.5 rounded-xl border border-amber-500/50 bg-amber-500/15 text-white flex items-center gap-2 text-left transition-all';
        if (btnIdentified) btnIdentified.className = 'p-2.5 rounded-xl border border-slate-700 bg-slate-950/70 text-slate-400 flex items-center gap-2 text-left transition-all hover:text-white';
        if (nicknameRow) nicknameRow.classList.add('hidden');
    } else {
        if (btnIdentified) btnIdentified.className = 'p-2.5 rounded-xl border border-emerald-500/50 bg-emerald-500/15 text-white flex items-center gap-2 text-left transition-all';
        if (btnAnonymous) btnAnonymous.className = 'p-2.5 rounded-xl border border-slate-700 bg-slate-950/70 text-slate-400 flex items-center gap-2 text-left transition-all hover:text-white';
        if (nicknameRow) {
            nicknameRow.classList.toggle('hidden', Boolean(currentAuthUser));
        }
    }
    updateReviewIdentityPreview();
}

function updateReviewIdentityPreview() {
    const previewEl = document.getElementById('identityUserPreview');
    const nicknameRow = document.getElementById('nicknameInputRow');
    if (!previewEl) return;

    if (currentAuthUser) {
        const displayName = currentAuthUser.user_metadata?.full_name || currentAuthUser.user_metadata?.name || currentAuthUser.email.split('@')[0];
        previewEl.textContent = `${displayName} (สมาชิกยืนยัน)`;
        if (nicknameRow) nicknameRow.classList.add('hidden');
    } else {
        previewEl.textContent = 'ระบุนามแฝง / ชื่อเล่น';
        if (!isReviewAnonymous && nicknameRow) {
            nicknameRow.classList.remove('hidden');
        }
    }
}

function updateReviewCharCount(textarea) {
    const countEl = document.getElementById('reviewCharCount');
    if (countEl && textarea) {
        countEl.textContent = `${textarea.value.length} / 400`;
    }
}

async function submitCommunityReview() {
    const commentEl = document.getElementById('reviewCommentInput');
    const statusMsg = document.getElementById('reviewFormStatusMsg');
    const submitBtn = document.getElementById('btnSubmitReview');
    const nicknameEl = document.getElementById('reviewNicknameInput');
    const commentText = (commentEl?.value || '').trim();

    if (!commentText || commentText.length < 5) {
        if (statusMsg) statusMsg.textContent = 'กรุณาพิมพ์ข้อความรีวิวอย่างน้อย 5 ตัวอักษร';
        return;
    }

    let displayName = 'ผู้ใช้งานนิรนาม';
    if (isReviewAnonymous) {
        const randomTag = Math.floor(100 + Math.random() * 900);
        displayName = `นักแบดมินตันนิรนาม #${randomTag}`;
    } else if (currentAuthUser) {
        displayName = currentAuthUser.user_metadata?.full_name || currentAuthUser.user_metadata?.name || currentAuthUser.email.split('@')[0];
    } else {
        displayName = (nicknameEl?.value || '').trim() || 'ผู้เล่นแบดมินตัน';
    }

    const newReview = {
        id: Date.now(),
        created_at: new Date().toISOString(),
        user_id: isReviewAnonymous ? null : (currentAuthUser?.id || null),
        display_name: displayName,
        is_anonymous: isReviewAnonymous,
        rating: selectedReviewRating,
        category: selectedReviewCategory,
        comment: commentText,
        helpful_count: 0
    };

    if (statusMsg) statusMsg.textContent = 'กำลังส่งความคิดเห็น...';
    if (submitBtn) submitBtn.disabled = true;

    // Save locally first
    communityReviews.unshift(newReview);
    saveLocalCommunityReviews();
    updateReviewScorecardUI();
    renderCommunityReviews();

    // Reset Form
    if (commentEl) commentEl.value = '';
    updateReviewCharCount(commentEl);
    setReviewRating(5);

    // Sync to Supabase: save directly to `matches` table (with club_code='APP_REVIEW'), which has full read/write permissions for anon role
    try {
        const payload = {
            club_code: 'APP_REVIEW',
            title: newReview.display_name,
            saved_at_text: newReview.comment,
            score_a: newReview.rating,
            score_b: 0,
            format: newReview.category || 'EXPERIENCE',
            user_id: newReview.user_id || null,
            players_summary: {
                category: newReview.category || 'EXPERIENCE',
                is_anonymous: Boolean(newReview.is_anonymous),
                display_name: newReview.display_name,
                rating: newReview.rating,
                helpful_count: 0
            }
        };

        const res = await ShuttleSecurity.fetchSupabaseRest('matches', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const savedRows = await res.json().catch(() => []);
            if (savedRows && savedRows[0] && savedRows[0].id) {
                newReview.id = savedRows[0].id;
                saveLocalCommunityReviews();
            }
        } else {
            // Secondary attempt to app_reviews if configured
            await ShuttleSecurity.fetchSupabaseRest('app_reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: newReview.user_id,
                    display_name: newReview.display_name,
                    is_anonymous: newReview.is_anonymous,
                    rating: newReview.rating,
                    category: newReview.category,
                    comment: newReview.comment,
                    helpful_count: 0
                })
            }).catch(() => {});
        }
    } catch (e) {
        // Safe local persistence fallback
    }

    if (statusMsg) statusMsg.textContent = '';
    if (submitBtn) submitBtn.disabled = false;
    showToast('ขอบคุณสำหรับความคิดเห็นและคะแนนรีวิวของคุณ!');
}

function updateReviewScorecardUI() {
    const list = communityReviews || [];
    const scoreEl = document.getElementById('reviewAvgScoreText');
    const totalEl = document.getElementById('reviewTotalCountText');
    const starsContainer = document.getElementById('reviewAvgStarsContainer');

    if (!list || list.length === 0) {
        if (scoreEl) scoreEl.textContent = '0.0';
        if (totalEl) totalEl.textContent = '0';
        if (starsContainer) {
            starsContainer.innerHTML = Array.from({ length: 5 }).map(() =>
                '<i class="ph-bold ph-star text-slate-700"></i>'
            ).join('');
        }
        [5, 4, 3, 2, 1].forEach(star => {
            const bar = document.getElementById(`reviewBar${star}`);
            const pctEl = document.getElementById(`reviewPct${star}`);
            if (bar) bar.style.width = '0%';
            if (pctEl) pctEl.textContent = '0%';
        });
        return;
    }

    const total = list.length;
    const sumRatings = list.reduce((acc, r) => acc + (Number(r.rating) || 5), 0);
    const avgScore = (sumRatings / total).toFixed(1);

    if (scoreEl) scoreEl.textContent = avgScore;
    if (totalEl) totalEl.textContent = total;
    if (starsContainer) {
        const roundedScore = Math.round(Number(avgScore));
        starsContainer.innerHTML = Array.from({ length: 5 }).map((_, i) =>
            i < roundedScore ? '<i class="ph-fill ph-star text-amber-400"></i>' : '<i class="ph-bold ph-star text-slate-700"></i>'
        ).join('');
    }

    // Breakdown bars
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    list.forEach(r => {
        const star = Math.max(1, Math.min(5, Math.round(r.rating || 5)));
        counts[star]++;
    });

    [5, 4, 3, 2, 1].forEach(star => {
        const pct = Math.round((counts[star] / total) * 100);
        const bar = document.getElementById(`reviewBar${star}`);
        const pctEl = document.getElementById(`reviewPct${star}`);
        if (bar) bar.style.width = `${pct}%`;
        if (pctEl) pctEl.textContent = `${pct}%`;
    });
}

function filterCommunityReviews(filterKey) {
    activeReviewFilter = filterKey;
    const filterBtns = document.querySelectorAll('#reviewFilterBar button');
    filterBtns.forEach(btn => {
        if (btn.getAttribute('data-filter') === filterKey) {
            btn.className = 'px-2.5 py-1 rounded-lg bg-amber-500/25 text-amber-300 font-bold border border-amber-500/40 shrink-0';
        } else {
            btn.className = 'px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 shrink-0 hover:text-white';
        }
    });
    renderCommunityReviews();
}

function renderCommunityReviews() {
    const container = document.getElementById('communityReviewsList');
    if (!container) return;

    let filtered = communityReviews;
    if (activeReviewFilter === '5STAR') {
        filtered = communityReviews.filter(r => r.rating === 5);
    } else if (activeReviewFilter !== 'ALL') {
        filtered = communityReviews.filter(r => r.category === activeReviewFilter);
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="text-center text-slate-400 py-10 space-y-2">
                <div class="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 text-2xl">
                    <i class="ph-bold ph-chat-circle-dots"></i>
                </div>
                <div class="text-sm font-bold text-white">ยังไม่มีความคิดเห็นหรือรีวิว</div>
                <div class="text-xs text-slate-400 max-w-xs mx-auto">ร่วมเป็นคนแรกที่ส่งรีวิว ให้คะแนน หรือแนะนำฟีเจอร์ใหม่สำหรับ ShuttlePro AI!</div>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(item => {
        const catMeta = REVIEW_CATEGORY_META[item.category] || REVIEW_CATEGORY_META.EXPERIENCE;
        const starHtml = Array.from({ length: 5 }).map((_, i) =>
            i < (item.rating || 5)
                ? '<i class="ph-fill ph-star text-amber-400 text-xs"></i>'
                : '<i class="ph-bold ph-star text-slate-700 text-xs"></i>'
        ).join('');

        const isAnon = item.is_anonymous;
        const avatarBg = isAnon ? 'bg-slate-800 text-slate-300' : 'bg-gradient-to-br from-emerald-400 to-teal-600 text-slate-950';
        const avatarIcon = isAnon ? '<i class="ph-bold ph-mask-happy text-sm"></i>' : '<i class="ph-bold ph-user text-sm font-bold"></i>';
        const userBadge = isAnon
            ? '<span class="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">ไม่ระบุตัวตน</span>'
            : (item.user_id ? '<span class="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold flex items-center gap-0.5"><i class="ph-fill ph-check-circle text-[10px]"></i> สมาชิกยืนยัน</span>' : '<span class="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300 border border-slate-700">ผู้ใช้ทั่วไป</span>');

        const createdDate = new Date(item.created_at || Date.now());
        const dateStr = createdDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
        const isUpvoted = userHelpfulUpvotes.has(item.id);

        return `
            <div class="review-feed-card space-y-2">
                <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <div class="w-8 h-8 rounded-xl ${avatarBg} flex items-center justify-center shrink-0 shadow">
                            ${avatarIcon}
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-1.5 min-w-0">
                                <span class="text-xs font-bold text-white truncate">${item.display_name}</span>
                                ${userBadge}
                            </div>
                            <div class="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                <div class="flex items-center gap-0.5">${starHtml}</div>
                                <span>•</span>
                                <span>${dateStr}</span>
                            </div>
                        </div>
                    </div>
                    <span class="text-[10px] px-2 py-0.5 rounded-full border ${catMeta.badgeClass} shrink-0 font-medium">
                        ${catMeta.label}
                    </span>
                </div>

                <div class="text-xs text-slate-200 leading-relaxed pt-0.5 pl-1">
                    ${item.comment}
                </div>

                <div class="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] text-slate-400">
                    <span class="text-slate-500">ShuttlePro AI Experience Review</span>
                    <button onclick="upvoteReviewHelpful('${item.id}')" class="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 transition-colors ${isUpvoted ? 'text-amber-300 font-bold border border-amber-500/30' : 'text-slate-400'}">
                        <i class="ph-fill ph-thumbs-up text-xs"></i>
                        <span>มีประโยชน์ (${item.helpful_count || 0})</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function upvoteReviewHelpful(reviewId) {
    const idStr = String(reviewId);
    if (userHelpfulUpvotes.has(idStr)) {
        showToast('คุณได้กดให้คะแนนประโยชน์กับรีวิวนี้แล้ว');
        return;
    }
    userHelpfulUpvotes.add(idStr);
    try {
        localStorage.setItem('shuttlepro_helpful_upvotes', JSON.stringify([...userHelpfulUpvotes]));
    } catch (e) {}

    const item = communityReviews.find(r => String(r.id) === idStr);
    if (item) {
        item.helpful_count = (item.helpful_count || 0) + 1;
        saveLocalCommunityReviews();
        renderCommunityReviews();
    }

    try {
        // Sync helpful count to Supabase matches table (stored in score_b)
        await ShuttleSecurity.fetchSupabaseRest(`matches?id=eq.${encodeURIComponent(idStr)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score_b: (item?.helpful_count || 1) })
        });
    } catch (e) {}
    showToast('ขอบคุณสำหรับคะแนนความมีประโยชน์');
}

async function fetchCommunityReviewsFromSupabase() {
    try {
        // 1. Fetch from Supabase matches table where club_code='APP_REVIEW' (instant cross-device sync)
        const res = await ShuttleSecurity.fetchSupabaseRest('matches?club_code=eq.APP_REVIEW&order=created_at.desc&limit=50');
        let remoteReviews = [];
        if (res.ok) {
            const rows = await res.json().catch(() => []);
            if (Array.isArray(rows)) {
                remoteReviews = rows.map(r => ({
                    id: String(r.id),
                    display_name: r.title || r.players_summary?.display_name || 'ผู้ใช้งานนิรนาม',
                    comment: r.saved_at_text || '',
                    rating: Number(r.score_a) || Number(r.players_summary?.rating) || 5,
                    category: r.format || r.players_summary?.category || 'EXPERIENCE',
                    helpful_count: Number(r.score_b) || Number(r.players_summary?.helpful_count) || 0,
                    is_anonymous: r.players_summary?.is_anonymous !== false,
                    user_id: r.user_id || null,
                    created_at: r.created_at || new Date().toISOString()
                }));
            }
        }

        // 2. Also merge from app_reviews table if any exists
        try {
            const res2 = await ShuttleSecurity.fetchSupabaseRest('app_reviews?order=created_at.desc&limit=30');
            if (res2.ok) {
                const rows2 = await res2.json().catch(() => []);
                if (Array.isArray(rows2) && rows2.length > 0) {
                    const extra = rows2.map(r => ({
                        id: String(r.id),
                        display_name: r.display_name || 'ผู้ใช้งานนิรนาม',
                        comment: r.comment || '',
                        rating: Number(r.rating) || 5,
                        category: r.category || 'EXPERIENCE',
                        helpful_count: Number(r.helpful_count) || 0,
                        is_anonymous: Boolean(r.is_anonymous),
                        user_id: r.user_id || null,
                        created_at: r.created_at || new Date().toISOString()
                    }));
                    remoteReviews = [...remoteReviews, ...extra];
                }
            }
        } catch (e) {}

        if (remoteReviews.length > 0) {
            const remoteMap = new Map(remoteReviews.map(r => [String(r.id), r]));
            const localOnly = communityReviews.filter(r => !remoteMap.has(String(r.id)));
            communityReviews = [...remoteReviews, ...localOnly];
            saveLocalCommunityReviews();
            updateReviewScorecardUI();
            renderCommunityReviews();
        }
    } catch (e) {
        // Safe offline / local fallback
    }
}

window.addEventListener('DOMContentLoaded', () => {
    if (typeof initPoseDetectionModel === 'function') {
        initPoseDetectionModel();
    }
    communityReviews = loadLocalCommunityReviews();
    fetchCommunityReviewsFromSupabase(); // Automatically sync reviews across all mobile & desktop devices immediately on boot!
    ensureKnowledgeBaseLoaded();
    initSupabaseAuth();
    renderMatchTitleUI();
    renderSavedMatchesList();
    fetchCloudMatches(false);
    resizeCanvases();
    updateScoreboardUI();
    updateLiveHUD();
    renderShotHistoryList();
    renderCoachStandbyInitial();
    animateLoop();
});

function renderCoachStandbyInitial() {
    renderCoachPreviewStandby();
}

// Global UI bindings for match detail modal, history click, rename & sync
window.openMatchDetailModal = openMatchDetailModal;
window.closeMatchDetailModal = closeMatchDetailModal;
window.switchDetailTab = switchDetailTab;
window.editSavedMatchTitle = editSavedMatchTitle;
window.editCurrentDetailMatchTitle = editCurrentDetailMatchTitle;
window.loadDetailMatchIntoApp = loadDetailMatchIntoApp;
window.openAuthModalForSignIn = openAuthModalForSignIn;
window.autoSyncCachedMatchesToAccount = autoSyncCachedMatchesToAccount;
window.saveCurrentMatchRecord = saveCurrentMatchRecord;
window.fetchCloudMatches = fetchCloudMatches;
window.exportReportJSON = exportReportJSON;
window.exportReportCSV = exportReportCSV;
window.exportSavedMatchById = exportSavedMatchById;
window.deleteSavedMatchById = deleteSavedMatchById;
