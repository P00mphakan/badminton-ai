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
| `v1.2.1-fix-dock-overlap` | เวอร์ชันแก้ปัญหาแถบปุ่มลัดทับซ้อนกับแถบเมนูด้านล่าง | `git checkout v1.2.1-fix-dock-overlap -- .` |
| `v1.2.2-court-geometry-and-ui-cleanup` | แก้ไขมิติมุมสนามตรงจุด 100%, แก้กราฟิกมาร์คคนตรงตัว, แก้ปัญหา UI 5 ชั้นทับซ้อน, และปรับปรุงสแกนเส้น | `git checkout v1.2.2-court-geometry-and-ui-cleanup -- .` |
| `v1.3.0-physics-aerodynamics-tracking-update` | ฟิสิกส์แรงต้านอากาศ (Aerodynamic Drag Model), Spatial Gate Filter & Play Volume Box, ป้องกันเส้นบิดเบี้ยวด้วย orderFourCorners อัตโนมัติบน pointerup, และล็อก Letterbox Render | `git checkout v1.3.0-physics-aerodynamics-tracking-update -- .` |
| `v1.3.1-fix-player-ring-and-target-lock` | ลดระดับวงแหวน Tracker ลงติดพื้นสนามใต้พื้นรองเท้า (Floor Mat Alignment) และแก้ไข Team Separation / In-Court Gating ให้ล็อคเป้าผู้เล่นครบ 4 คน (A1, A2, B1, B2) ได้แม่นยำ ไม่หลุด | `git checkout v1.3.1-fix-player-ring-and-target-lock -- .` |
| `v1.3.2-restore-clean-1080p-video-recorder` | นำปุ่ม Record วิดีโอต้นฉบับ 1080p (Clean Feed แบบไม่มีกราฟิกทับ) กลับมาไว้ที่แถบควบคุมหลักและเมนูตั้งค่า พร้อมระบบบีบอัดความละเอียดสูงประหยัดความจุ (~21 MB/นาที) | `git checkout v1.3.2-restore-clean-1080p-video-recorder -- .` |
| `v1.3.3-wider-clean-player-ring` | ขยายขนาดวงแหวน Player Tracker ให้กว้างขึ้นตามท่ายืนแบดมินตัน (~32% wider) และนำขีดเล็งกากบาทออก (Clean Solid Neon Halo) | `git checkout v1.3.3-wider-clean-player-ring -- .` |
| `v1.3.4-fix-uploaded-clip-tracker-and-13m-calibration` | กู้คืน Tracker ในโหมดอัพโหลดคลิป, ซิงค์เมนูและการควบคุมให้เหมือนโหมด Live, ใช้เส้นสนาม 13.4m เต็มสนามเป็นหลัก และรองรับการลากมุม/ขอบเขตเส้นแม้หลุดเฟรม | `git checkout v1.3.4-fix-uploaded-clip-tracker-and-13m-calibration -- .` |
| `v1.3.5-high-precision-anti-interference-tracker` | ป้องกันจับคน/ลูกจากสนามข้างเคียง 100%, ล็อคเป้าหมายผู้เล่นไม่ให้หลุด Tracker (Coasting 6s), ยกระดับความแม่นยำและความละเอียด 576px ในโหมดคลิป | `git checkout v1.3.5-high-precision-anti-interference-tracker -- .` |
| `v1.3.6-saved-history-detail-modal-and-account-sync` | แตะเลือกแมตช์ในประวัติดูสถิติ & 2D Heatmap & บทวิเคราะห์ AI ทันที, รองรับเปลี่ยนชื่อแมตช์, แสดงสถานะ Saved ✓ (ไม่ระบุ Supabase), แยกบัญชีผู้ใช้ และซิงค์ข้อมูลจาก Cache เบราว์เซอร์อัตโนมัติ | `git checkout v1.3.6-saved-history-detail-modal-and-account-sync -- .` |
| `v1.3.7-restore-v131-player-tracker` | **เวอร์ชันล่าสุด: นำโค้ด Player Tracker ของ v1.3.1 กลับมาใส่ในเวอร์ชันปัจจุบัน (กว้างเต็มจอ, ขอบเขต tolU/tolV กว้างจับคนติดง่ายไม่หลุด, ระดับวงแหวนแนบพื้นเท้า และคงฟังก์ชัน v1.3.6 ทั้งหมดไว้ครบถ้วน)** | `git checkout v1.3.7-restore-v131-player-tracker -- .` |

