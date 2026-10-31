# ShuttlePro AI - Modular Architecture & Token-Saving Rules (Gemini 4 Argon)

## Strict Token-Optimization Policy
To minimize token consumption on every turn:
1. **Never read all files in the workspace.** Identify the exact module(s) relevant to the user's request from the Module Map below and call `read_file` / `edit_file` **ONLY** on those specific file(s).
2. **Use `edit_file` for targeted patches** instead of rewriting entire files with `write_file`.
3. **Production Mode Only:** Never re-introduce fake/simulated players, fake court overlays on non-court scenes, or fake random scores.

---

## Module Map (Read & Edit ONLY the Relevant Module)

| Subsystem / Feature Request | Target File | Description |
| :--- | :--- | :--- |
| **HTML Layout / UI Buttons / Modals** | `index.html` | Main DOM structure, header, scoreboard HTML, camera container, and bottom tabs (~340 lines). |
| **Theme / CSS / Layout Styling** | `css/styles.css` | Glassmorphism panels, camera aspect ratios (`16:9` / `9:14`), scrollbars (~55 lines). |
| **Global State / Initial Data** | `js/state.js` | Shared state variables, `players` (`A1, A2, B1, B2`), `shuttle`, `scoreboard`, and `showToast` (~135 lines). |
| **Court Line & Net Detection / Homography** | `js/cv-court.js` | `window.ShuttleCV`: 8-DOF Homography solver (`H`, `H⁻¹`), white line ridge & net top tape CV detector, 3-frame shuttle motion diff, and BWF IN/OUT metric line evaluation (~385 lines). |
| **Player Pose & Shuttle Speed Tracking** | `js/pose-tracker.js` | TensorFlow.js MoveNet MultiPose inference, ankle-to-court distance/speed tracking, and shuttle velocity / stroke classification (~250 lines). |
| **BWF Scoreboard / Line Calls / Voice Umpire** | `js/scoreboard.js` | Automatic 21-point BWF rally scoring, Hawkeye IN/OUT/NET call logic, Undo stack, Singles/Doubles toggle, and Thai Web Speech API umpire (~205 lines). |
| **Live Camera / Canvas HUD / Calibration Loupe** | `js/live-view.js` | Webcam/video upload controls, 60 FPS `liveCanvas` rendering, court/net overlay drawing, 4-Corner + Net drag calibration with 3x Magnifier Loupe (~420 lines). |
| **Stats / 2D Heatmap / Gemini AI Coach** | `js/analytics-coach.js` | Tab 2 (Smash speed stats), Tab 3 (2D court heatmap & trails), Tab 4 (Gemini Coach & Vision Referee API), tab switching, and JSON export (~340 lines). |
