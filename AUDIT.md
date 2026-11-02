# ShuttlePro AI — System Architecture Audit Report (AUDIT.md)

Audit conducted as requested in Phase 1 of `Markdown.md`.

---

## 1. การตรวจจับลูกแบด (Shuttlecock Detection)
- **วิธีที่ใช้:** 3-Frame Temporal Differencing + Hot-Cell Static Rejector + Play Volume Box Filter (ไม่ได้ใช้โมเดลทั่วไปแบบ COCO sports ball หรือ color detection เดี่ยวๆ)
- **ไฟล์และบรรทัดที่เกี่ยวข้อง:**
  - [`js/cv-court.js`](file:///Users/dentcmu/Project%20Antigravity/Badminton%20app/js/cv-court.js#L35-L42): ตัวแปรบัฟเฟอร์ `prevGray1`, `prevGray2`, และตาราง `hotCellCounts` ขนาด 24x16 เพื่อตัดสัญญาณรบกวนคงที่ (เช่น หลอดไฟเพดาน, เส้นขอบสนาม)
  - [`js/cv-court.js`](file:///Users/dentcmu/Project%20Antigravity/Badminton%20app/js/cv-court.js#L312-L326): ฟังก์ชัน `detectShuttleCandidates(gray, humanBoxes)`
  - [`js/pose-tracker.js`](file:///Users/dentcmu/Project%20Antigravity/Badminton%20app/js/pose-tracker.js#L870-L910): กรองด้วย Play Volume 3D UV Box และ Ballistic Predictor เชื่อมรอยต่อช็อต (Inpaint Trajectory Bridge)

---

## 2. การตรวจจับผู้เล่น (Player Detection & Keypoints)
- **โมเดลที่ใช้:** TensorFlow.js MoveNet MultiPose (Lightning)
- **ไฟล์และบรรทัดที่เกี่ยวข้อง:**
  - [`js/pose-tracker.js`](file:///Users/dentcmu/Project%20Antigravity/Badminton%20app/js/pose-tracker.js#L30-L38): โหลด `poseDetection.SupportedModels.MoveNet` แบบ `MULTIPOSE_LIGHTNING`
  - [`js/pose-tracker.js`](file:///Users/dentcmu/Project%20Antigravity/Badminton%20app/js/pose-tracker.js#L244-L260): ตำแหน่งผู้เล่นถูกปรับปรุงเป็น **จุดสัมผัสพื้นจริง** โดยใช้:
    ```javascript
    footX = (leftAnkle.x + rightAnkle.x) / 2;
    footY = Math.max(leftAnkle.y, rightAnkle.y); // จุดต่ำสุดสัมผัสพื้นคอร์ท
    ```
    (พร้อม Fallback ไปที่ Knee/Hip extrapolation เฉพาะเมื่อตาข่ายบดบังข้อเท้าแดนไกล)

---

## 3. การแปลง Pixel เป็น Meter (Coordinate Mapping)
- **วิธีที่ใช้:** Projective 2D Homography Matrix (8-DOF Direct Linear Transform: DLT)
- **ไฟล์และบรรทัดที่เกี่ยวข้อง:**
  - [`js/cv-court.js`](file:///Users/dentcmu/Project%20Antigravity/Badminton%20app/js/cv-court.js#L102-L167): คำนวณแมทริกซ์ 3x3 ด้วย Gaussian Elimination 8x8 (`computeHomography4Pt` และ `invert3x3`)
  - [`js/cv-court.js`](file:///Users/dentcmu/Project%20Antigravity/Badminton%20app/js/cv-court.js#L1022-L1030): ฟังก์ชัน `screenToCourtMeters(sx, sy)` แปลงพิกัดจากหน้าจอสู่อัตราส่วนจริง BWF (กว้าง 6.10 ม. × ยาว 13.40 ม.)
  - ไม่มีการใช้ค่าคงที่ scale px/m ตัวเดียว

---

## 4. ค่า dt และ Frame Timing
- **วิธีที่ใช้:** `video.requestVideoFrameCallback` + `meta.mediaTime`
- **ไฟล์และบรรทัดที่เกี่ยวข้อง:**
  - [`js/live-view.js`](file:///Users/dentcmu/Project%20Antigravity/Badminton%20app/js/live-view.js#L34-L54): ลงทะเบียนฟังก์ชัน `startVideoFrameCallbackLoop` อ่านเวลาจริง `meta.mediaTime` จากวิดีโอระดับฮาร์ดแวร์
  - [`js/live-view.js`](file:///Users/dentcmu/Project%20Antigravity/Badminton%20app/js/live-view.js#L1783-L1797): ส่งผ่านเวลา `mt` ไปยัง `frameClockMs = mt * 1000` โดยข้ามเฟรมที่ `t` ไม่เพิ่มขึ้น (ทนทานต่อคลิปมือถือประเภท Variable Frame Rate: VFR)

---

## 5. การคำนวณ Shuttle Speed และ Outlier Filter
- **วิธีที่ใช้:** Multi-point Linear Regression + Aerodynamic Drag Compensation
- **ไฟล์และบรรทัดที่เกี่ยวข้อง:**
  - [`js/pose-tracker.js`](file:///Users/dentcmu/Project%20Antigravity/Badminton%20app/js/pose-tracker.js#L630-L690): คลาส `ShuttleSpeed` ทำงานร่วมกับบัฟเฟอร์ 3–6 จุดพิกัดสนามจริง
  - **Outlier Gate:** กรองการกระโดดของจุดที่เกิน 500 km/h (`jump / dt > 500 / 3.6`)
  - **Aerodynamic Drag:** ชดเชยแรงต้านอากาศด้วยสูตร $v_0 = v \cdot \exp(k \cdot s)$ โดย $k = \frac{g}{v_t^2} \approx 0.212\text{ m}^{-1}$ ย้อนหาความเร็วต้นตอนออกจากไม้
  - **HUD Hold:** ค้างค่า Peak Speed ไว้และติดป้ายกำกับ `~XXX km/h (ความเร็วประมาณ)`

---

## 6. Smoothing ของผู้เล่น (Jitter vs Latency)
- **วิธีที่ใช้:** One Euro Filter (`OneEuroFilter`)
- **ไฟล์และบรรทัดที่เกี่ยวข้อง:**
  - [`js/pose-tracker.js`](file:///Users/dentcmu/Project%20Antigravity/Badminton%20app/js/pose-tracker.js#L16-L55): คลาส `OneEuroFilter`
  - [`js/pose-tracker.js`](file:///Users/dentcmu/Project%20Antigravity/Badminton%20app/js/pose-tracker.js#L400-L425): ติดตั้งตัวกรองแยก 4 แกนต่อผู้เล่น (`_filterU`, `_filterV`, `_filterSX`, `_filterSY`) ด้วยพารามิเตอร์:
    - `minCutoff = 0.8`: ล็อคเท้านิ่งสนิทเมื่อยืนประจำตำแหน่ง
    - `beta = 0.010`: ปรับตามความเร็วสปรินต์ ไม่มีความหน่วงหรือหลอน

---

## 7. โครงสร้าง Inference และ Rendering Loop
- **วิธีที่ใช้:** Non-blocking Asynchronous Pipeline
- **ไฟล์และบรรทัดที่เกี่ยวข้อง:**
  - **Render Loop:** [`js/live-view.js`](file:///Users/dentcmu/Project%20Antigravity/Badminton%20app/js/live-view.js#L2378-L2414) รันด้วย `requestAnimationFrame` ที่ความถี่ 60 FPS อิสระ
  - **Inference Loop:** `runRealPoseEstimation` เป็น async function ที่ถูกเรียกแบบ fire-and-forget โดยไม่ `await` ใน Render Frame และป้องกันการชนด้วยแฟล็ก `poseInferenceBusy`
  - **Backend:** TensorFlow.js WebGL
  - **Input Size:** ย่อภาพเฉพาะบริเวณ Court Action Zone ที่ขนาด 448 px (`cw, ch`) เพื่อให้ผู้เล่นแดนไกลมีความละเอียดสูงโดยไม่เปลืองทรัพยากร

---

## 8. การจับคู่และล็อก ID ผู้เล่น
- **วิธีที่ใช้:** กติกาแบ่งแดนเน็ต BWF (Y = 6.70m) + Audience Gating + Bipartite Matching
- **ไฟล์และบรรทัดที่เกี่ยวข้อง:**
  - [`js/pose-tracker.js`](file:///Users/dentcmu/Project%20Antigravity/Badminton%20app/js/pose-tracker.js#L260-L270): ล็อกทีม A ฝั่งแดนไกล ($v \le 0.50$) และทีม B ฝั่งแดนใกล้ ($v > 0.50$) ข้ามเน็ตไม่ได้
  - [`js/pose-tracker.js`](file:///Users/dentcmu/Project%20Antigravity/Badminton%20app/js/pose-tracker.js#L271-L280): Audience Rejection ตัดคนดู/กรรมการที่ยืนห่างคอร์ทเกิน 1.2 ม. ด้านข้าง ($tolU = 0.20$) และ 1.5 ม. ด้านหลัง ($tolV = 0.11$)
  - [`js/pose-tracker.js`](file:///Users/dentcmu/Project%20Antigravity/Badminton%20app/js/pose-tracker.js#L350-L395): จัดสรรสล็อต [A1, A2] และ [B1, B2] ด้วย cost matrix ที่มี penalty ป้องกันการสลับตัว

---

## การจัดลำดับปัญหาตามผลกระทบ (Priority Ranking)

| ลำดับความสำคัญ | ปัญหาและผลกระทบ | สถานะการแก้ไข |
|:---|:---|:---|
| **สูง (High)** | เวลาเฟรมคลาดเคลื่อนจากคลิปมือถือ VFR ทำให้ค่า Speed ผิดเพี้ยน | **แก้ไขแล้ว** ด้วย `requestVideoFrameCallback` + `meta.mediaTime` |
| **สูง (High)** | สปีดลูกคำนวณจาก 2 เฟรมติดกัน เกิด Noise และค่ากระโดด | **แก้ไขแล้ว** ด้วย Multi-point Linear Regression + Aerodynamic Drag |
| **สูง (High)** | Marker ผู้เล่นสั่นและหน่วงเมื่อใช้ EMA หรือกึ่งกลาง BBox | **แก้ไขแล้ว** ด้วย Ankle Point + One Euro Filter (`OneEuroFilter`) |
| **กลาง (Medium)** | ผู้ชมและกรรมการข้างสนามถูกนำมาตรวจจับเป็นผู้เล่น | **แก้ไขแล้ว** ด้วย Court Boundary Gating (1.2m / 1.5m tolerance) |
| **กลาง (Medium)** | ขาดการบันทึก Calibration สู่ Storage และ Export CSV สำหรับวิเคราะห์ | **กำลังดำเนินการติดตั้ง** (Phase 3 & Phase 8) |
| **ต่ำ (Low)** | ผู้ใช้ไม่ทราบข้อจำกัด 2D Homography สำหรับลูกในอากาศ | **แก้ไขแล้ว** ติดป้าย `(ความเร็วประมาณ)` บน HUD และแท็บสถิติ |
