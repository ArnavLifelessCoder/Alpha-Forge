import { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, ReferenceLine, CartesianGrid, Legend,
} from 'recharts';
import {
  Brain, Cpu, Activity, AlertTriangle, CheckCircle2, RefreshCw,
  TrendingUp, TrendingDown, Minus, Gauge, FlaskConical, Database, Award,
} from 'lucide-react';
import { apiService } from '../../services/ApiService';

const PANEL = 'bg-slate-800 rounded-xl border border-slate-700/50 p-5 shadow-xl';
const LABEL = 'text-[10px] text-slate-400 uppercase tracking-wider font-medium';

function fmt(n: any, d = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toFixed(d);
}

// ---------------------------------------------------------------------------
function OfflineCard() {
  return (
    <div className={`${PANEL} text-center py-10`}>
      <Cpu className="w-10 h-10 mx-auto mb-3 text-slate-600" />
      <h3 className="text-lg font-bold text-slate-300">Model server offline</h3>
      <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto">
        The AlphaForge MLOps stack isn't reachable. The trading bot is running on its
        heuristic fallback. Start the serving layer to enable live ML inference:
      </p>
      <code className="block mt-3 text-[11px] text-indigo-300 bg-slate-900/60 rounded-lg px-3 py-2 max-w-md mx-auto">
        uvicorn ml.serving.app:app --port 8090
      </code>
    </div>
  );
}

// ---------------------------------------------------------------------------
function StatusBar({ info }: { info: any }) {
  const champ = info?.champion_version || '—';
  const cells = [
    { label: 'Champion', value: champ, icon: Award, color: 'text-indigo-300' },
    { label: 'Val AUC', value: fmt(info?.auc, 4), icon: Gauge, color: 'text-green-400' },
    { label: 'Val Accuracy', value: info?.accuracy != null ? `${fmt(info.accuracy * 100, 1)}%` : '—', icon: Activity, color: 'text-green-400' },
    { label: 'Inference', value: info?.infer_backend === 'cpp' ? 'C++ engine' : (info?.infer_backend || '—'), icon: Cpu, color: 'text-amber-300' },
    { label: 'Features', value: info?.feature_backend === 'cpp' ? 'C++ engine' : (info?.feature_backend || '—'), icon: Cpu, color: 'text-amber-300' },
    { label: 'Horizon', value: info?.horizon_sec ? `${info.horizon_sec}s` : '—', icon: TrendingUp, color: 'text-slate-300' },
    { label: 'Train rows', value: info?.n_rows ?? '—', icon: Database, color: 'text-slate-300' },
  ];
  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/15">
            <Brain className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-base font-bold">ML Intelligence</h2>
            <p className="text-[10px] text-slate-400">LightGBM directional model · C++ feature & inference engine</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded text-[10px] font-bold ${info?.ready ? 'bg-green-500/15 text-green-400 animate-pulse' : 'bg-slate-700 text-slate-400'}`}>
          {info?.ready ? '● MODEL LIVE' : '○ NO MODEL'}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {cells.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-slate-900/40 rounded-lg p-2.5 border border-slate-700/30">
              <div className="flex items-center space-x-1 mb-1">
                <Icon className="w-3 h-3 text-slate-500" />
                <p className="text-[9px] text-slate-400 uppercase tracking-wide">{c.label}</p>
              </div>
              <p className={`text-sm font-bold font-mono ${c.color}`}>{c.value}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function PredictionCard({ p }: { p: any }) {
  const up = p.direction === 'UP';
  const flat = p.direction === 'FLAT';
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const color = flat ? 'text-slate-400' : up ? 'text-green-400' : 'text-red-400';
  const barColor = up ? 'bg-green-400' : 'bg-red-400';
  return (
    <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-700/30">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-200">{p.symbol}</span>
        <span className={`flex items-center space-x-1 ${color}`}>
          <Icon className="w-3.5 h-3.5" />
          <span className="text-xs font-bold">{p.direction}</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${Math.round((p.prob || 0.5) * 100)}%` }} />
      </div>
      <div className="flex items-center justify-between mt-1.5 text-[10px]">
        <span className="text-slate-400">P(up) {fmt(p.prob, 3)}</span>
        <span className="text-slate-300">conf {fmt(p.confidence, 2)}</span>
      </div>
    </div>
  );
}

