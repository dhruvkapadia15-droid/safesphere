import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5000;

// Initialize clients if keys exist
let aiClient = null;
let anthropicClient = null;

if (process.env.GEMINI_API_KEY) {
  try {
    // Note: GoogleGenAI expects the apiKey or defaults to process.env.GEMINI_API_KEY
    aiClient = new GoogleGenAI();
    console.log('Gemini AI Client initialized successfully.');
  } catch (err) {
    console.error('Error initializing Gemini Client:', err.message);
  }
}

if (process.env.ANTHROPIC_API_KEY) {
  try {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    console.log('Anthropic Claude Client initialized successfully.');
  } catch (err) {
    console.error('Error initializing Anthropic Client:', err.message);
  }
}

// ----------------------------------------------------
// DATA MODELS & INITIAL STATE
// ----------------------------------------------------

const ZONES = [
  { id: 'zone-a', name: 'Confined Tank Farm', riskLevel: 'green', coordinates: [15, 20, 45, 50] },
  { id: 'zone-b', name: 'Loading Dock & Assembly', riskLevel: 'green', coordinates: [50, 10, 85, 45] },
  { id: 'zone-c', name: 'Hydrocarbon Process Area', riskLevel: 'green', coordinates: [20, 55, 80, 90] }
];

const sensorReadings = {
  'zone-a': { gasLevel: 12, temperature: 24.5, pressure: 1.01, humidity: 48, timestamp: Date.now() },
  'zone-b': { gasLevel: 0, temperature: 21.0, pressure: 1.00, humidity: 52, timestamp: Date.now() },
  'zone-c': { gasLevel: 5, temperature: 38.2, pressure: 2.4, humidity: 35, timestamp: Date.now() }
};

const detections = {
  'zone-a': {
    personId: 'worker-101',
    workersCount: 2,
    helmetViolations: 0,
    vestViolations: 0,
    glovesViolations: 0,
    restrictedZoneEntries: 0,
    fire: false,
    smoke: false,
    forkliftDetected: false,
    helmetDetected: true,
    vestDetected: true,
    inRestrictedZone: false,
    confidence: 0.96,
    timestamp: Date.now()
  },
  'zone-b': {
    personId: 'worker-102',
    workersCount: 4,
    helmetViolations: 1,
    vestViolations: 0,
    glovesViolations: 1,
    restrictedZoneEntries: 0,
    fire: false,
    smoke: false,
    forkliftDetected: true,
    helmetDetected: true,
    vestDetected: true,
    inRestrictedZone: false,
    confidence: 0.95,
    timestamp: Date.now()
  },
  'zone-c': {
    personId: 'worker-103',
    workersCount: 1,
    helmetViolations: 0,
    vestViolations: 0,
    glovesViolations: 0,
    restrictedZoneEntries: 0,
    fire: false,
    smoke: false,
    forkliftDetected: false,
    helmetDetected: true,
    vestDetected: true,
    inRestrictedZone: false,
    confidence: 0.97,
    timestamp: Date.now()
  }
};

const permits = [
  { id: 'permit-1', type: 'Confined Space Entry', zoneId: 'zone-a', startTime: Date.now() - 3600000, endTime: Date.now() + 7200000, status: 'active' },
  { id: 'permit-2', type: 'Hot Work', zoneId: 'zone-c', startTime: Date.now() - 1800000, endTime: Date.now() + 1800000, status: 'active' }
];

let currentShift = {
  type: 'day', // 'day', 'night', 'transition'
  supervisorCount: 3,
  startTime: '08:00',
  endTime: '16:00'
};

const riskAssessments = {
  'zone-a': { zoneId: 'zone-a', riskScore: 10, riskLevel: 'green', reasons: ['All values in normal parameters'], recommendedActions: ['Standard monitoring protocols'], timestamp: Date.now() },
  'zone-b': { zoneId: 'zone-b', riskScore: 5, riskLevel: 'green', reasons: ['All values in normal parameters'], recommendedActions: ['Standard monitoring protocols'], timestamp: Date.now() },
  'zone-c': { zoneId: 'zone-c', riskScore: 15, riskLevel: 'green', reasons: ['All values in normal parameters'], recommendedActions: ['Standard monitoring protocols'], timestamp: Date.now() }
};

// Caching limits: recompute API calls at most once every 12 seconds per zone
const lastAssessmentTime = {
  'zone-a': 0,
  'zone-b': 0,
  'zone-c': 0
};

