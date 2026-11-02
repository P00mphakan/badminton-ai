/********************************************************************
 * MODULE: js/scoreboard.js
 * PURPOSE: Automatic BWF 21-Point Rally Scoreboard, Hawkeye IN/OUT
 *          & Net Fault evaluation, Undo stack, Singles/Doubles toggle,
 *          and Thai Voice Umpire announcements.
 ********************************************************************/

function evaluateRallyEndAndAutoScore() {
    if (shuttle.trail.length < 4) return;
    const nowMs = performance.now();

    // 1. Strict Court Trust Gate: Never auto-score against an uncalibrated / unverified court geometry
    if (!ShuttleCV.isCourtTrusted()) {
        showToast('ตรวจพบจังหวะลูกลงพื้น (สนามยังไม่ได้ตั้งเส้น) • กรุณาตั้งเส้นสนามก่อน หรือกด +/- เพื่อปรับแต้ม');
        return;
    }

    // 2. Cooldown Gate: Prevent rapid duplicate auto-calls within 5.0 seconds
    if (scoreboard.lastAutoCallMs && (nowMs - scoreboard.lastAutoCallMs < 5000)) {
        return;
    }

    const lastPt = shuttle.trail[shuttle.trail.length - 1];
    const u = lastPt.u;
    const v = lastPt.v;

    // 3. Strict Hitter Gate: Must have an identified hitter team (never guess from firstPt.v)
    const hitterTeam = shuttle.lastHitterTeam;
    if (!hitterTeam) return;

    const landedSide = v < 0.5 ? 'A' : 'B';
    const distFromNetM = Math.abs(v - 0.5) * ShuttleCV.COURT_LENGTH_M;

    // 4. Net Fault Gate: Only call NET if landing on hitter's side within 1.5m of net
    if (landedSide === hitterTeam) {
        if (distFromNetM <= 1.5) {
            scoreboard.lastAutoCallMs = nowMs;
            const winnerTeam = hitterTeam === 'A' ? 'B' : 'A';
            const reason = distFromNetM <= 0.6 ? 'NET FAULT (ลูกติดเน็ท)' : 'NOT OVER NET (ลูกไม่ข้ามเน็ท)';
            awardPointBWF(winnerTeam, 'NET', `${reason} • แต้มทีม ${winnerTeam}`, {
                u, v, isIn: false, marginCm: 0, closestLineName: 'ตาข่าย (Net)', winner: winnerTeam
            });
        }
        // If landing on hitter's side > 1.5m away, it's inconclusive (e.g. racket pickup / floor bounce) -> do not auto-score
        return;
    }

    // 5. Line Call (Opponent's side)
    const lineCall = ShuttleCV.evaluateLineCall(u, v, isDoublesMatch);
    scoreboard.lastAutoCallMs = nowMs;

    if (lineCall.isIn) {
        const winnerTeam = hitterTeam;
        const callMsg = `IN (ลูกดี +${Math.abs(lineCall.marginCm)} ซม. ใน${lineCall.closestLineName}) • แต้มทีม ${winnerTeam}`;
        awardPointBWF(winnerTeam, 'IN', callMsg, {
            u, v, isIn: true, marginCm: lineCall.marginCm, closestLineName: lineCall.closestLineName, winner: winnerTeam
        });
    } else {
        const winnerTeam = hitterTeam === 'A' ? 'B' : 'A';
        const callMsg = `OUT (ลูกออก ${Math.abs(lineCall.marginCm)} ซม. นอก${lineCall.closestLineName}) • แต้มทีม ${winnerTeam}`;
        awardPointBWF(winnerTeam, 'OUT', callMsg, {
            u, v, isIn: false, marginCm: lineCall.marginCm, closestLineName: lineCall.closestLineName, winner: winnerTeam
        });
    }
}

