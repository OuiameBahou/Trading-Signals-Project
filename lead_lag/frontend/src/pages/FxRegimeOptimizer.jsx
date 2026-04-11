import React, { useState } from 'react';
import axios from 'axios';
import { Play, Loader2, AlertCircle, Compass, Trophy, Target } from 'lucide-react';
import PairSelector from '../components/PairSelector';

const fmt = (n, d = 4) => (typeof n === 'number' && !isNaN(n)) ? n.toFixed(d) : '—';
const ALL_IND = ['BB', 'RSI', 'MACD', 'SO', 'SAR', 'EMA'];

const getPairConfig = (pairName) => {
  const f = (pairName || '').toUpperCase();
  if (f.includes('JPY')) return { epsMin: 0.1,    epsMax: 5.0,  steps: 20 };
  if (f.includes('CAD')) return { epsMin: 0.001,  epsMax: 0.1,  steps: 20 };
  if (f.includes('GBP')) return { epsMin: 0.0001, epsMax: 0.01, steps: 20 };
  if (f.includes('NZD')) return { epsMin: 0.0001, epsMax: 0.02, steps: 20 };
  if (f.includes('AUD')) return { epsMin: 0.0001, epsMax: 0.02, steps: 20 };
  if (f.includes('CHF')) return { epsMin: 0.0001, epsMax: 0.05, steps: 20 };
  if (f.includes('EUR')) return { epsMin: 0.001,  epsMax: 0.1,  steps: 20 };
  return                        { epsMin: 0.0001, epsMax: 0.1,  steps: 20 };
};

/* ── Heatmap cell colour ──────────────────────────────────────────────────── */
const cellColor = (value, min, max) => {
  if (value == null) return 'var(--border-secondary)';
  const t = max === min ? 0.5 : (value - min) / (max - min);
  if (t < 0.5) {
    const s = t * 2;
    return `rgba(${Math.round(239 - 229 * s)}, ${Math.round(68 + 115 * s)}, 68, 0.85)`;
  } else {
    const s = (t - 0.5) * 2;
    return `rgba(${Math.round(10 + 240 * (1 - s))}, ${Math.round(183 - 3 * s)}, ${Math.round(68 * (1 - s) + 86 * s)}, 0.85)`;
  }
};

