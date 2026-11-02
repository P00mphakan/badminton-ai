# Deployment & Restore / Rollback Guide

**Project:** ShuttlePro AI (Badminton AI)  
**Remote Repository:** [https://github.com/P00mphakan/badminton-ai.git](https://github.com/P00mphakan/badminton-ai.git)  
**Production Branch:** `main`  
**Latest Production Tag:** `v1.2.0-court-math-ui-redesign` (Commit `b23916f`)  
**Deployment Date:** 2026-11-02 16:34:15 +07:00  

---

## 🚀 ข้อมูลการ Deploy สู่ Vercel

เมื่อโค้ดถูก Push สู่ Branch `main` บน GitHub (`P00mphakan/badminton-ai`) ระบบ Vercel ที่ผูกกับ Repo นี้จะตรวจจับ Webhook อัตโนมัติและดำเนินการ:
1. ดึงโค้ดเวอร์ชันล่าสุด (`b23916f`)
2. Build & Deploy เป็น Static Web Application
3. กระจายผลขึ้น Vercel Edge Network พร้อม Cache-Buster (`?v=20261102b`) เพื่อให้ผู้ใช้ได้รับไฟล์ล่าสุดทันทีโดยไม่ต้องล้างแคชบราวเซอร์

---

## 📌 จุดกู้คืนระบบ (System Restore & Rollback Log)

หากต้องการกู้คืนโค้ดกลับไปยังเวอร์ชันใด สามารถเปิด Terminal ในโฟลเดอร์โปรเจกต์แล้วรันคำสั่งตามตารางนี้ได้ทันที:

| เวอร์ชัน (Git Tag) | Commit SHA | รายละเอียดของเวอร์ชัน | คำสั่งกู้คืน (One-Command Restore) |
| :--- | :--- | :--- | :--- |
| **`v1.2.0-court-math-ui-redesign`** | `b23916f` | **เวอร์ชันปัจจุบัน:** แก้ Math เส้นตรง 100%, แก้แอปค้าง, UI 1-Tap นักแบด | `git checkout v1.2.0-court-math-ui-redesign -- .` |
| `v1.1.0-fieldtest-complete` | `9c53bd1` | เวอร์ชันเสถียรหลังแก้ปัญหา 9 ข้อจากคลิปทดสอบจริง | `git checkout v1.1.0-fieldtest-complete -- .` |
| `v1.0.9-fix-J` | `bf9aacc` | ปรับป้ายกำกับมิติความลึกสนาม (TL, TR, SL, SR) | `git checkout v1.0.9-fix-J -- .` |
| `v1.0.8-fix-H` | `6d954b2` | Data Quality Validation & Anti-Hallucination ใน AI Prompt | `git checkout v1.0.8-fix-H -- .` |
| `v1.0.7-fix-G` | `9a8a36a` | Safe Markdown & Table Renderer (No XSS) | `git checkout v1.0.7-fix-G -- .` |
| `v1.0.6-fix-F` | `ee10cda` | Homography Team Split & Strict In-Court Gating | `git checkout v1.0.6-fix-F -- .` |
| `v1.0.5-fix-E` | `979301c` | Noise Suppression ระยะวิ่งและความเร็วผู้เล่น | `git checkout v1.0.5-fix-E -- .` |
| `v1.0.4-fix-C` | `5e1842c` | Auto-scoring Gating & Expire Stale Call Chip | `git checkout v1.0.4-fix-C -- .` |
| `v1.0.3-fix-D` | `45abc00` | Video-Sync Frame Clock & Smash Velocity Validator | `git checkout v1.0.3-fix-D -- .` |
| `v1.0.2-fix-B` | `2f948f0` | แก้บั๊กเวลาคลิปอินฟินิตี้ (119309:13) & Timeline Freeze | `git checkout v1.0.2-fix-B -- .` |
| `v1.0.1-fix-A` | `3e83702` | ป้องกัน Render Loop Crash & Loupe ReferenceError | `git checkout v1.0.1-fix-A -- .` |
| `v1.0.0-pre-fieldtest-fix` | `ee49def` | **จุดเริ่มต้นเดิม** ก่อนการแก้ปัญหาจากคลิปทดสอบจริง | `git checkout v1.0.0-pre-fieldtest-fix -- .` |

---

## 🛠 วิธี Rollback บน Vercel โดยตรง (ผ่านหน้าเว็บ Vercel Dashboard)

นอกจากการใช้คำสั่ง Git ในเครื่องแล้ว คุณสามารถ Rollback ได้ทันทีจากหน้าจอ Vercel:
1. เข้าไปที่ [Vercel Dashboard](https://vercel.com/dashboard)
2. เลือกโปรเจกต์ `badminton-ai`
3. ไปที่แท็บ **Deployments**
4. มองหา Deployment ก่อนหน้าที่มีสถานะ **Ready** (มีไอคอนสีเขียว)
5. คลิกที่ปุ่มเมนู 3 จุด (`...`) ด้านขวาของ Deployment นั้น -> เลือก **Instant Rollback**
6. เว็บไซต์จริงจะสลับกลับไปยังเวอร์ชันนั้นทันทีภายใน 1 วินาที!

---

## 🛠 วิธี Rollback ด้วย Git แล้วสั่ง Deploy ใหม่อีกครั้ง

หากต้องการย้อนกลับโค้ดใน Git และ Deploy ขึ้น Vercel ใหม่:
```bash
# 1. กู้คืนไฟล์ทั้งหมดกลับไปที่ Tag ที่ต้องการ (เช่น v1.1.0)
git checkout v1.1.0-fieldtest-complete -- .

# 2. ทำการ Commit
git commit -m "rollback: revert to v1.1.0-fieldtest-complete"

# 3. Push ขึ้น GitHub เพื่อให้ Vercel Build ใหม่
git push origin main
```
