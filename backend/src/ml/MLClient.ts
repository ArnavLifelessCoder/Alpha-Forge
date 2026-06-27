/**
 * MLClient — bridge from the Node exchange to the Python model-serving layer.
 *
 * Polls the AlphaForge FastAPI service (`/predict/:symbol`, `/model/info`) at a
 * controlled cadence and caches the latest prediction per symbol. Deliberately
 * polls REST on a fixed timer (never on the WS hot path) so it cannot contribute
 * to the request floods earlier commits fought. Fully fault-tolerant: if serving
 * is down it simply reports `available = false` and callers fall back to
 * heuristics — the exchange keeps running.
 */

export interface MLPrediction {
  symbol: string;
  direction: 'UP' | 'DOWN' | 'FLAT';
  prob: number;
  confidence: number;
  backend: string;
  modelVersion: string | null;
  ts: number;
  fetchedAt: number;
}

export interface MLModelInfo {
  ready: boolean;
  champion_version: string | null;
  infer_backend: string;
  feature_backend: string;
  auc: number | null;
  accuracy: number | null;
  n_rows: number | null;
  horizon_sec: number | null;
  feature_names: string[];
  feature_importance: Record<string, number>;
  models: any[];
}

export class MLClient {
  private servingUrl: string;
  private symbols: string[];
  private pollMs: number;
  private predictions: Map<string, MLPrediction> = new Map();
  private modelInfo: MLModelInfo | null = null;
  private lastOk: number = 0;
  private predictTimer?: NodeJS.Timeout;
  private infoTimer?: NodeJS.Timeout;
  private staleMs: number;

  constructor(opts: { servingUrl?: string; symbols: string[]; pollMs?: number }) {
    this.servingUrl = (opts.servingUrl || process.env.ML_SERVING_URL || 'http://localhost:8090').replace(/\/$/, '');
    this.symbols = opts.symbols;
    this.pollMs = opts.pollMs || 2000;
    this.staleMs = this.pollMs * 4;
  }

  /** Serving reachable and responded recently. */
  get available(): boolean {
    return this.lastOk > 0 && Date.now() - this.lastOk < 15000;
  }

  start(): void {
    if (this.predictTimer) return;
    const poll = () => this.pollPredictions();
    const info = () => this.pollModelInfo();
    poll();
    info();
    this.predictTimer = setInterval(poll, this.pollMs);
    this.infoTimer = setInterval(info, 10000);
    console.log(`🧠 MLClient polling ${this.servingUrl} every ${this.pollMs}ms for ${this.symbols.length} symbols`);
  }

  stop(): void {
    if (this.predictTimer) clearInterval(this.predictTimer);
    if (this.infoTimer) clearInterval(this.infoTimer);
    this.predictTimer = undefined;
    this.infoTimer = undefined;
  }

  private async fetchJson(path: string, timeoutMs = 3000): Promise<any | null> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${this.servingUrl}${path}`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  private async pollPredictions(): Promise<void> {
    const results = await Promise.allSettled(
      this.symbols.map(async (symbol) => {
        const d = await this.fetchJson(`/predict/${symbol}`);
        if (!d || d.status === 'no_data') return;
        this.predictions.set(symbol, {
          symbol,
          direction: d.direction,
          prob: d.prob,
          confidence: d.confidence,
          backend: d.backend,
          modelVersion: d.model_version ?? null,
          ts: d.ts ?? Date.now(),
          fetchedAt: Date.now(),
        });
        this.lastOk = Date.now();
      })
    );
    // If every request failed, leave `available` to expire naturally.
    void results;
  }

  private async pollModelInfo(): Promise<void> {
    const d = await this.fetchJson('/model/info');
    if (d) {
      this.modelInfo = d;
      this.lastOk = Date.now();
    }
  }

  /** Latest prediction for a symbol, or null if stale/missing. */
  getPrediction(symbol: string): MLPrediction | null {
    const p = this.predictions.get(symbol);
    if (!p) return null;
    if (Date.now() - p.fetchedAt > this.staleMs) return null;
    return p;
  }

  getAllPredictions(): MLPrediction[] {
    return Array.from(this.predictions.values());
  }

  getModelInfo(): MLModelInfo | null {
    return this.modelInfo;
  }

  /** Pass-through GET to the serving layer (used by /api/ml/* proxy routes). */
  async proxy(path: string): Promise<any | null> {
    return this.fetchJson(path, 5000);
  }

  /** Pass-through POST to the serving layer (e.g. trigger retrain). */
  async proxyPost(path: string, body: any): Promise<any | null> {
    try {
      const res = await fetch(`${this.servingUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  get baseUrl(): string {
    return this.servingUrl;
  }
}
