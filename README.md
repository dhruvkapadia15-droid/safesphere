# SafeSphere AI 🛡️

**SafeSphere AI** is a predictive industrial safety intelligence platform. It fuses multiple factory telemetry streams — including live virtual IoT sensors, AI CCTV vision alerts, shift supervisor ratios, and active hazardous work permits — into a real-time **Agentic Compound Risk Engine**. 

Designed for safety managers and floor supervisors, this dashboard gives decision intelligence, AI-assisted natural-language safety audits, and a counterfactual **What-If Risk Simulator** to help prevent industrial incidents before they occur.

---

## 🚀 How to Run the Project

The project is structured as a monorepo containing:
- `/backend`: Node.js Express server + Socket.IO real-time gateway + Rule-based fallback and LLM (Gemini / Claude) integrations.
- `/frontend`: React + Vite + Tailwind CSS v4 dashboard client.

Currently, **both servers have been set up and are running live** in your workspace:
- **Frontend Developer Server:** running at [http://localhost:5173](http://localhost:5173)
- **Backend IoT Socket Server:** running at [http://localhost:5000](http://localhost:5000)

If you need to stop and start the services again, here is how:

### 1. Run the Backend Server
```bash
cd backend
npm install
npm start
```
*Note: If you have an Anthropic or Google Gemini API Key, add it to `backend/.env` (e.g. `GEMINI_API_KEY=your_key` or `ANTHROPIC_API_KEY=your_key`). If no key is set, the system dynamically falls back to an offline rule-based evaluation engine so the demo operates flawlessly immediately.*

### 2. Run the Frontend Developer App
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

---

## 🎯 Demo Walkthrough Script

Follow these steps during your live demo to tell the pitch story:

1. **Nominal State (Green)**: Open [http://localhost:5173](http://localhost:5173). Show the 3 nominal plant zones (Tank Farm, Loading Dock, and Process Area). Point out that all sensors (gases, pressure, temp) fluctuate naturally, and the risk engine outputs low scores (Green/Safe) due to standard operating conditions.
2. **Demo Panel (The Danger Hook)**: 
   - Click **"Incinerate Zone C (Blast Danger)"** in the top Presenter Banner.
   - Instantly watch the Floor Heatmap flash **RED** for Zone C, and the safety score spike to **~90%**.
   - Explain the *compound risk reasons* shown under the gauge: The gas level spiked (68 ppm) *while* a cutting/welding **Hot Work permit** was active, and AI CCTV detected a **missing hard helmet** and **unauthorized containment boundary entry**. Highlight that any single signal (like "no helmet detected") is minor, but fuses into a compound major hazard here.
3. **Safety Copilot (AI Reasoning)**:
   - Go to the Safety Copilot section on the sidebar.
   - Click the quick suggestion chip **"Why is this zone unsafe?"**.
   - Review the AI reasoning response demonstrating how the system translates live telemetry values directly into supervisor directives without hallucinations.
4. **"What-If" Counterfactual Simulation**:
   - Go to the **"What-If" Proactive Risk Simulator** panel.
   - Ask the audience: *"What if we approved a Confined Space permit during Node-A's Night Shift while H2S gas levels were slightly elevated (~30 ppm)?"*
   - Adjust the sliders/toggles:
     - Check **Confined Space Entry**.
   # SafeSphere AI 🛡️

   SafeSphere AI is a predictive industrial safety intelligence platform that fuses IoT telemetry, AI vision alerts, permit workflows, and human supervision signals into a real-time Compound Risk Engine.

   Key benefits:
   - Proactively surface compound hazards before incidents
   - Natural-language safety audits and exportable evidence
   - Interactive "What‑If" simulator for operational planning

   ---

   ## Quick Start

   Requirements: Node 18+ and npm.

   Backend (API + realtime gateway):
   ```bash
   cd backend
   npm install
   npm start
   ```
   If you need LLM integrations (Anthropic / Google Gemini), add keys to `backend/.env` (examples below). If no keys are present, the app falls back to a local rule-based evaluator for demos.

   Frontend (React + Vite dashboard):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   Default dev URLs:
   - Frontend: http://localhost:5173
   - Backend:  http://localhost:5000

   ---

   ## Environment Variables
   - `GEMINI_API_KEY` — (optional) Google Gemini API key
   - `ANTHROPIC_API_KEY` — (optional) Anthropic API key
   - `PORT` — backend port (default: 5000)

   Add keys to `backend/.env` like:
   ```
   GEMINI_API_KEY=your_key_here
   ANTHROPIC_API_KEY=your_key_here
   PORT=5000
   ```

   ---

   ## Project Structure
   - `/backend` — Node/Express API, Socket.IO gateway, risk engine
   - `/frontend` — React + Vite dashboard UI

   ---

   ## Features / Highlights
   - Real-time sensor fusion: gas, temperature, pressure, and CCTV
   - Compound risk scoring (multiple signals -> single actionable score)
   - Safety Copilot: concise, evidence-based natural-language reasoning
   - What‑If Risk Simulator: test counterfactual scenarios safely
   - Audit export: PDF reports with timestamps and rationales

   ---

   ## Demo Flow (short)
   1. Open the frontend: http://localhost:5173 and show the plant overview.
   2. Trigger an incident scenario (e.g., enable a Hot Work permit + elevated gas) and highlight the heatmap and score change.
   3. Use Safety Copilot to explain the compound causes.
   4. Run a What‑If simulation to compare live vs. simulated risk.
   5. Export an audit PDF for evidence and follow-up.

   ---

   ## Contributing
   - Fork and open a PR for bug fixes and enhancements.
   - For schema or API changes, include migration notes in your PR.

   ---

   ## License & Contact
   This repository is provided as-is for demo and development. For questions or collaboration requests, open an issue or contact the maintainer.

   Enjoy exploring SafeSphere AI 🚀
