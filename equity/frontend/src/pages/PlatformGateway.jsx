import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bot, Terminal, Activity, ArrowRight, Sparkles, Cpu, Zap, Network, Brain } from 'lucide-react';

const PlatformGateway = ({ onNavigate }) => {
  const [bootText, setBootText] = useState('');
  const fullText = "INITIALIZING QUANT TRADING BOT...";
  const [isReady, setIsReady] = useState(false);

  // Typewriter effect for boot text
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setBootText(fullText.substring(0, i));
      i++;
      if (i > fullText.length) {
        clearInterval(interval);
        setTimeout(() => setIsReady(true), 500); // Small pause before revealing UI
      }
    }, 40);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-[#050505] flex flex-col items-center justify-center overflow-hidden font-mono text-white">
      {/* Background Matrix / Grid effect */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
           style={{
             backgroundImage: `linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)`,
             backgroundSize: '40px 40px',
             backgroundPosition: 'center center'
           }}
      />
      
      {/* Subtle radial glow representing the core */}
      <motion.div 
        animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-900/20 rounded-full blur-[100px] pointer-events-none"
      />

      <div className="relative z-10 flex flex-col items-center w-full max-w-4xl px-8">
        
        {/* Autonomous Patrolling Sentry Robot */}
        <motion.div 
          className="absolute top-1/4 left-1/2 -ml-[56px] z-20 pointer-events-none"
          animate={{
            x: ["-40vw", "40vw", "-40vw"],
            y: [0, -40, 20, -40, 0],
            rotateY: [0, 0, 180, 180, 0] // Flips the robot so it faces the direction it's flying
          }}
          transition={{
            duration: 18,
            ease: "easeInOut",
            repeat: Infinity,
            times: [0, 0.45, 0.5, 0.95, 1] // Turn around exactly at the edges
          }}
        >
          <motion.div
            animate={{ y: [-10, 10, -10] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="relative flex items-center justify-center scale-75"
          >
            {/* Sentry Rings */}
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              className="absolute w-48 h-48 border-[2px] border-dashed border-red-500/40 rounded-full" />
            <motion.div animate={{ rotate: -360 }} transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              className="absolute w-36 h-36 border-t-4 border-l-4 border-[#FFB81C]/60 rounded-full" />

            {/* The Bot Hexagon Core */}
            <div className="w-28 h-28 bg-[#0a0a0a] border border-[#FFB81C]/50 rounded-xl flex items-center justify-center shadow-[0_0_50px_rgba(255,184,28,0.3)] relative overflow-hidden backdrop-blur-sm">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/20 to-[#FFB81C]/20" />
              <Bot size={58} className="text-[#FFB81C] relative z-10 drop-shadow-[0_0_15px_rgba(255,184,28,0.9)]" />
              <motion.div
                animate={{ y: ['-100%', '200%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                className="absolute left-0 right-0 h-1 bg-red-500 shadow-[0_0_20px_red] z-20"
              />
            </div>
          </motion.div>
          {/* Tracking Spotlight on the floor below the sentry */}
          <motion.div 
            className="w-48 h-10 mt-[250px] bg-red-500/10 blur-[20px] rounded-[100%] mx-auto -z-10"
          />
        </motion.div>

        {/* Boot text terminal - Pushed down slightly to make room for sweeping sentry */}
        <div className="h-8 mt-[140px] mb-12 flex items-center justify-center gap-3">
          <Terminal size={16} className="text-red-500" />
          <span className="text-[13px] tracking-[0.3em] font-black text-white/80 uppercase">
            {bootText}
            <motion.span 
              animate={{ opacity: [1, 0] }} 
              transition={{ repeat: Infinity, duration: 0.8 }}
            >_</motion.span>
          </span>
        </div>

        {/* Project Selection / Buttons - Only show when ready */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: isReady ? 1 : 0, scale: isReady ? 1 : 0.95, y: isReady ? 0 : 20 }}
          transition={{ duration: 0.6 }}
          className="w-full grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {/* Lead-Lag Module */}
          <button 
            disabled={!isReady}
            onClick={() => onNavigate('dashboard')}
            className="group relative text-left t-card border border-red-500/20 hover:border-red-500/60 bg-[#0a0a0a] hover:bg-[#110a0a] rounded-2xl p-8 overflow-hidden transition-all duration-300 transform hover:-translate-y-2 hover:shadow-[0_10px_40px_-10px_rgba(239,68,68,0.3)]"
          >
            {/* Card Background Glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-500/10 blur-[50px] rounded-full group-hover:bg-red-500/20 transition-all duration-500" />
            
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <Network className="text-red-500" size={24} />
              </div>
              <h2 className="text-xl font-black tracking-widest uppercase mb-2 group-hover:text-red-400 transition-colors">Lead-Lag Analytics</h2>
              <p className="text-[11px] text-gray-400 font-sans tracking-wide leading-relaxed mb-6">
                Cross-asset Granger causality, leadership topology logic, and statistical anomaly validation center. 
              </p>
              
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-red-500/80 group-hover:text-red-500 transition-colors">
                Initialize Module <ArrowRight size={12} className="group-hover:translate-x-1 border-red-500 transition-transform" />
              </div>
            </div>
          </button>

          {/* FX Technical Engine Module */}
          <button 
            disabled={!isReady}
            onClick={() => onNavigate('fx-command')}
            className="group relative text-left t-card border border-[#FFB81C]/20 hover:border-[#FFB81C]/60 bg-[#0a0a0a] hover:bg-[#151105] rounded-2xl p-8 overflow-hidden transition-all duration-300 transform hover:-translate-y-2 hover:shadow-[0_10px_40px_-10px_rgba(255,184,28,0.2)]"
          >
            {/* Card Background Glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#FFB81C]/10 blur-[50px] rounded-full group-hover:bg-[#FFB81C]/20 transition-all duration-500" />
            
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-xl bg-[#FFB81C]/10 border border-[#FFB81C]/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <Cpu className="text-[#FFB81C]" size={24} />
              </div>
              <h2 className="text-xl font-black tracking-widest uppercase mb-2 group-hover:text-[#FFB81C] transition-colors">Equity Indices Platform</h2>
              <p className="text-[11px] text-gray-400 font-sans tracking-wide leading-relaxed mb-6">
                Algorithmic regime optimization, high-frequency backtest running, and equity index parameter calibration matrix.
              </p>
              
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-[#FFB81C]/80 group-hover:text-[#FFB81C] transition-colors">
                Initialize Module <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          {/* NLP Sentiment Engine Module */}
          <button
            disabled={!isReady}
            onClick={() => onNavigate('nlp-command')}
            className="group relative text-left t-card border border-emerald-500/20 hover:border-emerald-500/60 bg-[#0a0a0a] hover:bg-[#091109] rounded-2xl p-8 overflow-hidden transition-all duration-300 transform hover:-translate-y-2 hover:shadow-[0_10px_40px_-10px_rgba(16,185,129,0.2)]"
          >
            {/* Card Background Glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 blur-[50px] rounded-full group-hover:bg-emerald-500/20 transition-all duration-500" />

            <div className="relative z-10">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <Brain className="text-emerald-400" size={24} />
              </div>
              <h2 className="text-xl font-black tracking-widest uppercase mb-2 group-hover:text-emerald-400 transition-colors">NLP Sentiment Engine</h2>
              <p className="text-[11px] text-gray-400 font-sans tracking-wide leading-relaxed mb-6">
                FinBERT + GPT-4o news pipeline, transfer entropy signals, IC analysis, and Polymarket intelligence fusion.
              </p>

              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-emerald-500/80 group-hover:text-emerald-400 transition-colors">
                Initialize Module <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

        </motion.div>

        {/* Status bar */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: isReady ? 1 : 0 }}
          transition={{ delay: 0.5, duration: 1 }}
          className="mt-12 flex justify-center text-[8px] font-black tracking-widest uppercase text-gray-600 gap-8"
        >
          <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"/> Engine status: Online</span>
          <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"/> Core Temp: Optimal</span>
          <span className="flex items-center gap-2"><Sparkles size={10} className="text-[#FFB81C]"/> QUANT TERMINAL v3.0</span>
        </motion.div>
      </div>
    </div>
  );
};

export default PlatformGateway;
