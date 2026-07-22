import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { jsPDF } from 'jspdf';
import { 
  Shield, 
  Activity, 
  UserCheck, 
  AlertTriangle, 
  Send, 
  FileText, 
  RefreshCw, 
  Clock, 
  Sparkles,  
  Plus, 
  X,
  Thermometer, 
  Gauge, 
  Wind, 
  Layers, 
  Radio, 
  CheckCircle2, 
  FileSignature, 
  ChevronRight,
  ChevronDown,
  Play,
  Video,
  Tv,
  Upload,
  LayoutDashboard,
  Settings,
  Bell,
  TrendingUp,
  ArrowUpRight,
} from 'lucide-react';

// Interfaces
interface SensorReading {
  gasLevel: number;
  temperature: number;
  pressure: number;
  humidity: number;
  timestamp: number;
}

interface Detection {
  personId: string;
  helmetDetected: boolean;
  vestDetected: boolean;
  inRestrictedZone: boolean;
  confidence: number;
  timestamp: number;
  workersCount?: number;
  helmetViolations?: number;
  vestViolations?: number;
  glovesViolations?: number;
  restrictedZoneEntries?: number;
  fire?: boolean | string;
  smoke?: boolean | string;
  forkliftDetected?: boolean | string;
}

interface Permit {
  id: string;
  type: string;
  zoneId: string;
  startTime: number;
  endTime: number;
  status: 'active' | 'expired' | 'pending';
}

interface RiskAssessment {
  zoneId: string;
  riskScore: number;
  riskLevel: 'green' | 'yellow' | 'red';
  reasons: string[];
  recommendedActions: string[];
  timestamp: number;
}

interface Zone {
  id: string;
  name: string;
  riskLevel: 'green' | 'yellow' | 'red';
  coordinates: number[];
  sensors: SensorReading;
  detections: Detection;
  activePermits: Permit[];
  latestAssessment: RiskAssessment;
}

export interface WhatIfState {
  sensors: {
    gasLevel: number;
    temperature: number;
    pressure: number;
    humidity: number;
  };
  detections: {
    helmetDetected: boolean;
    vestDetected: boolean;
    inRestrictedZone: boolean;
  };
  permits: {
    hotWork: boolean;
    confinedSpace: boolean;
  };
  shift: {
    type: 'day' | 'night' | 'transition';
    supervisorCount: number;
  };
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

interface Shift {
  type: 'day' | 'night' | 'transition';
  supervisorCount: number;
  startTime: string;
  endTime: string;
}

const generatePrepopulatedHistory = (baselineValue: number, fluctuationRange: number, count: number = 60) => {
  const history: number[] = [];
  let current = baselineValue;
  for (let i = 0; i < count; i++) {
    current = Math.max(0, current + (Math.random() * fluctuationRange - fluctuationRange / 2));
    history.push(current);
  }
  return history;
};

const getGasStatus = (val: number) => {
  if (val > 50) return { label: 'CRITICAL', color: 'text-red-400 bg-red-955/65 border border-red-500/30' };
  if (val > 25) return { label: 'WARNING', color: 'text-amber-400 bg-amber-955/60 border border-amber-500/30' };
  return { label: 'NORMAL', color: 'text-emerald-400 bg-emerald-955/60 border border-emerald-500/20' };
};

const getTempStatus = (val: number) => {
  if (val < 10 || val > 55) return { label: 'CRITICAL', color: 'text-red-400 bg-red-955/65 border border-red-500/30' };
  if (val < 18 || val > 45) return { label: 'WARNING', color: 'text-amber-400 bg-amber-950/60 border border-amber-500/30' };
  return { label: 'NORMAL', color: 'text-emerald-400 bg-emerald-955/60 border border-emerald-500/20' };
};

const getPressStatus = (val: number) => {
  if (val < 0.5 || val > 3.8) return { label: 'CRITICAL', color: 'text-red-400 bg-red-955/65 border border-red-500/30' };
  if (val < 0.8 || val > 2.5) return { label: 'WARNING', color: 'text-amber-400 bg-amber-950/60 border border-amber-500/30' };
  return { label: 'NORMAL', color: 'text-emerald-400 bg-emerald-950/60 border border-emerald-500/20' };
};

const getHumidStatus = (val: number) => {
  if (val < 20 || val > 80) return { label: 'CRITICAL', color: 'text-red-400 bg-red-955/65 border border-red-500/30' };
  if (val < 30 || val > 70) return { label: 'WARNING', color: 'text-amber-400 bg-amber-955/60 border border-amber-500/30' };
  return { label: 'NORMAL', color: 'text-emerald-400 bg-emerald-955/60 border border-emerald-500/20' };
};

const getRiskBorder = (level: string) => {
  if (level === 'red') return 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)] bg-slate-950/80';
  if (level === 'yellow') return 'border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.15)] bg-slate-950/80';
  return 'border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.1)] bg-slate-950/80';
};

interface TelemetryCardProps {
  label: string;
  value: number;
  unit: string;
  history: number[];
  color: string;
  icon: React.ReactNode;
  status: { label: string; color: string };
  decimals?: number;
}

