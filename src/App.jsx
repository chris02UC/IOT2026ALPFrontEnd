// src/App.jsx
import React, { useState, useEffect } from 'react';
import { database } from './firebase';
import { ref, query, limitToLast, onValue } from 'firebase/database'; 
import { Waves, ShieldCheck, Flame, Activity, Clock, Calendar } from 'lucide-react';

function App() {
  // Store the raw pulls from both database folders
  const [latestAlertSnap, setLatestAlertSnap] = useState(null);
  const [latestSafeSnap, setLatestSafeSnap] = useState(null);
  const [loading, setLoading] = useState(true);

  // System Configuration Constraints
  const MAX_CAPACITY_CM = 40; // Max depth of your prototype simulation container
  const FLOOD_THRESHOLD_CM = 35; // The critical height limit

  useEffect(() => {
    // 1. Setup queries for BOTH folders
    const alertsQuery = query(ref(database, 'alerts'), limitToLast(1));
    const safeQuery = query(ref(database, 'safe_logs'), limitToLast(1));

    console.log("⚡ Connecting dual-listeners to /alerts and /safe_logs...");

    // 2. Attach listener to /alerts
    const unsubAlerts = onValue(alertsQuery, (snapshot) => {
      if (snapshot.exists()) setLatestAlertSnap(snapshot.val());
      setLoading(false);
    });

    // 3. Attach listener to /safe_logs
    const unsubSafe = onValue(safeQuery, (snapshot) => {
      if (snapshot.exists()) setLatestSafeSnap(snapshot.val());
      setLoading(false);
    });

    return () => {
      unsubAlerts();
      unsubSafe();
    };
  }, []);

  // --- LOGIC: Figure out which event happened most recently ---
  let activeRecord = null;
  let activeDebugPath = "Awaiting Data...";

  const alertKeys = latestAlertSnap ? Object.keys(latestAlertSnap) : [];
  const safeKeys = latestSafeSnap ? Object.keys(latestSafeSnap) : [];

  const aKey = alertKeys.length > 0 ? alertKeys[0] : "";
  const sKey = safeKeys.length > 0 ? safeKeys[0] : "";

  // Firebase Push IDs are strictly chronological. We can compare them as strings to find the newest!
  if (aKey && sKey) {
    if (aKey > sKey) {
      activeRecord = latestAlertSnap[aKey];
      activeDebugPath = `/alerts/${aKey}`;
    } else {
      activeRecord = latestSafeSnap[sKey];
      activeDebugPath = `/safe_logs/${sKey}`;
    }
  } else if (aKey) {
    activeRecord = latestAlertSnap[aKey];
    activeDebugPath = `/alerts/${aKey}`;
  } else if (sKey) {
    activeRecord = latestSafeSnap[sKey];
    activeDebugPath = `/safe_logs/${sKey}`;
  }

  // --- PARSE DATA FOR UI ---
  // Default fallbacks if no data exists yet
  let waterHeight = 0;
  let riseSpeedMin = 0;
  let status = "SAFE";
  let eta = 0;
  let timestamp = "-";

  if (activeRecord) {
    // 1. Extract new JSON keys mapping to your updated ESP32 code
    const rawDistance = activeRecord.water_to_sensor_distance_cm || 0;
    const riseSpeedSec = activeRecord.rise_speed_cm_s || 0;
    status = activeRecord.status || "SAFE"; // "POTENTIAL_FLOOD" or "SAFE"
    timestamp = activeRecord.timestamp || "-";

    // 2. Math Conversions
    waterHeight = Math.max(0, MAX_CAPACITY_CM - rawDistance);
    riseSpeedMin = parseFloat((riseSpeedSec * 60).toFixed(2));

    // 3. ETA Calculation (Only matters if we are in a flood state)
    if (status === "POTENTIAL_FLOOD" && riseSpeedMin > 0 && waterHeight < FLOOD_THRESHOLD_CM) {
      eta = Math.ceil((FLOOD_THRESHOLD_CM - waterHeight) / riseSpeedMin);
    }
  }

  // --- THEME ENGINE ---
  const isDanger = status === "POTENTIAL_FLOOD";
  const theme = {
    bg: isDanger ? 'bg-red-50' : 'bg-green-50',
    border: isDanger ? 'border-red-200' : 'border-green-200',
    text: isDanger ? 'text-red-700' : 'text-green-700',
    icon: isDanger ? <Flame className="w-6 h-6 text-red-600 animate-pulse" /> : <ShieldCheck className="w-6 h-6 text-green-600" />,
    badgeStr: isDanger ? 'EMERGENCY STATE' : 'MONITORING SECURE'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Synchronizing Event States...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-12 font-sans">
      <header className="bg-blue-700 text-white shadow-md py-6 mb-8">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Waves className="w-8 h-8 text-blue-200" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Smart Flood Early Warning System</h1>
              <p className="text-sm text-blue-200 font-medium">Event-Driven Telemetry Protocol</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 bg-blue-800 px-4 py-2 rounded-lg text-xs font-mono tracking-wider text-blue-300">
            <span className={`w-2 h-2 rounded-full ${isDanger ? 'bg-red-500 animate-pulse' : 'bg-green-400'}`}></span>
            <span>{theme.badgeStr}</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4">
        {/* Core Binary Status Alert Banner */}
        <div className={`mb-8 p-6 rounded-2xl border ${theme.bg} ${theme.border} flex items-start space-x-4 shadow-sm transition-colors duration-500`}>
          <div className="p-3 bg-white rounded-xl shadow-xs">
            {theme.icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Hardware State Trigger</h2>
              <span className="flex items-center text-xs font-mono text-slate-400 bg-white/80 px-2 py-1 rounded border border-slate-200">
                <Calendar className="w-3.5 h-3.5 mr-1" /> {timestamp}
              </span>
            </div>
            <p className={`text-3xl font-black tracking-tight mt-1 ${theme.text}`}>
              {status.replace('_', ' ')}
            </p>
            {isDanger && (
              <div className="mt-4 bg-white/60 backdrop-blur-xs p-3 rounded-lg border border-red-100 text-sm text-red-900 font-medium">
                ⚠️ Critical rise velocity detected. Hardware locked into flood monitoring phase.
              </div>
            )}
          </div>
        </div>

        {/* Telemetry Metric Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          
          <div className={`bg-white p-6 rounded-2xl border ${isDanger ? 'border-red-100' : 'border-slate-200'} shadow-xs flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Peak Water Height</span>
                <Waves className="w-5 h-5 text-blue-500" />
              </div>
              <p className="text-4xl font-extrabold text-slate-900 tracking-tight">
                {waterHeight.toFixed(1)} <span className="text-xl font-medium text-slate-400">cm</span>
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400 font-medium">
              Height recorded at the moment of the state change.
            </div>
          </div>

          <div className={`bg-white p-6 rounded-2xl border ${isDanger ? 'border-red-100' : 'border-slate-200'} shadow-xs flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Trigger Velocity</span>
                <Activity className="w-5 h-5 text-indigo-500" />
              </div>
              <p className="text-4xl font-extrabold text-slate-900 tracking-tight">
                {riseSpeedMin} <span className="text-xl font-medium text-slate-400">cm/min</span>
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400 font-medium">
              Calculated speed that forced the event trigger.
            </div>
          </div>

          <div className={`bg-white p-6 rounded-2xl border ${isDanger ? 'border-red-100' : 'border-slate-200'} shadow-xs flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Estimated Arrival</span>
                <Clock className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-4xl font-extrabold text-slate-900 tracking-tight">
                {!isDanger ? (
                  <span className="text-2xl font-bold text-emerald-600">Stable</span>
                ) : (
                  <>
                    {eta} <span className="text-xl font-medium text-slate-400">mins</span>
                  </>
                )}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400 font-medium">
              Projection based on velocity at the time of trigger.
            </div>
          </div>

        </div>

        {/* Live Event Stream Debugger */}
        <div className="bg-slate-900 text-slate-200 p-6 rounded-2xl font-mono text-xs shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
            <span className="text-red-400 font-bold tracking-wider">🚨 LATEST STATE TRANSITION DATA:</span>
            <span className="text-emerald-400">Winning Path: {activeDebugPath}</span>
          </div>
          <pre className="bg-slate-950 p-4 rounded-lg overflow-x-auto text-sky-300 border border-slate-800">
            {activeRecord ? JSON.stringify(activeRecord, null, 2) : "Awaiting hardware event triggers..."}
          </pre>
        </div>
      </main>
    </div>
  );
}

export default App;