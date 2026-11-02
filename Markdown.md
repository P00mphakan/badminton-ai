# FIX_PLAN.md — Badminton HUD: Accurate Shuttle Speed & Smooth Player Tracking

## 0. Context
- Project: browser-based badminton HUD (index.html + js/ + css/), deployed on Vercel.
- Goals:
  1. Shuttle speed (km/h) ที่แม่นยำและสมจริง
  2. Player tracking ที่แม่นยำ, ไม่สั่น, ไม่หน่วง, ID ไม่สลับ
  3. HUD ลื่น ~60fps
- Rules for the agent:
  - อ่าน AGENTS.md และโค้ดทั้งหมดใน js/ ก่อนแก้อะไร
  - ห้ามทำ UI/feature เดิมพัง ทำทีละ Phase และ commit แยกแต่ละ Phase
  - ถ้าพบว่าโค้ดจริงทำบางข้อถูกแล้ว ให้ข้ามข้อนั้นและบันทึกเหตุผลไว้

## Phase 1 — Audit (ห้ามแก้โค้ดใน phase นี้)
สร้างไฟล์ AUDIT.md ตอบคำถามต่อไปนี้ พร้อมอ้างอิงชื่อไฟล์และเลขบรรทัด:
1. ลูกแบดถูกตรวจจับด้วยวิธีอะไร (model ไหน / color / frame diff)
2. ผู้เล่นถูกตรวจจับด้วย model อะไร และใช้จุดไหนเป็นตำแหน่งผู้เล่น (bbox center / ankle / อื่น)
3. แปลง pixel -> meter อย่างไร (ค่าคงที่ / homography / ไม่มี)
4. dt ระหว่างเฟรมมาจากไหน (performance.now / fps คงที่ / video.currentTime / mediaTime)
5. speed คำนวณจากกี่เฟรม มี outlier filter ไหม
6. มี smoothing ไหม แบบไหน ค่าพารามิเตอร์เท่าไร
7. inference รันใน main thread หรือ worker, backend อะไร (WebGL/WebGPU/WASM), input size เท่าไร
8. มีการจับคู่/ล็อก ID ผู้เล่นไหม
จากนั้นจัดลำดับปัญหาตามผลกระทบ (สูง/กลาง/ต่ำ)

## Phase 2 — Frame timing ที่ถูกต้อง (ผลกระทบสูง, แก้ง่าย)
ปัญหา: วิดีโอมือถือเป็น VFR การใช้ performance.now() หรือ fps คงที่ทำให้ dt ผิด -> speed ผิด
แก้: ใช้ requestVideoFrameCallback + metadata.mediaTime เป็นเวลาของทุกการคำนวณ

```javascript
function startLoop(video, processFrame) {
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    const onFrame = (now, meta) => {
      processFrame(meta.mediaTime);            // วินาที, เวลาจริงของเฟรมในวิดีโอ
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  } else {
    const loop = () => { processFrame(video.currentTime); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}
```
Acceptance: ทุกการคำนวณ speed/filter ใช้ t จาก mediaTime, ข้ามเฟรมที่ t ไม่เพิ่มขึ้น

## Phase 3 — Court calibration ด้วย Homography
ปัญหา: px/m ค่าเดียวใช้ไม่ได้กับมุมกล้องเปอร์สเปกทีฟ (คลาด 2–3 เท่า)
แก้:
- เพิ่ม calibration UI: ผู้ใช้คลิก 4 มุมสนาม (doubles 6.10 m x 13.40 m) ตามลำดับ TL, TR, BR, BL
- บันทึกจุดไว้ใน localStorage แยกตามชื่อวิดีโอ/ขนาดวิดีโอ
- วาดเส้นสนามที่ project กลับมาทับภาพ เพื่อให้ผู้ใช้ตรวจว่าคาลิเบรตถูก

```javascript
export const COURT = [[0, 0], [6.10, 0], [6.10, 13.40], [0, 13.40]];
export const NET_Y = 6.70;

export function computeHomography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let i = 0; i < 8; i++) {
    let m = i;
    for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
    [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
    for (let r = i + 1; r < 8; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < 8; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const h = new Array(8);
  for (let i = 7; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < 8; c++) s -= A[i][c] * h[c];
    h[i] = s / A[i][i];
  }
  return [...h, 1];
}

export function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}
// court->image ใช้ computeHomography(COURT, imagePts) สำหรับวาดเส้นสนาม
```
Acceptance: เส้นสนามที่วาดทับตรงกับเส้นจริงในภาพ คลาดไม่เกินประมาณ 5 px

