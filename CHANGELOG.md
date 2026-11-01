# ShuttlePro AI - Changelog & Version Release Log

บันทึกประวัติการแก้ไขและเวอร์ชันระบบ ShuttlePro AI สำหรับตรวจสอบย้อนหลังและกู้คืนระบบ (Rollback & Recovery).

---

## 📌 จุดกู้คืนระบบ (Recovery & Rollback Guide)

| จุดกู้คืน (Git Tag) | วัตถุประสงค์ | คำสั่งกู้คืนทั้งโปรเจกต์ |
| :--- | :--- | :--- |
| `v1.0.0-pre-fieldtest-fix` | **เวอร์ชันเดิมก่อนแก้ปัญหาจากคลิปทดสอบจริง** | `git checkout v1.0.0-pre-fieldtest-fix -- .` |
| `v1.0.1-fix-A` | กู้คืนหลังแก้ Loop Crash & Loupe ReferenceError | `git checkout v1.0.1-fix-A -- .` |
| `v1.0.2-fix-B` | กู้คืนหลังแก้ Video Duration Infinity & Timeline Freeze | `git checkout v1.0.2-fix-B -- .` |
| `v1.0.3-fix-D` | กู้คืนหลังแก้ Frame Clock & Speed Cross-Validation | `git checkout v1.0.3-fix-D -- .` |
| `v1.0.4-fix-C` | กู้คืนหลังแก้ Auto-Score Court Gating & Stale Chip Expiry | `git checkout v1.0.4-fix-C -- .` |
| `v1.0.5-fix-E` | กู้คืนหลังแก้ Player Speed & Distance Noise Suppression | `git checkout v1.0.5-fix-E -- .` |
| `v1.0.6-fix-F` | กู้คืนหลังแก้ Team Split & In-Court Gating | `git checkout v1.0.6-fix-F -- .` |
| `v1.0.7-fix-G` | กู้คืนหลังเพิ่ม Safe Markdown & Table Renderer (No XSS) | `git checkout v1.0.7-fix-G -- .` |
| `v1.0.8-fix-H` | กู้คืนหลังเพิ่ม Data Quality Validation ใน AI JSON & Prompt | `git checkout v1.0.8-fix-H -- .` |
| `v1.0.9-fix-J` | กู้คืนหลังปรับป้ายชื่อจุดคาลิเบรต (TL, TR, SL, SR, Net-L, Net-R) | `git checkout v1.0.9-fix-J -- .` |
| `v1.1.0-fieldtest-complete` | **เวอร์ชันเสถียรล่าสุด ผ่านการทดสอบและแก้ปัญหาครบทุกข้อ** | `git checkout v1.1.0-fieldtest-complete -- .` |

---

## 🚀 รายการบันทึกการแก้ไขตามเวอร์ชัน

### [v1.1.0-fieldtest-complete] - 2026-11-02
- **Cache-Buster Update:** ปรับ Version Tag ใน `index.html` เป็น `?v=20261102a` ครบทุกโมดูล
- **Documentation:** เพิ่มเอกสารสรุปผล `docs/HANDOFF-fieldtest-2026-11-01.md` และ `CHANGELOG.md`
- **System Verification:** รันตรวจสอบ Syntax JS (`node --check`) ผ่าน 100% ครบทุกไฟล์

### [v1.0.9-fix-J] - 2026-11-02
- **Calibration Labels & UX (`js/live-view.js`):**
  - เปลี่ยนชื่อจุดลากคาลิเบรต 4 มุมให้ชัดเจนตามมิติความลึกสนามจริง:
    - `tl`: `เส้นหลังฝั่งไกล-ซ้าย (TL)`
    - `tr`: `เส้นหลังฝั่งไกล-ขวา (TR)`
    - `bl`: `เส้นเสิร์ฟสั้นฝั่งใกล้-ซ้าย (SL)`
    - `br`: `เส้นเสิร์ฟสั้นฝั่งใกล้-ขวา (SR)`
    - `netL`: `หัวเน็ทซ้าย (Net-L)`
    - `netR`: `หัวเน็ทขวา (Net-R)`
  - ขยายกล่องข้อความป้าย Handle เป็น 120px ให้ข้อความภาษาไทยแสดงได้ครบถ้วน ชัดเจน