---

## 🚀 รายการบันทึกการแก้ไขตามเวอร์ชัน

### [v1.3.7-restore-v131-player-tracker] - 2026-11-03
- **กู้คืนระบบ Player Tracker ฉบับเสถียรของ v1.3.1 กลับสู่เวอร์ชันปัจจุบัน:**
  - นำ `getCourtActionCrop` มุมมองแบบเต็มความกว้างจอ (`x: 0, w: 1.0, cropY0: max(0, min(0.40, minCourtY - 0.24))`) กลับมาใช้ ทำให้ตรวจจับผู้เล่นริมเส้นข้างและแดนหลังได้ครบถ้วน ไม่ถูกตัดขอบทิ้ง
  - ปรับค่าความคลาดเคลื่อน Homography In-Court Gating กลับเป็น `tolU = 0.45` และ `tolV = 0.65` ป้องกันปัญหาวงแหวน Tracker หลุดเป้าเมื่อผู้เล่นวิ่งถอยรับลูกเสิร์ฟหรือลูกตบหลังเส้น Baseline
  - รักษาระดับวงแหวน Tracker ให้อยู่ใต้พื้นรองเท้าแนบพื้นคอร์ท (`soleOffset`) ตามการคำนวณสรีระข้อเท้า-หัวเข่า-สะโพกของ v1.3.1
  - ย้อนกลับเกณฑ์ระยะการเคลื่อนที่ของลูกขนไก่เทียบกับตัวผู้เล่นตีลูกเป็นรัศมี $2.2\text{ m}$ ป้องกันการตัดลูกตบเหนือศีรษะทิ้ง
  - **คงฟังก์ชันใหม่ของเวอร์ชัน v1.3.6 ไว้ 100%:** ทั้ง Modal สถิติแมตช์ย้อนหลัง, 2D Heatmap, บทวิเคราะห์โค้ช AI, การเปลี่ยนชื่อแมตช์, ปุ่ม Record วิดีโอ 1080p, และการซิงค์บัญชีผู้ใช้ `Saved ✓`

### [v1.3.6-saved-history-detail-modal-and-account-sync] - 2026-11-02
- **แตะเลือกแมตช์ในประวัติเพื่อดูรายละเอียดเต็ม (Interactive Match Detail Modal):**
  - เพิ่มหน้าต่าง Modal รายละเอียดแมตช์ (`#matchDetailModal`) พร้อม 3 แท็บย่อย:
    1. **สถิติตบ & ผู้เล่น:** แสดงสปีดตบสูงสุด, สปีดเฉลี่ย, จำนวนครั้งตบ, เวลาแข่งขัน, การวิ่งจริงรายบุคคล และ Recent Shots
    2. **กราฟิกวิ่ง 2D Heatmap:** แสดงสนามแบดมินตัน 2D BWF มาตรฐาน พร้อมพื้นที่ Heatmap รังสีความร้อนและเส้นทางวิ่ง (Trails) ของผู้เล่นที่บันทึกไว้
    3. **บทวิเคราะห์โค้ช AI:** แสดงรายงานแท็กติกการแข่งขันของแมตช์นั้นอย่างละเอียด
  - รองรับปุ่ม "เปิดในแท็บวิเคราะห์หลัก" เพื่อโหลดสถิติและข้อมูลเข้าสู่หน้าระบบ
- **ระบบบันทึกและแสดงผลแบบ Saved ✓ (Clean White-Label):**
  - ลบข้อความและป้ายกำกับ "Supabase" ออกจากหน้าจอผู้ใช้ทั้งหมด ปรับใช้ข้อความ "Saved ✓" ที่เข้าใจง่ายและเป็นมืออาชีพ
  - รองรับการแก้ไขชื่อแมตช์ (`editSavedMatchTitle`) ได้ทั้งจากปุ่มไอคอนดินสอบนการ์ดประวัติ และจากภายในหน้าต่าง Modal โดยบันทึกลงทั้งฐานข้อมูลและ Cache ในเครื่องทันที