// ----------------------------------------------------
// RULE-BASED FALLBACK ENGINE (For Offline / No API Key)
// ----------------------------------------------------
function localRiskEngine(zoneState) {
  const { zoneId, sensors, currentDetections, activePermits, shift } = zoneState;
  
  let score = 5;
  const reasons = [];
  const recommendedActions = [];

  // Gas Level logic
  if (sensors.gasLevel > 50) {
    score += 40;
    reasons.push(`Dangerous gas level threshold exceeded (${sensors.gasLevel} ppm)`);
    recommendedActions.push('Evacuate zone immediately and activate ventilation systems');
  } else if (sensors.gasLevel > 20) {
    score += 15;
    reasons.push(`Elevated gas level detected (${sensors.gasLevel} ppm)`);
    recommendedActions.push('Check for local component leaks and wear respirator equipment');
  }

  // Temp & Pressure logic
  if (sensors.temperature > 50) {
    score += 15;
    reasons.push(`High ambient temperature (${sensors.temperature.toFixed(1)}°C)`);
    recommendedActions.push('Monitor cooling systems and implement worker hydration breaks');
  }
  if (sensors.pressure > 4.0) {
    score += 30;
    reasons.push(`Critical pressure levels detected (${sensors.pressure.toFixed(2)} bar)`);
    recommendedActions.push('Initiate relief valves and verify piping integrity');
  } else if (sensors.pressure > 3.0) {
    score += 12;
    reasons.push(`Elevated process line pressure (${sensors.pressure.toFixed(2)} bar)`);
    recommendedActions.push('Inspect valve status and decrease feed rates');
  }

  // Detections logic (PPE & Restriction & Fire/Smoke/Vehicles)
  if (currentDetections) {
    // Handle both old schema and new dynamic schema
    const helmetViolationCount = currentDetections.helmetViolations !== undefined 
      ? currentDetections.helmetViolations 
      : (currentDetections.helmetDetected === false ? 1 : 0);
      
    const vestViolationCount = currentDetections.vestViolations !== undefined 
      ? currentDetections.vestViolations 
      : (currentDetections.vestDetected === false ? 1 : 0);
      
    const restrictedEntries = currentDetections.restrictedZoneEntries !== undefined 
      ? currentDetections.restrictedZoneEntries 
      : (currentDetections.inRestrictedZone ? 1 : 0);

    const glovesViolationCount = currentDetections.glovesViolations || 0;
    const hasFire = currentDetections.fire === true || currentDetections.fire === 'Yes' || currentDetections.fire === 'yes';
    const hasSmoke = currentDetections.smoke === true || currentDetections.smoke === 'Yes' || currentDetections.smoke === 'yes';
    const forklift = currentDetections.forkliftDetected === true || currentDetections.forkliftDetected === 'Yes' || currentDetections.forkliftDetected === 'yes';

    if (helmetViolationCount > 0) {
      score += 15 * helmetViolationCount;
      reasons.push(`AI CCTV: Detected ${helmetViolationCount} personnel without protective helmets`);
      recommendedActions.push('Enforce hard helmet compliance at entry gates');
    }
    if (vestViolationCount > 0) {
      score += 10 * vestViolationCount;
      reasons.push(`AI CCTV: Detected ${vestViolationCount} personnel without high-visibility safety vests`);
      recommendedActions.push('Ensure safety vest verification on floor entry');
    }
    if (glovesViolationCount > 0) {
      score += 5 * glovesViolationCount;
      reasons.push(`AI CCTV: Detected ${glovesViolationCount} safety gloves violations`);
      recommendedActions.push('Inspect worker task descriptions for hand protection compliance');
    }
    if (restrictedEntries > 0) {
      score += 25 * Math.min(3, restrictedEntries);
      reasons.push(`AI CCTV: ${restrictedEntries} unauthorized entries detected inside restricted perimeter`);
      recommendedActions.push('Dispatch floor guards to escort unauthorized personnel from containment areas');
    }
    if (hasFire) {
      score += 50;
      reasons.push('AI CCTV VISION: Active flame or high-thermal combustion detected on camera!');
      recommendedActions.push('ACTIVATE LOCAL FIRE SUPPRESSION SYSTEMS AND CLEAR ZONE PERIMETER');
    }
    if (hasSmoke) {
      score += 20;
      reasons.push('AI CCTV VISION: Heavy smoke column or ventilation exhaust opacity detected');
      recommendedActions.push('Verify scrubber status and deploy thermal sensor team');
    }
    if (forklift) {
      score += 5;
      reasons.push('AI CCTV: Heavy vehicle (Forklift/Loader) currently active in zone');
      recommendedActions.push('Maintain active personnel separation boundaries');
    }
  }

  // Permits logic & Compound Risk
  const hotWorkPermit = activePermits.find(p => p.type.toLowerCase().includes('hot') && p.status === 'active');
  const confinedSpacePermit = activePermits.find(p => p.type.toLowerCase().includes('confined') && p.status === 'active');

  if (hotWorkPermit) {
    score += 8;
    reasons.push('Hot Work permit active in progress');
    if (sensors.gasLevel > 15) {
      score += 30; // Compound explosive hazard!
      reasons.push('COMPOUND RISK: High gas concentration during active Hot Work operation (ignition danger!)');
      recommendedActions.push('IMMEDIATELY cancel Hot Work permit and halt all cutting/welding operations');
    }
  }

  if (confinedSpacePermit) {
    score += 5;
    reasons.push('Confined Space permit active in progress');
    if (sensors.gasLevel > 10) {
      score += 20; // Oxygen displacement or toxic compounds in enclosed area
      reasons.push('COMPOUND RISK: Elevated toxic/combustible gases inside confined space area');
      recommendedActions.push('Order immediate evacuation of the confined space; verify ventilation is operational');
    }
  }

  // Shift modifier
  if (shift.type === 'night') {
    score += 5;
    if (shift.supervisorCount < 2) {
      score += 10;
      reasons.push('Reduced supervisor count during night operations');
      recommendedActions.push('Limit hazardous tasks to daylight hours or increase supervisor staffing');
    }
  } else if (shift.type === 'transition') {
    score += 8;
    reasons.push('Ongoing shift handover window (elevated miscommunication risk)');
    recommendedActions.push('Ensure verbal and written logs are fully completed before worker rotation');
  }

  // Normalize score
  score = Math.min(100, Math.max(0, Math.round(score)));

  let riskLevel = 'green';
  if (score >= 70) {
    riskLevel = 'red';
  } else if (score >= 35) {
    riskLevel = 'yellow';
  }

  if (reasons.length === 0) {
    reasons.push('No anomalies detected. Operations within nominal baseline parameters.');
    recommendedActions.push('Continue routine safety sweeps and shift logs.');
  }

  return {
    riskScore: score,
    riskLevel,
    reasons,
    recommendedActions
  };
}

