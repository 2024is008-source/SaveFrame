import {AsyncLocalStorage} from 'node:async_hooks';
import {performance} from 'node:perf_hooks';

export type MediaStage = 'validation' | 'rate_limit' | 'analytics' | 'dns' | 'upstream_connection' | 'upstream_body' | 'extraction' | 'subprocess' | 'subprocess_startup' | 'python_worker' | 'shared_wait' | 'fallback' | 'normalization' | 'preview_response' | 'download_preparation';
export type MediaCounter = 'cache_hit' | 'cache_miss' | 'shared' | 'fallback';
export class MediaTiming {
  private readonly started = performance.now();
  readonly stages: Partial<Record<MediaStage, number>> = {};
  readonly counters: Partial<Record<MediaCounter, number>> = {};
  outcome: 'ok' | 'error' | undefined;
  operation: 'resolve' | 'download' = 'resolve';
  add(stage: MediaStage, milliseconds: number) { this.stages[stage] = (this.stages[stage] || 0) + milliseconds; }
  snapshot() {
    return {totalMs: Math.round((performance.now() - this.started) * 100) / 100,
      stages: Object.fromEntries(Object.entries(this.stages).map(([key, value]) => [key, Math.round(value * 100) / 100])), counters: {...this.counters}, operation: this.operation, outcome: this.outcome};
  }
  header() { return Object.entries(this.snapshot().stages).map(([key, value]) => `${key};dur=${value}`).join(', '); }
}
const context = new AsyncLocalStorage<MediaTiming>();
export function mediaDuration(stage: MediaStage, milliseconds: number) { context.getStore()?.add(stage, milliseconds); }
export function mediaFailure() { const trace = context.getStore(); if (trace) trace.outcome = 'error'; }
export function mediaCount(counter: MediaCounter) {
  const trace = context.getStore();
  if (trace) trace.counters[counter] = (trace.counters[counter] || 0) + 1;
}
export async function mediaStage<T>(stage: MediaStage, operation: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try { return await operation(); } finally { context.getStore()?.add(stage, performance.now() - started); }
}
export function mediaStageSync<T>(stage: MediaStage, operation: () => T): T {
  const started = performance.now();
  try { return operation(); } finally { context.getStore()?.add(stage, performance.now() - started); }
}
/** Fixed numeric stages/counters only: no URLs, records, errors, IPs or correlation IDs. */
export async function withMediaTiming<T>(operation: (trace: MediaTiming) => Promise<T>, kind: 'resolve' | 'download' = 'resolve'): Promise<T> {
  const trace = new MediaTiming();
  trace.operation = kind;
  return context.run(trace, async () => {
    try { const result = await operation(trace); trace.outcome ||= 'ok'; return result; }
    catch (error) { trace.outcome = 'error'; throw error; }
    finally {
      if (process.env.SAVEFRAME_MEDIA_TIMING === '1') {
        try { console.info('[SaveFrame] Media timing', trace.snapshot()); } catch { /* Best effort. */ }
      }
    }
  });
}