function awardPointBWF(winnerTeam, callType, callDescription, landingSpot = null) {
    scoreboard.historyStack.push({
        scoreA: scoreboard.scoreA,
        scoreB: scoreboard.scoreB,
        setsA: scoreboard.setsA,
        setsB: scoreboard.setsB,
        currentSet: scoreboard.currentSet,
        servingTeam: scoreboard.servingTeam,
        serviceCourt: scoreboard.serviceCourt,
        lastCallText: scoreboard.lastCallText,
        lastCallType: scoreboard.lastCallType
    });
    if (scoreboard.historyStack.length > 30) scoreboard.historyStack.shift();

    if (winnerTeam === 'A') scoreboard.scoreA++;
    else scoreboard.scoreB++;

    scoreboard.servingTeam = winnerTeam;
    const serverScore = winnerTeam === 'A' ? scoreboard.scoreA : scoreboard.scoreB;
    scoreboard.serviceCourt = (serverScore % 2 === 0) ? 'R' : 'L';

    scoreboard.rallyState = 'POINT_CALL';
    scoreboard.lastCallType = callType;
    scoreboard.lastCallText = callDescription;
    scoreboard.lastCallAtMs = performance.now();
    if (landingSpot) {
        scoreboard.lastLandingSpot = { ...landingSpot, time: performance.now() };
    }

    const timeStr = formatTimeSec(matchSeconds);
    scoreboard.pointLog.unshift({
        time: timeStr,
        set: scoreboard.currentSet,
        scoreA: scoreboard.scoreA,
        scoreB: scoreboard.scoreB,
        winner: winnerTeam,
        callType,
        detail: callDescription
    });

    const sA = scoreboard.scoreA;
    const sB = scoreboard.scoreB;
    let setWinner = null;
    if ((sA >= 21 && sA - sB >= 2) || sA === 30) setWinner = 'A';
    else if ((sB >= 21 && sB - sA >= 2) || sB === 30) setWinner = 'B';

    if (setWinner) {
        if (setWinner === 'A') scoreboard.setsA++;
        else scoreboard.setsB++;
        showToast(`จบเซตที่ ${scoreboard.currentSet}! ทีม ${setWinner} ชนะเซตด้วยคะแนน ${sA} - ${sB}`);
        announceVoiceReferee(`จบเซตที่ ${scoreboard.currentSet} ทีม ${setWinner} ชนะ ${sA} ต่อ ${sB}`);
        if (scoreboard.setsA < 2 && scoreboard.setsB < 2) {
            setTimeout(() => {
                scoreboard.currentSet++;
                scoreboard.scoreA = 0;
                scoreboard.scoreB = 0;
                scoreboard.servingTeam = setWinner;
                scoreboard.serviceCourt = 'R';
                updateScoreboardUI();
            }, 3500);
        }
    } else {
        const callSpeech = callType === 'IN' ? 'ลูกดี' : (callType === 'OUT' ? 'ลูกออก' : (callType === 'NET' ? 'ลูกติดเน็ท' : ''));
        announceVoiceReferee(`${callSpeech} แต้มทีม ${winnerTeam}, ${scoreboard.scoreA} ต่อ ${scoreboard.scoreB}`);
    }

    updateScoreboardUI();
}

function manualAdjustScore(team, delta) {
    if (delta > 0) {
        const nextScore = team === 'A' ? scoreboard.scoreA + 1 : scoreboard.scoreB + 1;
        awardPointBWF(team, 'MANUAL', `ปรับแต้มทีม ${team} (+1) • เสิร์ฟฝั่ง${(nextScore % 2 === 0) ? 'ขวา' : 'ซ้าย'}`);
    } else {
        if ((team === 'A' && scoreboard.scoreA <= 0) || (team === 'B' && scoreboard.scoreB <= 0)) return;
        scoreboard.historyStack.push({
            scoreA: scoreboard.scoreA,
            scoreB: scoreboard.scoreB,
            setsA: scoreboard.setsA,
            setsB: scoreboard.setsB,
            currentSet: scoreboard.currentSet,
            servingTeam: scoreboard.servingTeam,
            serviceCourt: scoreboard.serviceCourt,
            lastCallText: scoreboard.lastCallText,
            lastCallType: scoreboard.lastCallType
        });
        if (scoreboard.historyStack.length > 30) scoreboard.historyStack.shift();

        if (team === 'A' && scoreboard.scoreA > 0) scoreboard.scoreA--;
        if (team === 'B' && scoreboard.scoreB > 0) scoreboard.scoreB--;
        scoreboard.lastCallType = 'MANUAL';
        scoreboard.lastCallText = `ปรับลดแต้มทีม ${team} (-1)`;
        updateScoreboardUI();
        showToast(`ปรับลดแต้มทีม ${team} (-1)`);
    }
}

function undoLastPoint() {
    if (scoreboard.historyStack.length === 0) {
        showToast('ไม่มีประวัติแต้มก่อนหน้าให้ย้อนกลับ');
        return;
    }
    const prev = scoreboard.historyStack.pop();
    scoreboard.scoreA = prev.scoreA;
    scoreboard.scoreB = prev.scoreB;
    scoreboard.setsA = prev.setsA;
    scoreboard.setsB = prev.setsB;
    scoreboard.currentSet = prev.currentSet;
    scoreboard.servingTeam = prev.servingTeam;
    scoreboard.serviceCourt = prev.serviceCourt;
    scoreboard.lastCallText = prev.lastCallText;
    scoreboard.lastCallType = prev.lastCallType;
    scoreboard.pointLog.shift();
    updateScoreboardUI();
    showToast('ย้อนกลับแต้มล่าสุดเรียบร้อย (Undo)');
}