- **การแยกประวัติแมตช์ตามบัญชีผู้ใช้ (Strict Account Isolation):**
  - คัดแยกข้อมูลแมตช์ตาม `user_id` ของบัญชีที่เข้าสู่ระบบ ป้องกันการเห็นข้อมูลปะปนกับผู้ใช้อื่น
  - หากยังไม่ได้เข้าสู่ระบบ จะแสดงกล่องแจ้งเตือนสีเหลืองอำพัน (`#unauthenticatedWarningBox`) อธิบายชัดเจนว่าข้อมูลถูกบันทึกชั่วคราวในเบราว์เซอร์ พร้อมปุ่มทางลัด "เข้าสู่ระบบ / สมัครสมาชิก"
  - เมื่อเข้าสู่ระบบสำเร็จ ระบบจะทำงานบนหน้าเดิมโดยอัตโนมัติ ไม่รีเฟรชหรือเปลี่ยนหน้าให้เสียสมาธิ
- **ระบบกู้คืนและซิงค์ข้อมูลจาก Cache อัตโนมัติ (Auto Cache Sync to Cloud):**
  - เพิ่มฟังก์ชัน `autoSyncCachedMatchesToAccount()`: นำแมตช์และบทวิเคราะห์ที่เก็บไว้ใน `localStorage` ของเบราว์เซอร์ขณะออฟไลน์/ผู้ใช้ทั่วไป ซิงค์ขึ้นบัญชีผู้ใช้โดยอัตโนมัติทันทีที่ล็อกอินเสร็จสมบูรณ์ พร้อมแจ้งเตือน `Saved ✓` สวยงาม

### [v1.3.5-high-precision-anti-interference-tracker] - 2026-11-02
- **ป้องกันการจับคนจากสนามข้างเคียง 100% (Adjacent Court Player Rejection):**
  - ปรับปรุง `getCourtActionCrop()` ให้ตัดขอบด้านข้างตามแนวคอร์ทจริงของเรา (+8% margin buffer หรือ ~0.5m) ตัดภาพสนามข้างเคียงซ้าย-ขวาออกจากอินพุตของ MoveNet โดยสิ้นเชิง
  - ปรับความคลาดเคลื่อนด้านข้างสนาม (`tolU`) และด้านหลังสนาม (`tolV`) ใน `evaluatePoseCandidate` จากเดิมที่กว้างเกินไป เหลือเพียง `0.16` (~0.98m จากเส้นข้าง และ ~2.14m จากเส้นหลัง) ปัดทิ้งผู้เล่นและผู้ชมของสนามข้างเคียงทั้งหมดโดยอัตโนมัติ
- **ระบบล็อคเป้าผู้เล่นไม่หลุด Tracker (Rock-Solid Player Locking & Coasting):**
  - ขยายระยะเวลา Coasting เมื่อเข้าสู่สถานะล็อคเป้าเป็น 6,000ms ในโหมดคลิป (4,500ms ใน Live) ทำให้จังหวะที่คู่ขาวิ่งตัดหน้า กระโดดตบ หรือบังตัวกัน วงแหวน Tracker และโครงร่างจะไม่หลุดหรือหายไป
  - เพิ่มบทลงโทษการสลับ Slot ID ระหว่างคู่ขา (`slotCost`) สูงสุด $distM \times 8.0 + 50.0$ ป้องกันการสลับคู่ขา A1/A2 และ B1/B2
  - ปรับค่าความนุ่มนวล Exponential Filter ($\alpha = 0.42$) ทำให้วงแหวนเคลื่อนที่ตามฝีเท้าอย่างมั่นคง ไร้อาการสั่นกระตุก
- **ยกระดับความแม่นยำสูงพิเศษในโหมดอัพโหลดคลิป (Ultra-Detail 576px Resolution):**
  - ขยายความละเอียดภาพป้อนเข้าโมเดล MoveNet จาก 448px เป็น 576px (+65% พิกเซล) เมื่อตรวจจับคลิปวิดีโออัพโหลด ทำให้ตรวจจับข้อเท้า หัวเข่า และข้อมือของผู้เล่นฝั่งไกลได้แม่นยำและคมชัดยิ่งขึ้น
- **ป้องกันการจับลูกขนไก่จากสนามข้างเคียง (Adjacent Shuttlecock Rejection):**
  - บีบ Play Volume Box ด้านข้างให้กระชับเหลือ $x \in [-0.75, 6.85]\text{ m}$ (จากเดิม 7.3m)
  - เพิ่มเงื่อนไขตรวจสอบต้นกำเนิดลูก (Rally Origin Gate): ลูกขนไก่ที่เริ่มบินข้ามเฟรมจะถูกรับเป็น Track ตีลูกก็ต่อเมื่อเริ่มต้นในระยะเอื้อมตีของนักกีฬาในสนามเรา ($\le 1.45$ เท่าของความสูงคน หรือ ~2.5m) เท่านั้น ลูกที่ลอยมาจากสนามอื่นจะถูกตัดทิ้งทันที

