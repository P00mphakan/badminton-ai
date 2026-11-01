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

async function callGeminiAPIWithFallback(parts, expectJson = false, systemPromptText = '') {
    let lastError = 'ไม่สามารถเชื่อมต่อ AI ได้';
    const now = Date.now();

    for (const modelName of GEMINI_FALLBACK_MODELS) {
        if (exhaustedModelsUntil[modelName] && now < exhaustedModelsUntil[modelName]) {
            continue; // Skip model currently in rate-limit cooldown
        }
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
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

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) {
                const msg = data?.error?.message || `HTTP ${res.status}`;
                lastError = msg;
                // If quota/rate-limit (429) or unavailable (404/503), mark cooldown and switch to next model immediately
                if (res.status === 429 || msg.includes('quota') || msg.includes('Quota')) {
                    exhaustedModelsUntil[modelName] = now + 15 * 60 * 1000;
                } else if (res.status === 404) {
                    exhaustedModelsUntil[modelName] = now + 24 * 60 * 60 * 1000;
                }
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

function renderCoachPreviewStandby() {
    const outputBox = document.getElementById('aiCoachOutput');
    if (!outputBox) return;
    const localReport = buildLocalTacticalCoachReport();
    const formatted = localReport
        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-emerald-300">$1</strong>')
        .replace(/\n/g, '<br>');

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

    // Only invoke external AI when the user explicitly clicks the button on the AI Coach tab (Tab 4)
    if (!userTriggered) {
        renderCoachPreviewStandby();
        return;
    }

    await ensureKnowledgeBaseLoaded();
    const matchDataJSON = buildStructuredMatchDataJSON();

    const snapshotKey = `${scoreboard.scoreA}-${scoreboard.scoreB}-${maxRecordedSpeed}-${shotHistory.length}-${scoreboard.pointLog?.length || 0}-${focusTopic}`;
    if (snapshotKey === lastAnalyzedSnapshotKey && latestAICoachReportText) {
        const cachedHtml = latestAICoachReportText
            .replace(/\*\*(.*?)\*\*/g, '<strong class="text-emerald-300">$1</strong>')
            .replace(/\n/g, '<br>');
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
            ShuttleKB.systemPrompt
        );
        const finalReportText = result.ok ? result.text.trim() : buildLocalTacticalCoachReport();
        const badgeLabel = result.ok ? `BWF Knowledge AI (${result.model})` : 'On-Device BWF Knowledge AI';

        latestAICoachReportText = finalReportText;
        lastAnalyzedSnapshotKey = snapshotKey;

        const formattedHtml = finalReportText
            .replace(/\*\*(.*?)\*\*/g, '<strong class="text-emerald-300">$1</strong>')
            .replace(/\n/g, '<br>');

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
    } else if (tabId === 'coach' && !latestAICoachReportText) {
        renderCoachPreviewStandby();
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

    if (currentAuthUser) {
        const email = currentAuthUser.email || 'ผู้ใช้งาน Cloud';
        const shortName = email.split('@')[0];
        if (loggedInView) loggedInView.classList.remove('hidden');
        if (formView) formView.classList.add('hidden');
        if (emailEl) emailEl.textContent = email;
        if (headerLabel) headerLabel.textContent = shortName;
        if (headerIcon) headerIcon.className = 'ph-fill ph-check-circle text-emerald-400 text-sm';
        if (headerBtn) headerBtn.className = 'h-8 px-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 text-[11px] font-semibold';
        if (sheetLabel) sheetLabel.textContent = `บัญชี: ${shortName}`;
    } else {
        if (loggedInView) loggedInView.classList.add('hidden');
        if (formView) formView.classList.remove('hidden');
        if (headerLabel) headerLabel.textContent = 'เข้าสู่ระบบ';
        if (headerIcon) headerIcon.className = 'ph-bold ph-user-circle text-sm';
        if (headerBtn) headerBtn.className = 'h-8 px-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-cyan-300 border border-slate-700 flex items-center gap-1 text-[11px] font-semibold';
        if (sheetLabel) sheetLabel.textContent = 'เข้าสู่ระบบ / สมัคร';
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

        supabaseClient.auth.onAuthStateChange((_event, session) => {
            const prevUser = currentAuthUser?.id;
            currentAuthUser = session?.user || null;
            if (currentAuthUser) {
                sessionStorage.setItem('shuttlepro_active_session', '1');
            }
            updateAuthUI();
            if (prevUser !== currentAuthUser?.id) {
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
                showToast(`สมัครสมาชิกและเข้าสู่ระบบสำเร็จ (${email})`);
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

async function syncMatchRecordToSupabase(record) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
    try {
        // Store AI text summary inside players_summary JSONB or as a dedicated metadata entry (NEVER upload video files)
        const playersPayload = (record.playersSummary || []).map((p, idx) =>
            idx === 0 && record.aiAnalysisText ? { ...p, aiAnalysisText: record.aiAnalysisText } : p
        );
        const payload = {
            client_match_id: record.id,
            club_code: record.clubCode || clubCode || 'PUBLIC',
            user_id: currentAuthUser?.id || null,
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
                localStorage.setItem('shuttlepro_match_history', JSON.stringify(matchHistory));
                renderSavedMatchesList();
            }
        } else {
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
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const rows = await res.json();
            if (rows && rows[0] && rows[0].id) {
                record.cloudId = rows[0].id;
                localStorage.setItem('shuttlepro_match_history', JSON.stringify(matchHistory));
                renderSavedMatchesList();
            }
        }
        isCloudSynced = true;
        updateCloudSyncBadge('ซิงค์บทวิเคราะห์ขึ้น Cloud แล้ว (ไม่เก็บไฟล์คลิป)', true);
        return true;
    } catch (e) {
        console.warn('Supabase sync warning:', e);
        updateCloudSyncBadge('บันทึกในเครื่องแล้ว', false);
        return false;
    }
}

async function fetchCloudMatches(showNotification = false) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    try {
        updateCloudSyncBadge('กำลังซิงค์...', true);
        let rows = [];
        if (supabaseClient) {
            let query = supabaseClient
                .from('matches')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(30);
            if (currentAuthUser?.id) {
                query = query.or(`user_id.eq.${currentAuthUser.id},club_code.eq.${clubCode || 'PUBLIC'}`);
            } else {
                query = query.eq('club_code', clubCode || 'PUBLIC');
            }
            const { data, error } = await query;
            if (error) throw error;
            rows = data || [];
        } else {
            const code = encodeURIComponent(clubCode || 'PUBLIC');
            const url = `${SUPABASE_URL}/rest/v1/matches?club_code=eq.${code}&order=created_at.desc&limit=30`;
            const res = await fetch(url, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            rows = await res.json();
        }

        const cloudRecords = (rows || []).map(r => {
            const pSum = r.players_summary || [];
            const savedAiText = (pSum[0] && pSum[0].aiAnalysisText) ? pSum[0].aiAnalysisText : '';
            return {
                id: r.client_match_id || new Date(r.created_at).getTime(),
                cloudId: r.id,
                userId: r.user_id || null,
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
        const localUnsynced = matchHistory.filter(m => (!m.clubCode || m.clubCode === clubCode) && !cloudIds.has(m.id));
        matchHistory = [...localUnsynced, ...cloudRecords].slice(0, 35);
        try {
            localStorage.setItem('shuttlepro_match_history', JSON.stringify(matchHistory));
        } catch (e) {}
        renderSavedMatchesList();
        isCloudSynced = true;
        updateCloudSyncBadge(`ซิงค์ Cloud ล่าสุด (${cloudRecords.length} แมตช์)`, true);

        for (const unsynced of localUnsynced) {
            syncMatchRecordToSupabase(unsynced);
        }
        if (showNotification) showToast(`ซิงค์ข้อมูลจาก Supabase สำเร็จ (${cloudRecords.length} แมตช์)`);
    } catch (e) {
        updateCloudSyncBadge('ออฟไลน์ (ใช้ข้อมูลในเครื่อง)', false);
    }
}

async function saveCurrentMatchRecord() {
    const avgSmash = allSmashSpeeds.length > 0
        ? Math.round(allSmashSpeeds.reduce((a, b) => a + b, 0) / allSmashSpeeds.length)
        : 0;

    // Ensure we have a tactical text summary for the match (never store video files, only text analysis + metrics)
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
    showToast(`กำลังบันทึกเฉพาะข้อความบทวิเคราะห์และสถิติขึ้น Supabase Cloud...`);
    const ok = await syncMatchRecordToSupabase(record);
    if (ok) {
        showToast(`บันทึกบทวิเคราะห์ "${record.title}" ขึ้น Supabase สำเร็จ! (ไม่เก็บไฟล์คลิปวิดีโอ)`);
    }
}

function renderSavedMatchesList() {
    const container = document.getElementById('savedMatchesList');
    if (!container) return;
    if (!matchHistory || matchHistory.length === 0) {
        container.innerHTML = `<div class="text-center text-xs text-slate-500 py-5">ยังไม่มีบทวิเคราะห์แมตช์ในห้องก๊วน "${clubCode}" • กดปุ่ม "บันทึกแมตช์" เพื่อเก็บข้อความวิเคราะห์ขึ้น Cloud</div>`;
        return;
    }
    container.innerHTML = matchHistory.map((m, idx) => {
        const cloudIcon = m.cloudId
            ? `<i class="ph-fill ph-cloud-check text-cyan-400 text-xs shrink-0" title="ซิงค์บทวิเคราะห์บน Supabase Cloud แล้ว"></i>`
            : `<i class="ph-bold ph-device-mobile text-slate-500 text-xs shrink-0" title="บันทึกในเครื่อง"></i>`;
        const aiSnippet = m.aiAnalysisText || (m.playersSummary?.[0]?.aiAnalysisText) || '';
        const cleanSnippet = aiSnippet.replace(/\*\*/g, '').slice(0, 140);
        return `
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-1.5">
            <div class="flex items-center justify-between gap-2">
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
            ${cleanSnippet ? `<div class="text-[11px] text-slate-300 bg-slate-950/70 border border-slate-800/80 rounded-lg px-2.5 py-1.5 line-clamp-2">📝 ${cleanSnippet}${aiSnippet.length > 140 ? '...' : ''}</div>` : ''}
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

window.addEventListener('DOMContentLoaded', () => {
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