function TelemetryCard({ label, value, unit, history, color, icon, status, decimals = 1 }: TelemetryCardProps) {
  const drawPath = () => {
    if (!history || history.length < 2) return '';
    const maxVal = Math.max(...history);
    const minVal = Math.min(...history);
    const range = maxVal - minVal || 1;
    
    return history
      .map((val, index) => {
        const x = (index / (history.length - 1)) * 120;
        const y = 35 - ((val - minVal) / range) * 28 - 3;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const linePath = drawPath();
  const areaPath = linePath ? `${linePath} L 120 35 L 0 35 Z` : '';

  return (
    <div className="glass-panel p-4.5 rounded-xl flex items-center justify-between border border-slate-800/80 bg-slate-900/30 transition-all duration-350 hover:-translate-y-1 hover:border-slate-750 hover:shadow-lg hover:shadow-slate-950/30">
      <div className="flex flex-col gap-1 text-left">
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{label}</span>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-xl font-black text-white font-mono">{value.toFixed(decimals)}</span>
          <span className="text-xs text-slate-400 font-medium">{unit}</span>
        </div>
        <div className={`mt-2 flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[9px] font-bold w-fit ${status.color}`}>
          {icon}
          {status.label}
        </div>
      </div>

      {linePath && (
        <div className="w-[120px] h-[35px]">
          <svg className="w-full h-full" viewBox="0 0 120 35">
            <path
              d={areaPath}
              fill={`url(#area-${label.replace(/\s+/g, '-')})`}
              className="opacity-10"
            />
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <defs>
              <linearGradient id={`area-${label.replace(/\s+/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.4" />
                <stop offset="100%" stopColor={color} stopOpacity="0.0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      )}
    </div>
  );
}

function localRiskEngine(zoneState: {
  zoneId: string;
  sensors: SensorReading;
  currentDetections: Detection;
  activePermits: Permit[];
  shift: Shift;
}) {
  const { sensors, currentDetections, activePermits, shift } = zoneState;
  
  let score = 5;
  const reasons: string[] = [];
  const recommendedActions: string[] = [];

  if (sensors.gasLevel > 50) {
    score += 40;
    reasons.push(`Dangerous gas level threshold exceeded (${sensors.gasLevel} ppm)`);
    recommendedActions.push('Evacuate zone immediately and activate ventilation systems');
  } else if (sensors.gasLevel > 25) {
    score += 15;
    reasons.push(`Elevated gas level detected (${sensors.gasLevel} ppm)`);
    recommendedActions.push('Check for local component leaks and wear respirator equipment');
  }

  if (sensors.temperature > 50) {
    score += 15;
    reasons.push(`High ambient temperature (${sensors.temperature.toFixed(1)}°C)`);
    recommendedActions.push('Monitor cooling systems and implement worker hydration breaks');
  }
  if (sensors.pressure > 3.8) {
    score += 30;
    reasons.push(`Critical pressure levels detected (${sensors.pressure.toFixed(2)} bar)`);
    recommendedActions.push('Initiate relief valves and verify piping integrity');
  } else if (sensors.pressure > 2.5) {
    score += 12;
    reasons.push(`Elevated process line pressure (${sensors.pressure.toFixed(2)} bar)`);
    recommendedActions.push('Inspect valve status and decrease feed rates');
  }

  if (currentDetections) {
    const helmetViolationCount = currentDetections.helmetViolations ?? (currentDetections.helmetDetected === false ? 1 : 0);
    const vestViolationCount = currentDetections.vestViolations ?? (currentDetections.vestDetected === false ? 1 : 0);
    const restrictedEntries = currentDetections.restrictedZoneEntries ?? (currentDetections.inRestrictedZone ? 1 : 0);
    const glovesViolationCount = currentDetections.glovesViolations ?? 0;
    const hasFire = currentDetections.fire === true || currentDetections.fire === 'yes' || currentDetections.fire === 'Yes';
    const hasSmoke = currentDetections.smoke === true || currentDetections.smoke === 'yes' || currentDetections.smoke === 'Yes';
    const forklift = currentDetections.forkliftDetected === true || currentDetections.forkliftDetected === 'yes' || currentDetections.forkliftDetected === 'Yes';

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

  const hotWorkPermit = activePermits.find(p => p.type.toLowerCase().includes('hot') && p.status === 'active');
  const confinedSpacePermit = activePermits.find(p => p.type.toLowerCase().includes('confined') && p.status === 'active');

  if (hotWorkPermit) {
    score += 8;
    reasons.push('Hot Work permit active in progress');
    if (sensors.gasLevel > 15) {
      score += 30;
      reasons.push('COMPOUND RISK: High gas concentration during active Hot Work operation (ignition danger!)');
      recommendedActions.push('IMMEDIATELY cancel Hot Work permit and halt all cutting/welding operations');
    }
  }

  if (confinedSpacePermit) {
    score += 5;
    reasons.push('Confined Space permit active in progress');
    if (sensors.gasLevel > 10) {
      score += 20;
      reasons.push('COMPOUND RISK: Elevated toxic/combustible gases inside confined space area');
      recommendedActions.push('Order immediate evacuation of the confined space; verify ventilation is operational');
    }
  }

  if (shift.type === 'night') {
    score += 5;
    if (shift.supervisorCount < 2) {
      score += 10;
      reasons.push('Reduced supervisor count during night operations');
      recommendedActions.push('Limit hazardous tasks or increase supervisor staffing');
    }
  } else if (shift.type === 'transition') {
    score += 8;
    reasons.push('Ongoing shift handover window (elevated miscommunication risk)');
    recommendedActions.push('Ensure verbal and written logs are fully completed');
  }

  score = Math.min(100, Math.max(0, Math.round(score)));

  let riskLevel: 'green' | 'yellow' | 'red' = 'green';
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

export default function App() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [permitsList, setPermitsList] = useState<Permit[]>([]);
  const [shiftState, setShiftState] = useState<Shift | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedZoneId, setSelectedZoneId] = useState<string>('zone-c');
  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  const [showPermitModal, setShowPermitModal] = useState(false);
  const [newPermitType, setNewPermitType] = useState('Hot Work');
  const [newPermitDuration, setNewPermitDuration] = useState(2);

  const [copilotMessages, setCopilotMessages] = useState<Record<string, ChatMessage[]>>({
    'zone-a': [
      { id: '1', sender: 'assistant', text: 'Hello, I am your Safety Copilot for Zone A (Tank Farm). How can I assist you with safety protocols today?', timestamp: new Date() }
    ],
    'zone-b': [
      { id: '1', sender: 'assistant', text: 'Hello, I am your Safety Copilot for Zone B (Loading Dock). How can I assist you today?', timestamp: new Date() }
    ],
    'zone-c': [
      { id: '1', sender: 'assistant', text: 'Hello, I am your Safety Copilot for Zone C (Hydrocarbon Process Area). How can I assist you today?', timestamp: new Date() }
    ]
  });
  const [inputVal, setInputVal] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const [sensorHistory, setSensorHistory] = useState<Record<string, {
    gasLevel: number[];
    temperature: number[];
    pressure: number[];
    humidity: number[];
  }>>({
    'zone-a': {
      gasLevel: generatePrepopulatedHistory(12, 4),
      temperature: generatePrepopulatedHistory(24.5, 0.5),
      pressure: generatePrepopulatedHistory(1.01, 0.05),
      humidity: generatePrepopulatedHistory(48, 2)
    },
    'zone-b': {
      gasLevel: generatePrepopulatedHistory(0, 0),
      temperature: generatePrepopulatedHistory(21.0, 0.6),
      pressure: generatePrepopulatedHistory(1.00, 0),
      humidity: generatePrepopulatedHistory(52, 3)
    },
    'zone-c': {
      gasLevel: generatePrepopulatedHistory(5, 2),
      temperature: generatePrepopulatedHistory(38.2, 1.0),
      pressure: generatePrepopulatedHistory(2.4, 0.15),
      humidity: generatePrepopulatedHistory(35, 1)
    }
  });

  const [visionMode, setVisionMode] = useState<'upload' | 'stream'>('upload');
  const [selectedVideo, setSelectedVideo] = useState<{ name: string; size: string; duration: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzingCCTV, setIsAnalyzingCCTV] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [showAnalysisResults, setShowAnalysisResults] = useState(false);
  const [rtspUrl, setRtspUrl] = useState('');
  const [rtspState, setRtspState] = useState<'disconnected' | 'connected' | 'error'>('disconnected');

  const [simIncidentType, setSimIncidentType] = useState('Gas Leak');
  const [simZoneId, setSimZoneId] = useState('zone-a');

  const [isIncidentDropdownOpen, setIsIncidentDropdownOpen] = useState(false);
  const [isZoneDropdownOpen, setIsZoneDropdownOpen] = useState(false);
  const incidentDropdownRef = useRef<HTMLDivElement | null>(null);
  const zoneDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (incidentDropdownRef.current && !incidentDropdownRef.current.contains(event.target as Node)) {
        setIsIncidentDropdownOpen(false);
      }
      if (zoneDropdownRef.current && !zoneDropdownRef.current.contains(event.target as Node)) {
        setIsZoneDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const selectedZone = zones.find(z => z.id === selectedZoneId);

  // Sockets connection and message broker
  useEffect(() => {
    const socket = io('http://localhost:5000');
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      setLoading(false);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('initial-state', (data: { zones: Zone[]; permits: Permit[]; shift: Shift }) => {
      setZones(data.zones);
      setPermitsList(data.permits);
      setShiftState(data.shift);
      setLoading(false);
    });

    socket.on('sensor-tick', (data: { zoneId: string; sensors: SensorReading }) => {
      setZones(prev => prev.map(z => z.id === data.zoneId ? { ...z, sensors: data.sensors } : z));
      setSensorHistory(prev => {
        const hist = prev[data.zoneId];
        if (!hist) return prev;
        return {
          ...prev,
          [data.zoneId]: {
            gasLevel: [...hist.gasLevel.slice(1), data.sensors.gasLevel],
            temperature: [...hist.temperature.slice(1), data.sensors.temperature],
            pressure: [...hist.pressure.slice(1), data.sensors.pressure],
            humidity: [...hist.humidity.slice(1), data.sensors.humidity]
          }
        };
      });
    });

    socket.on('detection-alert', (data: { zoneId: string; detections: Detection }) => {
      setZones(prev => prev.map(z => {
        if (z.id !== data.zoneId) return z;
        return { ...z, detections: data.detections };
      }));
    });

    socket.on('zone-risk-update', (data: { zoneId: string; zone: Zone; assessment: RiskAssessment }) => {
      setZones(prev => prev.map(z => z.id === data.zoneId ? { ...z, latestAssessment: data.assessment, riskLevel: data.assessment.riskLevel } : z));
    });

    socket.on('permit-created', (newPermit: Permit) => {
      setPermitsList(prev => [...prev.filter(p => p.id !== newPermit.id), newPermit]);
      setZones(prev => prev.map(z => z.id === newPermit.zoneId ? { ...z, activePermits: [...z.activePermits.filter(p => p.id !== newPermit.id), newPermit] } : z));
    });

    socket.on('permit-expired', (permit: Permit) => {
      setPermitsList(prev => prev.map(p => p.id === permit.id ? permit : p));
      setZones(prev => prev.map(z => z.id === permit.zoneId ? { ...z, activePermits: z.activePermits.map(p => p.id === permit.id ? permit : p) } : z));
    });

    socket.on('shift-update', (shift: Shift) => {
      setShiftState(shift);
    });

    socket.on('copilot-reply', (data: { zoneId: string; answer: string; messageId: string; timestamp: number }) => {
      setChatLoading(false);
      setCopilotMessages(prev => {
        const msgs = prev[data.zoneId] || [];
        if (msgs.some(m => m.id === data.messageId)) return prev;
        return {
          ...prev,
          [data.zoneId]: [...msgs, {
            id: data.messageId,
            sender: 'assistant',
            text: data.answer,
            timestamp: new Date(data.timestamp)
          }]
        };
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Background mock simulator fallback
  useEffect(() => {
    if (socketConnected) return;

    const interval = setInterval(() => {
      setZones(prev => prev.map(zone => {
        const lastSensors = zone.sensors;
        let gas = lastSensors.gasLevel;
        let temp = lastSensors.temperature;
        let press = lastSensors.pressure;
        let hum = lastSensors.humidity;

        if (zone.id === 'zone-a') {
          gas = Math.max(0, Math.min(100, Math.round(gas + (Math.random() * 4 - 2))));
          temp = Math.max(15, Math.min(35, temp + (Math.random() * 0.4 - 0.2)));
          press = Math.max(0.9, Math.min(1.2, press + (Math.random() * 0.02 - 0.01)));
          hum = Math.max(40, Math.min(60, hum + (Math.random() * 2 - 1)));
        } else if (zone.id === 'zone-b') {
          gas = 0;
          temp = Math.max(15, Math.min(28, temp + (Math.random() * 0.6 - 0.3)));
          press = 1.00;
          hum = Math.max(45, Math.min(65, hum + (Math.random() * 3 - 1.5)));
        } else if (zone.id === 'zone-c') {
          gas = Math.max(0, Math.min(25, Math.round(gas + (Math.random() * 2 - 1))));
          temp = Math.max(30, Math.min(48, temp + (Math.random() * 1.0 - 0.49)));
          press = Math.max(1.8, Math.min(3.2, press + (Math.random() * 0.15 - 0.07)));
          hum = Math.max(25, Math.min(45, hum + (Math.random() * 1 - 0.5)));
        }

        const newSensors = { gasLevel: gas, temperature: temp, pressure: press, humidity: hum, timestamp: Date.now() };

        setSensorHistory(hist => {
          const zHist = hist[zone.id];
          if (!zHist) return hist;
          return {
            ...hist,
            [zone.id]: {
              gasLevel: [...zHist.gasLevel.slice(1), gas],
              temperature: [...zHist.temperature.slice(1), temp],
              pressure: [...zHist.pressure.slice(1), press],
              humidity: [...zHist.humidity.slice(1), hum]
            }
          };
        });

        const ruleAssessment = localRiskEngine({
          zoneId: zone.id,
          sensors: newSensors,
          currentDetections: zone.detections,
          activePermits: permitsList.filter(p => p.zoneId === zone.id && p.status === 'active'),
          shift: shiftState || { type: 'day', supervisorCount: 3, startTime: '08:00', endTime: '16:00' }
        });

        return {
          ...zone,
          sensors: newSensors,
          latestAssessment: {
            ...ruleAssessment,
            zoneId: zone.id,
            timestamp: Date.now()
          },
          riskLevel: ruleAssessment.riskLevel
        };
      }));
    }, 3500);

    return () => clearInterval(interval);
  }, [socketConnected, permitsList, shiftState]);

  // Initial zones bootstrap fallback
  useEffect(() => {
    if (!socketConnected && zones.length === 0) {
      const defaultZones: Zone[] = [
        {
          id: 'zone-a',
          name: 'Confined Tank Farm',
          riskLevel: 'green',
          coordinates: [15, 20, 45, 50],
          sensors: { gasLevel: 12, temperature: 24.5, pressure: 1.01, humidity: 48, timestamp: Date.now() },
          detections: { personId: 'worker-101', helmetDetected: true, vestDetected: true, inRestrictedZone: false, confidence: 0.96, timestamp: Date.now(), workersCount: 2, helmetViolations: 0, vestViolations: 0, glovesViolations: 0, restrictedZoneEntries: 0, fire: false, smoke: false, forkliftDetected: false },
          activePermits: [
            { id: 'permit-1', type: 'Confined Space Entry', zoneId: 'zone-a', startTime: Date.now() - 3600000, endTime: Date.now() + 7200000, status: 'active' }
          ],
          latestAssessment: { zoneId: 'zone-a', riskScore: 10, riskLevel: 'green', reasons: ['All values in normal parameters'], recommendedActions: ['Standard monitoring protocols'], timestamp: Date.now() }
        },
        {
          id: 'zone-b',
          name: 'Loading Dock & Assembly',
          riskLevel: 'green',
          coordinates: [50, 10, 85, 45],
          sensors: { gasLevel: 0, temperature: 21.0, pressure: 1.00, humidity: 52, timestamp: Date.now() },
          detections: { personId: 'worker-102', helmetDetected: true, vestDetected: true, inRestrictedZone: false, confidence: 0.95, timestamp: Date.now(), workersCount: 4, helmetViolations: 1, vestViolations: 0, glovesViolations: 1, restrictedZoneEntries: 0, fire: false, smoke: false, forkliftDetected: true },
          activePermits: [],
          latestAssessment: { zoneId: 'zone-b', riskScore: 5, riskLevel: 'green', reasons: ['All values in normal parameters'], recommendedActions: ['Standard monitoring protocols'], timestamp: Date.now() }
        },
        {
          id: 'zone-c',
          name: 'Hydrocarbon Process Area',
          riskLevel: 'green',
          coordinates: [20, 55, 80, 90],
          sensors: { gasLevel: 5, temperature: 38.2, pressure: 2.4, humidity: 35, timestamp: Date.now() },
          detections: { personId: 'worker-103', helmetDetected: true, vestDetected: true, inRestrictedZone: false, confidence: 0.97, timestamp: Date.now(), workersCount: 1, helmetViolations: 0, vestViolations: 0, glovesViolations: 0, restrictedZoneEntries: 0, fire: false, smoke: false, forkliftDetected: false },
          activePermits: [
            { id: 'permit-2', type: 'Hot Work', zoneId: 'zone-c', startTime: Date.now() - 1800000, endTime: Date.now() + 1800000, status: 'active' }
          ],
          latestAssessment: { zoneId: 'zone-c', riskScore: 15, riskLevel: 'green', reasons: ['All values in normal parameters'], recommendedActions: ['Standard monitoring protocols'], timestamp: Date.now() }
        }
      ];
      setZones(defaultZones);
      setPermitsList([
        { id: 'permit-1', type: 'Confined Space Entry', zoneId: 'zone-a', startTime: Date.now() - 3600000, endTime: Date.now() + 7200000, status: 'active' },
        { id: 'permit-2', type: 'Hot Work', zoneId: 'zone-c', startTime: Date.now() - 1800000, endTime: Date.now() + 1800000, status: 'active' }
      ]);
      setShiftState({
        type: 'day',
        supervisorCount: 3,
        startTime: '08:00',
        endTime: '16:00'
      });
      setLoading(false);
    }
  }, [socketConnected, zones.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [copilotMessages, selectedZoneId]);

  const createPermit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedZoneId) return;

    const permitData = {
      type: newPermitType,
      zoneId: selectedZoneId,
      durationHours: Number(newPermitDuration)
    };

    if (socketConnected) {
      try {
        const resp = await fetch('http://localhost:5000/api/permits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(permitData)
        });
        if (resp.ok) {
          setShowPermitModal(false);
        }
      } catch (err) {
        console.error('Failed to create permit on server:', err);
      }
    } else {
      const localPermit: Permit = {
        id: `permit-demo-${Date.now()}`,
        type: newPermitType,
        zoneId: selectedZoneId,
        startTime: Date.now(),
        endTime: Date.now() + Number(newPermitDuration) * 3600000,
        status: 'active'
      };
      setPermitsList(prev => [...prev, localPermit]);
      setZones(prev => prev.map(z => z.id === selectedZoneId ? { ...z, activePermits: [...z.activePermits, localPermit] } : z));
      setShowPermitModal(false);
    }
  };

  const expirePermit = async (permitId: string) => {
    if (socketConnected) {
      try {
        await fetch(`http://localhost:5000/api/permits/${permitId}/expire`, {
          method: 'POST'
        });
      } catch (err) {
        console.error('Failed to expire permit:', err);
      }
    } else {
      setPermitsList(prev => prev.map(p => p.id === permitId ? { ...p, status: 'expired', endTime: Date.now() } : p));
      setZones(prev => prev.map(z => ({
        ...z,
        activePermits: z.activePermits.map(p => p.id === permitId ? { ...p, status: 'expired', endTime: Date.now() } : p)
      })));
    }
  };

  const triggerIncident = async (zoneId: string, incidentType: string) => {
    setSelectedZoneId(zoneId);
    if (socketConnected) {
      try {
        await fetch('http://localhost:5000/api/trigger-risk-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zoneId, incidentType })
        });
      } catch (err) {
        console.error('Failed to trigger server incident:', err);
      }
    } else {
      setZones(prev => prev.map(z => {
        if (z.id !== zoneId) return z;

        const newSensors = { ...z.sensors };
        const newDetections = { ...z.detections };

        switch (incidentType) {
          case 'Gas Leak':
            newSensors.gasLevel = 75;
            newSensors.temperature = 26.5;
            newSensors.pressure = 1.15;
            newSensors.humidity = 45;
            newDetections.helmetDetected = true;
            newDetections.vestDetected = true;
            newDetections.inRestrictedZone = false;
            break;
          case 'Fire':
            newSensors.gasLevel = 38;
            newSensors.temperature = 68.2;
            newSensors.pressure = 1.05;
            newSensors.humidity = 20;
            newDetections.helmetDetected = true;
            newDetections.vestDetected = true;
            newDetections.inRestrictedZone = false;
            newDetections.fire = true;
            break;
          case 'Explosion':
            newSensors.gasLevel = 62;
            newSensors.temperature = 94.5;
            newSensors.pressure = 4.95;
            newSensors.humidity = 15;
            newDetections.helmetDetected = false;
            newDetections.vestDetected = true;
            newDetections.inRestrictedZone = true;
            break;
          case 'Chemical Spill':
            newSensors.gasLevel = 48;
            newSensors.temperature = 22.1;
            newSensors.pressure = 0.72;
            newSensors.humidity = 70;
            newDetections.helmetDetected = true;
            newDetections.vestDetected = true;
            newDetections.inRestrictedZone = true;
            break;
          case 'Unauthorized Entry':
            newSensors.gasLevel = zoneId === 'zone-b' ? 0 : 5;
            newSensors.temperature = zoneId === 'zone-c' ? 38.0 : 23.5;
            newSensors.pressure = zoneId === 'zone-c' ? 2.4 : 1.01;
            newDetections.helmetDetected = false;
            newDetections.vestDetected = false;
            newDetections.inRestrictedZone = true;
            break;
          case 'Equipment Failure':
            newSensors.gasLevel = 15;
            newSensors.temperature = 58.4;
            newSensors.pressure = 3.92;
            newDetections.helmetDetected = true;
            newDetections.vestDetected = true;
            newDetections.inRestrictedZone = false;
            break;
          case 'High Temperature':
            newSensors.gasLevel = 8;
            newSensors.temperature = 74.8;
            newSensors.pressure = 2.1;
            newSensors.humidity = 28;
            newDetections.helmetDetected = true;
            newDetections.vestDetected = true;
            newDetections.inRestrictedZone = false;
            break;
          case 'Pressure Spike':
            newSensors.gasLevel = 5;
            newSensors.temperature = 39.5;
            newSensors.pressure = 4.75;
            newSensors.humidity = 35;
            newDetections.helmetDetected = true;
            newDetections.vestDetected = true;
            newDetections.inRestrictedZone = false;
            break;
          case 'Toxic Gas Release':
            newSensors.gasLevel = 92;
            newSensors.temperature = 25.2;
            newSensors.pressure = 1.05;
            newSensors.humidity = 40;
            newDetections.helmetDetected = true;
            newDetections.vestDetected = true;
            newDetections.inRestrictedZone = false;
            break;
          case 'Electrical Short Circuit':
            newSensors.gasLevel = 4;
            newSensors.temperature = 52.3;
            newSensors.pressure = 1.01;
            newSensors.humidity = 30;
            newDetections.helmetDetected = true;
            newDetections.vestDetected = true;
            newDetections.inRestrictedZone = false;
            newDetections.smoke = true;
            break;
        }

        const localReport = localRiskEngine({
          zoneId,
          sensors: newSensors,
          currentDetections: newDetections,
          activePermits: permitsList.filter(p => p.zoneId === zoneId && p.status === 'active'),
          shift: shiftState || { type: 'day', supervisorCount: 3, startTime: '08:00', endTime: '16:00' }
        });

        setSensorHistory(hist => {
          const zHist = hist[zoneId];
          if (!zHist) return hist;
          return {
            ...hist,
            [zoneId]: {
              gasLevel: [...zHist.gasLevel.slice(1), newSensors.gasLevel],
              temperature: [...zHist.temperature.slice(1), newSensors.temperature],
              pressure: [...zHist.pressure.slice(1), newSensors.pressure],
              humidity: [...zHist.humidity.slice(1), newSensors.humidity]
            }
          };
        });

        return {
          ...z,
          sensors: newSensors,
          detections: newDetections,
          latestAssessment: {
            ...localReport,
            zoneId,
            timestamp: Date.now()
          },
          riskLevel: localReport.riskLevel
        };
      }));
    }
  };

  const resetIncident = async () => {
    if (socketConnected) {
      try {
        await fetch('http://localhost:5000/api/reset-risk-event', { method: 'POST' });
      } catch (err) {
        console.error('Failed to reset server incident:', err);
      }
    } else {
      setZones(prev => prev.map(z => {
        let gas = 10;
        let temp = 24.1;
        let press = 1.01;
        let hum = 48;

        if (z.id === 'zone-b') {
          gas = 0; temp = 21.0; press = 1.00; hum = 52;
        } else if (z.id === 'zone-c') {
          gas = 4; temp = 37.8; press = 2.1; hum = 36;
        }

        const normSensors = { gasLevel: gas, temperature: temp, pressure: press, humidity: hum, timestamp: Date.now() };
        const normDetections = {
          personId: `worker-${z.id === 'zone-a' ? '101' : z.id === 'zone-b' ? '102' : '103'}`,
          workersCount: z.id === 'zone-a' ? 2 : z.id === 'zone-b' ? 4 : 1,
          helmetViolations: 0,
          vestViolations: 0,
          glovesViolations: 0,
          restrictedZoneEntries: 0,
          fire: false,
          smoke: false,
          forkliftDetected: z.id === 'zone-b',
          helmetDetected: true,
          vestDetected: true,
          inRestrictedZone: false,
          confidence: 0.96,
          timestamp: Date.now()
        };

        const ruleReport = localRiskEngine({
          zoneId: z.id,
          sensors: normSensors,
          currentDetections: normDetections,
          activePermits: [],
          shift: shiftState || { type: 'day', supervisorCount: 3, startTime: '08:00', endTime: '16:00' }
        });

        return {
          ...z,
          sensors: normSensors,
          detections: normDetections,
          activePermits: [],
          latestAssessment: {
            ...ruleReport,
            zoneId: z.id,
            timestamp: Date.now()
          },
          riskLevel: ruleReport.riskLevel
        };
      }));
      setPermitsList([]);
    }
  };

  const generatePDFReport = (zone: Zone) => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`SafeSphere AI Safety Audit - ${zone.name}`, 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
    doc.text(`System Config: SafeSphere Cognitive Fusion v2.4`, 14, 34);

    doc.setFontSize(14);
    doc.text("1. Overall Risk Vector Profile", 14, 46);
    doc.setFontSize(10);
    doc.text(`Risk Score: ${zone.latestAssessment.riskScore}/100`, 18, 54);
    doc.text(`Risk Evaluation: ${zone.latestAssessment.riskLevel.toUpperCase()}`, 18, 60);

    doc.setFontSize(14);
    doc.text("2. Telemetry Diagnostics", 14, 72);
    doc.setFontSize(10);
    doc.text(`Gas Concentration: ${zone.sensors.gasLevel} ppm`, 18, 80);
    doc.text(`Ambient Temperature: ${zone.sensors.temperature.toFixed(1)} °C`, 18, 86);
    doc.text(`Line Barometric Pressure: ${zone.sensors.pressure.toFixed(2)} bar`, 18, 92);
    doc.text(`Relative Humidity: ${zone.sensors.humidity.toFixed(1)} %`, 18, 98);

    doc.setFontSize(14);
    doc.text("3. Threat Grounded Observations", 14, 110);
    doc.setFontSize(10);
    let yPos = 118;
    zone.latestAssessment.reasons.forEach((reason) => {
      doc.text(`- ${reason}`, 18, yPos);
      yPos += 6;
    });

    doc.setFontSize(14);
    doc.text("4. Mandatory Supervisor Actions", 14, yPos + 6);
    doc.setFontSize(10);
    yPos += 14;
    zone.latestAssessment.recommendedActions.forEach((action) => {
      doc.text(`- ${action}`, 18, yPos);
      yPos += 6;
    });

    doc.save(`SafeSphere-Audit-${zone.id}-${Date.now()}.pdf`);
  };

  const sendCopilotMessage = async () => {
    if (!inputVal.trim() || !selectedZoneId) return;

    const userMsg: ChatMessage = {
      id: `${Date.now()}-user`,
      sender: 'user',
      text: inputVal,
      timestamp: new Date()
    };

    setCopilotMessages(prev => ({
      ...prev,
      [selectedZoneId]: [...(prev[selectedZoneId] || []), userMsg]
    }));

    const question = inputVal;
    setInputVal('');
    setChatLoading(true);

    if (socketConnected && socketRef.current) {
      socketRef.current.emit('copilot-message', {
        zoneId: selectedZoneId,
        question,
        messageId: `${Date.now()}-reply`
      });
    } else {
      setTimeout(() => {
        setChatLoading(false);
        const activeZone = zones.find(z => z.id === selectedZoneId);
        if (!activeZone) return;

        let reply = "";
        const lowerQ = question.toLowerCase();

        if (lowerQ.includes('why') || lowerQ.includes('reason') || lowerQ.includes('risk')) {
          reply = `For **${activeZone.name}**, the current risk score is **${activeZone.latestAssessment.riskScore}%** (${activeZone.riskLevel.toUpperCase()}). The reasons mapped by the engine are: \n`;
          activeZone.latestAssessment.reasons.forEach(r => { reply += `- ${r}\n`; });
          reply += `\nWe recommend immediate action: **${activeZone.latestAssessment.recommendedActions.join(', ')}**`;
        } else if (lowerQ.includes('gas') || lowerQ.includes('leak') || lowerQ.includes('ppm')) {
          reply = `In **${activeZone.name}**, gas level matches **${activeZone.sensors.gasLevel} ppm**. ${
            activeZone.sensors.gasLevel > 25 
              ? "Warning: This is elevated. Evacuation protocols or respirator mandates should be active." 
              : "This is well within normal safe thresholds (< 25 ppm)."
          }`;
        } else if (lowerQ.includes('mask') || lowerQ.includes('helmet') || lowerQ.includes('ppe') || lowerQ.includes('vest')) {
          const det = activeZone.detections;
          const issues = [];
          if (det.helmetViolations && det.helmetViolations > 0) issues.push(`${det.helmetViolations} helmet violations`);
          if (det.vestViolations && det.vestViolations > 0) issues.push(`${det.vestViolations} vest violations`);
          if (issues.length > 0) {
            reply = `Yes, the CCTV alert indicates workers in **${activeZone.name}** are missing PPE: ${issues.join(' and ')}. Supervise immediately to enforce PPE guidelines.`;
          } else {
            reply = `CCTV logs indicate 100% compliance for all personnel in **${activeZone.name}** (Helmets + High-Vis vests confirmed).`;
          }
        } else {
          reply = `Zone **${activeZone.name}** is operating at a **${activeZone.riskLevel}** safety rating (Score: ${activeZone.latestAssessment.riskScore}/100).\nTelemetry values are Temp: ${activeZone.sensors.temperature.toFixed(1)}°C, Pressure: ${activeZone.sensors.pressure.toFixed(2)} bar. Active permits list: ${activeZone.activePermits.map(p => p.type).join(', ') || 'None'}.`;
        }

        setCopilotMessages(prev => ({
          ...prev,
          [selectedZoneId]: [...(prev[selectedZoneId] || []), {
            id: `${Date.now()}-reply`,
            sender: 'assistant',
            text: reply,
            timestamp: new Date()
          }]
        }));
      }, 1000);
    }
  };

  const sendSuggestion = (text: string) => {
    setInputVal(text);
  };

  const handleCCTVFile = (file: File) => {
    setSelectedVideo({
      name: file.name,
      size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      duration: '0:18'
    });
    setShowAnalysisResults(false);
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleCCTVFile(file);
  };

  const runVideoAnalysis = async () => {
    if (!selectedVideo || !selectedZoneId) return;

    setIsAnalyzingCCTV(true);
    setAnalysisProgress(0);
    setShowAnalysisResults(false);

    const interval = setInterval(() => {
      setAnalysisProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 10;
      });
    }, 200);

    await new Promise(resolve => setTimeout(resolve, 2200));
    setIsAnalyzingCCTV(false);
    setShowAnalysisResults(true);

    if (socketConnected) {
      try {
        await fetch('http://localhost:5000/api/vision/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoName: selectedVideo.name,
            zoneId: selectedZoneId
          })
        });
      } catch (err) {
        console.error('Failed to report analysis to backend:', err);
      }
    } else {
      setZones(prev => prev.map(z => {
        if (z.id !== selectedZoneId) return z;
        
        const isIncidentVideo = selectedVideo.name.toLowerCase().includes('fire') || 
                                selectedVideo.name.toLowerCase().includes('explosion') || 
                                selectedVideo.name.toLowerCase().includes('incident') || 
                                selectedVideo.name.toLowerCase().includes('accident');
        
        const localDetections: Detection = {
          personId: 'worker-104',
          confidence: 0.95,
          timestamp: Date.now(),
          workersCount: isIncidentVideo ? 4 : 2,
          helmetViolations: isIncidentVideo ? 2 : 1,
          vestViolations: isIncidentVideo ? 1 : 0,
          glovesViolations: isIncidentVideo ? 1 : 0,
          restrictedZoneEntries: isIncidentVideo ? 2 : 0,
          fire: isIncidentVideo,
          smoke: isIncidentVideo,
          forkliftDetected: isIncidentVideo,
          helmetDetected: isIncidentVideo ? false : true,
          vestDetected: true,
          inRestrictedZone: isIncidentVideo
        };

        const ruleReport = localRiskEngine({
          zoneId: selectedZoneId,
          sensors: z.sensors,
          currentDetections: localDetections,
          activePermits: permitsList.filter(p => p.zoneId === selectedZoneId && p.status === 'active'),
          shift: shiftState || { type: 'day', supervisorCount: 3, startTime: '08:00', endTime: '16:00' }
        });

        return {
          ...z,
          detections: localDetections,
          latestAssessment: {
            ...ruleReport,
            zoneId: selectedZoneId,
            timestamp: Date.now()
          },
          riskLevel: ruleReport.riskLevel
        };
      }));
    }
  };

  const connectRtspCamera = async () => {
    if (!rtspUrl.trim() || !selectedZoneId) return;

    setRtspState('disconnected');

    await new Promise(resolve => setTimeout(resolve, 800));

    if (rtspUrl.startsWith('rtsp://') || rtspUrl.startsWith('http://') || rtspUrl.startsWith('https://')) {
      setRtspState('connected');
      setShowAnalysisResults(true);

      if (socketConnected) {
        try {
          await fetch('http://localhost:5000/api/vision/connect-rtsp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: rtspUrl,
              zoneId: selectedZoneId
            })
          });
        } catch (err) {
          console.error('Failed to notify rtsp stream to backend:', err);
        }
      } else {
        setZones(prev => prev.map(z => {
          if (z.id !== selectedZoneId) return z;
          
          const localDetections: Detection = {
            personId: 'worker-live',
            confidence: 0.98,
            timestamp: Date.now(),
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
            inRestrictedZone: false
          };

          const ruleReport = localRiskEngine({
            zoneId: selectedZoneId,
            sensors: z.sensors,
            currentDetections: localDetections,
            activePermits: permitsList.filter(p => p.zoneId === selectedZoneId && p.status === 'active'),
            shift: shiftState || { type: 'day', supervisorCount: 3, startTime: '08:00', endTime: '16:00' }
          });

          return {
            ...z,
            detections: localDetections,
            latestAssessment: {
              ...ruleReport,
              zoneId: selectedZoneId,
              timestamp: Date.now()
            },
            riskLevel: ruleReport.riskLevel
          };
        }));
      }
    } else {
      setRtspState('error');
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans pb-10">
      
      {/* 1. LEFT SIDEBAR NAVIGATION */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between hidden lg:flex flex-shrink-0 z-40">
        <div className="flex flex-col gap-6 p-6">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600/10 border border-blue-500/30 rounded-xl">
              <Shield className="w-5 h-5 text-blue-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xs font-black tracking-widest text-white uppercase leading-none">SafeSphere AI</h1>
              <span className="text-[8px] text-blue-400 font-mono tracking-widest font-bold">SAFETY COGNITIVE</span>
            </div>
          </div>

          <nav className="flex flex-col gap-1.5 mt-2">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'vision', label: 'AI Vision CCTV', icon: Video },
              { id: 'telemetry', label: 'Live Telemetry', icon: Activity },
              { id: 'risk-engine', label: 'Compound Assessment', icon: Shield },
              { id: 'heatmap', label: 'Plant Heatmap', icon: Layers },
              { id: 'incident-center', label: 'Incident & Permits', icon: AlertTriangle },
              { id: 'reports', label: 'Audit Reports', icon: FileText },
              { id: 'copilot', label: 'Safety Copilot', icon: Sparkles },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[10px] font-bold tracking-wide uppercase transition ${
                    isActive 
                      ? 'bg-blue-605/15 border border-blue-500/20 text-blue-400 font-extrabold shadow-sm' 
                      : 'text-slate-400 hover:text-slate-205 hover:bg-slate-800/40 border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800/80">
          <button
            onClick={() => setCurrentTab('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
              currentTab === 'settings' 
                ? 'bg-slate-800 text-white' 
                : 'text-slate-505 hover:text-slate-300 hover:bg-slate-800/20'
            }`}
          >
            <Settings className="w-4 h-4 text-slate-555" />
            System Settings
          </button>
        </div>
      </aside>

      {/* 2. MAIN BODY (Flex Column) */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* TOP STATUS HEADER BAR */}
        <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex flex-col text-left">
            <div className="flex items-center gap-2">
              <h2 className="text-md font-black text-white tracking-tight uppercase leading-none">
                {currentTab === 'dashboard' ? 'Executive Overview' :
                 currentTab === 'vision' ? 'AI Vision Hub' :
                 currentTab === 'telemetry' ? 'Industrial IoT Telemetry' :
                 currentTab === 'risk-engine' ? 'Compound Threat Evaluator' :
                 currentTab === 'heatmap' ? 'Refinery Floor Heatmap' :
                 currentTab === 'incident-center' ? 'Incident & Permit Control' :
                 currentTab === 'reports' ? 'Compliance & Audit Logs' :
                 currentTab === 'copilot' ? 'Safety Copilot AI' : 'System Settings'}
              </h2>
              <span className="text-[9px] bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-slate-400 font-mono tracking-wider">
                ZONE: {selectedZone?.name.toUpperCase() || 'CENTRAL'}
              </span>
            </div>
            <span className="text-xs text-slate-500 mt-1 leading-none">SafeSphere AI Platform • Real-time plant status indicators</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Current Shift */}
            <div className="hidden md:flex items-center gap-1.5 bg-slate-950 border border-slate-850 px-2.5 py-1.5 rounded-lg text-[10px] text-slate-350 font-bold uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span className="capitalize text-white">{shiftState?.type || 'Day'} Shift</span>
              <span className="text-slate-700">|</span>
              <span className="text-slate-450">{shiftState?.supervisorCount || 3} Supervisors</span>
            </div>

            {/* Watch/Clock */}
            <div className="hidden sm:flex items-center gap-1 bg-slate-950 border border-slate-850 hover:bg-slate-900 px-2.5 py-1.5 rounded-lg text-xs font-mono text-slate-400">
              <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            {/* System status */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-850 px-2.5 py-1.5 rounded-lg text-xs font-bold font-mono">
              <div className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="text-slate-355">{socketConnected ? 'SYSTEM ONLINE' : 'SIM CONNECTED'}</span>
            </div>

            {/* Notifications */}
            <div className="relative p-2 bg-slate-950 border border-slate-855 rounded-lg hover:bg-slate-800 transition cursor-pointer">
              <Bell className="w-4 h-4 text-slate-300" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
            </div>

            {/* User profile */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-850 px-2 rounded-lg py-1">
              <div className="w-6 h-6 rounded-full bg-blue-600/35 border border-blue-500 flex items-center justify-center text-[10px] font-bold text-blue-100">
                SP
              </div>
              <div className="hidden xl:flex flex-col text-left">
                <span className="text-[10px] font-bold text-white leading-none">S. Patel</span>
                <span className="text-[8px] text-slate-400 mt-0.5 leading-none">Plant Supervisor</span>
              </div>
            </div>
          </div>
        </header>

        {/* MOBILE NAVIGATION TAB BAR SECTION */}
        <div className="flex lg:hidden bg-slate-900 border-b border-slate-800 px-4 py-2 overflow-x-auto gap-2 scrollbar-none">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'vision', label: 'Vision', icon: Video },
            { id: 'telemetry', label: 'Telemetry', icon: Activity },
            { id: 'risk-engine', label: 'Risk', icon: Shield },
            { id: 'heatmap', label: 'Heatmap', icon: Layers },
            { id: 'incident-center', label: 'Incidents/Permits', icon: AlertTriangle },
            { id: 'reports', label: 'Reports', icon: FileText },
            { id: 'copilot', label: 'Copilot', icon: Sparkles },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${
                  currentTab === tab.id 
                    ? 'bg-blue-600 border-blue-500 text-white' 
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-205'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 3. DYNAMIC CONTENT ROUTER PANELS */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 mt-6 flex flex-col gap-6 pb-12">
          
          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 text-slate-400">
              <Activity className="w-12 h-12 text-blue-500 animate-spin mb-4" />
              <p className="text-base font-semibold">Booting SafeSphere Intelligence Engine...</p>
              <p className="text-xs text-slate-500 mt-1">Connecting to simulated IoT sensor gateway</p>
            </div>
          ) : (
            <>
              {/* TAB 1: EXECUTIVE DASHBOARD */}
              {currentTab === 'dashboard' && (() => {
                const overallRisk = zones.length > 0 
                  ? Math.round(zones.reduce((sum, z) => sum + z.latestAssessment.riskScore, 0) / zones.length) 
                  : 24;
                const overallRiskLevel = overallRisk >= 70 ? 'red' : overallRisk >= 35 ? 'yellow' : 'green';
                
                const criticalAlertsCount = zones.filter(z => z.riskLevel === 'red').length;
                const warningAlertsCount = zones.filter(z => z.riskLevel === 'yellow').length;
                const totalAlertsCount = criticalAlertsCount + warningAlertsCount;

                const totalWorkers = zones.reduce((sum, z) => sum + (z.detections.workersCount ?? 1), 0);
                const workersHazard = zones.filter(z => z.riskLevel !== 'green').reduce((sum, z) => sum + (z.detections.workersCount ?? 1), 0);
                const ppeCompliance = zones.every(z => z.detections.helmetViolations === 0 && z.detections.vestViolations === 0) ? '98.5%' : '86.4%';

                const currentIncidents = zones.filter(z => z.riskLevel === 'red').length;
                const resolvedToday = zones.filter(z => z.riskLevel === 'green').length + 2; 

                return (
                  <div className="flex flex-col gap-6 animate-[fadeIn_0.3s_ease-out]">

                    {/* ── SECTION 1: PLANT HEALTH SUMMARY KPIs ── */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

                      {/* KPI 1: Overall Risk Score */}
                      <div className="glass-panel p-5 rounded-2xl border-l-[5px] border-l-blue-500 flex items-center justify-between hover:-translate-y-0.5 transition-transform duration-200">
                        <div>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Overall Risk Score</p>
                          <p className="text-2xl font-black text-white mt-1.5 font-mono">{overallRisk}%</p>
                          <span className={`inline-block text-[9px] font-bold py-0.5 px-2 rounded uppercase mt-1.5 ${
                            overallRiskLevel === 'red' ? 'text-red-400 bg-red-950/40 border border-red-500/20' :
                            overallRiskLevel === 'yellow' ? 'text-amber-400 bg-amber-950/40 border border-amber-500/20' :
                            'text-emerald-400 bg-emerald-950/40 border border-emerald-500/20'
                          }`}>
                            {overallRiskLevel} risk
                          </span>
                        </div>
                        <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                          <Shield className="w-6 h-6 text-blue-400" />
                        </div>
                      </div>

                      {/* KPI 2: Active Alerts */}
                      <div className="glass-panel p-5 rounded-2xl border-l-[5px] border-l-amber-500 flex items-center justify-between hover:-translate-y-0.5 transition-transform duration-200">
                        <div>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Active Alerts</p>
                          <p className="text-2xl font-black text-white mt-1.5 font-mono">{totalAlertsCount}</p>
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400 font-bold uppercase">
                            <span>Crit: <strong className="text-red-400">{criticalAlertsCount}</strong></span>
                            <span>Warn: <strong className="text-amber-400">{warningAlertsCount}</strong></span>
                          </div>
                        </div>
                        <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                          <AlertTriangle className="w-6 h-6 text-amber-400 animate-pulse" />
                        </div>
                      </div>

                      {/* KPI 3: Workers On Site */}
                      <div className="glass-panel p-5 rounded-2xl border-l-[5px] border-l-emerald-500 flex items-center justify-between hover:-translate-y-0.5 transition-transform duration-200">
                        <div>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Workers On Site</p>
                          <p className="text-2xl font-black text-white mt-1.5 font-mono">{totalWorkers}</p>
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400 font-bold uppercase">
                            <span>Haz: <strong className="text-slate-300">{workersHazard}</strong></span>
                            <span>PPE: <strong className="text-emerald-400">{ppeCompliance}</strong></span>
                          </div>
                        </div>
                        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                          <UserCheck className="w-6 h-6 text-emerald-400" />
                        </div>
                      </div>

                      {/* KPI 4: Active Incidents + Cameras Online */}
                      <div className="glass-panel p-5 rounded-2xl border-l-[5px] border-l-purple-500 flex items-center justify-between hover:-translate-y-0.5 transition-transform duration-200">
                        <div>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Active Incidents</p>
                          <p className="text-2xl font-black text-white mt-1.5 font-mono">{currentIncidents}</p>
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400 font-bold uppercase">
                            <span>Res: <strong className="text-emerald-400">{resolvedToday}</strong></span>
                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />4 Cams</span>
                          </div>
                        </div>
                        <div className="p-3.5 bg-purple-500/10 border border-purple-500/20 rounded-2xl">
                          <Activity className="w-6 h-6 text-purple-400 animate-pulse" />
                        </div>
                      </div>
                    </div>

                    {/* ── SECTION 2 & 3: HEATMAP + COMPOUND RISK ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                      {/* Plant Heatmap (7 cols) */}
                      <div className="glass-panel p-5 rounded-2xl lg:col-span-7 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-xs font-black tracking-wider text-slate-400 uppercase flex items-center gap-2">
                              <Layers className="w-4 h-4 text-blue-400" />
                              Plant Heatmap
                            </h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase font-mono mt-0.5">Color-coded by zone risk level</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono font-bold">LIVE</span>
                            <button
                              onClick={() => setCurrentTab('heatmap')}
                              className="text-[10px] text-slate-400 hover:text-blue-400 border border-slate-800 hover:border-blue-500/40 bg-slate-900/60 px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1"
                            >
                              Full Map <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Floor plate — fixed geometry, visual-only selection */}
                        <div className="relative bg-slate-950/85 border border-slate-800/80 rounded-xl overflow-hidden aspect-[4/3]">
                          {/* Zone A */}
                          <button
                            onClick={() => { setSelectedZoneId('zone-a'); setCurrentTab('heatmap'); }}
                            className={`absolute left-[5%] top-[10%] w-[42%] h-[40%] rounded-lg border p-3 flex flex-col justify-between text-left cursor-pointer transition-[border-color,box-shadow,background-color] duration-200 hover:border-purple-500/60 hover:shadow-[0_0_10px_rgba(168,85,247,0.2)] ${
                              zones.find(z => z.id === 'zone-a')?.riskLevel === 'red' ? 'pulse-red border-red-500/80 bg-red-950/30' :
                              zones.find(z => z.id === 'zone-a')?.riskLevel === 'yellow' ? 'pulse-yellow border-amber-500/80 bg-amber-950/30' :
                              'border-emerald-500/20 bg-emerald-950/10'
                            }`}
                          >
                            <div>
                              <p className="text-xs font-black text-white">Zone A</p>
                              <p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">Tank Farm</p>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                                zones.find(z => z.id === 'zone-a')?.riskLevel === 'red' ? 'text-red-400 bg-red-950/60' :
                                zones.find(z => z.id === 'zone-a')?.riskLevel === 'yellow' ? 'text-amber-400 bg-amber-950/60' : 'text-emerald-400 bg-emerald-950/60'
                              }`}>
                                {zones.find(z => z.id === 'zone-a')?.riskLevel?.toUpperCase() ?? 'GREEN'}
                              </span>
                              <span className="text-[9px] font-mono text-slate-400">{zones.find(z => z.id === 'zone-a')?.latestAssessment?.riskScore ?? 0}%</span>
                            </div>
                          </button>

                          {/* Zone B */}
                          <button
                            onClick={() => { setSelectedZoneId('zone-b'); setCurrentTab('heatmap'); }}
                            className={`absolute right-[5%] top-[10%] w-[42%] h-[40%] rounded-lg border p-3 flex flex-col justify-between text-left cursor-pointer transition-[border-color,box-shadow,background-color] duration-200 hover:border-purple-500/60 hover:shadow-[0_0_10px_rgba(168,85,247,0.2)] ${
                              zones.find(z => z.id === 'zone-b')?.riskLevel === 'red' ? 'pulse-red border-red-500/80 bg-red-950/30' :
                              zones.find(z => z.id === 'zone-b')?.riskLevel === 'yellow' ? 'pulse-yellow border-amber-500/80 bg-amber-950/30' :
                              'border-emerald-500/20 bg-emerald-950/10'
                            }`}
                          >
                            <div>
                              <p className="text-xs font-black text-white">Zone B</p>
                              <p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">Loading Dock</p>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                                zones.find(z => z.id === 'zone-b')?.riskLevel === 'red' ? 'text-red-400 bg-red-950/60' :
                                zones.find(z => z.id === 'zone-b')?.riskLevel === 'yellow' ? 'text-amber-400 bg-amber-950/60' : 'text-emerald-400 bg-emerald-950/60'
                              }`}>
                                {zones.find(z => z.id === 'zone-b')?.riskLevel?.toUpperCase() ?? 'GREEN'}
                              </span>
                              <span className="text-[9px] font-mono text-slate-400">{zones.find(z => z.id === 'zone-b')?.latestAssessment?.riskScore ?? 0}%</span>
                            </div>
                          </button>

                          {/* Zone C */}
                          <button
                            onClick={() => { setSelectedZoneId('zone-c'); setCurrentTab('heatmap'); }}
                            className={`absolute bottom-[10%] left-[5%] right-[5%] w-[90%] h-[35%] rounded-lg border p-3 flex flex-row justify-between items-center text-left cursor-pointer transition-[border-color,box-shadow,background-color] duration-200 hover:border-purple-500/60 hover:shadow-[0_0_10px_rgba(168,85,247,0.2)] ${
                              zones.find(z => z.id === 'zone-c')?.riskLevel === 'red' ? 'pulse-red border-red-500/80 bg-red-950/30' :
                              zones.find(z => z.id === 'zone-c')?.riskLevel === 'yellow' ? 'pulse-yellow border-amber-500/80 bg-amber-950/30' :
                              'border-emerald-500/20 bg-emerald-950/10'
                            }`}
                          >
                            <div>
                              <p className="text-xs font-black text-white">Zone C</p>
                              <p className="text-[9px] text-slate-500 font-bold uppercase">Hydrocarbon Process Area</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                                zones.find(z => z.id === 'zone-c')?.riskLevel === 'red' ? 'text-red-400 bg-red-950/60' :
                                zones.find(z => z.id === 'zone-c')?.riskLevel === 'yellow' ? 'text-amber-400 bg-amber-950/60' : 'text-emerald-400 bg-emerald-950/60'
                              }`}>
                                {zones.find(z => z.id === 'zone-c')?.riskLevel?.toUpperCase() ?? 'GREEN'}
                              </span>
                              <span className="text-[9px] font-mono text-slate-400">{zones.find(z => z.id === 'zone-c')?.latestAssessment?.riskScore ?? 0}%</span>
                            </div>
                          </button>

                          {/* Subtle grid overlay */}
                          <div className="absolute inset-0 pointer-events-none opacity-5" style={{backgroundImage: 'radial-gradient(circle, #94a3b8 1px, transparent 1px)', backgroundSize: '20px 20px'}} />
                        </div>
                      </div>

                      {/* Compound Risk Summary (5 cols) */}
                      <div className="glass-panel p-5 rounded-2xl lg:col-span-5 flex flex-col justify-between gap-4">
                        <div>
                          <h3 className="text-xs font-black tracking-wide text-slate-400 uppercase flex items-center gap-2">
                            <Shield className="w-4 h-4 text-blue-400" />
                            Compound Risk Summary
                          </h3>

                          {/* Gauge */}
                          <div className="flex flex-col items-center py-4 bg-slate-955/50 border border-slate-805 rounded-xl mt-3">
                            <div className="relative w-28 h-28 flex items-center justify-center">
                              <svg className="w-full h-full transform -rotate-90">
                                <circle cx="56" cy="56" r="44" className="stroke-slate-850 fill-none" strokeWidth="8"></circle>
                                <circle
                                  cx="56" cy="56" r="44"
                                  className={`fill-none stroke-current ${
                                    overallRiskLevel === 'red' ? 'text-red-500' :
                                    overallRiskLevel === 'yellow' ? 'text-amber-500' : 'text-emerald-500'
                                  }`}
                                  strokeWidth="8"
                                  strokeLinecap="round"
                                  strokeDasharray={276}
                                  strokeDashoffset={276 - (276 * overallRisk) / 100}
                                ></circle>
                              </svg>
                              <div className="absolute text-center">
                                <span className="text-3xl font-black text-white font-mono">{overallRisk}</span>
                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">RISK</p>
                              </div>
                            </div>

                            <span className={`text-[10px] font-black uppercase mt-2 tracking-widest px-3 py-1 rounded-full border ${
                              overallRiskLevel === 'red' ? 'text-red-400 bg-red-950/40 border-red-500/30' :
                              overallRiskLevel === 'yellow' ? 'text-amber-400 bg-amber-950/40 border-amber-500/30' :
                              'text-emerald-400 bg-emerald-950/40 border-emerald-500/30'
                            }`}>
                              {overallRiskLevel === 'red' ? '⚠ CRITICAL' : overallRiskLevel === 'yellow' ? '⚡ ELEVATED' : '✓ NOMINAL'}
                            </span>
                          </div>

                          {/* AI one-liner */}
                          <p className="text-[11px] text-slate-400 italic leading-relaxed mt-3 px-1">
                            {criticalAlertsCount + warningAlertsCount > 0
                              ? `Agentic fusion engine detected ${criticalAlertsCount + warningAlertsCount} active zone anomalies. Immediate review recommended.`
                              : 'All sensor channels nominal. No critical anomalies detected across active zones.'
                            }
                          </p>
                        </div>

                        <button
                          onClick={() => setCurrentTab('risk-engine')}
                          className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white py-3 rounded-xl text-xs font-black tracking-wider uppercase transition flex items-center justify-center gap-2 shadow"
                        >
                          View Full Assessment
                          <ArrowUpRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>


                    {/* ── SECTION 4 · 5 · 6: ALERTS · TELEMETRY · COPILOT ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                      {/* Recent Critical Alerts (4 cols) */}
                      <div className="glass-panel p-5 rounded-2xl lg:col-span-4 flex flex-col justify-between gap-4 text-left">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-black tracking-wide text-slate-400 uppercase flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                              Recent Critical Alerts
                            </h3>
                            <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded border ${
                              criticalAlertsCount > 0 ? 'text-red-400 bg-red-950/40 border-red-500/20 animate-pulse' : 'text-slate-500 bg-slate-900 border-slate-800'
                            }`}>{totalAlertsCount} ACTIVE</span>
                          </div>

                          <div className="flex flex-col gap-2">
                            {zones.find(z => z.riskLevel === 'red') && (
                              <div className="flex items-start justify-between text-xs bg-red-950/20 p-2.5 border border-red-500/20 rounded-xl gap-2">
                                <div className="flex-1">
                                  <p className="font-bold text-white leading-tight">{zones.find(z => z.riskLevel === 'red')?.name} — Critical Risk</p>
                                  <p className="text-[10px] text-slate-400 mt-0.5">Risk score exceeds threshold</p>
                                </div>
                                <span className="text-[9px] uppercase font-bold bg-red-950/60 border border-red-500/20 text-red-400 px-2 py-0.5 rounded font-mono shrink-0">CRIT</span>
                              </div>
                            )}
                            {zones.find(z => z.riskLevel === 'yellow') && (
                              <div className="flex items-start justify-between text-xs bg-amber-950/15 p-2.5 border border-amber-500/20 rounded-xl gap-2">
                                <div className="flex-1">
                                  <p className="font-bold text-white leading-tight">{zones.find(z => z.riskLevel === 'yellow')?.name} — Elevated</p>
                                  <p className="text-[10px] text-slate-400 mt-0.5">Warning threshold breached</p>
                                </div>
                                <span className="text-[9px] uppercase font-bold bg-amber-950/60 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-mono shrink-0">WARN</span>
                              </div>
                            )}
                            <div className="flex items-start justify-between text-xs bg-slate-900/60 p-2.5 border border-slate-805 rounded-xl gap-2">
                              <div className="flex-1">
                                <p className="font-bold text-white leading-tight">PPE Helmet Compliance Check</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">AI Vision — 1 violation today</p>
                              </div>
                              <span className="text-[9px] uppercase font-bold bg-amber-950/50 border border-amber-500/15 text-amber-400 px-2 py-0.5 rounded font-mono shrink-0">WARN</span>
                            </div>
                            <div className="flex items-start justify-between text-xs bg-slate-900/60 p-2.5 border border-slate-805 rounded-xl gap-2">
                              <div className="flex-1">
                                <p className="font-bold text-white leading-tight">System Calibration Sync</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">SCADA sensor register OK</p>
                              </div>
                              <span className="text-[9px] uppercase font-bold bg-blue-950/60 border border-blue-500/20 text-blue-400 px-2 py-0.5 rounded font-mono shrink-0">INFO</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => setCurrentTab('incident-center')}
                          className="w-full bg-slate-850 hover:bg-slate-800 active:scale-95 text-slate-300 py-2.5 rounded-xl text-xs font-bold border border-slate-700/80 transition flex items-center justify-center gap-1.5"
                        >
                          View All Alerts <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Live Telemetry Summary (4 cols) */}
                      <div className="glass-panel p-5 rounded-2xl lg:col-span-4 flex flex-col justify-between gap-4 text-left">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-black tracking-wide text-slate-400 uppercase flex items-center gap-2">
                              <Activity className="w-4 h-4 text-blue-400" />
                              Live Telemetry
                            </h3>
                            <span className="text-[10px] bg-slate-800/85 border border-slate-700 px-2 py-0.5 rounded text-slate-400 font-mono font-bold">
                              {selectedZoneId.toUpperCase().replace('-', ' ')}
                            </span>
                          </div>

                          {selectedZone ? (() => {
                            const h = sensorHistory[selectedZoneId];
                            const gasVal   = h ? h.gasLevel[h.gasLevel.length - 1]       : selectedZone.sensors.gasLevel;
                            const tempVal  = h ? h.temperature[h.temperature.length - 1] : selectedZone.sensors.temperature;
                            const pressVal = h ? h.pressure[h.pressure.length - 1]       : selectedZone.sensors.pressure;
                            const humVal   = h ? h.humidity[h.humidity.length - 1]       : selectedZone.sensors.humidity;
                            return (
                              <div className="grid grid-cols-2 gap-2.5">
                                <TelemetryCard label="Gas"         value={gasVal}   unit="ppm" color="#10b981" decimals={0} history={h ? h.gasLevel     : []} icon={<Wind        className="w-4 h-4 text-emerald-400" />} status={getGasStatus(gasVal)}    />
                                <TelemetryCard label="Temperature" value={tempVal}  unit="°C"  color="#f97316" decimals={1} history={h ? h.temperature  : []} icon={<Thermometer  className="w-4 h-4 text-orange-400" />} status={getTempStatus(tempVal)}  />
                                <TelemetryCard label="Pressure"    value={pressVal} unit="bar" color="#3b82f6" decimals={2} history={h ? h.pressure     : []} icon={<Gauge        className="w-4 h-4 text-blue-400"    />} status={getPressStatus(pressVal)} />
                                <TelemetryCard label="Humidity"    value={humVal}   unit="%"   color="#a855f7" decimals={1} history={h ? h.humidity     : []} icon={<Activity     className="w-4 h-4 text-purple-400"  />} status={getHumidStatus(humVal)}  />
                              </div>
                            );
                          })() : (
                            <p className="text-xs text-slate-500 py-4 border border-dashed border-slate-800 rounded-xl text-center">Select a zone on the heatmap to load telemetry feeds.</p>
                          )}
                        </div>

                        <button
                          onClick={() => setCurrentTab('telemetry')}
                          className="w-full bg-slate-850 hover:bg-slate-800 active:scale-95 text-blue-300 py-2.5 rounded-xl text-xs font-bold border border-slate-700/80 transition flex items-center justify-center gap-1.5"
                        >
                          Open Telemetry Dashboard <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* AI Copilot Widget (4 cols) */}
                      <div className="glass-panel p-5 rounded-2xl lg:col-span-4 flex flex-col justify-between gap-4 text-left">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 px-2 bg-blue-600/15 border border-blue-500/20 rounded-lg">
                              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                            </div>
                            <div>
                              <h3 className="text-xs font-black tracking-wide text-slate-400 uppercase leading-none">Safety Copilot</h3>
                              <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">AI Assistant Online</p>
                            </div>
                            <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          </div>

                          <div className="bg-slate-950/60 border border-slate-805 rounded-xl p-3 flex flex-col gap-1.5">
                            <span className="text-[9px] text-blue-400 font-bold uppercase tracking-wider">Latest Recommendation</span>
                            <p className="text-[11px] text-slate-300 italic leading-relaxed">
                              {selectedZone
                                ? `"${selectedZone.riskLevel === 'red'
                                    ? 'Evacuate zone immediately. Activate ventilation systems and isolate gas valves.'
                                    : selectedZone.riskLevel === 'yellow'
                                    ? 'Heightened vigilance required. Verify all personnel have valid PPE in area.'
                                    : `All parameters nominal in ${selectedZone.name}. Continue standard monitoring protocols.`
                                  }"`
                                : '"Select a zone to receive context-aware safety recommendations from the AI engine."'
                              }
                            </p>
                          </div>

                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Ask copilot a quick question..."
                              className="flex-1 bg-slate-950 border border-slate-800 focus:border-blue-500/50 text-xs text-white placeholder-slate-600 rounded-lg px-3 py-2 outline-none transition"
                              onKeyDown={(e) => { if (e.key === 'Enter') setCurrentTab('copilot'); }}
                            />
                            <button
                              onClick={() => setCurrentTab('copilot')}
                              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-2.5 transition active:scale-95"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <button
                          onClick={() => setCurrentTab('copilot')}
                          className="w-full bg-slate-850 hover:bg-slate-800 active:scale-95 text-blue-300 py-2.5 rounded-xl text-xs font-bold border border-slate-700/80 transition flex items-center justify-center gap-1.5"
                        >
                          Open Full Copilot <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })()}

              {/* TAB 2: AI VISION FEED VIEW */}
              {currentTab === 'vision' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-left animate-[fadeIn_0.3s_ease-out]">
                  
                  {/* Left panel: Input config controls */}
                  <div className="lg:col-span-5 flex flex-col gap-6">
                    <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4">
                      <div>
                        <h3 className="text-xs font-black tracking-wide text-slate-400 uppercase flex items-center gap-2 pb-0.5">
                          <Video className="w-4 h-4 text-purple-400" />
                          AI Vision Input source
                        </h3>
                        <p className="text-[10px] text-slate-500 uppercase font-bold font-mono">Stream gateway controller</p>
                      </div>

                      {/* Selector */}
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] text-slate-405 font-bold uppercase tracking-wider">Input Source</label>
                        <div className="flex gap-1.5 bg-slate-950/70 p-1 border border-slate-800 rounded-xl">
                          {/* Upload option */}
                          <button
                            onClick={() => setVisionMode('upload')}
                            className={`
                              relative flex-1 flex items-center justify-center gap-2
                              px-3 py-2.5 rounded-lg text-xs font-bold tracking-wide
                              cursor-pointer transition-[background-color,box-shadow,color,border-color]
                              duration-250 select-none
                              ${visionMode === 'upload'
                                ? 'bg-purple-600 text-white shadow-[0_0_14px_rgba(168,85,247,0.45)] border border-purple-500/60'
                                : 'bg-transparent text-slate-500 border border-transparent hover:bg-slate-800/60 hover:text-slate-300'
                              }
                            `}
                          >
                            <span className={`
                              inline-flex items-center justify-center w-3.5 h-3.5 rounded-full
                              text-[10px] font-black transition-[opacity,transform] duration-200
                              ${visionMode === 'upload' ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}
                            `}>✓</span>
                            <span>Upload Footage</span>
                          </button>

                          {/* Live Stream option */}
                          <button
                            onClick={() => setVisionMode('stream')}
                            className={`
                              relative flex-1 flex items-center justify-center gap-2
                              px-3 py-2.5 rounded-lg text-xs font-bold tracking-wide
                              cursor-pointer transition-[background-color,box-shadow,color,border-color]
                              duration-250 select-none
                              ${visionMode === 'stream'
                                ? 'bg-purple-600 text-white shadow-[0_0_14px_rgba(168,85,247,0.45)] border border-purple-500/60'
                                : 'bg-transparent text-slate-500 border border-transparent hover:bg-slate-800/60 hover:text-slate-300'
                              }
                            `}
                          >
                            <span className={`
                              inline-flex items-center justify-center w-3.5 h-3.5 rounded-full
                              text-[10px] font-black transition-[opacity,transform] duration-200
                              ${visionMode === 'stream' ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}
                            `}>✓</span>
                            <span>Live CCTV Stream</span>
                          </button>
                        </div>

                        {/* Active mode indicator strip */}
                        <div className="flex gap-1.5 px-0.5">
                          <div className={`h-0.5 flex-1 rounded-full transition-[background-color,opacity] duration-250 ${visionMode === 'upload' ? 'bg-purple-500 opacity-100' : 'bg-slate-800 opacity-60'}`} />
                          <div className={`h-0.5 flex-1 rounded-full transition-[background-color,opacity] duration-250 ${visionMode === 'stream' ? 'bg-purple-500 opacity-100' : 'bg-slate-800 opacity-60'}`} />
                        </div>
                      </div>

                      {/* Mode Uploader */}
                      {visionMode === 'upload' ? (
                        <div className="flex flex-col gap-4">
                          {!selectedVideo ? (
                            /* Drag and drop zone */
                            <div 
                              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                              onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                              onDrop={(e) => {
                                e.preventDefault();
                                setIsDragging(false);
                                const file = e.dataTransfer.files?.[0];
                                if (file) handleCCTVFile(file);
                              }}
                              className={`border-2 border-dashed rounded-xl p-8 transition-all flex flex-col items-center justify-center text-center cursor-pointer relative group ${
                                isDragging 
                                  ? 'border-purple-500 bg-purple-950/25 shadow-[0_0_15px_rgba(168,85,247,0.2)]' 
                                  : 'border-slate-800 bg-slate-950/40 hover:border-purple-600/80 hover:bg-slate-900/70 hover:shadow-[0_0_12px_rgba(147,51,234,0.1)]'
                              }`}
                            >
                              <input
                                type="file"
                                accept="video/*"
                                onChange={handleVideoSelect}
                                className="absolute inset-0 opacity-0 cursor-pointer z-10"
                              />
                              <Upload className="w-8 h-8 text-purple-405 group-hover:scale-110 transition-transform duration-200 mb-3" />
                              <p className="text-xs font-bold text-white transition-colors group-hover:text-purple-300">
                                {isDragging ? 'Drop video here' : 'Choose Video File or Drag Here'}
                              </p>
                              <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-tight">Accepts live camera recordings & MP4 clips</p>
                            </div>
                          ) : (
                            /* Selected file view */
                            <div className="glass-panel p-5 rounded-xl border border-slate-800 bg-slate-950/60 flex flex-col gap-4">
                              <div className="flex items-start gap-3">
                                <div className="p-2 bg-emerald-950/80 border border-emerald-500/30 rounded-lg shrink-0">
                                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                  <p className="text-slate-500 text-[9px] uppercase font-bold tracking-wider font-mono">CCTV File Selected</p>
                                  <p className="text-xs font-bold text-white truncate mt-0.5">{selectedVideo.name}</p>
                                  <div className="flex gap-4 mt-2 text-[10px] font-mono text-slate-404">
                                    <span>Size: <strong className="text-slate-300">{selectedVideo.size}</strong></span>
                                    <span>Duration: <strong className="text-slate-300">{selectedVideo.duration}</strong></span>
                                  </div>
                                </div>
                              </div>

                              {/* Status Area */}
                              <div className="border-t border-slate-900 pt-3 flex flex-col gap-3">
                                {!isAnalyzingCCTV && !showAnalysisResults && (
                                  <>
                                    <div className="flex items-center gap-1.5 text-xs text-amber-405 font-bold bg-amber-955/30 border border-amber-600/20 px-2.5 py-1.5 rounded-lg w-fit">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-450 animate-pulse" />
                                      Status: Ready for Analysis
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-1">
                                      <button
                                        type="button"
                                        onClick={() => { setSelectedVideo(null); setShowAnalysisResults(false); }}
                                        className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800 text-xs font-bold text-slate-300 rounded-lg transition"
                                      >
                                        Replace File
                                      </button>
                                      <button
                                        type="button"
                                        onClick={runVideoAnalysis}
                                        className="py-2.5 px-2 bg-purple-650 hover:bg-purple-750 active:scale-95 border border-purple-500/30 text-xs font-bold text-white rounded-lg transition shadow-[0_0_12px_rgba(168,85,247,0.2)]"
                                      >
                                        Analyze Video
                                      </button>
                                    </div>
                                  </>
                                )}

                                {isAnalyzingCCTV && (
                                  <div className="flex flex-col gap-2.5 bg-slate-950/40 p-3 border border-slate-900 rounded-lg animate-pulse">
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="text-purple-404 font-black tracking-wide flex items-center gap-1.5">
                                        <Activity className="w-3.5 h-3.5 animate-spin" />
                                        AI is analyzing CCTV footage...
                                      </span>
                                      <span className="text-white font-mono font-black">{analysisProgress}%</span>
                                    </div>
                                    <div className="w-full bg-slate-905 rounded-full h-1.5 overflow-hidden">
                                      <div 
                                        className="bg-purple-500 h-full rounded-full transition-all duration-200" 
                                        style={{ width: `${analysisProgress}%` }}
                                      />
                                    </div>
                                    <p className="text-[9px] text-slate-500 leading-normal">Extracting telemetry vectors, safety gear bounding coordinates, and YOLOv8 validation...</p>
                                  </div>
                                )}

                                {showAnalysisResults && !isAnalyzingCCTV && (
                                  <div className="flex flex-col gap-3">
                                    <div className="flex items-center gap-2 text-xs text-emerald-405 font-bold bg-emerald-955/40 border border-emerald-500/20 px-3 py-2 rounded-lg justify-between animate-[bounce_1.4s_ease-in-out_1]">
                                      <span className="flex items-center gap-1.5">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                        ✔ Analysis Complete
                                      </span>
                                      <span className="text-[9px] bg-emerald-955 px-2 py-0.5 rounded text-emerald-400 border border-emerald-500/10">100% OK</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => { setSelectedVideo(null); setShowAnalysisResults(false); }}
                                      className="py-2 px-3 bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800 text-xs font-bold text-slate-400 rounded-lg transition"
                                    >
                                      Reset Analysis
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        // Live Stream Connect inputs
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">RTSP IP Camera Link / Server URL</label>
                            <input
                              type="text"
                              placeholder="rtsp://192.168.1.100:554/h264Preview_01_main"
                              value={rtspUrl}
                              onChange={(e) => setRtspUrl(e.target.value)}
                              className="bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg p-2.5 text-xs text-white outline-none font-mono"
                            />
                          </div>

                          <button
                            onClick={connectRtspCamera}
                            disabled={!rtspUrl.trim()}
                            className={`w-full py-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                              !rtspUrl.trim()
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                : 'bg-purple-650 hover:bg-purple-750 text-white'
                            }`}
                          >
                            Connect Camera Feed
                          </button>

                          {rtspState === 'connected' && (
                            <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-2.5 flex items-center gap-2 text-[10px] text-emerald-405 animate-pulse font-mono justify-center">
                              <span className="w-2 h-2 rounded-full bg-emerald-405 animate-ping" />
                              ● Live Camera Connected
                            </div>
                          )}

                          {rtspState === 'error' && (
                            <div className="bg-red-955/40 border border-red-500/30 rounded-lg p-2.5 flex items-center gap-2 text-[10px] text-red-400 font-mono justify-center">
                              <span className="w-2 h-2 rounded-full bg-red-500" />
                              ⚠️ Connection Timeout: Host unreachable
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right panel: Verification player & detection alerts table */}
                  <div className="lg:col-span-7 flex flex-col gap-6">
                    
                    {/* Visual Overlay Verification Player */}
                    {showAnalysisResults && selectedZone ? (
                      <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4 border border-purple-550/30 animate-[fadeIn_0.3s_ease-out]">
                        <div className="flex justify-between items-center border-b border-slate-805 pb-3">
                          <p className="text-xs font-black text-white uppercase flex items-center gap-1.5">
                            <Tv className="w-4 h-4 text-purple-405" />
                            Visual Verification Player (Processed Output)
                          </p>
                          <span className="text-[9px] bg-purple-950 text-purple-400 border border-purple-800/40 px-2 py-0.5 rounded font-mono font-bold">YOLOv8 OVERLAYS</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950 rounded-xl p-2 border border-slate-900">
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[9px] text-slate-500 font-mono uppercase font-bold">Raw CCTV Feed</span>
                            <div className="relative aspect-[4/3] bg-slate-900 border border-slate-850 rounded-lg overflow-hidden flex items-center justify-center">
                              <div className="w-full h-full bg-gradient-to-tr from-slate-955 to-slate-900 opacity-40 absolute inset-0" />
                              <Video className="w-8 h-8 text-slate-700 animate-pulse" />
                              <span className="absolute bottom-2 right-2 text-[8px] font-mono text-slate-500 font-bold tracking-wider">CCTV_FEED_RAW</span>
                            </div>
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <span className="text-[9px] text-slate-500 font-mono uppercase font-bold">AI Annotations (Overlays)</span>
                            <div className="relative aspect-[4/3] bg-slate-900 border border-slate-805 rounded-lg overflow-hidden flex items-center justify-center">
                              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                              
                              <div className="absolute top-[20%] left-[10%] w-[35%] h-[60%] border-2 border-emerald-400 bg-emerald-500/10 rounded flex flex-col justify-between p-1 animate-pulse">
                                <span className="text-[8px] text-emerald-300 font-mono bg-emerald-950/80 px-1 py-0.5 rounded w-fit leading-none font-bold">
                                  Person (98%)
                                </span>
                                <span className="text-[7px] text-emerald-400 font-black bg-slate-950/80 px-1 py-0.5 rounded w-fit self-end uppercase">
                                  Helmet OK
                                </span>
                              </div>

                              <div className="absolute top-[15%] right-[10%] w-[38%] h-[65%] border-2 border-red-505 bg-red-950/20 rounded flex flex-col justify-between p-1 animate-pulse">
                                <span className="text-[8px] text-red-200 font-mono bg-red-955 px-1 py-0.5 rounded w-fit leading-none font-bold">
                                  Person (92%)
                                </span>
                                <span className="text-[7px] text-red-405 font-black bg-slate-950/90 px-1 py-0.5 rounded w-fit self-end animate-[pulse_1s_infinite] uppercase border border-red-500/25">
                                  NO HELMET
                                </span>
                              </div>

                              {(selectedZone.detections?.fire === true || selectedZone.detections?.fire === 'yes') && (
                                <div className="absolute inset-0 border-2 border-red-650 bg-red-950/15 flex items-center justify-center p-2 animate-[pulse_1s_infinite]">
                                  <span className="text-[10px] font-black text-white bg-red-600 px-3 py-1.5 border border-red-500 rounded-lg shadow-lg uppercase tracking-wider">
                                    FIRE DETECTED
                                  </span>
                                </div>
                              )}

                              {selectedZone.detections?.inRestrictedZone && (
                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-red-900 border border-red-650 px-2 py-0.5 rounded shadow">
                                  <span className="text-red-405 font-mono text-[7px] font-black tracking-widest animate-pulse uppercase">
                                    RESTRICTED AREA INVASION
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="glass-panel p-10 rounded-2xl flex flex-col items-center justify-center text-center text-slate-500 bg-slate-900/30">
                        <Video className="w-10 h-10 text-slate-700 mb-3 animate-pulse" />
                        <p className="text-xs font-bold uppercase tracking-wider">Visual Verification Offline</p>
                        <p className="text-[11px] text-slate-550 mt-1 max-w-sm">Please select a video file and initiate "Analyze Video Feed" to verify YOLOv8 annotating overlays.</p>
                      </div>
                    )}

                    {/* AI Vision CCTV Alerts list */}
                    <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4">
                      <h3 className="text-xs font-black tracking-wide text-slate-404 uppercase flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-purple-400" />
                        AI Vision CCTV Alerts & Frame Counts
                      </h3>
                      
                      {selectedZone ? (
                        <div className="flex flex-col gap-2.5 text-xs">
                          <div className="flex justify-between items-center bg-slate-900/60 p-3 rounded-lg border border-slate-805">
                            <span className="text-slate-350 font-bold uppercase text-[10px]">Workers Detected</span>
                            <span className="px-2.5 py-1 rounded font-black text-white bg-slate-800 font-mono">
                              {selectedZone.detections?.workersCount ?? 2}
                            </span>
                          </div>

                          <div className="flex justify-between items-center bg-slate-900/60 p-3 rounded-lg border border-slate-805">
                            <span className="text-slate-300 font-bold uppercase text-[10px]">Helmet violations</span>
                            <span className={`px-2.5 py-1 rounded font-black font-mono text-[10px] ${
                              (selectedZone.detections?.helmetViolations ?? 0) > 0 
                                ? 'bg-red-955/80 text-red-405 border border-red-500/25 animate-pulse'
                                : 'bg-emerald-950 text-emerald-450 border border-emerald-500/20 font-bold'
                            }`}>
                              {selectedZone.detections?.helmetViolations ?? 0}
                            </span>
                          </div>

                          <div className="flex justify-between items-center bg-slate-900/60 p-3 rounded-lg border border-slate-805">
                            <span className="text-slate-300 font-bold uppercase text-[10px]">Safety Vest Violations</span>
                            <span className={`px-2.5 py-1 rounded font-black font-mono text-[10px] ${
                              (selectedZone.detections?.vestViolations ?? 0) > 0 
                                ? 'bg-red-955/80 text-red-400 border border-red-500/25'
                                : 'bg-emerald-950 text-emerald-450 border border-emerald-500/20 font-bold'
                            }`}>
                              {selectedZone.detections?.vestViolations ?? 0}
                            </span>
                          </div>

                          <div className="flex justify-between items-center bg-slate-900/60 p-3 rounded-lg border border-slate-805">
                            <span className="text-slate-303 font-bold uppercase text-[10px]">Restricted Area entries</span>
                            <span className={`px-2.5 py-1 rounded font-black font-mono text-[10px] ${
                              selectedZone.detections?.inRestrictedZone
                                ? 'bg-red-955/80 text-red-505 border border-red-500/30 animate-pulse font-black'
                                : 'bg-emerald-955 text-emerald-455 border border-emerald-500/20'
                            }`}>
                              {selectedZone.detections?.inRestrictedZone ? 1 : 0}
                            </span>
                          </div>

                          <div className="flex justify-between items-center bg-slate-900/60 p-3 rounded-lg border border-slate-805">
                            <span className="text-slate-303 font-bold uppercase text-[10px]">Active Fire Detections</span>
                            <span className={`px-2.5 py-1 rounded font-black font-mono text-[10px] ${
                              selectedZone.detections?.fire === true || selectedZone.detections?.fire === 'yes'
                                ? 'bg-red-650 text-white animate-pulse'
                                : 'bg-slate-800 text-slate-500'
                            }`}>
                              {selectedZone.detections?.fire === true || selectedZone.detections?.fire === 'yes' ? 'YES' : 'NO'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-slate-550 text-xs font-semibold">Select a zone to load Vision results.</p>
                      )}
                    </div>

                  </div>
                </div>
              )}

              {/* TAB 3: LIVE TELEMETRY MODULE */}
              {currentTab === 'telemetry' && (
                <div className="flex flex-col gap-6 text-left animate-[fadeIn_0.3s_ease-out]">
                  
                  {/* Zone Selector Buttons */}
                  <div className="glass-panel p-4.5 rounded-2xl flex items-center justify-between gap-4">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-400" />
                      Select Monitoring Zone:
                    </span>
                    <div className="flex bg-slate-950 p-1 border border-slate-800 rounded-lg">
                      {[
                        { id: 'zone-a', label: 'Zone A: Tank Farm' },
                        { id: 'zone-b', label: 'Zone B: Loading Dock' },
                        { id: 'zone-c', label: 'Zone C: Process Area' }
                      ].map(z => (
                        <button
                          key={z.id}
                          onClick={() => setSelectedZoneId(z.id)}
                          className={`text-xs px-4 py-2 font-bold rounded-md transition ${selectedZoneId === z.id ? 'bg-blue-600 text-white shadow' : 'text-slate-455 hover:text-slate-205'}`}
                        >
                          {z.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedZone ? (() => {
                    const activeHistory = sensorHistory[selectedZoneId];
                    
                    const gasVal = activeHistory ? activeHistory.gasLevel[activeHistory.gasLevel.length - 1] : selectedZone.sensors.gasLevel;
                    const tempVal = activeHistory ? activeHistory.temperature[activeHistory.temperature.length - 1] : selectedZone.sensors.temperature;
                    const pressVal = activeHistory ? activeHistory.pressure[activeHistory.pressure.length - 1] : selectedZone.sensors.pressure;
                    const humVal = activeHistory ? activeHistory.humidity[activeHistory.humidity.length - 1] : selectedZone.sensors.humidity;

                    return (
                      <div className="flex flex-col gap-6">
                        {/* 4 large KPI dynamic sparklines */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                          <TelemetryCard
                            label="Gas Concentration"
                            value={gasVal}
                            unit="ppm"
                            color="#10b981"
                            decimals={0}
                            history={activeHistory ? activeHistory.gasLevel : []}
                            icon={<Wind className="w-5 h-5 text-emerald-400" />}
                            status={getGasStatus(gasVal)}
                          />
                          <TelemetryCard
                            label="Temperature Rating"
                            value={tempVal}
                            unit="°C"
                            color="#f97316"
                            decimals={1}
                            history={activeHistory ? activeHistory.temperature : []}
                            icon={<Thermometer className="w-5 h-5 text-orange-400" />}
                            status={getTempStatus(tempVal)}
                          />
                          <TelemetryCard
                            label="Pressure Vector"
                            value={pressVal}
                            unit="bar"
                            color="#3b82f6"
                            decimals={2}
                            history={activeHistory ? activeHistory.pressure : []}
                            icon={<Gauge className="w-5 h-5 text-blue-400" />}
                            status={getPressStatus(pressVal)}
                          />
                          <TelemetryCard
                            label="Relative Humidity"
                            value={humVal}
                            unit="%"
                            color="#a855f7"
                            decimals={1}
                            history={activeHistory ? activeHistory.humidity : []}
                            icon={<Activity className="w-5 h-5 text-purple-400" />}
                            status={getHumidStatus(humVal)}
                          />
                        </div>

                        {/* Logs and Health */}
                        <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4">
                          <h3 className="text-xs font-black tracking-wide text-slate-400 uppercase flex items-center gap-2">
                            <Activity className="w-4 h-4 text-blue-400" />
                            SCADA sensor Logs & Gateway Health
                          </h3>
                          
                          <div className="bg-slate-950/80 border border-slate-805 rounded-xl p-4 font-mono text-xs flex flex-col gap-2 max-h-60 overflow-y-auto leading-relaxed">
                            <p className="text-slate-500">[{new Date().toLocaleTimeString()}] Gateway initialized ... OK</p>
                            <p className="text-slate-400">[{new Date().toLocaleTimeString()}] Loading telemetry buffer for {selectedZoneId} ... 60 frames</p>
                            <p className="text-emerald-450 font-bold">[{new Date().toLocaleTimeString()}] Gas Sensor health: 100% (No packet loss)</p>
                            <p className="text-emerald-450 font-bold">[{new Date().toLocaleTimeString()}] Thermal Barometer health: 99.8%</p>
                            <p className="text-slate-400">[{new Date().toLocaleTimeString()}] Log: Gas={gasVal.toFixed(0)} ppm, Temp={tempVal.toFixed(1)}°C, Press={pressVal.toFixed(2)} bar</p>
                          </div>
                        </div>
                      </div>
                    );
                  })() : (
                    <p className="text-xs text-slate-500">Select a zone above to view telemetry metrics.</p>
                  )}
                </div>
              )}
                       {/* TAB 4: UNIFIED COMPOUND ASSESSMENT WORKSPACE */}
              {currentTab === 'risk-engine' && (
                <div className="flex flex-col gap-6 text-left animate-[fadeIn_0.3s_ease-out]">
                  
                  {/* HERO HEADER OR INTRO BANNER */}
                  <div className="glass-panel p-5 rounded-2xl border-l-[6px] border-l-blue-600 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/40">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                        <Shield className="w-5 h-5 text-blue-400 animate-pulse" />
                        Compound Risk Assessment Workspace
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Interact with the scenario simulator below to automatically evaluate risk engines, SOPs, and YOLO vision annotations on the fly.
                      </p>
                    </div>
                    {selectedZone && (
                      <button 
                        onClick={() => generatePDFReport(selectedZone)}
                        className="bg-blue-605/15 border border-blue-500/35 hover:bg-blue-650 transition active:scale-95 text-blue-400 hover:text-white py-2 px-4 rounded-xl text-xs font-black tracking-wide uppercase flex items-center gap-2 shadow"
                      >
                        <FileText className="w-4 h-4" />
                        Export Audit PDF
                      </button>
                    )}
                  </div>

                  {/* SUB SECTION: 3-COLUMN WORKSPACE GRID */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    
                    {/* SECTION 1: SIMULATION CONTROLS */}
                    <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4 border border-purple-500/20 bg-slate-900/20">
                      <div>
                        <h4 className="text-xs font-black tracking-wider text-purple-400 uppercase flex items-center gap-2">
                          <Radio className="w-4 h-4 text-purple-400 animate-pulse" />
                          Simulation Control Console
                        </h4>
                        <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold">Inject safety incidents</p>
                      </div>

                      <div className="flex flex-col gap-4 mt-2">
                        <div className="flex flex-col gap-1.5 relative" ref={incidentDropdownRef}>
                          <label className="text-[9px] text-slate-450 font-bold uppercase tracking-wider">Incident Mock Scenario</label>
                          <button
                            type="button"
                            onClick={() => {
                              setIsIncidentDropdownOpen(!isIncidentDropdownOpen);
                              setIsZoneDropdownOpen(false);
                            }}
                            className="bg-slate-955 border border-slate-800 text-xs text-white rounded-lg p-2.5 outline-none focus:border-purple-500/50 transition font-semibold flex items-center justify-between text-left cursor-pointer w-full hover:bg-slate-900"
                          >
                            <span>{simIncidentType}</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isIncidentDropdownOpen ? 'transform rotate-180' : ''}`} />
                          </button>
                          
                          {isIncidentDropdownOpen && (
                            <div className="absolute left-0 right-0 top-[100%] mt-1 bg-slate-950 border border-slate-800/90 rounded-lg shadow-2xl z-[9999] overflow-y-auto max-h-[250px] scrollbar-thin scrollbar-thumb-slate-800 animate-[fadeIn_0.15s_ease-out]">
                              <div className="flex flex-col p-1 text-left">
                                {[
                                  'Gas Leak',
                                  'Fire',
                                  'Explosion',
                                  'Chemical Spill',
                                  'Unauthorized Entry',
                                  'Equipment Failure',
                                  'High Temperature',
                                  'Pressure Spike',
                                  'Toxic Gas Release',
                                  'Electrical Short Circuit'
                                ].map((type) => (
                                  <button
                                    key={type}
                                    type="button"
                                    onClick={() => {
                                      setSimIncidentType(type);
                                      setIsIncidentDropdownOpen(false);
                                    }}
                                    className={`text-left px-3 py-2 text-xs rounded transition-colors font-semibold cursor-pointer ${
                                      simIncidentType === type 
                                        ? 'bg-purple-600/25 text-purple-300 font-bold' 
                                        : 'text-slate-300 hover:bg-slate-808 hover:text-white'
                                    }`}
                                  >
                                    {type}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-1.5 relative" ref={zoneDropdownRef}>
                          <label className="text-[9px] text-slate-455 font-bold uppercase tracking-wider">Target Zone</label>
                          <button
                            type="button"
                            onClick={() => {
                              setIsZoneDropdownOpen(!isZoneDropdownOpen);
                              setIsIncidentDropdownOpen(false);
                            }}
                            className="bg-slate-955 border border-slate-800 text-xs text-white rounded-lg p-2.5 outline-none focus:border-purple-500/50 transition font-semibold flex items-center justify-between text-left cursor-pointer w-full hover:bg-slate-900"
                          >
                            <span>
                              {simZoneId === 'zone-a' ? 'Zone A: Tank Farm' :
                               simZoneId === 'zone-b' ? 'Zone B: Loading Dock' :
                               'Zone C: Process Area'}
                            </span>
                            <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isZoneDropdownOpen ? 'transform rotate-180' : ''}`} />
                          </button>
                          
                          {isZoneDropdownOpen && (
                            <div className="absolute left-0 right-0 top-[100%] mt-1 bg-slate-950 border border-slate-800/90 rounded-lg shadow-2xl z-[9999] overflow-y-auto max-h-[250px] animate-[fadeIn_0.15s_ease-out]">
                              <div className="flex flex-col p-1 text-left">
                                {[
                                  { id: 'zone-a', name: 'Zone A: Tank Farm' },
                                  { id: 'zone-b', name: 'Zone B: Loading Dock' },
                                  { id: 'zone-c', name: 'Zone C: Process Area' }
                                ].map((zone) => (
                                  <button
                                    key={zone.id}
                                    type="button"
                                    onClick={() => {
                                      setSimZoneId(zone.id);
                                      setIsZoneDropdownOpen(false);
                                    }}
                                    className={`text-left px-3 py-2 text-xs rounded transition-colors font-semibold cursor-pointer ${
                                      simZoneId === zone.id 
                                        ? 'bg-purple-600/25 text-purple-300 font-bold' 
                                        : 'text-slate-300 hover:bg-slate-808 hover:text-white'
                                    }`}
                                  >
                                    {zone.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-2 mt-4">
                          <button
                            onClick={() => triggerIncident(simZoneId, simIncidentType)}
                            className="w-full bg-purple-650 hover:bg-purple-700 active:scale-95 border border-purple-500/30 text-white py-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(147,51,234,0.2)]"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            Run Scenario Simulation
                          </button>
                          <button
                            onClick={resetIncident}
                            className="w-full bg-slate-850 hover:bg-slate-800 active:scale-95 border border-slate-700/80 text-slate-300 py-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                            Reset Simulation
                          </button>
                        </div>
                      </div>

                      {/* QUICK SCENARIO CHIPS */}
                      <div className="border-t border-slate-800/85 pt-4 flex flex-col gap-2">
                        <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Quick Preset Buttons</span>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            onClick={() => { setSimIncidentType('Gas Leak'); setSimZoneId('zone-a'); triggerIncident('zone-a', 'Gas Leak'); }}
                            className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-center hover:border-purple-500/40 hover:bg-slate-900/30 transition text-[9px] font-bold text-slate-300"
                          >
                            Gas Zone A
                          </button>
                          <button
                            onClick={() => { setSimIncidentType('Unauthorized Entry'); setSimZoneId('zone-b'); triggerIncident('zone-b', 'Unauthorized Entry'); }}
                            className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-center hover:border-purple-500/40 hover:bg-slate-900/30 transition text-[9px] font-bold text-slate-300"
                          >
                            Intruder B
                          </button>
                          <button
                            onClick={() => { setSimIncidentType('Fire'); setSimZoneId('zone-c'); triggerIncident('zone-c', 'Fire'); }}
                            className="bg-slate-955 border border-slate-805 rounded-lg p-2 text-center hover:border-purple-500/40 hover:bg-slate-900/30 transition text-[9px] font-bold text-slate-300"
                          >
                            Fire Zone C
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 2: ASSESSMENT RESULTS (Gauge & Safety Rating & Heatmap) */}
                    <div className="glass-panel p-5 rounded-2xl flex flex-col gap-5 border border-slate-800 lg:col-span-2">
                      <div className="flex justify-between items-center pb-1">
                        <div>
                          <h4 className="text-xs font-black tracking-wider text-slate-400 uppercase flex items-center gap-2">
                            <Activity className="w-4 h-4 text-blue-400" />
                            Live Diagnostic Indicators
                          </h4>
                          <span className="text-[10px] text-slate-500 uppercase font-bold font-mono">Real-time fusion vectors</span>
                        </div>
                        {selectedZone && (
                          <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded border ${
                            selectedZone.riskLevel === 'red' ? 'text-red-400 bg-red-950/60 border-red-500/30 animate-pulse' :
                            selectedZone.riskLevel === 'yellow' ? 'text-amber-400 bg-amber-950/60 border-amber-500/30' :
                            'text-emerald-400 bg-emerald-950/60 border-emerald-500/20'
                          }`}>
                            {selectedZone.name} : {selectedZone.riskLevel.toUpperCase()}
                          </span>
                        )}
                      </div>

                      {/* GRID - CONTROLS RESULTS */}
                      {selectedZone ? (
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                          
                          {/* Circle Gauge column */}
                          <div className={`md:col-span-5 flex flex-col items-center border p-4.5 rounded-xl transition ${getRiskBorder(selectedZone.riskLevel)}`}>
                            <div className="relative w-28 h-28 flex items-center justify-center">
                              <svg className="w-full h-full transform -rotate-90">
                                <circle cx="56" cy="56" r="44" className="stroke-slate-900 fill-none" strokeWidth="8"></circle>
                                <circle 
                                  cx="56" 
                                  cy="56" 
                                  r="44" 
                                  className={`fill-none stroke-current ${
                                    selectedZone.riskLevel === 'red' ? 'text-red-500' :
                                    selectedZone.riskLevel === 'yellow' ? 'text-amber-500' :
                                    'text-emerald-500'
                                  }`}
                                  strokeWidth="8"
                                  strokeDasharray={276}
                                  strokeDashoffset={276 - (276 * selectedZone.latestAssessment.riskScore) / 100}
                                ></circle>
                              </svg>
                              <div className="absolute text-center">
                                <span className="text-3xl font-black text-white font-mono">{selectedZone.latestAssessment.riskScore}</span>
                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">RISK RATE</p>
                              </div>
                            </div>

                            <span className={`text-[10px] font-black uppercase mt-3 tracking-widest ${
                              selectedZone.riskLevel === 'red' ? 'text-red-400' :
                              selectedZone.riskLevel === 'yellow' ? 'text-amber-400' :
                              'text-emerald-400'
                            }`}>
                              {selectedZone.riskLevel.toUpperCase()} LEVEL
                            </span>
                          </div>

                          {/* Mini interactive Heatmap overview */}
                          <div className="md:col-span-7 flex flex-col gap-2.5">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Interactive Zone Overview</span>
                            
                            <div className="relative bg-slate-955 border border-slate-850 rounded-xl overflow-hidden aspect-[16/10] p-2 flex flex-col justify-between">
                              {/* Mini A */}
                              <button 
                                onClick={() => setSelectedZoneId('zone-a')}
                                className={`absolute left-[4%] top-[10%] w-[42%] h-[36%] rounded border p-1.5 flex flex-col justify-between text-left cursor-pointer transition-[border-color,box-shadow,background-color] hover:border-purple-500 hover:shadow-[0_0_10px_rgba(168,85,247,0.25)] duration-200 ${
                                  selectedZoneId === 'zone-a' 
                                    ? 'border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.25)] bg-slate-900/60' 
                                    : zones.find(z => z.id === 'zone-a')?.riskLevel === 'red' ? 'pulse-red border-red-500/80 bg-red-950/20' :
                                      zones.find(z => z.id === 'zone-a')?.riskLevel === 'yellow' ? 'pulse-yellow border-amber-500/80 bg-amber-950/20' :
                                      'border-emerald-500/20 bg-emerald-950/5'
                                }`}
                              >
                                <div className="flex justify-between items-center w-full">
                                  <span className="text-[9px] font-black text-white tracking-tight leading-none">Zone A</span>
                                  {selectedZoneId === 'zone-a' && (
                                    <CheckCircle2 className="w-2.5 h-2.5 text-purple-405" />
                                  )}
                                </div>
                                <div className="flex justify-between items-center w-full mt-1">
                                  <span className="text-[8px] font-mono text-slate-400 font-bold leading-none">
                                    {zones.find(z => z.id === 'zone-a')?.latestAssessment?.riskScore ?? 0}%
                                  </span>
                                  {selectedZoneId === 'zone-a' && (
                                    <span className="text-[6px] text-purple-308 font-extrabold bg-purple-950/80 px-1 rounded">SEL</span>
                                  )}
                                </div>
                              </button>

                              {/* Mini B */}
                              <button 
                                onClick={() => setSelectedZoneId('zone-b')}
                                className={`absolute right-[4%] top-[10%] w-[42%] h-[36%] rounded border p-1.5 flex flex-col justify-between text-left cursor-pointer transition-[border-color,box-shadow,background-color] hover:border-purple-500 hover:shadow-[0_0_10px_rgba(168,85,247,0.25)] duration-200 ${
                                  selectedZoneId === 'zone-b' 
                                    ? 'border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.25)] bg-slate-900/60' 
                                    : zones.find(z => z.id === 'zone-b')?.riskLevel === 'red' ? 'pulse-red border-red-500/80 bg-red-950/20' :
                                      zones.find(z => z.id === 'zone-b')?.riskLevel === 'yellow' ? 'pulse-yellow border-amber-500/80 bg-amber-950/20' :
                                      'border-emerald-550/20 bg-emerald-950/5'
                                }`}
                              >
                                <div className="flex justify-between items-center w-full">
                                  <span className="text-[9px] font-black text-white tracking-tight leading-none font-sans">Zone B</span>
                                  {selectedZoneId === 'zone-b' && (
                                    <CheckCircle2 className="w-2.5 h-2.5 text-purple-405" />
                                  )}
                                </div>
                                <div className="flex justify-between items-center w-full mt-1">
                                  <span className="text-[8px] font-mono text-slate-400 font-bold leading-none">
                                    {zones.find(z => z.id === 'zone-b')?.latestAssessment?.riskScore ?? 0}%
                                  </span>
                                  {selectedZoneId === 'zone-b' && (
                                    <span className="text-[6px] text-purple-308 font-extrabold bg-purple-950/80 px-1 rounded">SEL</span>
                                  )}
                                </div>
                              </button>

                              {/* Mini C */}
                              <button 
                                onClick={() => setSelectedZoneId('zone-c')}
                                className={`absolute bottom-[10%] left-[4%] right-[4%] w-[92%] h-[34%] rounded border p-1.5 flex flex-row items-center justify-between text-left cursor-pointer transition-[border-color,box-shadow,background-color] hover:border-purple-500 hover:shadow-[0_0_10px_rgba(168,85,247,0.25)] duration-200 ${
                                  selectedZoneId === 'zone-c' 
                                    ? 'border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.25)] bg-slate-900/60' 
                                    : zones.find(z => z.id === 'zone-c')?.riskLevel === 'red' ? 'pulse-red border-red-500/80 bg-red-950/20' :
                                      zones.find(z => z.id === 'zone-c')?.riskLevel === 'yellow' ? 'pulse-yellow border-amber-500/80 bg-amber-955/20' :
                                      'border-emerald-500/20 bg-emerald-950/5'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-black text-white tracking-tight leading-none font-sans">Zone C</span>
                                  {selectedZoneId === 'zone-c' && (
                                    <CheckCircle2 className="w-2.5 h-2.5 text-purple-405" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {selectedZoneId === 'zone-c' && (
                                    <span className="text-[6px] text-purple-308 font-extrabold bg-purple-950/80 px-1 rounded mr-1">SELECTED</span>
                                  )}
                                  <span className="text-[8px] font-mono text-slate-400 font-bold leading-none">
                                    {zones.find(z => z.id === 'zone-c')?.latestAssessment?.riskScore ?? 0}%
                                  </span>
                                </div>
                              </button>
                            </div>
                          </div>

                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">Connecting telemetry layers...</p>
                      )}
                    </div>
                  </div>

                  {/* BOTTOM ROW: EXPLAINABLE AI, DIRECTIVES, TIMELINE, LOGS */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    
                    {/* SECTION 3: EXPLAINABLE AI - GROUNDED REASONS */}
                    {selectedZone ? (
                      <div className="lg:col-span-8 flex flex-col gap-6">
                        
                        {/* Grounded threat reasons */}
                        <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4">
                          <h4 className="text-xs font-black tracking-wide text-slate-350 uppercase flex items-center gap-2 pb-0.5 border-b border-slate-805">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            Grounded Threat Analysis (Explainable AI)
                          </h4>
                          <div className="flex flex-col gap-3 mt-1">
                            {selectedZone.latestAssessment.reasons.map((reason, i) => (
                              <div key={i} className="flex gap-3 items-start bg-slate-900/60 p-3.5 border border-slate-805 rounded-xl text-xs">
                                <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                                  selectedZone.riskLevel === 'red' ? 'text-red-404 animate-pulse' :
                                  selectedZone.riskLevel === 'yellow' ? 'text-amber-400' :
                                  'text-blue-400'
                                }`} />
                                <p className="text-slate-300 leading-relaxed">{reason}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* SOP Directives */}
                        <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4">
                          <h4 className="text-xs font-black tracking-wide text-slate-350 uppercase flex items-center gap-2 pb-0.5 border-b border-slate-805">
                            <CheckCircle2 className="w-4 h-4 text-emerald-450" />
                            Supervisor Actions & Standard Operating Procedures (SOPs)
                          </h4>
                          <div className="flex flex-col gap-3 mt-1">
                            {selectedZone.latestAssessment.recommendedActions.map((action, i) => (
                              <div key={i} className="flex gap-3 items-start bg-blue-955/20 p-3.5 border border-blue-900/25 rounded-xl text-xs">
                                <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                                <p className="text-blue-200 font-bold leading-relaxed">{action}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>
                    ) : (
                      <div className="lg:col-span-8 glass-panel p-10 rounded-2xl text-center text-slate-500">
                        Select a zone to load explanation overlays.
                      </div>
                    )}

                    {/* RISK TIMELINE & ASSESSMENT LOGS */}
                    <div className="lg:col-span-4 flex flex-col gap-6">
                      
                      {/* Risk Timeline */}
                      <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4">
                        <h4 className="text-xs font-black tracking-wide text-slate-400 uppercase flex items-center gap-2 border-b border-slate-850 pb-2.5">
                          <Clock className="w-4 h-4 text-purple-400" />
                          Risk Event Timeline
                        </h4>
                        
                        <div className="flex flex-col gap-4 relative pl-3.5 border-l border-slate-800 text-xs">
                          {selectedZone ? (
                            <>
                              <div className="relative">
                                <span className={`absolute -left-[19.5px] top-1 w-2.5 h-2.5 rounded-full border border-slate-950 ${
                                  selectedZone.riskLevel === 'red' ? 'bg-red-500 animate-ping' :
                                  selectedZone.riskLevel === 'yellow' ? 'bg-amber-400' : 'bg-emerald-500'
                                }`} />
                                <span className={`absolute -left-[19.5px] top-1 w-2.5 h-2.5 rounded-full border border-slate-950 ${
                                  selectedZone.riskLevel === 'red' ? 'bg-red-500' :
                                  selectedZone.riskLevel === 'yellow' ? 'bg-amber-400' : 'bg-emerald-500'
                                }`} />
                                <p className="font-bold text-white">Zone evaluation updated</p>
                                <p className="text-[10px] text-slate-450 mt-0.5">Assessed Risk Score: {selectedZone.latestAssessment.riskScore}%</p>
                                <span className="text-[9px] text-slate-550 block font-mono mt-0.5">Just now</span>
                              </div>

                              <div className="relative">
                                <span className="absolute -left-[19.5px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500 border border-slate-950" />
                                <p className="font-medium text-slate-300">SCADA Stream Synced</p>
                                <p className="text-[10px] text-slate-455 mt-0.5">Synchronized gas sensor registers</p>
                                <span className="text-[9px] text-slate-550 block font-mono mt-0.5">3 mins ago</span>
                              </div>

                              {selectedZone.activePermits.length > 0 ? (
                                <div className="relative">
                                  <span className="absolute -left-[19.5px] top-1 w-2.5 h-2.5 rounded-full bg-purple-500 border border-slate-950" />
                                  <p className="font-medium text-slate-355 font-bold">Active Work Permit logged</p>
                                  <p className="text-[10px] text-slate-500 mt-0.5">{selectedZone.activePermits[0].type} approved</p>
                                  <span className="text-[9px] text-slate-550 block font-mono mt-0.5">30 mins ago</span>
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <p className="text-slate-500">Awaiting stream triggers...</p>
                          )}
                        </div>
                      </div>

                      {/* Assessment Logs Console */}
                      <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4">
                        <h4 className="text-xs font-black tracking-wide text-slate-400 uppercase flex items-center gap-2 border-b border-slate-850 pb-2.5">
                          <Activity className="w-4 h-4 text-emerald-450" />
                          Platform Audit Log
                        </h4>

                        <div className="bg-slate-955/80 border border-slate-850 p-3 rounded-lg font-mono text-[10px] text-slate-350 leading-relaxed overflow-y-auto max-h-[160px] flex flex-col gap-2">
                          <p className="text-slate-505 font-bold">[{new Date().toLocaleTimeString()}] Cognitive assessment sync ...</p>
                          {selectedZone && selectedZone.latestAssessment.reasons.map((re, idx) => (
                            <p key={idx} className={selectedZone.riskLevel === 'red' ? 'text-red-400/90' : 'text-slate-400'}>
                              [{new Date().toLocaleTimeString()}] REASON: {re.substring(0, 35)}...
                            </p>
                          ))}
                          <p className="text-emerald-450 font-bold">[{new Date().toLocaleTimeString()}] Evaluator: central risk fusions OK</p>
                        </div>
                      </div>

                    </div>
                  </div>

                </div>
              )}

              {/* TAB 5: HEATMAP DETAILED PAGE */}
              {currentTab === 'heatmap' && (
                <div className="flex flex-col gap-5 text-left animate-[fadeIn_0.3s_ease-out]">
                  <div className="glass-panel p-5 rounded-2xl">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-850">
                      <div>
                        <h3 className="text-xs font-black tracking-wide text-slate-400 uppercase">Interactive Floor Layout Map</h3>
                        <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold">Vector SVG Layout Nodes</p>
                      </div>
                      <div className="flex gap-2">
                        {['zone-a', 'zone-b', 'zone-c'].map(id => (
                          <button
                            key={id}
                            onClick={() => setSelectedZoneId(id)}
                            className={`px-3 py-1 text-xs font-bold rounded border uppercase tracking-wider transition ${
                              selectedZoneId === id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {id.replace('-', ' ')}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col md:flex-row gap-6">
                      {/* Interactive SVG component */}
                      <div className="flex-1 bg-slate-950/80 border border-slate-805/80 rounded-2xl overflow-hidden aspect-[4/3] p-6 relative">
                                      {/* Confined Tank Farm (Zone A) */}
                        <button 
                          onClick={() => setSelectedZoneId('zone-a')}
                          className={`absolute left-[5%] top-[10%] w-[42%] h-[40%] rounded-lg transition-[border-color,box-shadow,background-color] border p-4 flex flex-col justify-between text-left cursor-pointer hover:border-purple-500 hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] duration-200 ${
                            selectedZoneId === 'zone-a' 
                              ? 'border-purple-550 shadow-[0_0_20px_rgba(168,85,247,0.25)] bg-slate-900/60' 
                              : zones.find(z => z.id === 'zone-a')?.riskLevel === 'red' ? 'pulse-red border-red-500/80 bg-red-950/40' :
                                zones.find(z => z.id === 'zone-a')?.riskLevel === 'yellow' ? 'pulse-yellow border-amber-500/80 bg-amber-955/40' :
                                'border-emerald-500/30 bg-emerald-950/15'
                          }`}
                        >
                          <div>
                            <div className="flex justify-between items-center w-full">
                              <p className="text-sm font-black text-white">Zone A</p>
                              {selectedZoneId === 'zone-a' && (
                                <div className="flex items-center gap-1 bg-purple-950 border border-purple-500/40 px-1.5 py-0.5 rounded text-[8px] font-bold text-purple-300 font-mono">
                                  <CheckCircle2 className="w-2.5 h-2.5 text-purple-405" />
                                  <span>SELECTED</span>
                                </div>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-405 font-bold uppercase mt-0.5">Tank Farm Area</p>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono font-black text-slate-205">
                              Risk: {zones.find(z => z.id === 'zone-a')?.latestAssessment?.riskScore ?? 0}%
                            </span>
                            <Activity className="w-4 h-4 text-slate-500" />
                          </div>
                        </button>

                        {/* Loading Dock / Assembly Area (Zone B) */}
                        <button 
                          onClick={() => setSelectedZoneId('zone-b')}
                          className={`absolute right-[5%] top-[10%] w-[42%] h-[40%] rounded-lg transition-[border-color,box-shadow,background-color] border p-4 flex flex-col justify-between text-left cursor-pointer hover:border-purple-500 hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] duration-200 ${
                            selectedZoneId === 'zone-b' 
                              ? 'border-purple-550 shadow-[0_0_20px_rgba(168,85,247,0.25)] bg-slate-900/60' 
                              : zones.find(z => z.id === 'zone-b')?.riskLevel === 'red' ? 'pulse-red border-red-500/80 bg-red-955/40' :
                                zones.find(z => z.id === 'zone-b')?.riskLevel === 'yellow' ? 'pulse-yellow border-amber-500/80 bg-amber-955/40' :
                                'border-emerald-500/30 bg-emerald-950/15'
                          }`}
                        >
                          <div>
                            <div className="flex justify-between items-center w-full">
                              <p className="text-sm font-black text-white">Zone B</p>
                              {selectedZoneId === 'zone-b' && (
                                <div className="flex items-center gap-1 bg-purple-950 border border-purple-500/40 px-1.5 py-0.5 rounded text-[8px] font-bold text-purple-300 font-mono">
                                  <CheckCircle2 className="w-2.5 h-2.5 text-purple-455" />
                                  <span>SELECTED</span>
                                </div>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-405 font-bold uppercase mt-0.5">Loading Dock Hub</p>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono font-black text-slate-205">
                              Risk: {zones.find(z => z.id === 'zone-b')?.latestAssessment?.riskScore ?? 0}%
                            </span>
                            <Activity className="w-4 h-4 text-slate-500" />
                          </div>
                        </button>

                        {/* Process Area (Zone C) */}
                        <button 
                          onClick={() => setSelectedZoneId('zone-c')}
                          className={`absolute bottom-[10%] left-[5%] right-[5%] w-[90%] h-[35%] rounded-lg transition-[border-color,box-shadow,background-color] border p-4 flex flex-row justify-between items-center text-left cursor-pointer hover:border-purple-500 hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] duration-200 ${
                            selectedZoneId === 'zone-c' 
                              ? 'border-purple-550 shadow-[0_0_20px_rgba(168,85,247,0.25)] bg-slate-900/60' 
                              : zones.find(z => z.id === 'zone-c')?.riskLevel === 'red' ? 'pulse-red border-red-500/80 bg-red-950/40' :
                                zones.find(z => z.id === 'zone-c')?.riskLevel === 'yellow' ? 'pulse-yellow border-amber-500/80 bg-amber-955/40' :
                                'border-emerald-500/30 bg-emerald-950/15'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-3">
                              <p className="text-sm font-black text-white">Zone C</p>
                              {selectedZoneId === 'zone-c' && (
                                <div className="flex items-center gap-1 bg-purple-950 border border-purple-500/40 px-1.5 py-0.5 rounded text-[8px] font-bold text-purple-300 font-mono">
                                  <CheckCircle2 className="w-2.5 h-2.5 text-purple-405" />
                                  <span>SELECTED</span>
                                </div>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-405 font-bold uppercase mt-0.5">Hydrocarbon Process Plant Area</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono font-black text-slate-202">
                              Assessment Score: {zones.find(z => z.id === 'zone-c')?.latestAssessment?.riskScore ?? 0}%
                            </span>
                            <Activity className="w-4 h-4 text-slate-550" />
                          </div>
                        </button>

                      </div>

                      {/* Selected zone details */}
                      <div className="w-full md:w-80 flex flex-col gap-4">
                        <div className="bg-slate-950/80 border border-slate-805 p-5 rounded-2xl">
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Active Workspace Selected</p>
                          <h4 className="text-lg font-black text-white mt-1.5">{selectedZone?.name}</h4>
                          <span className={`text-[9px] uppercase font-bold py-0.5 px-2 rounded mt-1 inline-block border ${
                            selectedZone?.riskLevel === 'red' ? 'text-red-405 border-red-500/20 bg-red-950/40' :
                            selectedZone?.riskLevel === 'yellow' ? 'text-amber-450 border-amber-500/20 bg-amber-950/40' :
                            'text-emerald-405 border-emerald-505/20 bg-emerald-950/40'
                          }`}>
                            {selectedZone?.riskLevel} Risk status
                          </span>

                          <div className="flex flex-col gap-2.5 mt-5 border-t border-slate-900 pt-4 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-450">Active Incident state</span>
                              <span className="font-bold text-white">{selectedZone?.riskLevel === 'red' ? 'Spike alert active' : 'Normal'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-455">Active permit count</span>
                              <span className="font-bold text-white font-mono">{selectedZone?.activePermits.length || 0} permits</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-455">Assigned safety officers</span>
                              <span className="font-bold text-white font-mono">2 Officers</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 6: INCIDENT CENTER DETAILED PAGE */}
              {currentTab === 'incident-center' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-left animate-[fadeIn_0.3s_ease-out]">
                  
                  {/* Left: Active Alerts & Stats */}
                  <div className="lg:col-span-5 flex flex-col gap-6">
                    {/* Active Warnings Log */}
                    <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4">
                      <h3 className="text-xs font-black tracking-wide text-slate-400 uppercase flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        Active Safety Alarms Log (CCTV / Sensor)
                      </h3>

                      <div className="flex flex-col gap-2 mt-1">
                        <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-855 flex flex-col gap-1 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="font-black text-white font-bold uppercase text-[10px]">Zone C pressure critical</span>
                            <span className="text-[8px] bg-red-950/60 text-red-500 border border-red-500/20 px-2 py-0.5 rounded font-mono font-bold">ALARM</span>
                          </div>
                          <p className="text-slate-405 text-[11px] leading-relaxed">Pressure telemetry exceeded normal thresholds (3.8 bar cutoff limit)</p>
                          <span className="text-[8px] text-slate-500 mt-1">Received 5 mins ago</span>
                        </div>

                        <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-850 flex flex-col gap-1 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="font-black text-white font-bold uppercase text-[10px]">Zone A PPE violation</span>
                            <span className="text-[8px] bg-amber-955/65 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded font-mono font-bold">WARNING</span>
                          </div>
                          <p className="text-slate-405 text-[11px] leading-relaxed">AI vision module detected 1 employee missing hard-helmet protection PPE</p>
                          <span className="text-[8px] text-slate-505 mt-1">Received 12 mins ago</span>
                        </div>
                      </div>
                    </div>

                    {/* Incident Statistics */}
                    <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4">
                      <h3 className="text-xs font-black tracking-wide text-slate-400 uppercase flex items-center gap-2">
                        <Layers className="w-4 h-4 text-emerald-450" />
                        Violation & event summaries (24h)
                      </h3>

                      <div className="space-y-3 bg-slate-955/60 border border-slate-850 p-4 rounded-xl">
                        {/* Bar 1 */}
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-400">PPE Hard Helmet Misses</span>
                            <span className="text-white font-mono font-medium">14 Alerts</span>
                          </div>
                          <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-blue-500 h-full rounded-full" style={{ width: '65%' }}></div>
                          </div>
                        </div>
                        {/* Bar 2 */}
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-400">Gas Alarm Threshold Exceedances</span>
                            <span className="text-white font-mono font-medium">3 Incidents</span>
                          </div>
                          <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-amber-505 h-full rounded-full" style={{ width: '25%' }}></div>
                          </div>
                        </div>
                        {/* Bar 3 */}
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-405">Confined boundaries Intrusions</span>
                            <span className="text-white font-mono font-medium">8 Violations</span>
                          </div>
                          <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-red-500 h-full rounded-full" style={{ width: '45%' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Permits */}
                  <div className="lg:col-span-7 flex flex-col gap-6">
                    <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4">
                      <div className="flex justify-between items-center border-b border-slate-850 pb-3">
                        <div>
                          <h3 className="text-xs font-black tracking-wide text-slate-404 uppercase flex items-center gap-2">
                            <FileSignature className="w-4 h-4 text-blue-400" />
                            Authorized permits lists
                          </h3>
                          <p className="text-[10px] text-slate-500 uppercase font-bold font-mono">Permitting security officer audit</p>
                        </div>
                        <button 
                          onClick={() => setShowPermitModal(true)}
                          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-2.5 px-3 py-2 text-xs font-bold transition flex items-center gap-1 active:scale-95 shadow"
                        >
                          <Plus className="w-3.5 h-3.5" /> Approve permit
                        </button>
                      </div>

                      {selectedZone ? (
                        permitsList.filter(p => p.zoneId === selectedZoneId).length > 0 ? (
                          <div className="flex flex-col gap-2.5">
                            {permitsList.filter(p => p.zoneId === selectedZoneId).map(permit => (
                              <div key={permit.id} className="flex justify-between items-center text-xs bg-slate-900/60 p-3 border border-slate-805 rounded-xl">
                                <div>
                                  <p className="font-bold text-white">{permit.type}</p>
                                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                                    Validity: {new Date(permit.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(permit.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[9px] uppercase font-bold py-0.5 px-2 rounded ${
                                    permit.status === 'active' ? 'bg-emerald-950 text-emerald-450 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'
                                  }`}>
                                    {permit.status}
                                  </span>
                                  {permit.status === 'active' && (
                                    <button 
                                      onClick={() => expirePermit(permit.id)}
                                      className="text-[10px] text-red-500 border border-red-500/30 bg-red-950/40 hover:bg-red-955/90 rounded px-2.5 py-1 transition font-bold"
                                    >
                                      Revoke
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-505 py-6 border border-dashed border-slate-800 rounded-xl text-center">
                            No permits exist for {selectedZone.name}. Click "Approve Permit" to issue.
                          </p>
                        )
                      ) : (
                        <p className="text-xs text-slate-550">Select a zone first.</p>
                      )}
                    </div>
                  </div>

                </div>
              )}

              {/* TAB 7: REPORTSDETAILED PAGE */}
              {currentTab === 'reports' && (
                <div className="flex flex-col gap-6 text-left animate-[fadeIn_0.3s_ease-out]">
                  <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-slate-850 pb-3">
                      <div>
                        <h3 className="text-xs font-black tracking-wide text-slate-405 uppercase">Safety Compliance reports & Auditing</h3>
                        <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold">Shift registers & PDF exports</p>
                      </div>
                      
                      {selectedZone && (
                        <button 
                          onClick={() => generatePDFReport(selectedZone)}
                          className="bg-blue-600 hover:bg-blue-700 active:scale-95 border border-blue-500/35 text-white rounded-lg p-2.5 px-4 text-xs font-bold transition flex items-center gap-1.5 shadow"
                        >
                          <FileText className="w-4 h-4 text-white" />
                          Generate Audit PDF
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                      <div className="bg-slate-950/60 p-4 border border-slate-808 rounded-2xl flex flex-col gap-3">
                        <p className="text-xs text-slate-400 font-bold uppercase">Supervisor Logs (Today's shift changes)</p>
                        <div className="flex flex-col gap-2 text-xs">
                          <div className="flex justify-between border-b border-slate-900 pb-2">
                            <div>
                              <p className="font-bold text-white">Day Shift register</p>
                              <p className="text-[10px] text-slate-500">M. Sterling, S. Patel (3 Supervisors)</p>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">08:00 - 16:00 (Completed)</span>
                          </div>
                          <div className="flex justify-between pb-1">
                            <div>
                              <p className="font-bold text-white">Night Shift Shift register</p>
                              <p className="text-[10px] text-slate-500">R. Davidson (2 Supervisors)</p>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">16:00 - 00:00 (Active)</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-950/60 p-4 border border-slate-808 rounded-2xl flex flex-col gap-3">
                        <p className="text-xs text-slate-400 font-bold uppercase">SafeSphere Platform Audit Code Verifications</p>
                        <div className="flex flex-col gap-2 font-mono text-[11px] text-slate-400 leading-relaxed bg-slate-955 p-2.5 rounded-lg border border-slate-900">
                          <p>ID: SS-AI-ASSESSMENT-09252</p>
                          <p>Risk Vector Fusions: 4 Channels OK</p>
                          <p>CCTV Vision channels: Frame ticks OK</p>
                          <p className="text-emerald-400 font-bold">Verification Hash: OK_SS_AI_CENTRAL_FUSE</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 9: AI SAFETY COPILOT CHAT PANEL */}
              {currentTab === 'copilot' && (
                <div className="glass-panel p-5 rounded-2xl flex flex-col h-[550px] md:h-[650px] animate-[fadeIn_0.3s_ease-out] text-left">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                    <div className="p-1 px-2.5 bg-blue-655/15 border border-blue-500/20 rounded-md">
                      <Sparkles className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white leading-none">Safety Copilot AI Assistant</h3>
                      <p className="text-[10px] text-slate-500 leading-none mt-1">Consulting Zone: {selectedZone?.name || 'Central'}</p>
                    </div>
                  </div>

                  {/* Messages feed */}
                  <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1 text-left">
                    {selectedZoneId && copilotMessages[selectedZoneId]?.map((msg) => (
                      <div 
                        key={msg.id} 
                        className={`flex flex-col max-w-[85%] rounded-lg p-2.5 text-xs ${
                          msg.sender === 'user' 
                            ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100 self-end ml-auto' 
                            : 'bg-slate-900 border border-slate-800/80 text-slate-200 self-start'
                        }`}
                      >
                        <p className="leading-relaxed whitespace-pre-line">{msg.text}</p>
                        <span className="text-[8px] text-slate-500 mt-1 text-right block">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="bg-slate-900 border border-slate-800 max-w-[85%] rounded-lg p-3 text-xs text-slate-404 self-start animate-pulse flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                        Analyzing telemetry vectors...
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Preloaded Suggestion Chips */}
                  <div className="flex flex-wrap gap-1 mb-3 pt-2 border-t border-slate-800/80">
                    <button 
                      onClick={() => sendSuggestion("Why is this zone unsafe?")}
                      className="text-[9px] bg-slate-900 border border-slate-800 text-slate-350 hover:bg-slate-850 rounded px-2.5 py-0.5 tracking-tight active:scale-95 transition"
                    >
                      Risk Analysis?
                    </button>
                    <button 
                      onClick={() => sendSuggestion("List active gas concentrations.")}
                      className="text-[9px] bg-slate-900 border border-slate-800 text-slate-350 hover:bg-slate-850 rounded px-2.5 py-0.5 tracking-tight active:scale-95 transition"
                    >
                      Check Gas Levels
                    </button>
                    <button 
                      onClick={() => sendSuggestion("Check worker helmet PPE compliance status.")}
                      className="text-[9px] bg-slate-900 border border-slate-808 text-slate-305 hover:bg-slate-850 rounded px-2.5 py-0.5 tracking-tight active:scale-95 transition"
                    >
                      PPE Violations?
                    </button>
                  </div>

                  {/* Input form */}
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Ask copilot about safety logs..." 
                      value={inputVal}
                      onChange={(e) => setInputVal(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendCopilotMessage()}
                      className="flex-1 glass-input text-xs rounded-lg px-3 py-2 text-white placeholder-slate-500"
                    />
                    <button 
                      onClick={sendCopilotMessage}
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-2.5 transition active:scale-95"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 10: SETTINGS PAGE */}
              {currentTab === 'settings' && (
                <div className="glass-panel p-5 rounded-2xl text-left animate-[fadeIn_0.3s_ease-out] flex flex-col gap-5">
                  <div>
                    <h3 className="text-xs font-black tracking-wide text-slate-400 uppercase">SafeSphere Platform Threshold configurations</h3>
                    <p className="text-[10px] text-slate-550 font-bold uppercase mt-1">Configure warning thresholds for simulated telemetry fields</p>
                  </div>

                  <div className="flex flex-col gap-4 max-w-lg mt-2">
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between text-xs font-bold text-slate-300">
                        <span>Gas Concentration Warning cap</span>
                        <span className="font-mono text-blue-400">50 ppm</span>
                      </div>
                      <input type="range" min="20" max="100" defaultValue="50" className="accent-blue-500 w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer" />
                    </div>

                    <div className="flex flex-col gap-2 mt-2">
                      <div className="flex justify-between text-xs font-bold text-slate-300">
                        <span>Temperature Warning limit</span>
                        <span className="font-mono text-blue-400">45°C</span>
                      </div>
                      <input type="range" min="30" max="80" defaultValue="45" className="accent-blue-500 w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer" />
                    </div>

                    <div className="bg-slate-950/80 p-4 border border-slate-850 rounded-xl text-xs mt-3 flex flex-col gap-1 text-slate-400">
                      <p><strong>SafeSphere Instance Version:</strong> v2.4-cognitive-fusion</p>
                      <p><strong>Socket connection endpoint:</strong> http://localhost:5000</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

        </main>
      </div>


{/* 3. SUBCOMPONENTS / MODALS */}
      {showPermitModal && selectedZone && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-sm rounded-2xl p-5 flex flex-col gap-4 animate-[scaleIn_0.2s_ease-out]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-base font-bold text-white">Approve Work Permit</h4>
              <button 
                onClick={() => setShowPermitModal(false)}
                className="text-slate-400 hover:text-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={createPermit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1 text-left">
                <label className="text-[11px] text-slate-400 font-bold uppercase">Zone Location</label>
                <p className="text-sm text-white font-mono bg-slate-950 px-2.5 py-1 rounded border border-slate-800 mt-1">{selectedZone.name}</p>
              </div>

              <div className="flex flex-col gap-1 text-left">
                <label className="text-[11px] text-slate-400 font-bold uppercase">Permit Hazard Designation</label>
                <select 
                  value={newPermitType}
                  onChange={(e) => setNewPermitType(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs text-white rounded p-2 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  <option value="Hot Work">Hot Work Permit (Welding / Cutting)</option>
                  <option value="Confined Space Entry">Confined Space Entry Permit (Enclosed Vessel)</option>
                  <option value="Electrical Lockout/Tagout">Electrical Isolation (LOTO)</option>
                  <option value="Chemical Transfer Isolation">Chemical Transfer Line Clearance</option>
                </select>
              </div>

              <div className="flex flex-col gap-1 text-left">
                <label className="text-[11px] text-slate-400 font-bold uppercase">Duration Window (hours)</label>
                <input 
                  type="number" min="1" max="12"
                  value={newPermitDuration}
                  onChange={(e) => setNewPermitDuration(parseInt(e.target.value))}
                  className="bg-slate-950 border border-slate-800 text-xs text-white rounded p-2 outline-none"
                />
              </div>

              <button 
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 mt-2 text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" /> Formally Approve & Issue
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