// ----------------------------------------------------
// LLM IMPLEMENTATION FOR COMPOUND RISK ASSESSMENT
// ----------------------------------------------------
async function assessRiskLLM(zoneState) {
  const prompt = `You are the reasoning core of an industrial safety system. You will receive
structured JSON describing a factory zone's current sensor readings, CCTV
detections, active work permits, and shift status. Your job is NOT to detect
individual hazards — that's already done. Your job is to reason across all
signals together and assess COMPOUND risk: how these factors interact and
amplify each other.

Return ONLY valid JSON in this exact shape:
{
  "riskScore": <0-100 integer>,
  "riskLevel": "green" | "yellow" | "red",
  "reasons": ["short factual reason", ...],
  "recommendedActions": ["short imperative action", ...]
}

Rules:
- Base your score on the interaction of factors, not just their sum. E.g.
  a gas leak alone is a concern; a gas leak + active hot work permit +
  missing PPE + night shift is a compounding emergency.
- Reasons must reference only the specific data provided — never invent
  readings.
- Keep reasons and actions short and operational, written for a floor
  supervisor scanning a screen in seconds.

Zone State JSON Data:
${JSON.stringify(zoneState, null, 2)}`;

  // Try Anthropic Claude first
  if (anthropicClient) {
    try {
      console.log(`Calling Claude API for risk assessment of ${zoneState.zoneId}...`);
      const response = await anthropicClient.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      });
      const responseText = response.content[0].text;
      const jsonStart = responseText.indexOf('{');
      const jsonEnd = responseText.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonStr = responseText.substring(jsonStart, jsonEnd + 1);
        return JSON.parse(jsonStr);
      }
    } catch (err) {
      console.error('Claude API call failed, falling back to Gemini / Local:', err.message);
    }
  }

  // Try Gemini next
  if (aiClient) {
    try {
      console.log(`Calling Gemini API for risk assessment of ${zoneState.zoneId}...`);
      const response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });
      const responseText = response.text;
      return JSON.parse(responseText);
    } catch (err) {
      console.error('Gemini API call failed, falling back to Local:', err.message);
    }
  }

  // Fallback to local rule engine
  console.log(`Using Local Rule-Based Risk Engine for ${zoneState.zoneId} (Offline/No API key)`);
  return localRiskEngine(zoneState);
}