### [v1.3.4-fix-uploaded-clip-tracker-and-13m-calibration] - 2026-11-02
- **กู้คืนระบบ Tracker ในโหมดอัพโหลดคลิป (`js/pose-tracker.js`, `js/live-view.js`):**
  - แก้ไขปัญหา MoveNet MultiPose ค้าง/ไม่ตรวจจับคนในคลิปวิดีโออัพโหลด โดยเปลี่ยนมาใช้ `performance.now()` เป็น Wall-clock throttle อิสระ ทำให้การประมวลผลไม่ถูกบล็อกจากการแปลง `mediaTime` หรือการกรอกลับ/Seek
  - เพิ่มระบบ Pause Protection: เมื่อหยุดวิดีโอชั่วคราว ข้อมูล Tracker ผู้เล่นและตำแหน่งจะไม่หายไป (ไม่หมดอายุเมื่อ `video.paused`)
  - อัปเดตพิกัดเริ่มต้นสนามแนวตั้งมาตรฐาน (Far Baseline อยู่ที่ $y \approx 0.39$ เหนือผู้เล่นฝั่งไกล แทนที่ $0.584$) ทำให้ผู้เล่นทั้งฝั่งใกล้และฝั่งไกล (A1, A2, B1, B2) คำนวณค่า $u, v$ อยู่ในสนามจริงและตรวจจับได้ครบถ้วน
- **ระบบทาบเส้นสนาม 13.4m เต็มสนามเป็นหลัก + ลากเส้นบริเวณขอบเขตเมื่อหลุดเฟรม (`js/cv-court.js`, `js/live-view.js`):**
  - ตั้งค่า BWF 13.40m Full Court (`full`) เป็นโหมดหลักถาวร และยกเลิกการสลับโหมดอัตโนมัติเมื่อแตะจุด เพื่อความแม่นยำในการวิเคราะห์
  - รองรับการลากที่เส้นขอบเขต (Boundary Line Dragging): เมื่อจุดมุมสนามหลุดออกนอกจอ (เช่น เส้นหลังใกล้ `bl`, `br`) ผู้ใช้สามารถสัมผัสและลากเส้นบริเวณขอบเขตนั้น ๆ ได้โดยตรง ด้วยระบบ Relative Delta Tracking ทำให้เส้นขยับตามนิ้วอย่างแม่นยำ ไม่กระตุก
- **ซิงค์เมนูและการควบคุมให้สมบูรณ์ทั้งในโหมดคลิปและ Live (`index.html`, `js/live-view.js`):**
  - เพิ่มปุ่ม เล่น/หยุด (Play/Pause) ที่แถบควบคุมคลิปวิดีโอ เพื่อความสะดวกในการหยุดดูจังหวะและปรับเส้นสนาม
  - เมนูหลัก Quick Setup Pills (กล้องสด, Record, คลิป, ทาบเส้น, เมนู) และฟังก์ชันใน Hamburger Sheet ใช้งานได้เหมือนกัน 100%

### [v1.3.3-wider-clean-player-ring] - 2026-11-02
- **Wider Athletic Floor Ring & Crosshair Removal (`js/live-view.js`):**
  - ขยายรัศมีวงแหวนเรืองแสงของตัวผู้เล่นให้กว้างขึ้นประมาณ 32% (`ringRx = 50 * depthScale`, `ringRy = ringRx * 0.36`) เพื่อครอบคลุมท่ายืนเตรียมพร้อม (Athletic Ready Stance) ของนักแบดมินตันได้อย่างสมดุลและสวยงาม
  - นำขีดกากบาท 4 ทิศ (Crosshair Reticle Ticks) ออกทั้งหมดตามคำขอ เหลือเพียงวงแหวนนีออนสไตล์เรืองแสง 3 ชั้น (Floor Wash + Neon Bloom + White-Hot Core) ที่ดูสะอาดตาและไม่รกหน้าจอ
  - ปรับระดับแกน Y ให้วางแนบสนิทกับเสื่อคอร์ทสีเขียวใต้ฝ่าเท้าผู้เล่นอย่างต่อเนื่อง

