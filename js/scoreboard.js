/********************************************************************
 * MODULE: js/scoreboard.js
 * PURPOSE: Automatic BWF 21-Point Rally Scoreboard, Hawkeye IN/OUT
 *          & Net Fault evaluation, Undo stack, Singles/Doubles toggle,
 *          and Thai Voice Umpire announcements.
 ********************************************************************/

function evaluateRallyEndAndAutoScore() {
    if (shuttle.trail.length < 3) return;
    const lastPt = shuttle.trail[shuttle.trail.length - 1];
    const firstPt = shuttle.trail[0];

    const u = lastPt.u;
    const v = lastPt.v;
    const hitterTeam = shuttle.lastHitterTeam || (firstPt.v < 0.5 ? 'A' : 'B');

    const landedSide = v < 0.5 ? 'A' : 'B';
    const isNearNet = Math.abs(v - 0.5) < 0.045;

    if (isNearNet || landedSide === hitterTeam) {
        const winnerTeam = hitterTeam === 'A' ? 'B' : 'A';
        const reason = isNearNet ? 'NET FAULT (ลูกติดเน็ท)' : 'NOT OVER NET (ลูกไม่ข้ามเน็ท)';
        awardPointBWF(winnerTeam, 'NET', `${reason} • แต้มทีม ${winnerTeam}`, {
            u, v, isIn: false, marginCm: 0, closestLineName: 'ตาข่าย (Net)', winner: winnerTeam
        });
        return;
    }

    const lineCall = ShuttleCV.evaluateLineCall(u, v, isDoublesMatch);
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
        if (team === 'A' && scoreboard.scoreA > 0) scoreboard.scoreA--;
        if (team === 'B' && scoreboard.scoreB > 0) scoreboard.scoreB--;
        updateScoreboardUI();
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
    const btn = document.getElementById('btnMatchFormat');
    if (btn) {
        btn.textContent = isDoublesMatch ? 'ประเภทคู่ (Doubles 6.10m)' : 'ประเภทเดี่ยว (Singles 5.18m)';
    }
    showToast(`เปลี่ยนเส้นเขตสนามตัดสิน IN/OUT เป็น: ${isDoublesMatch ? 'แบดมินตันคู่ (6.10 ม.)' : 'แบดมินตันเดี่ยว (5.18 ม.)'}`);
}

function toggleVoiceReferee() {
    isVoiceRefereeOn = !isVoiceRefereeOn;
    const btn = document.getElementById('btnVoiceReferee');
    if (btn) {
        btn.className = isVoiceRefereeOn
            ? 'px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-medium flex items-center gap-1'
            : 'px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 text-[11px] font-medium flex items-center gap-1';
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
            callBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
        } else if (scoreboard.lastCallType === 'OUT') {
            callBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40';
        } else if (scoreboard.lastCallType === 'NET') {
            callBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';
        } else {
            callBadge.className = 'px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700';
        }
    }
}