// ----------------------------------------------------
// SAFETY COPILOT CHAT FUNCTION
// ----------------------------------------------------
async function runSafetyCopilot(zoneState, question) {
  const prompt = `You are SafeSphere AI's safety copilot. A plant manager is asking about a
specific zone. You will receive the zone's current sensor data, detections,
permits, shift info, and its latest risk assessment. Answer the manager's
question directly and briefly, grounded only in this data. If asked for a
recommendation, be decisive and specific (e.g. "Evacuate Zone A" not "consider
evacuating"). Do not speculate beyond the data provided.

Zone Safety Data:
${JSON.stringify({
  zoneName: ZONES.find(z => z.id === zoneState.zoneId)?.name || zoneState.zoneId,
  ...zoneState
}, null, 2)}

Manager's Question:
"${question}"`;

  // Try Claude
  if (anthropicClient) {
    try {
      console.log(`Calling Claude API for Copilot query...`);
      const response = await anthropicClient.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      });
      return response.content[0].text;
    } catch (err) {
      console.error('Claude API Copilot call failed, falling back to Gemini:', err.message);
    }
  }

  // Try Gemini
  if (aiClient) {
    try {
      console.log(`Calling Gemini API for Copilot query...`);
      const response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      return response.text;
    } catch (err) {
      console.error('Gemini API Copilot call failed:', err.message);
    }
  }

  // Mock Copilot response in case of failure/no api keys
  console.log('Using mock Copilot response.');
  
  // Custom simple reasoning
  const zoneName = ZONES.find(z => z.id === zoneState.zoneId)?.name || zoneState.zoneId;
  const assessment = zoneState.assessment;
  const lowercaseQ = question.toLowerCase();
  
  if (lowercaseQ.includes('why') || lowercaseQ.includes('reason') || lowercaseQ.includes('risk')) {
    let resp = `For **${zoneName}**, the current risk score is **${assessment.riskScore}%** (${assessment.riskLevel.toUpperCase()}). `;
    resp += `The reasons mapped by the engine are: \n`;
    assessment.reasons.forEach(r => { resp += `- ${r}\n`; });
    resp += `\nWe recommend immediate action: **${assessment.recommendedActions.join(', ')}**`;
    return resp;
  }
  
  if (lowercaseQ.includes('gas') || lowercaseQ.includes('leak') || lowercaseQ.includes('ppm')) {
    return `In **${zoneName}**, gas level matches **${zoneState.sensors.gasLevel} ppm**. ${
      zoneState.sensors.gasLevel > 20 
        ? "Warning: This is elevated. Evacuation protocols or respirator mandates should be active." 
        : "This is well within normal safe thresholds (< 20 ppm)."
    }`;
  }

  if (lowercaseQ.includes('mask') || lowercaseQ.includes('helmet') || lowercaseQ.includes('ppe') || lowercaseQ.includes('vest')) {
    const det = zoneState.currentDetections;
    if (!det) return `No CCTV feeds are connected to **${zoneName}** at this millisecond.`;
    const issues = [];
    if (!det.helmetDetected) issues.push("Helmet violation");
    if (!det.vestDetected) issues.push("Safety vest violation");
    if (issues.length > 0) {
      return `Yes, the CCTV alert indicates workers in **${zoneName}** are missing PPE: ${issues.join(' and ')}. Supervise immediately to enforce PPE guidelines.`;
    }
    return `CCTV logs indicate 100% compliance for all personnel in **${zoneName}** (Helmets + High-Vis vests confirmed).`;
  }

  return `Zone **${zoneName}** is operating at a **${assessment.riskLevel}** safety rating (Score: ${assessment.riskScore}/100).
Current state: Temp ${zoneState.sensors.temperature.toFixed(1)}°C, Pressure ${zoneState.sensors.pressure.toFixed(2)} bar, Gas ${zoneState.sensors.gasLevel} ppm.
Supervisor Count: ${zoneState.shift.supervisorCount} during ${zoneState.shift.type} shift.
Active Permits: ${zoneState.activePermits.map(p => p.type).join(', ') || 'None'}.
Is there a specific signal or parameter you'd like me to explain further?`;
}

// Helper to compile zone state payload
function compileZoneState(zoneId, assessmentOverride = null) {
  const activePermits = permits.filter(p => p.zoneId === zoneId && p.status === 'active');
  const sensors = sensorReadings[zoneId];
  const currentDetections = detections[zoneId];
  const assessment = assessmentOverride || riskAssessments[zoneId];

  return {
    zoneId,
    sensors,
    currentDetections,
    activePermits,
    shift: currentShift,
    assessment
  };
}

// ----------------------------------------------------
// CORE RISK UPDATE ORCHESTRATOR
// ----------------------------------------------------
async function updateZoneRisk(zoneId, forceRealTime = false) {
  const state = compileZoneState(zoneId);
  const now = Date.now();

  // Rate limit check
  if (!forceRealTime && (now - lastAssessmentTime[zoneId] < 12000)) {
    // If recently updated, do not make an API call, return cached version
    return riskAssessments[zoneId];
  }

  try {
    const assessment = await assessRiskLLM(state);
    
    // Update local store
    riskAssessments[zoneId] = {
      ...assessment,
      zoneId,
      timestamp: now
    };
    lastAssessmentTime[zoneId] = now;

    // Update zone overall riskLevel status
    const zoneIndex = ZONES.findIndex(z => z.id === zoneId);
    if (zoneIndex !== -1) {
      ZONES[zoneIndex].riskLevel = assessment.riskLevel;
    }

    // Emit live update to sockets
    io.emit('zone-risk-update', {
      zoneId,
      zone: ZONES.find(z => z.id === zoneId),
      assessment: riskAssessments[zoneId]
    });

  } catch (error) {
    console.error(`Failed to update risk parameters for zone ${zoneId}:`, error);
  }

  return riskAssessments[zoneId];
}