ข้อจำกัด (ต้องแสดงใน UI): homography แม่นเฉพาะจุดบนพื้น ลูกที่ลอยกลางอากาศจะมี error
แนะนำผู้ใช้ให้ตั้งกล้องสูงหลังสนามหรือด้านข้าง และติดป้าย "ค่าประมาณ" ที่ค่า speed

## Phase 4 — Shuttle speed ที่ทน noise
ปัญหาที่ต้องแก้:
- คำนวณจาก 2 เฟรม -> noise สูง
- ไม่มี outlier gating -> ค่ากระโดด
- วัดช้า -> ลูกแบดเสียความเร็วเร็วมาก (terminal velocity ~6.8 m/s)

แก้:
- ตรวจจับ "hit event": ทิศทางลูกเปลี่ยน > 60° หรือ speed เพิ่มกะทันหัน และลูกอยู่ใกล้ข้อมือผู้เล่น (< 0.6 m ในพิกัดภาพที่ normalize แล้ว)
- เก็บ 3–5 จุดแรกหลัง hit แล้วทำ linear regression
- ชดเชยแรงต้าน: v0 = v * exp(k * s), k = g / vt² ≈ 0.212 1/m
- แสดง "peak speed ของช็อตนั้น" ค้างไว้ 1.5 s ไม่ให้ค่าวิ่งทุกเฟรม

```javascript
const K_DRAG = 9.81 / (6.8 * 6.8);
const MAX_MS = 500 / 3.6;

export class ShuttleSpeed {
  constructor(win = 5) { this.win = win; this.buf = []; this.hit = null; this.peak = null; }
  onHit(p) { this.hit = p; this.buf = []; this.peak = null; }
  push(t, X, Y) {
    const last = this.buf.at(-1);
    if (last) {
      const dt = t - last.t;
      if (dt <= 0) return this.peak;
      if (Math.hypot(X - last.X, Y - last.Y) / dt > MAX_MS) return this.peak; // outlier
    }
    this.buf.push({ t, X, Y });
    if (this.buf.length > this.win) this.buf.shift();
    const est = this.estimate();
    if (est && (!this.peak || est.initialKmh > this.peak.initialKmh)) this.peak = { ...est, t };
    return this.peak;
  }
  estimate() {
    const n = this.buf.length;
    if (n < 3) return null;
    const t0 = this.buf[0].t;
    let st = 0, sx = 0, sy = 0, stt = 0, stx = 0, sty = 0;
    for (const p of this.buf) {
      const t = p.t - t0;
      st += t; sx += p.X; sy += p.Y; stt += t * t; stx += t * p.X; sty += t * p.Y;
    }
    const d = n * stt - st * st;
    if (Math.abs(d) < 1e-9) return null;
    const vx = (n * stx - st * sx) / d, vy = (n * sty - st * sy) / d;
    const v = Math.hypot(vx, vy);
    const mid = this.buf[Math.floor(n / 2)];
    const s = this.hit ? Math.hypot(mid.X - this.hit.X, mid.Y - this.hit.Y) : 0;
    const v0 = Math.min(v * Math.exp(K_DRAG * s), MAX_MS);
    return { kmh: v * 3.6, initialKmh: v0 * 3.6 };
  }
}
```
Acceptance:
- clear/lift ทั่วไปได้ 80–200 km/h, smash มือสมัครเล่น 150–300 km/h
- ไม่มีค่าเกิน 500 km/h และค่าไม่กระพริบเปลี่ยนทุกเฟรม

## Phase 5 — Shuttle detector (ถ้า Phase 1 พบว่าใช้ COCO sports ball / color detection)
ลำดับทางเลือก:
1. ดีที่สุด: TrackNetV3 หรือ YOLO ที่เทรนเฉพาะลูกแบด -> export ONNX -> รันด้วย onnxruntime-web (WebGPU, fallback WASM)
2. ทางเลือกเบา: frame differencing (|frame_t - frame_t-1|) + threshold + mask เฉพาะพื้นที่สนามที่ขยายขึ้นไปด้านบน + กรอง blob ขนาดเล็ก + เลือก blob ที่ใกล้ตำแหน่งที่ทำนายไว้ (constant-velocity prediction)
- เพิ่ม gating: ยอมรับเฉพาะ detection ที่อยู่ในรัศมีจากตำแหน่งที่ทำนายไว้
- ถ้าลูกหาย <= 3 เฟรม ให้ใช้ค่าที่ทำนายไว้แทน ถ้าเกินนั้นให้ reset track
- UI: แนะนำให้ผู้ใช้ถ่ายวิดีโอ 120/240fps ถ้าต้องการวัดสแมช