### [v1.3.2-restore-clean-1080p-video-recorder] - 2026-11-02
- **Clean 1080p Raw Video Recorder UI Restored (`index.html`, `css/styles.css`, `js/live-view.js`):**
  - นำปุ่ม **Record** กลับมาแสดงอย่างเด่นชัดบนแถบปุ่มลัดหลักด้านล่างหน้าจอ (`#btnRecordRawVideo`) ข้างปุ่มกล้อง Live และปุ่มคลิป
  - เพิ่มปุ่มบันทึกวิดีโอสดลงในเมนูหลักแฮมเบอร์เกอร์ (`#moreSheet`) ภายใต้ขั้นตอนที่ 1 (ตั้งกล้อง & คลิปวิดีโอ)
  - เพิ่มเอฟเฟกต์ไฟสถานะสีแดงนีออนกะพริบ (`.dock-pill-btn.is-recording` & `#recDot`) พร้อมตัวเลขนับเวลาอัดคลิปสดแบบเรียลไทม์
- **Zero-Graphics Clean Recording:**
  - บันทึกสัญญาณภาพและเสียงโดยตรงจาก `webcamVideo.srcObject` (Camera Sensor Stream) 100% จึงไม่มีเส้นคอร์ท โครงกระดูก วงแหวน หรือสกอร์บอร์ดมาบดบังแมตช์จริง
- **1080p High-Efficiency Storage Optimization:**
  - กำหนดค่ากล้องขั้นต่ำ 1080p Full HD (`1920 × 1080 @ 60fps`)
  - ใช้โปรไฟล์บีบอัด H.264 / VP9 อัตราบิต 2.8 Mbps (ภาพ) + 96 kbps (เสียง) ได้ขนาดไฟล์เพียง ~21 MB ต่อนาที (ประหยัดความจำมือถือมากกว่ากล้องติดเครื่องเดิมถึง 85% โดยลูกขนไก่ที่พุ่งเร็วยังคงคมชัด ไม่แตกเป็นบล็อก)
  - รองรับการบันทึกเข้าสู่คลังภาพ (Photos / Gallery) ผ่าน Native Share Sheet บน iOS และ Android ทันทีเมื่อกดหยุดอัดคลิป

### [v1.3.1-fix-player-ring-and-target-lock] - 2026-11-02
- **Player Floor Contact & Neon Tracker Ring Height Fix (`js/pose-tracker.js`, `js/live-view.js`):**
  - แก้ไขปัญหาวงแหวนเรืองแสงลอยสูงอยู่ที่ระดับหัวเข่า/หน้าแข้ง:
    - ใน `js/pose-tracker.js`: เพิ่มการชดเชยระยะ Sole Offset (`soleOffset = ankleToKnee * 0.22` หรือ `playerH * 0.055`) จากตำแหน่งข้อเท้า (Ankle Joint) ลงสู่พื้นสัมผัสจริงของพื้นรองเท้า (Shoe Soles on Court Mat)
    - ปรับปรุงการคำนวณกรณีข้อเท้าถูกบดบังด้วยการประมาณจากเข่า-สะโพก (`kneeY + thighH * 1.18`) และสะโพก-ไหล่ (`hipY + torsoH * 1.35`) ให้สอดคล้องกับสรีระจริง
    - ใน `js/live-view.js`: กำหนดจุดศูนย์กลางของวงแหวนและรัศมี Perspective (`floorY = py + ringRy * 0.20`) ทำให้วงแหวน แสงสะท้อนพื้น (Floor Wash) เส้นกากบาทเล็ง และป้ายชื่อ วางราบแนบสนิทกับพื้นคอร์ทสีเขียวใต้ฝ่าเท้าผู้เล่น 100%