// ----------------------------------------------------
// VIRTUAL SENSOR SIMULATOR (Background Job)
// ----------------------------------------------------
let demoTriggeredState = null;

function simulateSensors() {
  // Periodically fluctuate values
  ZONES.forEach(zone => {
    // Skip simulator updates if a manual demo risk event is running
    if (demoTriggeredState && demoTriggeredState.zoneId === zone.id) {
      return;
    }

    const sensor = sensorReadings[zone.id];
    
    if (zone.id === 'zone-a') {
      // Tank farm: slight gas fluctuations, normal temp/pressure
      sensor.gasLevel = Math.max(0, Math.min(100, Math.round(sensor.gasLevel + (Math.random() * 4 - 2))));
      sensor.temperature = Math.max(15, Math.min(35, sensor.temperature + (Math.random() * 0.4 - 0.2)));
      sensor.pressure = Math.max(0.9, Math.min(1.2, sensor.pressure + (Math.random() * 0.02 - 0.01)));
      sensor.humidity = Math.max(40, Math.min(60, sensor.humidity + (Math.random() * 2 - 1)));
    } else if (zone.id === 'zone-b') {
      // Loading Dock: 0 gas usually, normal weather temperature
      sensor.gasLevel = 0;
      sensor.temperature = Math.max(15, Math.min(28, sensor.temperature + (Math.random() * 0.6 - 0.3)));
      sensor.pressure = 1.00;
      sensor.humidity = Math.max(45, Math.min(65, sensor.humidity + (Math.random() * 3 - 1.5)));
    } else if (zone.id === 'zone-c') {
      // Process Area: process heat, high pressure, minor gases
      sensor.gasLevel = Math.max(0, Math.min(25, Math.round(sensor.gasLevel + (Math.random() * 2 - 1))));
      sensor.temperature = Math.max(30, Math.min(48, sensor.temperature + (Math.random() * 1.0 - 0.49)));
      sensor.pressure = Math.max(1.8, Math.min(3.2, sensor.pressure + (Math.random() * 0.15 - 0.07)));
      sensor.humidity = Math.max(25, Math.min(45, sensor.humidity + (Math.random() * 1 - 0.5)));
    }
    
    sensor.timestamp = Date.now();

    // Fluctuating detections occasionally
    const det = detections[zone.id];
    if (Math.random() > 0.95 && zone.id === 'zone-b') {
      // Occasional PPE violation in Zone B for realism
      det.helmetDetected = Math.random() > 0.12; 
      det.vestDetected = Math.random() > 0.06;
      det.timestamp = Date.now();
      io.emit('detection-alert', { zoneId: zone.id, detections: det });
    }

    // Push raw sensor values to client
    io.emit('sensor-tick', { zoneId: zone.id, sensors: sensor });

    // Trigger risk re-evaluation (checks rate limits inside updateZoneRisk)
    updateZoneRisk(zone.id);
  });
}

// Run sensor updates every 3.5 seconds
setInterval(simulateSensors, 3500);

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// Get full system state
app.get('/api/state', (req, res) => {
  const compiledZones = ZONES.map(z => ({
    ...z,
    sensors: sensorReadings[z.id],
    detections: detections[z.id],
    activePermits: permits.filter(p => p.zoneId === z.id && p.status === 'active'),
    latestAssessment: riskAssessments[z.id]
  }));
  
  res.json({
    zones: compiledZones,
    permits,
    shift: currentShift
  });
});

// Create/Update Permit
app.post('/api/permits', async (req, res) => {
  const { type, zoneId, durationHours } = req.body;
  if (!type || !zoneId) {
    return res.status(400).json({ error: 'Missing type or zoneId parameters' });
  }

  const newPermit = {
    id: `permit-${Date.now()}`,
    type,
    zoneId,
    startTime: Date.now(),
    endTime: Date.now() + (durationHours || 2) * 3600000,
    status: 'active'
  };

  permits.push(newPermit);
  io.emit('permit-created', newPermit);
  
  // Re-run risk analysis instantly
  const assessment = await updateZoneRisk(zoneId, true);
  res.status(201).json({ permit: newPermit, assessment });
});

// Expire Permit
app.post('/api/permits/:id/expire', async (req, res) => {
  const { id } = req.params;
  const pIdx = permits.findIndex(p => p.id === id);
  if (pIdx === -1) {
    return res.status(404).json({ error: 'Permit not found' });
  }

  permits[pIdx].status = 'expired';
  permits[pIdx].endTime = Date.now();
  io.emit('permit-expired', permits[pIdx]);

  // Re-run risk analysis instantly for that zone
  const zoneId = permits[pIdx].zoneId;
  const assessment = await updateZoneRisk(zoneId, true);
  
  res.json({ permit: permits[pIdx], assessment });
});