/* ── Heatmap component ───────────────────────────────────────────────────── */
const Heatmap = ({ grid, thetaValues, epsValues, bestTheta, bestEps }) => {
  const [hovered, setHovered] = useState(null);
  if (!grid?.length || !thetaValues?.length || !epsValues?.length) return null;

  const flat = grid.flat().filter(v => v != null);
  const min = Math.min(...flat);
  const max = Math.max(...flat);

  const cellW = Math.max(36, Math.min(64, Math.floor(600 / thetaValues.length)));
  const cellH = Math.max(24, Math.min(36, Math.floor(340 / epsValues.length)));

  return (
    <div className="relative overflow-auto">
      <div className="text-[8px] t-text-m font-black uppercase tracking-widest mb-2 text-center">
        θ (vote threshold) →
      </div>
      <div className="flex">
        <div className="flex items-center justify-center" style={{ width: 52, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          <span className="text-[8px] t-text-m font-black uppercase tracking-widest">ε (trend slope) →</span>
        </div>
        <div>
          <div className="flex mb-1">
            {thetaValues.map((t, j) => (
              <div key={j} style={{ width: cellW }} className="text-center text-[8px] t-text-m font-mono font-bold">
                {t.toFixed(2)}
              </div>
            ))}
          </div>
          {grid.map((row, i) => (
            <div key={i} className="flex items-center">
              {row.map((val, j) => {
                const isBest = Math.abs(thetaValues[j] - bestTheta) < 1e-6 &&
                               Math.abs(epsValues[i] - bestEps) < 1e-6;
                const isHovered = hovered?.i === i && hovered?.j === j;
                return (
                  <div key={j}
                    style={{ width: cellW, height: cellH, background: cellColor(val, min, max),
                      ...(isBest ? { boxShadow: '0 0 0 3px #FFB81C, 0 0 12px rgba(255,184,28,0.5)' } : {}) }}
                    className={`flex items-center justify-center cursor-default transition-all rounded-[3px] m-[0.5px]
                                ${isBest ? 'z-10 relative scale-105' : ''}
                                ${isHovered ? 'ring-1 ring-white/50 z-10' : ''}`}
                    onMouseEnter={() => setHovered({ i, j, val, theta: thetaValues[j], eps: epsValues[i] })}
                    onMouseLeave={() => setHovered(null)}>
                    {cellH >= 24 && (
                      <span className="text-[7px] font-mono font-black text-white/80 select-none drop-shadow-sm">
                        {val != null ? val.toFixed(1) : '—'}
                      </span>
                    )}
                  </div>
                );
              })}
              <div style={{ width: 70 }} className="pl-2 text-[8px] font-mono t-text-m font-bold">
                {epsValues[i]?.toFixed(4)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hover tooltip */}
      {hovered && (
        <div className="absolute top-4 right-4 t-card border t-border-s rounded-xl px-4 py-3 shadow-2xl z-20 pointer-events-none">
          <div className="text-[8px] font-black uppercase tracking-widest t-text-m mb-2">Cell Detail</div>
          <div className="space-y-1 font-mono text-[10px]">
            <div className="flex justify-between gap-4">
              <span className="t-text-m">θ</span>
              <span className="font-black text-[#FFB81C]">{hovered.theta?.toFixed(3)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="t-text-m">ε</span>
              <span className="font-black text-[#FFB81C]">{hovered.eps?.toFixed(5)}</span>
            </div>
            <div className="flex justify-between gap-4 pt-1 border-t t-border-s">
              <span className="t-text-m">Return</span>
              <span className={`font-black ${(hovered.val ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmt(hovered.val, 2)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Legend bar */}
      <div className="flex items-center gap-3 mt-3">
        <span className="text-[8px] t-text-m font-bold">Low</span>
        <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{
          background: 'linear-gradient(to right, rgba(239,68,68,0.85), rgba(251,191,36,0.85), rgba(16,185,129,0.85))'
        }} />
        <span className="text-[8px] t-text-m font-bold">High</span>
        <span className="text-[8px] t-text-m ml-1 font-bold uppercase tracking-wider">Return %</span>
      </div>
    </div>
  );
};

const InputField = ({ label, value, onChange, step = 0.001, min = 0 }) => (
  <div>
    <div className="text-[8px] t-text-m font-bold uppercase tracking-widest mb-1">{label}</div>
    <input type="number" value={value} step={step} min={min}
      onChange={e => onChange(e.target.value)}
      className="w-full t-elevated border t-border-s rounded-lg px-2.5 py-2 text-[10px] font-mono
                 t-text focus:outline-none focus:border-[#FFB81C]/60 bg-transparent" />
  </div>
);

/* ── main ────────────────────────────────────────────────────────────────── */
const FxRegimeOptimizer = () => {
  const [selectedPair, setSelectedPair] = useState(null);
  const [capital, setCapital] = useState(10000);
  const [thetaMin, setThetaMin] = useState(0.1);
  const [thetaMax, setThetaMax] = useState(0.6);
  const [thetaSteps, setThetaSteps] = useState(6);
  const [epsMin, setEpsMin] = useState(0.01);
  const [epsMax, setEpsMax] = useState(2.0);
  const [epsSteps, setEpsSteps] = useState(10);
  const [confirmedInds, setConfirmedInds] = useState(['RSI','MACD','SO','SAR','BB','EMA']);
  const [running, setRunning] = useState(false);
  const [gridData, setGridData] = useState(null);
  const [error, setError] = useState(null);

  const handlePairChange = (pair) => {
    setSelectedPair(pair);
    const cfg = getPairConfig(pair.name);
    setEpsMin(cfg.epsMin); setEpsMax(cfg.epsMax); setEpsSteps(cfg.steps);
  };

  const toggleInd = (ind) =>
    setConfirmedInds(prev => prev.includes(ind) ? prev.filter(x => x !== ind) : [...prev, ind]);

  const handleRun = async () => {
    if (!selectedPair) { setError('Select an asset first.'); return; }
    setRunning(true); setError(null); setGridData(null);
    try {
      const r = await axios.post('/api/fx/backtest/regime-optimize', {
        file_path: selectedPair.file_path,
        file_type: selectedPair.file_type,
        initial_capital: Number(capital),
        theta_range: [Number(thetaMin), Number(thetaMax), Number(thetaSteps)],
        eps_range: [Number(epsMin), Number(epsMax), Number(epsSteps)],
        confirmed_indicators: confirmedInds,
      });
      setGridData(r.data);
    } catch (err) {
      setError(err.response?.data?.detail?.message || 'Regime optimization failed');
    } finally { setRunning(false); }
  };


  const totalCells = Number(thetaSteps) * Number(epsSteps);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#FFB81C] mb-1">Indicators Engine</div>
        <h1 className="text-2xl font-black t-text tracking-tight flex items-center gap-3">
          <Compass className="text-[#FFB81C]" size={22} />
          Regime Optimizer
        </h1>
        <p className="text-[10px] t-text-m mt-1 uppercase tracking-widest font-bold">
          2-D grid sweep · θ × ε · {totalCells} cells · {selectedPair ? selectedPair.name.replace(/_/g, '/') : 'No asset'}
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6">
        {/* Config panel */}
        <div className="space-y-3">
          <div className="t-card rounded-xl border t-border-s p-4 space-y-3">
            <PairSelector value={selectedPair} onChange={handlePairChange} />
            <InputField label="Capital ($)" value={capital} onChange={setCapital} step={1000} min={100} />
          </div>

          <div className="t-card rounded-xl border t-border-s p-4 space-y-3">
            <div className="text-[9px] font-black t-text-m uppercase tracking-[0.2em]">θ Vote Threshold</div>
            <div className="grid grid-cols-3 gap-2">
              <InputField label="Min" value={thetaMin} onChange={setThetaMin} step={0.05} />
              <InputField label="Max" value={thetaMax} onChange={setThetaMax} step={0.05} />
              <InputField label="Steps" value={thetaSteps} onChange={setThetaSteps} step={1} min={2} />
            </div>
          </div>

          <div className="t-card rounded-xl border t-border-s p-4 space-y-3">
            <div className="text-[9px] font-black t-text-m uppercase tracking-[0.2em]">ε Trend Slope</div>
            <div className="grid grid-cols-3 gap-2">
              <InputField label="Min" value={epsMin} onChange={setEpsMin} />
              <InputField label="Max" value={epsMax} onChange={setEpsMax} step={0.1} />
              <InputField label="Steps" value={epsSteps} onChange={setEpsSteps} step={1} min={2} />
            </div>
            <div className="text-[9px] t-text-m font-bold">
              Grid: <span className="text-[#FFB81C] font-black">{totalCells}</span> cells
            </div>
          </div>

          <div className="t-card rounded-xl border t-border-s p-4 space-y-2">
            <div className="text-[9px] font-black t-text-m uppercase tracking-[0.2em]">Active Indicators</div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_IND.map(ind => (
                <button key={ind} onClick={() => toggleInd(ind)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black border transition-all
                              ${confirmedInds.includes(ind)
                                ? 'bg-[#FFB81C]/15 border-[#FFB81C]/50 text-[#FFB81C] shadow-sm'
                                : 't-border-s t-text-m hover:t-text'}`}>
                  {ind}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleRun} disabled={running || !selectedPair}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-black text-[11px]
                       uppercase tracking-widest bg-[#FFB81C] text-black hover:bg-[#FFB81C]/90
                       disabled:opacity-40 transition-all shadow-lg shadow-[#FFB81C]/20 active:scale-[0.98]">
            {running
              ? <><Loader2 size={14} className="animate-spin" />Sweeping {totalCells} cells…</>
              : <><Play size={14} />Run Regime Optimizer</>}
          </button>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/8 px-3 py-2">
              <AlertCircle size={13} className="text-red-400" />
              <span className="text-[10px] text-red-400">{error}</span>
            </div>
          )}
        </div>

        {/* Results panel */}
        <div className="space-y-4">
          {!gridData && !running && (
            <div className="flex items-center justify-center h-72 t-card rounded-xl border t-border-s">
              <div className="text-center t-text-m">
                <Compass size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-[11px] font-black uppercase tracking-widest opacity-40">Configure and run</p>
                <p className="text-[9px] mt-1 opacity-30">Heatmap will appear here</p>
              </div>
            </div>
          )}

          {running && (
            <div className="flex items-center justify-center h-72 t-card rounded-xl border t-border-s">
              <div className="text-center">
                <Loader2 size={36} className="animate-spin mx-auto mb-3 text-[#FFB81C]" />
                <p className="text-[11px] t-text-m font-black uppercase tracking-widest">
                  Running {totalCells} backtest cells…
                </p>
                <p className="text-[9px] t-text-m mt-1">This may take several minutes for large grids.</p>
              </div>
            </div>
          )}

          {gridData && !running && (
            <>
              {/* Best params banner */}
              <div className="t-card rounded-xl border border-[#FFB81C]/30 bg-[#FFB81C]/5 p-5 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy size={14} className="text-[#FFB81C]" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#FFB81C]">Optimal Parameters</span>
                  </div>
                  <div className="flex gap-8 font-mono">
                    <div>
                      <div className="text-[8px] t-text-m font-bold uppercase tracking-widest mb-0.5">θ vote</div>
                      <div className="text-xl font-black text-[#FFB81C]">{gridData.best_theta?.toFixed(3)}</div>
                    </div>
                    <div>
                      <div className="text-[8px] t-text-m font-bold uppercase tracking-widest mb-0.5">ε slope</div>
                      <div className="text-xl font-black text-[#FFB81C]">{gridData.best_eps?.toFixed(5)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Heatmap */}
              <div className="t-card rounded-xl border t-border-s p-5">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#FFB81C] mb-4">
                  Return % Heatmap — θ × ε
                </div>
                <Heatmap
                  grid={gridData.grid}
                  thetaValues={gridData.theta_values}
                  epsValues={gridData.eps_values}
                  bestTheta={gridData.best_theta}
                  bestEps={gridData.best_eps}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FxRegimeOptimizer;
