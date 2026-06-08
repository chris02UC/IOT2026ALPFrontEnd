// src/App.jsx
import React, { useState, useEffect } from 'react';
import { database } from './firebase';
import { ref, query, limitToLast, onValue } from 'firebase/database'; 
import { Waves, ShieldCheck, AlertTriangle, Flame, Activity, Clock, Calendar } from 'lucide-react';

function App() {
  const [metrics, setMetrics] = useState({
    water_height: 0,
    rate_of_rise_min: 0,
    status: 'AMAN',
    eta: 0,
    timestamp: '-'
  });
  const [loading, setLoading] = useState(true);
  const [rawDebug, setRawDebug] = useState("");

  // System Configuration Constraints from your project documentation
  const MAX_CAPACITY_CM = 40; // Max depth of your prototype simulation container
  const FLOOD_THRESHOLD_CM = 35; // The critical height limit where flooding triggers

  useEffect(() => {
    // 1. Point directly to the exact folder path your ESP32 is pushing to
    const alertsRef = ref(database, 'alerts'); 
    const latestAlertQuery = query(alertsRef, limitToLast(1));

    console.log("⚡ Connecting live to SFEWS /alerts node...");

    const unsubscribe = onValue(latestAlertQuery, (snapshot) => {
      if (snapshot.exists()) {
        const payload = snapshot.val();
        setRawDebug(JSON.stringify(payload, null, 2));

        // Isolate the newest unique alphanumeric entry ID key
        const keys = Object.keys(payload);
        const latestKey = keys[keys.length - 1];
        const record = payload[latestKey];

        if (record) {
          // Extract data using the exact variable names from your ESP32 sketch
          const rawDistance = record.water_height_cm || 0;
          const riseSpeedSec = record.rise_speed_cm_s || 0;
          const timeStr = record.timestamp || '-';

          /* NOTE: Ultrasonic sensors measure distance from the top down.
             Actual Water Height = Total Container Depth - Distance to Surface.
             If your sensor output is already pre-converted to water height, change this line to: 
             const actualWaterHeight = rawDistance;
          */
          const actualWaterHeight = Math.max(0, MAX_CAPACITY_CM - rawDistance);

          // Convert cm/s from ESP32 to cm/min to match your paper's formula spec
          const riseSpeedMin = parseFloat((riseSpeedSec * 60).toFixed(2));

          // Calculate Rule-Based Tiers based on your document logic (% of Capacity)
          const fillPercentage = (actualWaterHeight / MAX_CAPACITY_CM) * 100;
          let currentStatus = 'AMAN';

          if (fillPercentage >= 85) {
            currentStatus = 'BAHAYA';
          } else if (fillPercentage >= 60) {
            currentStatus = 'SIAGA';
          } else if (fillPercentage >= 30) {
            currentStatus = 'WASPADA';
          } else {
            currentStatus = 'AMAN';
          }

          // Calculate Estimated Time Window (ETA) to Flood in minutes
          let calculatedEta = 0;
          if (riseSpeedMin > 0 && actualWaterHeight < FLOOD_THRESHOLD_CM) {
            calculatedEta = Math.ceil((FLOOD_THRESHOLD_CM - actualWaterHeight) / riseSpeedMin);
          }

          setMetrics({
            water_height: parseFloat(actualWaterHeight.toFixed(1)),
            rate_of_rise_min: riseSpeedMin,
            status: currentStatus,
            eta: calculatedEta,
            timestamp: timeStr
          });
        }
      } else {
        setRawDebug("No data found inside the '/alerts' path yet. Ensure your ESP32 is running and triggering alerts!");
      }
      setLoading(false);
    }, (error) => {
      console.error("Firebase subscription issue:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getStatusStyles = (status) => {
    switch (status) {
      case 'WASPADA':
        return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: <AlertTriangle className="w-6 h-6 text-yellow-600" /> };
      case 'SIAGA':
        return { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: <AlertTriangle className="w-6 h-6 text-orange-600" /> };
      case 'BAHAYA':
        return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: <Flame className="w-6 h-6 text-red-600" /> };
      case 'AMAN':
      default:
        return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: <ShieldCheck className="w-6 h-6 text-green-600" /> };
    }
  };

  const currentStyle = getStatusStyles(metrics.status);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium font-sans">Connecting to SFEWS Networks...</p>
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
              <p className="text-sm text-blue-200 font-medium">Real-Time Frontend Client UI</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 bg-blue-800 px-4 py-2 rounded-lg text-xs font-mono tracking-wider text-blue-300">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-ping"></span>
            <span>LIVE INTERFACE ACTIVE</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4">
        {/* Risk Assessment Summary Alert Banner */}
        <div className={`mb-8 p-6 rounded-2xl border ${currentStyle.bg} ${currentStyle.border} flex items-start space-x-4 shadow-sm`}>
          <div className="p-3 bg-white rounded-xl shadow-xs">
            {currentStyle.icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Current Flood Risk Assessment</h2>
              <span className="flex items-center text-xs font-mono text-slate-400 bg-white/80 px-2 py-1 rounded border border-slate-200">
                <Calendar className="w-3.5 h-3.5 mr-1" /> {metrics.timestamp}
              </span>
            </div>
            <p className={`text-3xl font-black tracking-tight mt-1 ${currentStyle.text}`}>
              STATUS: {metrics.status}
            </p>
          </div>
        </div>

        {/* Core Metrics Content Display Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          
          {/* Telemetry Metric Card 1: Computed Water Depth */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Water Height Level</span>
                <Waves className="w-5 h-5 text-blue-500" />
              </div>
              <p className="text-4xl font-extrabold text-slate-900 tracking-tight">
                {metrics.water_height} <span className="text-xl font-medium text-slate-400">cm</span>
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400 font-medium">
              Calculated height from prototype surface floor level.
            </div>
          </div>

          {/* Telemetry Metric Card 2: Speed Conversion Profile */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Velocity Change</span>
                <Activity className="w-5 h-5 text-indigo-500" />
              </div>
              <p className="text-4xl font-extrabold text-slate-900 tracking-tight">
                {metrics.rate_of_rise_min} <span className="text-xl font-medium text-slate-400">cm/min</span>
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400 font-medium">
              Scaled conversion tracking rate of volumetric expansion.
            </div>
          </div>

          {/* Telemetry Metric Card 3: Derived Prediction ETA */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Estimated Arrival Window</span>
                <Clock className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-4xl font-extrabold text-slate-900 tracking-tight">
                {metrics.rate_of_rise_min <= 0 ? (
                  <span className="text-2xl font-bold text-emerald-600">Stable</span>
                ) : (
                  <>
                    {metrics.eta} <span className="text-xl font-medium text-slate-400">mins</span>
                  </>
                )}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400 font-medium">
              Estimated minutes left before breaching your flood limit.
            </div>
          </div>

        </div>

        {/* Live Debug Console Monitor Pane */}
        <div className="bg-slate-900 text-slate-200 p-6 rounded-2xl font-mono text-xs shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
            <span className="text-red-400 font-bold tracking-wider">🚨 LIVE HARDWARE DATA STREAM INSPECTOR:</span>
            <span className="text-slate-500">Firebase Path: "/alerts"</span>
          </div>
          <pre className="bg-slate-950 p-4 rounded-lg overflow-x-auto text-green-400 border border-slate-800">
            {rawDebug}
          </pre>
        </div>
      </main>
    </div>
  );
}

export default App;