// Change Shift Settings
app.post('/api/shift', async (req, res) => {
  const { type, supervisorCount } = req.body;
  if (!['day', 'night', 'transition'].includes(type)) {
    return res.status(400).json({ error: 'Invalid shift type specified' });
  }

  currentShift = {
    type,
    supervisorCount: supervisorCount ?? currentShift.supervisorCount,
    startTime: type === 'day' ? '08:00' : type === 'night' ? '16:00' : '07:30',
    endTime: type === 'day' ? '16:00' : type === 'night' ? '08:00' : '08:30',
  };

  io.emit('shift-update', currentShift);

  // Force re-evaluate risk in all zones immediately
  for (const zone of ZONES) {
    await updateZoneRisk(zone.id, true);
  }

  res.json(currentShift);
});

// Trigger Hand-scripted Safety Incident in any Zone
app.post('/api/trigger-risk-event', async (req, res) => {
  const { zoneId, incidentType } = req.body;
  const targetZone = zoneId || 'zone-c'; // Default to Zone C
  const type = incidentType || 'Gas Leak'; // Default to Gas Leak
  
  demoTriggeredState = { zoneId: targetZone, incidentType: type };

  // Get current readings
  const sensor = sensorReadings[targetZone];
  const det = detections[targetZone];

  if (!sensor || !det) {
    return res.status(404).json({ error: 'Zone not found' });
  }

  sensor.timestamp = Date.now();
  det.timestamp = Date.now();

  // Custom scenario configurations
  switch (type) {
    case 'Gas Leak':
      sensor.gasLevel = 75;
      sensor.temperature = 26.5;
      sensor.pressure = 1.15;
      sensor.humidity = 45;
      det.helmetDetected = true;
      det.vestDetected = true;
      det.inRestrictedZone = false;
      break;
    case 'Fire':
      sensor.gasLevel = 38;
      sensor.temperature = 68.2;
      sensor.pressure = 1.05;
      sensor.humidity = 20;
      det.helmetDetected = true;
      det.vestDetected = true;
      det.inRestrictedZone = false;
      break;
    case 'Explosion':
      sensor.gasLevel = 62;
      sensor.temperature = 94.5;
      sensor.pressure = 4.95;
      sensor.humidity = 15;
      det.helmetDetected = false; // PPE blown off/lost
      det.vestDetected = true;
      det.inRestrictedZone = true;
      break;
    case 'Chemical Spill':
      sensor.gasLevel = 48;
      sensor.temperature = 22.1;
      sensor.pressure = 0.72; // pressure line drop
      sensor.humidity = 70;
      det.helmetDetected = true;
      det.vestDetected = true;
      det.inRestrictedZone = true; // worker trapped in containment area
      break;
    case 'Unauthorized Entry':
      // Normal sensors, but intruder in restricted zone without PPE
      sensor.gasLevel = targetZone === 'zone-b' ? 0 : 5;
      sensor.temperature = targetZone === 'zone-c' ? 38.0 : 23.5;
      sensor.pressure = targetZone === 'zone-c' ? 2.4 : 1.01;
      det.helmetDetected = false;
      det.vestDetected = false;
      det.inRestrictedZone = true;
      break;
    case 'Equipment Failure':
      sensor.gasLevel = 15;
      sensor.temperature = 58.4; // compressor overheating
      sensor.pressure = 3.92;     // high stress pressure line
      det.helmetDetected = true;
      det.vestDetected = true;
      det.inRestrictedZone = false;
      break;
    case 'High Temperature':
      sensor.gasLevel = 8;
      sensor.temperature = 74.8;
      sensor.pressure = 2.1;
      sensor.humidity = 28;
      det.helmetDetected = true;
      det.vestDetected = true;
      det.inRestrictedZone = false;
      break;
    case 'Pressure Spike':
      sensor.gasLevel = 5;
      sensor.temperature = 39.5;
      sensor.pressure = 4.75;
      sensor.humidity = 35;
      det.helmetDetected = true;
      det.vestDetected = true;
      det.inRestrictedZone = false;
      break;
    case 'Toxic Gas Release':
      sensor.gasLevel = 92;
      sensor.temperature = 25.2;
      sensor.pressure = 1.05;
      sensor.humidity = 40;
      det.helmetDetected = true;
      det.vestDetected = true;
      det.inRestrictedZone = false;
      break;
    case 'Electrical Short Circuit':
      sensor.gasLevel = 4;
      sensor.temperature = 52.3;
      sensor.pressure = 1.01;
      sensor.humidity = 30;
      det.helmetDetected = true;
      det.vestDetected = true;
      det.inRestrictedZone = false;
      det.smoke = true;
      break;
    default:
      sensor.gasLevel = 65;
      sensor.temperature = 45.0;
      sensor.pressure = 3.5;
      det.helmetDetected = false;
      det.inRestrictedZone = true;
  }

  // Force critical risk assessment updates instantly
  io.emit('sensor-tick', { zoneId: targetZone, sensors: sensor });
  io.emit('detection-alert', { zoneId: targetZone, detections: det });
  
  const assessment = await updateZoneRisk(targetZone, true);
  
  res.json({
    message: `Incident event [${type}] triggered at ${targetZone}`,
    state: compileZoneState(targetZone),
    assessment
  });
});