### [v1.0.8-fix-H] - 2026-11-02
- **Data Quality & Anti-Hallucination (`js/analytics-coach.js`, `knowledge/system-prompt.md`):**
  - เพิ่มส่วน `data_quality` ใน `Match Data JSON` ตรวจสอบความถูกต้องของข้อมูล (Court Trusted, ระยะวิ่งต่อนาที, ความเร็วลูกตบ)
  - กำหนด Rule 8 ใน `knowledge/system-prompt.md` สั่งให้ AI Coach เตือนผู้เล่นทันทีหากข้อมูลมาจากการตรวจจับที่ยังไม่ตั้งเส้นสนาม หรือมีความผันผวนสูง ห้ามสรุปเป็นข้อเท็จจริงเด็ดขาด

### [v1.0.7-fix-G] - 2026-11-02
- **Zero-Dependency Safe Markdown & Table Renderer (`js/analytics-coach.js`):**
  - พัฒนาฟังก์ชัน `renderMarkdownSafe(mdText)` แปลง Markdown (Headers `##`, `###`, Tables `|...|`, HR `---`, Lists `* `, `1. `, Bold, Code) ให้เป็น HTML ที่สวยงาม พร้อม Entity Escaping ป้องกัน XSS
  - อัปเดตการแสดงผลรายงานในแท็บโค้ช AI ทั้ง Standby Report, Cached Report และ Live Gemini Analysis Report ให้เรนเดอร์ตารางและหัวข้อได้อย่างเป็นระบบ สบายตา
  - กรองอักขระ Markdown ออกจาก Snippet รายการแมตช์ที่บันทึกไว้ใน Supabase

### [v1.0.6-fix-F] - 2026-11-02
- **Strict In-Court Gating & Team Split (`js/pose-tracker.js`):**
  - แก้ไขการแบ่งทีม A/B โดยอ้างอิงพิกัดเส้นเน็ตในคอร์ทจริง (`uv.y <= 0.5 ? 'A' : 'B'`) แทนการใช้ `footY <= 0.5` บนหน้าจอ เพื่อแก้ปัญหาวิดีโอแนวตั้งที่ผู้เล่นแดนใกล้ถูกจัดเป็นทีม A
  - เพิ่ม In-Court Gating เมื่อสนามผ่านการ Calibrate: ตัดบุคคลที่อยู่นอกเขตเส้นสนาม (คนนั่งดูบนม้านั่ง ผู้เล่นสนามข้างเคียง) ออกจากการ Track เป็นผู้เล่น A1/A2/B1/B2
  - เพิ่ม Distance Penalty ในการจับคู่ผู้เล่นข้ามเฟรม ป้องกันการสลับตัวผู้เล่นกะทันหัน

### [v1.0.5-fix-E] - 2026-11-02
- **Player Speed & Distance Jitter Suppression (`js/pose-tracker.js`):**
  - แก้ปัญหายืนนิ่งแต่ความเร็วขึ้น 10-25 km/h และระยะวิ่งสะสมเกินจริง (745m ใน 5 นาที)
  - เพิ่ม Rolling 500ms Window คำนวณความเร็วจากการกระจัดสุทธิแทนการคูณเฟรมต่อเฟรม
  - เพิ่ม Depth-Adaptive Deadband (`noiseM = 0.14 + 0.30 * (1 - v)`) กรองการสั่นของข้อเท้าฝั่งไกล
  - เพิ่ม Anchor-based Distance Accumulation: สะสมระยะทางเฉพาะเมื่อเคลื่อนที่ออกจากจุดเดิมเกิน Noise Threshold
  - เชื่อมโยงพิกัดวงแหวนเท้า (`screenX, screenY`) เข้ากับ Homography โดยตรง ทำให้วงแหวนอยู่ใต้เท้าพอดี ไม่เหลื่อม