## Phase 6 — Player tracking แม่นและ smooth
6.1 ตำแหน่งผู้เล่น = จุดเท้า ไม่ใช่กึ่งกลาง bbox
```javascript
function footPoint(kp, bbox) {
  const la = kp.left_ankle, ra = kp.right_ankle;
  if (la?.score > 0.3 && ra?.score > 0.3) return [(la.x + ra.x) / 2, Math.max(la.y, ra.y)];
  return [bbox.x + bbox.w / 2, bbox.y + bbox.h];   // fallback: ขอบล่างกึ่งกลาง bbox
}
```
จากนั้นแปลงด้วย applyH(H, ...) เป็นพิกัดสนาม (เมตร)

6.2 One Euro Filter (แทน EMA) — ใช้ 1 ตัวต่อแกนต่อจุด
```javascript
export class OneEuro {
  constructor(minCutoff = 1.0, beta = 0.02, dCutoff = 1.0) {
    Object.assign(this, { minCutoff, beta, dCutoff, x: null, dx: 0, t: null });
  }
  a(c, dt) { const r = 2 * Math.PI * c * dt; return r / (r + 1); }
  filter(x, t) {
    if (this.x === null) { this.x = x; this.t = t; return x; }
    const dt = Math.max(t - this.t, 1e-3); this.t = t;
    this.dx += this.a(this.dCutoff, dt) * ((x - this.x) / dt - this.dx);
    this.x += this.a(this.minCutoff + this.beta * Math.abs(this.dx), dt) * (x - this.x);
    return this.x;
  }
}
```
การปรับค่า: ถ้ายังสั่นให้ลด minCutoff (เช่น 0.5) ถ้าหน่วงตอนวิ่งให้เพิ่ม beta (เช่น 0.05)
ใช้ filter กับทั้งจุดเท้า (court coords) และ keypoints/skeleton ที่วาดบน HUD

6.3 ล็อก ID
- Singles: player A = court Y < NET_Y, player B = Y > NET_Y
- ตัดคนที่อยู่นอกสนามเกิน 1.5 m (คนดู/กรรมการ)
- Doubles: Kalman (constant velocity) + จับคู่ด้วยระยะ (greedy nearest หรือ Hungarian), gate 1.5 m
- ถ้าผู้เล่นหายไป <= 10 เฟรม ให้คง ID ไว้และแสดงค่าที่ทำนายไว้

Acceptance: ผู้เล่นยืนนิ่งแล้ว marker สั่นไม่เกิน ±3 px, ID ไม่สลับตลอด rally, ไม่จับคนนอกสนาม

## Phase 7 — Performance / smooth rendering
- ย้าย inference ไป Web Worker (ส่ง ImageBitmap ผ่าน transfer) ใช้ backend WebGPU และ fallback เป็น WebGL/WASM
- ย่อ input ก่อนส่งเข้า model (256–640 px) แล้ว scale พิกัดกลับเป็นขนาดจริง
- แยก loop: inference loop (async, 15–30 Hz) กับ render loop (requestAnimationFrame 60 Hz)
- render loop วาดตำแหน่งที่ extrapolate จากผลล่าสุด + velocity (ไม่เกิน 100 ms)
- ห้ามรอ (await) inference ใน render loop
- ใช้ canvas layer แยกสำหรับวาด HUD และ clear เฉพาะ layer นั้น
Acceptance: HUD ได้ ≥ 55 fps บน laptop ทั่วไป ไม่มี frame ค้าง > 50 ms

## Phase 8 — Debug & validation tools
- เพิ่ม debug overlay (toggle ด้วยปุ่ม D): fps, inference ms, dt, trail ของลูก, ค่า speed ดิบเทียบกับค่าที่ผ่าน filter, court grid
- เพิ่ม export CSV: t, shuttleX, shuttleY, speed, playerA_X/Y, playerB_X/Y
- ทดสอบความแม่นของ speed: วางวัตถุบนพื้นห่างกันทุก 1 m แล้วตรวจว่า homography ให้ระยะคลาดไม่เกิน 5%
- ทดสอบกับวิดีโอทั้ง 30fps และ 120fps+

## Deliverables
1. AUDIT.md (จาก Phase 1)
2. โค้ดที่แก้แล้ว แยกเป็นโมดูล: timing.js, calibration.js, shuttleSpeed.js, oneEuro.js, playerTracker.js, worker/inference.worker.js
3. CHANGELOG.md สรุปสิ่งที่เปลี่ยนในแต่ละ Phase และค่า parameter ที่ใช้
4. อัปเดต AGENTS.md ให้มีโครงสร้างโมดูลใหม่