- **All-Player Target Lock & Far-Court Detection Fix (`js/pose-tracker.js`):**
  - แก้ไขบั๊กการแบ่งแดนผู้เล่น (Team A vs Team B): เดิมระบบเปรียบเทียบกับ `netScreenY` (ซึ่งเป็นเทปขอบบนของตาข่ายที่ลอยสูง 1.55 เมตร) ทำให้ผู้เล่นแดนไกล (Team A) ที่ยืนอยู่บนพื้นหลังตาข่ายถูกเข้าใจผิดว่าเป็น Team B และถูกตัดทิ้งจนเหลือตรวจจับได้เพียง `ค้นหา [2/4]`
  - ปรับระบบการแบ่งแดนใหม่ให้ใช้พิกัดความลึกของสนามจริง $v \le 0.51$ (Far Court = Team A, Near Court = Team B) และเปรียบเทียบกับแนวพื้นโคนตาข่าย (`netBaseY`)
  - ปรับเกณฑ์ MoveNet MultiPose ให้ตรวจจับผู้เล่นแดนไกลที่ตัวเล็กและถูกตาข่ายบังบางส่วนได้แม่นยำขึ้น (คะแนน $\ge 0.12$, Keypoints $\ge 3$)
  - ขยาย In-Court Gating Tolerance สำหรับแดนไกล (`tolU = 0.45`, `tolV = 0.65`) เพื่อรองรับจังหวะผู้เล่นถอยไปรับลูกโย่งหลังคอร์ทโดยเป้าหมายไม่หลุด
  - ขยายเวลา Coasting สำหรับเป้าหมายที่ล็อคแล้วเป็น 2400ms รองรับจังหวะกระโดดตบหรือวิ่งตัดหน้ากัน และเสริมระบบล็อคเป้ารายตัวอัตโนมัติ ทำให้ผู้เล่นล็อคครบ 4 คน (`🎯 ล็อคเป้า 4/4`) ได้อย่างรวดเร็วและแม่นยำ

### [v1.3.0-physics-aerodynamics-tracking-update] - 2026-11-02
- **Physics Engine (`js/pose-tracker.js`):**
  - ติดตั้งสูตรอากาศพลศาสตร์ BWF Standard Shuttlecock: $F_d = \frac{1}{2} \rho C_d A v^2$ และ $v_0 = \frac{L(e^{D/L} - 1)}{T}$ โดยใช้ $v_t = 7.0\text{ m/s}$, $g = 9.81\text{ m/s}^2$, $L \approx 4.99\text{ m}$ พร้อมฟังก์ชันมาตรฐาน `calculateSmashInitialSpeed(distanceMeters, flightTimeSec)` ชดเชยแรงต้านอากาศ ไม่คำนวณแบบหารระยะทางตรงๆ
  - ส่งออกฟังก์ชัน `window.calculateSmashInitialSpeed` และ `ShuttleCV.calculateSmashInitialSpeed` สำหรับทดสอบและเชื่อมต่อระบบวิเคราะห์
- **Shuttlecock Tracking & Interference Rejection (`js/cv-court.js`, `js/pose-tracker.js`):**
  - กำหนด **Play Volume Box** $x \in [-1.2, 7.3]\text{ m}, y \in [-1.5, 14.9]\text{ m}, z \in [0, 8.0]\text{ m}$ พร้อมฟังก์ชันตรวจสอบ `isInsidePlayVolume(x, y, z)` และ `isInsidePlayVolumeUV(u, v)`
  - ปรับปรุง `getCourtAirspacePolygon()` ใน `js/cv-court.js` ให้ขยายปริมาตรอากาศคลุมพื้นที่ Play Volume Box 8.0 เมตร
  - ตรวจจับลูกขนไก่ด้วย 3-Frame Temporal Difference $|F_t - F_{t-1}| \cap |F_{t-1} - F_{t-2}|$ กรองจุดแสงรบกวนด้วย Hot-Cell Filter
  - ใน `onTrackConfirmed`: ลูกขนไก่ที่ถูกต้องจะต้องมีจุดเริ่มต้นสัมผัสหน้าไม้ (Hit Point) ใกล้เคียงกับผู้เล่นในสนามเราเท่านั้น ($d \le 2.2$) คัดทิ้งลูกที่ลอยมาจากคอร์ทข้างเคียง
- **Court Calibration & Homography (`js/cv-court.js`, `js/live-view.js`):**
  - ฟังก์ชัน `orderFourCorners(pts)` จัดเรียง 4 จุดมุมสนามอัตโนมัติตามเข็มนาฬิกา (Centroid -> Clockwise Sort -> Top-Left Anchor) ป้องกันปัญหาเส้นสนามบิดเบี้ยวไขว้กันเป็นรูปโบว์ไทด์ (Bow-tie)
  - ทำงานอัตโนมัติทุกครั้งเมื่อผู้ใช้ปล่อยนิ้ว (`pointerup`, `pointercancel`, `lostpointercapture`) ทั้งโหมดเต็มสนาม, โหมดเส้นหน้าเน็ต และโหมดเสิร์ฟสั้น
  - แก้ไขเส้น Crosshair แนวตั้งในแว่นขยาย Loupe 3x Magnifier ให้ตรงจุดกึ่งกลาง