// Reset event
app.post('/api/reset-risk-event', async (req, res) => {
  demoTriggeredState = null;

  // Reset to nominal parameters
  sensorReadings['zone-a'] = { gasLevel: 10, temperature: 24.1, pressure: 1.01, humidity: 48, timestamp: Date.now() };
  sensorReadings['zone-b'] = { gasLevel: 0, temperature: 21.0, pressure: 1.00, humidity: 52, timestamp: Date.now() };
  sensorReadings['zone-c'] = { gasLevel: 4, temperature: 37.8, pressure: 2.1, humidity: 36, timestamp: Date.now() };

  detections['zone-a'] = { personId: 'worker-101', helmetDetected: true, vestDetected: true, inRestrictedZone: false, confidence: 0.96, timestamp: Date.now() };
  detections['zone-b'] = { personId: 'worker-102', helmetDetected: true, vestDetected: true, inRestrictedZone: false, confidence: 0.95, timestamp: Date.now() };
  detections['zone-c'] = { personId: 'worker-103', helmetDetected: true, vestDetected: true, inRestrictedZone: false, confidence: 0.97, timestamp: Date.now() };

  // Remove demo permits
  const basePermits = permits.filter(p => !p.id.startsWith('permit-demo'));
  permits.length = 0;
  permits.push(...basePermits);

  io.emit('sensor-tick', { zoneId: 'zone-a', sensors: sensorReadings['zone-a'] });
  io.emit('sensor-tick', { zoneId: 'zone-b', sensors: sensorReadings['zone-b'] });
  io.emit('sensor-tick', { zoneId: 'zone-c', sensors: sensorReadings['zone-c'] });

  for (const zone of ZONES) {
    await updateZoneRisk(zone.id, true);
  }

  res.json({ message: 'Dashboard simulated parameters rebooted to safe baseline status.' });
});

// "What-If" Counterfactual Risk Simulator
app.post('/api/simulate-whatif', async (req, res) => {
  const { zoneId, sensors, currentDetections, activePermits, shift } = req.body;
  if (!zoneId) {
    return res.status(400).json({ error: 'Missing zoneId in simulation request' });
  }

  // Compile hypothetical state
  const mockState = {
    zoneId,
    sensors: { ...sensorReadings[zoneId], ...sensors },
    currentDetections: currentDetections !== undefined ? currentDetections : detections[zoneId],
    activePermits: activePermits !== undefined ? activePermits : permits.filter(p => p.zoneId === zoneId && p.status === 'active'),
    shift: { ...currentShift, ...shift }
  };

  try {
    console.log(`Running What-If simulation for ${zoneId}...`);
    // Assess risk on this hypothetical state
    const simulationResult = await assessRiskLLM(mockState);
    
    res.json({
      originalState: compileZoneState(zoneId),
      simulatedState: mockState,
      result: simulationResult
    });
  } catch (error) {
    res.status(500).json({ error: 'Simulation failed to run', details: error.message });
  }
});

// AI Safety Copilot Query
app.post('/api/copilot', async (req, res) => {
  const { zoneId, question } = req.body;
  if (!zoneId || !question) {
    return res.status(400).json({ error: 'Missing zoneId or question' });
  }

  const zoneState = compileZoneState(zoneId);
  try {
    const answer = await runSafetyCopilot(zoneState, question);
    res.json({ answer });
  } catch (error) {
    res.status(500).json({ error: 'Copilot queries failed', details: error.message });
  }
});

// Update Vision CCTV Detections dynamically
app.post('/api/vision/detections', async (req, res) => {
  const { zoneId, detections: clientDetections } = req.body;
  if (!zoneId || !clientDetections) {
    return res.status(400).json({ error: 'Missing zoneId or detections data' });
  }

  detections[zoneId] = {
    ...detections[zoneId],
    ...clientDetections,
    helmetDetected: clientDetections.helmetViolations === 0,
    vestDetected: clientDetections.vestViolations === 0,
    inRestrictedZone: clientDetections.restrictedZoneEntries > 0,
    timestamp: Date.now()
  };

  io.emit('detection-alert', { zoneId, detections: detections[zoneId] });
  const assessment = await updateZoneRisk(zoneId, true);

  res.json({
    message: `Vision detections updated for ${zoneId}`,
    detections: detections[zoneId],
    assessment
  });
});