function toggleMatchTypeSinglesDoubles() {
    isDoublesMatch = !isDoublesMatch;
    if (!isDoublesMatch) {
        // Immediately deactivate A2 & B2 for Singles
        ['A2', 'B2'].forEach(id => {
            if (players[id]) {
                players[id].detected = false;
                players[id].currentSpeedKmh = 0;
                players[id]._posWindow = [];
                players[id]._anchor = null;
            }
        });
    }
    const btn = document.getElementById('btnMatchFormat');
    if (btn) {
        btn.textContent = isDoublesMatch ? 'คู่ 6.10m' : 'เดี่ยว 5.18m';
    }
    const pill = document.getElementById('hudFormatPillLabel');
    if (pill) {
        pill.textContent = isDoublesMatch ? 'ประเภทคู่ (A1,A2/B1,B2)' : 'ประเภทเดี่ยว (A1/B1)';
    }
    if (typeof resetPlayerLockState === 'function') resetPlayerLockState();
    showToast(`สลับประเภทแมตช์เป็น: ${isDoublesMatch ? 'ประเภทคู่ 6.10m (A1, A2 vs B1, B2)' : 'ประเภทเดี่ยว 5.18m (A1 vs B1)'}`);
}

function toggleVoiceReferee() {
    isVoiceRefereeOn = !isVoiceRefereeOn;
    const btn = document.getElementById('btnVoiceReferee');
    if (btn) {
        btn.className = isVoiceRefereeOn
            ? 'sheet-btn !border-emerald-500/40 !text-emerald-300'
            : 'sheet-btn !text-slate-400 opacity-60';
    }
    showToast(isVoiceRefereeOn ? 'เปิดเสียงกรรมการ AI ขานแต้มอัตโนมัติ' : 'ปิดเสียงกรรมการขานแต้ม');
}

function announceVoiceReferee(text) {
    if (!isVoiceRefereeOn || !('speechSynthesis' in window)) return;
    try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'th-TH';
        utter.rate = 1.08;
        window.speechSynthesis.speak(utter);
    } catch (e) {}
}

function updateScoreboardUI() {
    const elScoreA = document.getElementById('scoreA');
    const elScoreB = document.getElementById('scoreB');
    if (elScoreA) elScoreA.textContent = scoreboard.scoreA;
    if (elScoreB) elScoreB.textContent = scoreboard.scoreB;

    const mainA = document.getElementById('boardScoreA');
    const mainB = document.getElementById('boardScoreB');
    const setsA = document.getElementById('boardSetsA');
    const setsB = document.getElementById('boardSetsB');
    const setNum = document.getElementById('boardSetNumber');
    const serveBadgeA = document.getElementById('serveBadgeA');
    const serveBadgeB = document.getElementById('serveBadgeB');
    const callBadge = document.getElementById('boardLastCallBadge');
    const serviceBoxText = document.getElementById('boardServiceBoxText');

    if (mainA) mainA.textContent = scoreboard.scoreA;
    if (mainB) mainB.textContent = scoreboard.scoreB;
    if (setsA) setsA.textContent = scoreboard.setsA;
    if (setsB) setsB.textContent = scoreboard.setsB;
    if (setNum) setNum.textContent = `SET ${scoreboard.currentSet}`;

    const courtSideThai = scoreboard.serviceCourt === 'R' ? 'คอร์ทขวา (แต้มคู่)' : 'คอร์ทซ้าย (แต้มคี่)';
    if (serviceBoxText) {
        serviceBoxText.textContent = `ทีม ${scoreboard.servingTeam} เสิร์ฟ • ${courtSideThai}`;
    }

    if (serveBadgeA && serveBadgeB) {
        if (scoreboard.servingTeam === 'A') {
            serveBadgeA.classList.remove('hidden');
            serveBadgeB.classList.add('hidden');
        } else {
            serveBadgeA.classList.add('hidden');
            serveBadgeB.classList.remove('hidden');
        }
    }

    if (callBadge) {
        callBadge.textContent = scoreboard.lastCallText;
        if (scoreboard.lastCallType === 'IN') {
            callBadge.className = 'call-chip !bg-emerald-500/25 !text-emerald-300 !border-emerald-500/50';
        } else if (scoreboard.lastCallType === 'OUT') {
            callBadge.className = 'call-chip !bg-rose-500/25 !text-rose-300 !border-rose-500/50';
        } else if (scoreboard.lastCallType === 'NET') {
            callBadge.className = 'call-chip !bg-amber-500/25 !text-amber-300 !border-amber-500/50';
        } else {
            callBadge.className = 'call-chip';
        }
    }
}

function expireStaleCallChip() {
    if (scoreboard.rallyState === 'POINT_CALL' && (performance.now() - (scoreboard.lastCallAtMs || 0) > 6000)) {
        scoreboard.rallyState = 'WAITING';
        scoreboard.lastCallType = 'IDLE';
        scoreboard.lastCallText = 'รอเริ่มแรลลี่ (พร้อมตรวจจับอัตโนมัติ)';
        updateScoreboardUI();
    }
}