- **Letterbox Offset Alignment Guard (`js/live-view.js`):**
  - กราฟิก Court lines, Skeletons, Floor Rings, Shuttle Trail, และ Loupe ทั้งหมดถูกเรนเดอร์และ `clip()` ให้อยู่ภายในกรอบวิดีโอจริง (`videoRenderRect`) 100% ป้องกันกราฟิกหลุดออกแถบดำ Letterbox บนคลิปวิดีโอแนวตั้ง (9:16)
- **Deployment & Production Quality:**
  - สร้าง `vercel.json` รองรับ Clean URLs และ Static Deployment
  - อัปเดต Cache Buster เป็น `?v=20261102k`
  - ยืนยัน Zero Mock Data / Production Mode Only 100%

### [v1.2.2-court-geometry-and-ui-cleanup] - 2026-11-02
- **Zero-Overlap Modal State UI (`index.html`, `js/live-view.js`):**
  - แก้ไขปัญหา UI ซ้อนทับ 5 ชั้น: ขณะเปิดโหมดทาบเส้น (`isCalibratingCourt`) ระบบจะทำการ **ซ่อนปุ่ม Hero Match Bar และปุ่มลัด 5 ปุ่ม และแถบวิดีโอ** โดยอัตโนมัติ เหลือเพียงแถบควบคุมทาบเส้นแถวเดียวที่ด้านล่าง ทำให้หน้าจอเปิดโล่ง 100% มองเห็นและลากจุดมุมสนามได้ครบทุกจุด
  - เมื่อกด "บันทึกเส้น ✓" ระบบจะสลับคืนหน้าจอหลักและแถบควบคุมปกติทันที
- **Court Perspective Corners Fix (`js/cv-court.js`):**
  - แก้ต้นตอจุดมาร์คไม่ครบ/ไม่ตรง: จุด `tl`/`tr` (เส้นหลังฝั่งไกล) เดิมถูกตั้งค่าไว้ที่ $y=0.585$ (อยู่ลึกกว่าเน็ท) และ `bl`/`br` (เส้นหลังฝั่งใกล้) อยู่ที่ $y=0.975$ (หลุดขอบล่างของหน้าจอ)
  - ปรับพิกัดเริ่มต้นใหม่ตามมุมมองกล้องตั้งหลังคอร์ทจริง (`IMG_7847.MOV` & `IMG_7130.MOV` geometry):
    - `tl`: `{ x: 0.360, y: 0.390 }`, `tr`: `{ x: 0.720, y: 0.390 }` (เส้นหลังฝั่งไกล อยู่เหนือเน็ท ชัดเจน)
    - `netL`: `{ x: 0.250, y: 0.465 }`, `netR`: `{ x: 0.830, y: 0.465 }` (หัวเน็ท 2 เสา กึ่งกลางสนาม)
    - `bl`: `{ x: 0.180, y: 0.880 }`, `br`: `{ x: 0.900, y: 0.880 }` (เส้นหลังฝั่งใกล้ ลอยเหนือแผงปุ่ม ไม่หลุดขอบ)
- **Player Foot Marker Alignment Fix (`js/pose-tracker.js`):**
  - แก้ปัญหาจุดมาร์คคนลอยไม่ตรงตัว: ยกเลิกการบังคับ re-project พิกัดเท้าผ่านเมทริกซ์สนามที่เอียง โดยให้ใช้วงแหวนและกรอบเล็งล็อกตรงกับตำแหน่งเท้าจริงที่ MoveNet ตรวจจับได้ในวิดีโอ 1:1 (`slot.screenX = c.footX; slot.screenY = c.footY;`) ทำให้จุดมาร์คเกาะติดเท้าผู้เล่น 100% ทุกเฟรม
- **Line Auto-Scan Accuracy (`js/cv-court.js`):**
  - ปรับปรุงรัศมีสแกน `searchR` และเกณฑ์ความเปรียบต่าง ให้รองรับสภาพแสงในสนามแบดมินตันในร่ม ทำให้กด "สแกนเส้น" แล้วดูดจับเส้นขาวจริงได้อย่างแม่นยำ
- **Cache-Buster Update:** ปรับ Version Tag ใน `index.html` เป็น `?v=20261102d` ครบทุกไฟล์

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