// Mock or Live LLM Vision Analysis
app.post('/api/vision/analyze', async (req, res) => {
  const { videoName, zoneId } = req.body;
  if (!videoName || !zoneId) {
    return res.status(400).json({ error: 'Missing videoName or zoneId' });
  }

  // Pre-configured analysis outputs matching the AI Analysis Prompt guidelines
  let detectionResult = {
    workersCount: 2,
    helmetViolations: 0,
    vestViolations: 0,
    glovesViolations: 0,
    restrictedZoneEntries: 0,
    fire: false,
    smoke: false,
    forkliftDetected: false
  };

  const nameLower = videoName.toLowerCase();
  
  if (nameLower.includes('fire') || nameLower.includes('explosion') || nameLower.includes('incident_high') || nameLower.includes('accident')) {
    detectionResult = {
      workersCount: 4,
      helmetViolations: 2,
      vestViolations: 1,
      glovesViolations: 1,
      restrictedZoneEntries: 2,
      fire: true,
      smoke: true,
      forkliftDetected: true
    };
  } else if (nameLower.includes('intrusion') || nameLower.includes('restrict')) {
    detectionResult = {
      workersCount: 3,
      helmetViolations: 1,
      vestViolations: 0,
      glovesViolations: 2,
      restrictedZoneEntries: 1,
      fire: false,
      smoke: false,
      forkliftDetected: false
    };
  } else if (nameLower.includes('gear') || nameLower.includes('ppe') || nameLower.includes('violation') || nameLower.includes('unsafe')) {
    detectionResult = {
      workersCount: 2,
      helmetViolations: 1,
      vestViolations: 1,
      glovesViolations: 1,
      restrictedZoneEntries: 0,
      fire: false,
      smoke: false,
      forkliftDetected: false
    };
  }

  detections[zoneId] = {
    ...detections[zoneId],
    ...detectionResult,
    helmetDetected: detectionResult.helmetViolations === 0,
    vestDetected: detectionResult.vestViolations === 0,
    inRestrictedZone: detectionResult.restrictedZoneEntries > 0,
    timestamp: Date.now()
  };

  io.emit('detection-alert', { zoneId, detections: detections[zoneId] });
  const assessment = await updateZoneRisk(zoneId, true);

  res.json({
    videoName,
    zoneId,
    detections: detections[zoneId],
    assessment
  });
});

// Connect Live RTSP Camera
app.post('/api/vision/connect-rtsp', async (req, res) => {
  const { url, zoneId } = req.body;
  if (!url || !zoneId) {
    return res.status(400).json({ error: 'Missing URL or zoneId' });
  }

  const isValidUrl = url.startsWith('rtsp://') || url.startsWith('rtmp://') || url.startsWith('http://') || url.startsWith('https://');

  if (!isValidUrl) {
    return res.status(400).json({ error: 'Invalid RTSP/IP camera connection URL format' });
  }

  console.log(`Connecting to camera feed: ${url} for ${zoneId}`);

  detections[zoneId] = {
    ...detections[zoneId],
    workersCount: 3,
    helmetViolations: 0,
    vestViolations: 0,
    glovesViolations: 0,
    restrictedZoneEntries: 0,
    fire: false,
    smoke: false,
    forkliftDetected: false,
    helmetDetected: true,
    vestDetected: true,
    inRestrictedZone: false,
    rtspConnected: true,
    rtspUrl: url,
    timestamp: Date.now()
  };

  io.emit('detection-alert', { zoneId, detections: detections[zoneId] });
  const assessment = await updateZoneRisk(zoneId, true);

  res.json({
    message: 'Live Camera Connected',
    detections: detections[zoneId],
    assessment
  });
});

// ----------------------------------------------------
// SOCKET OPERATIONS
// ----------------------------------------------------
io.on('connection', (socket) => {
  console.log(`Client node connected: ${socket.id}`);
  
  // Send current baseline state upon joining
  const compiledZones = ZONES.map(z => ({
    ...z,
    sensors: sensorReadings[z.id],
    detections: detections[z.id],
    activePermits: permits.filter(p => p.zoneId === z.id && p.status === 'active'),
    latestAssessment: riskAssessments[z.id]
  }));
  
  socket.emit('initial-state', {
    zones: compiledZones,
    permits,
    shift: currentShift
  });

  // Support chat queries over sockets too
  socket.on('copilot-message', async (data) => {
    const { zoneId, question, messageId } = data;
    if (!zoneId || !question) return;

    const zoneState = compileZoneState(zoneId);
    try {
      const answer = await runSafetyCopilot(zoneState, question);
      socket.emit('copilot-reply', {
        zoneId,
        answer,
        messageId,
        timestamp: Date.now()
      });
    } catch (err) {
      socket.emit('copilot-reply', {
        zoneId,
        answer: `Safety Copilot encountered an error analyzing this zone. Fault details: ${err.message}`,
        messageId,
        timestamp: Date.now()
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client node disconnected: ${socket.id}`);
  });
});

// ----------------------------------------------------
// SERVER START
// ----------------------------------------------------
server.listen(PORT, () => {
  console.log(`SafeSphere AI Core System active on port http://localhost:${PORT}`);
});