### [v1.0.4-fix-C] - 2026-11-04
- **BWF Auto-Score Gating & Stale Chip Expiry (`js/scoreboard.js`, `js/pose-tracker.js`, `js/state.js`):**
  - ล็อกไม่ให้ระบบให้แต้มอัตโนมัติหากสนามยังไม่ผ่านการ Calibrate / Trusted
  - บังคับว่าต้องมี `lastHitterTeam` ที่ยืนยันได้ ห้ามสุ่มเดาจาก `firstPt.v < 0.5`
  - ตรวจสอบ Net Fault เฉพาะลูกที่ตกฝั่งผู้ตีและห่างเน็ตไม่เกิน 1.5 เมตร ป้องกันการนับแต้มผิดเมื่อถือไม้ลงพื้น
  - เพิ่ม Cooldown 5.0 วินาที ป้องกันการให้แต้มซ้ำซ้อน
  - เพิ่ม `expireStaleCallChip()`: เคลียร์ป้ายขานแต้มกลับสู่สถานะพร้อมแรลลี่ถัดไปอัตโนมัติภายใน 6 วินาที

### [v1.0.3-fix-D] - 2026-11-02
- **Frame-Clock Synchronization & Shuttle Speed Validation (`js/live-view.js`, `js/pose-tracker.js`, `js/analytics-coach.js`):**
  - ซิงค์ `frameClockMs` กับ `video.currentTime` แก้ปัญหา Render Loop 100fps ประมวลผลวิดีโอ 30fps ซ้ำ
  - ตรวจจับการ Seek หรือ Loop วิดีโอเพื่อ Reset Shuttle Tracker อัตโนมัติ
  - เพิ่ม Dual Cross-Validation: ปฏิเสธความเร็วลูกแบดหากไม่มี Pixel Metric Velocity รองรับ (ตัดการ Hallucinate ตัวเลข 243-263 km/h ขณะไม่มีการตี)
  - ปรับการแสดงผล HUD Smash Speed: ตัวเลขจะจางลงและขึ้นป้าย "(ล่าสุด)" เมื่อผ่านไปเกิน 5 วินาที

### [v1.0.2-fix-B] - 2026-11-02
- **Infinite Video Duration Fix (`js/live-view.js`, `js/state.js`):**
  - แก้ไขปัญหาคลิป WebM/MediaRecorder แสดงความยาว `119309:13` และแถบเลื่อนค้าง
  - ปรับปรุง `formatTimeSec(sec)` ให้รองรับ `h:mm:ss` และป้องกันค่า `Infinity` / ลบ
  - เพิ่มฟังก์ชัน `getSafeVideoDuration()` และกลไก Seek-probe หา Duration ที่แท้จริงใน `onloadedmetadata`
  - รองรับการวนลูปคลิปอัตโนมัติ (`onended`) พร้อมเคลียร์แทร็กเกอร์

### [v1.0.1-fix-A] - 2026-11-02
- **Loop Crash & ReferenceError Fix (`js/live-view.js`):**
  - แก้ไข `ReferenceError: uploadedVideo is not defined` ใน Calibration Loupe และ Auto-Snap
  - ย้าย `requestAnimationFrame` ขึ้นบรรทัดแรกของ `animateLoop` พร้อม `try/catch` ครอบการเรนเดอร์ เพื่อให้แอนิเมชันทำงานต่อเนื่องตลอดเวลาแม้เกิดข้อผิดพลาดชั่วคราว
  - หยุดวิดีโอชั่วคราวขณะลากจุดตั้งเส้นสนาม เพื่อให้ผู้ใช้ทาบเส้นบนเฟรมเดิมได้อย่างแม่นยำ
  - ตั้งสถานะ `isCourtTrusted = true` เมื่อผู้ใช้กด "บันทึกเส้นสนาม"
