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
| `v1.1.0-fieldtest-complete` | เวอร์ชันเสถียรหลังแก้ปัญหาจากคลิปทดสอบจริง | `git checkout v1.1.0-fieldtest-complete -- .` |
| `v1.2.0-court-math-ui-redesign` | เวอร์ชันเสถียร: แก้ไขคณิตศาสตร์เส้นสนามตรง 100%, แก้บั๊กแอปค้าง, UI Redesign สำหรับนักแบด 1-Tap AI | `git checkout v1.2.0-court-math-ui-redesign -- .` |
| `v1.2.1-fix-dock-overlap` | **เวอร์ชันล่าสุด: แก้ปัญหาแถบปุ่มลัด (Quick Setup Pills) ทับซ้อนกับแถบเมนูด้านล่าง (Bottom Nav)** | `git checkout v1.2.1-fix-dock-overlap -- .` |

---

## 🚀 รายการบันทึกการแก้ไขตามเวอร์ชัน

### [v1.2.1-fix-dock-overlap] - 2026-11-02
- **UI Layout & Clearance Fix (`css/styles.css`, `index.html`):**
  - ขยับตำแหน่ง `.hud-bottom` จากเดิม `bottom: calc(3.85rem + ...)` เป็น `bottom: calc(5.1rem + env(safe-area-inset-bottom, 0px))` เพิ่มระยะห่างให้ลอยเหนือแถบเมนูด้านล่าง 20px+ ป้องกันการเกยทับกันอย่างเด็ดขาด
  - ปรับขนาดและ Padding ของ `.hero-match-btn` (รัศมีมน 20px, padding 8px 14px) และ `.dock-pill-btn` ให้กะทัดรัด สวยงาม ไม่บวมทับคอนเทนต์
  - อัปเดต Cache-Buster ทั้งใน `<link rel="stylesheet">` และ `<script>` ทั้งหมดเป็น `?v=20261102c` เพื่อบังคับให้อุปกรณ์และ Vercel Edge โหลด CSS ใหม่ทันที

### [v1.2.0-court-math-ui-redesign] - 2026-11-02
- **Court Perspective Math (DLT Homography) (`js/cv-court.js`):**
  - เพิ่มระบบ Dual Calibration Mode: `full` (BWF 13.40m × 6.10m 4 มุมคอร์ทแท้จริง $v=0 \dots 1.0$) และ `service` (8.68m ถึงเส้นเสิร์ฟหน้า $v=0.6478$ สำหรับกล้องมุมต่ำมาก)
  - แก้ต้นตอเส้นสนามเบี้ยว: รหัสเดิมสมมติให้จุดใกล้คือเส้นเสิร์ฟสั้น แต่ผู้ใช้ลากไปวางที่เส้นหลังจริง ทำให้เกิดการคูณยืด $1.54\times$ และกางออกเป็นพัด
  - เพิ่ม Horizon Guarding ใน `projectPoint`: ป้องกัน $w \le 1e-4$ หรือพิกัดหารศูนย์ ไม่ให้เกิดค่าอนันต์ทำลาย Canvas 2D engine
  - ปรับ Default Court Corners ให้ตรงมิติคลิปถ่ายแนวตั้งหลังเส้นสนามทันที (`IMG_7847.MOV` geometry)
- **Drag Performance & Freezing Fix (`js/live-view.js`):**
  - แก้บั๊กแอปค้างเมื่อลากจุด: พักการประมวลผล MoveNet Pose & CV Frame-diff ชั่วขณะที่มีการลาก เพื่อมอบ CPU/GPU 100% ให้ UI วาดลื่นไหล 60 FPS
  - ย้ายการผูก Pointer Event ไปยัง Canvas พร้อมเพิ่ม `lostpointercapture`, `pointercancel` และ Global safety listeners ป้องกัน State ล็อกค้าง
  - เพิ่ม 3x Magnifier Loupe Guarding: ดัก Boundary Box และ `try/catch` ไม่ให้หลุดเฟรมวิดีโอ
- **UI/UX Redesign - The Badminton Player Journey (`index.html`, `css/styles.css`):**
  - **1-Tap Hero Match Button (`#btnHeroMatchAction`):** ปุ่มหลักเริ่มแมตช์/จบแมตช์ เด่นชัด กดง่ายแม้มือเปียกเหงื่อ:
    - สถานะเตรียมพร้อม (Idle): สีมรกต `▶ เริ่มแมตช์ & วิเคราะห์สด`
    - สถานะแข่งขัน (Running): สีกุหลาบกระพริบ `⏹ จบแมตช์ & ส่ง AI วิเคราะห์ (00:00)` จบแมตช์แล้วส่งสรุปสถิติตรงเข้าแท็บโค้ช AI ทันทีอัตโนมัติ
  - **Quick Setup Tools Bar:** แถบปุ่มลัดด้านล่าง `[ Live ]` `[ คลิป ]` `[ ทาบเส้น ]` `[ Demo 4K ]` `[ เมนู ]`
  - **Court Calibration Toolbar:** เมื่ออยู่ในโหมดทาบเส้น แสดงปุ่มลอย `[ 💾 บันทึกเส้น ✓ ]` `[ 🔄 สลับโหมด 13.4m/8.68m ]` `[ ↺ รีเซ็ต ]` `[ ⚡ สแกนเส้น ]`
  - **Reorganized 4-Step Hamburger Sheet (`#moreSheetPanel`):** จัดหมวดหมู่ 4 ขั้นตอนตามลำดับการใช้งานจริง:
    - *ขั้นตอนที่ 1 • ตั้งกล้อง & คลิปวิดีโอ* (Live, Upload, Demo 4K, Lens, Resolution, Orientation)
    - *ขั้นตอนที่ 2 • ทาบเส้นสนาม & Hawkeye* (ตั้งเส้น, สลับโหมด, Auto-snap, รีเซ็ต, กราฟิกเลเยอร์)
    - *ขั้นตอนที่ 3 • สกอร์บอร์ด & การแข่งขัน* (เริ่มแมตช์, แต้มทีม A/B, เดี่ยว/คู่, เสียงขานไทย, Pause)
    - *ขั้นตอนที่ 4 • สรุปสถิติ & โค้ช AI* (ส่งวิเคราะห์ AI ทันที, ตั้งชื่อแมตช์, บันทึกผล, Export JSON, แมตช์ใหม่)
- **Demo Clip Integration (`IMG_7847.MOV`):**
  - เพิ่มฟังก์ชัน `loadDemoBadmintonClip()` เรียกดูคลิปตัวอย่างการเล่นจริง 4K 60fps ได้ในคลิกเดียว พร้อมล็อกเส้นสนามตรงจุดทันที
- **Cache-Buster Update:** ปรับ Version Tag ใน `index.html` เป็น `?v=20261102b` ครบทุกโมดูล

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