function PredictionsPanel({ preds }: { preds: any[] }) {
  return (
    <div className={PANEL}>
      <div className="flex items-center space-x-2 mb-3">
        <Activity className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-bold">Live Predictions</h3>
        <span className="text-[10px] text-slate-500">({preds.length} symbols)</span>
      </div>
      {preds.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">Waiting for predictions…</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {preds.map((p) => <PredictionCard key={p.symbol} p={p} />)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function FeatureImportancePanel({ importance }: { importance: Record<string, number> }) {
  const data = Object.entries(importance || {})
    .map(([name, gain]) => ({ name, gain: Number(gain) }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 13);
  return (
    <div className={PANEL}>
      <div className="flex items-center space-x-2 mb-3">
        <Brain className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-bold">Feature Importance</h3>
        <span className="text-[10px] text-slate-500">(gain)</span>
      </div>
      {data.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">No model yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} layout="vertical" margin={{ left: 20, right: 10 }}>
            <XAxis type="number" tick={{ fill: '#9A8F7E', fontSize: 10 }} />
            <YAxis type="category" dataKey="name" width={100} tick={{ fill: '#5E564A', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E8E1D6', borderRadius: 8, fontSize: 11 }} />
            <Bar dataKey="gain" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => <Cell key={i} fill={i === 0 ? '#0E7C86' : '#6FB9BF'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function DriftPanel({ drift }: { drift: any }) {
  const features = (drift?.features || []).map((f: any) => ({ name: f.feature, psi: Number(f.psi) }));
  const status = drift?.status || 'ok';
  const statusMap: Record<string, { c: string; Icon: any; t: string }> = {
    ok: { c: 'text-green-400', Icon: CheckCircle2, t: 'No significant drift' },
    warning: { c: 'text-yellow-400', Icon: AlertTriangle, t: 'Moderate drift — monitoring' },
    alert: { c: 'text-red-400', Icon: AlertTriangle, t: 'Major drift — retrain advised' },
  };
  const s = statusMap[status] || statusMap.ok;
  const SIcon = s.Icon;
  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Gauge className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold">Data Drift (PSI)</h3>
        </div>
        <span className={`flex items-center space-x-1 text-[10px] font-bold ${s.c}`}>
          <SIcon className="w-3.5 h-3.5" /><span>{s.t}</span>
        </span>
      </div>
      {features.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">No drift samples yet (needs a champion + live features).</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={features} margin={{ left: 0, right: 10 }}>
            <XAxis dataKey="name" tick={{ fill: '#9A8F7E', fontSize: 9 }} angle={-35} textAnchor="end" height={60} interval={0} />
            <YAxis tick={{ fill: '#9A8F7E', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E8E1D6', borderRadius: 8, fontSize: 11 }} />
            <ReferenceLine y={0.1} stroke="#C77D11" strokeDasharray="4 4" />
            <ReferenceLine y={0.25} stroke="#D23B3B" strokeDasharray="4 4" />
            <Bar dataKey="psi" radius={[4, 4, 0, 0]}>
              {features.map((f: any, i: number) => (
                <Cell key={i} fill={f.psi > 0.25 ? '#D23B3B' : f.psi > 0.1 ? '#C77D11' : '#1A7F4B'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      <p className="text-[9px] text-slate-500 mt-1">PSI &lt; 0.1 stable · 0.1–0.25 moderate · &gt; 0.25 major shift</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
function PerformancePanel({ perf }: { perf: any }) {
  const acc = perf?.accuracy;
  const calib = (perf?.calibration || []).map((c: any) => ({
    bucket: c.bucket, predicted: c.predicted, empirical: c.empirical,
  }));
  return (
    <div className={PANEL}>
      <div className="flex items-center space-x-2 mb-3">
        <Activity className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-bold">Live Performance</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-slate-900/40 rounded-lg p-2.5 border border-slate-700/30">
          <p className={LABEL}>Rolling Accuracy</p>
          <p className="text-xl font-bold font-mono text-green-400">
            {acc != null ? `${fmt(acc * 100, 1)}%` : '—'}
          </p>
        </div>
        <div className="bg-slate-900/40 rounded-lg p-2.5 border border-slate-700/30">
          <p className={LABEL}>Resolved Predictions</p>
          <p className="text-xl font-bold font-mono text-slate-200">{perf?.n ?? 0}</p>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 mb-1">Calibration (predicted vs realized)</p>
      {calib.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">Awaiting resolved outcomes…</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={calib} margin={{ left: -10, right: 10 }}>
            <CartesianGrid stroke="#E8E1D6" />
            <XAxis dataKey="bucket" tick={{ fill: '#9A8F7E', fontSize: 10 }} domain={[0, 1]} />
            <YAxis tick={{ fill: '#9A8F7E', fontSize: 10 }} domain={[0, 1]} />
            <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E8E1D6', borderRadius: 8, fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line type="monotone" dataKey="empirical" stroke="#1A7F4B" strokeWidth={2} dot={{ r: 3 }} name="empirical" />
            <Line type="monotone" dataKey="predicted" stroke="#9A8F7E" strokeDasharray="4 4" strokeWidth={1.5} dot={false} name="ideal" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function ExperimentsPanel({ runs, models, onRetrain, retraining }: any) {
  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <FlaskConical className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold">Experiments & Registry</h3>
        </div>
        <button
          onClick={onRetrain}
          disabled={retraining}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${retraining ? 'animate-spin' : ''}`} />
          <span>{retraining ? 'Training…' : 'Train challenger'}</span>
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-slate-400 border-b border-slate-700/50">
              <th className="text-left py-1.5 font-medium">Version</th>
              <th className="text-left font-medium">Role</th>
              <th className="text-right font-medium">AUC</th>
              <th className="text-right font-medium">Acc</th>
              <th className="text-right font-medium">Rows</th>
              <th className="text-right font-medium">Promoted</th>
            </tr>
          </thead>
          <tbody>
            {(runs || []).slice(0, 8).map((r: any, i: number) => {
              const model = (models || []).find((m: any) => m.version === r.model_version);
              const role = model?.role || '—';
              return (
                <tr key={i} className="border-b border-slate-800/50">
                  <td className="py-1.5 font-mono text-slate-200">{r.model_version}</td>
                  <td>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      role === 'champion' ? 'bg-green-500/15 text-green-400' :
                      role === 'challenger' ? 'bg-amber-500/15 text-amber-400' :
                      'bg-slate-700 text-slate-400'
                    }`}>{role}</span>
                  </td>
                  <td className="text-right font-mono text-green-400">{fmt(r.auc, 4)}</td>
                  <td className="text-right font-mono text-slate-300">{r.accuracy != null ? `${fmt(r.accuracy * 100, 1)}%` : '—'}</td>
                  <td className="text-right font-mono text-slate-400">{r.n_rows}</td>
                  <td className="text-right">{r.promoted ? '✅' : '—'}</td>
                </tr>
              );
            })}
            {(!runs || runs.length === 0) && (
              <tr><td colSpan={6} className="text-center py-4 text-slate-500">No training runs yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function MLDashboard() {
  const [status, setStatus] = useState<any>(null);
  const [info, setInfo] = useState<any>(null);
  const [preds, setPreds] = useState<any[]>([]);
  const [drift, setDrift] = useState<any>(null);
  const [perf, setPerf] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [retraining, setRetraining] = useState(false);

  const refresh = useCallback(async () => {
    const [st, mi, pr] = await Promise.all([
      apiService.getMLStatus(), apiService.getMLModelInfo(), apiService.getMLPredictions(),
    ]);
    setStatus(st);
    setInfo(mi);
    setPreds(pr?.predictions || []);
  }, []);

  const refreshSlow = useCallback(async () => {
    const [dr, pf, ex] = await Promise.all([
      apiService.getMLDrift(), apiService.getMLPerformance(), apiService.getMLExperiments(),
    ]);
    setDrift(dr);
    setPerf(pf);
    setRuns(Array.isArray(ex) ? ex : []);
  }, []);

  useEffect(() => {
    refresh(); refreshSlow();
    const fast = setInterval(refresh, 2500);
    const slow = setInterval(refreshSlow, 8000);
    return () => { clearInterval(fast); clearInterval(slow); };
  }, [refresh, refreshSlow]);

  const handleRetrain = async () => {
    setRetraining(true);
    await apiService.triggerRetrain(true);
    await Promise.all([refresh(), refreshSlow()]);
    setRetraining(false);
  };

  const available = status?.available;

  return (
    <div className="container mx-auto px-4 py-4 space-y-4">
      {!available ? (
        <OfflineCard />
      ) : (
        <>
          <StatusBar info={info} />
          <PredictionsPanel preds={preds} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FeatureImportancePanel importance={info?.feature_importance || {}} />
            <DriftPanel drift={drift} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PerformancePanel perf={perf} />
            <ExperimentsPanel runs={runs} models={info?.models} onRetrain={handleRetrain} retraining={retraining} />
          </div>
        </>
      )}
    </div>
  );
}
