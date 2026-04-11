import type { ProcessInfo, ProcessOptions, ProcessState, KernelEvent } from './types';

/**
 * Process — A running instance of an Agent.
 *
 * Processes have a lifecycle: created → starting → running → paused → terminated.
 * They can also crash, in which case the state is 'crashed'.
 *
 * Processes are managed by the Kernel — you don't create them directly.
 */
export class Process {
  readonly id: string;
  readonly agentName: string;
  private _state: ProcessState;
  readonly createdAt: Date;
  private _startedAt?: Date;
  private _terminatedAt?: Date;
  private _metadata: Record<string, unknown>;
  private _events: KernelEvent[];
  private _abortController: AbortController;

  constructor(id: string, agentName: string, options: ProcessOptions = {}) {
    this.id = id;
    this.agentName = agentName;
    this._state = 'created' as ProcessState;
    this.createdAt = new Date();
    this._metadata = options.metadata ?? {};
    this._events = [];
    this._abortController = new AbortController();
  }

  // ── State ──

  get state(): ProcessState {
    return this._state;
  }

  get signal(): AbortSignal {
    return this._abortController.signal;
  }

  get info(): ProcessInfo {
    return {
      id: this.id,
      agentName: this.agentName,
      state: this._state,
      createdAt: this.createdAt,
      startedAt: this._startedAt,
      terminatedAt: this._terminatedAt,
      metadata: { ...this._metadata },
    };
  }

  // ── Lifecycle transitions ──

  /** @internal Called by Kernel */
  _start(): void {
    this._assertState('created', 'start');
    this._state = 'starting' as ProcessState;
    this._startedAt = new Date();
    this._state = 'running' as ProcessState;
    this._recordEvent('process:started');
  }

  /** @internal Called by Kernel */
  _pause(): void {
    this._assertState('running', 'pause');
    this._state = 'paused' as ProcessState;
    this._recordEvent('process:paused');
  }

  /** @internal Called by Kernel */
  _resume(): void {
    this._assertState('paused', 'resume');
    this._state = 'running' as ProcessState;
    this._recordEvent('process:resumed');
  }

  /** @internal Called by Kernel */
  _terminate(): void {
    if (this._state === ('terminated' as ProcessState)) return;
    this._state = 'terminated' as ProcessState;
    this._terminatedAt = new Date();
    this._abortController.abort();
    this._recordEvent('process:terminated');
  }

  /** @internal Called by Kernel on unhandled error */
  _crash(error: Error): void {
    this._state = 'crashed' as ProcessState;
    this._terminatedAt = new Date();
    this._abortController.abort();
    this._recordEvent('process:crashed', { error: error.message, stack: error.stack });
  }

  // ── Metadata ──

  setMetadata(key: string, value: unknown): void {
    this._metadata[key] = value;
  }

  getMetadata(key: string): unknown {
    return this._metadata[key];
  }

  // ── Events ──

  get events(): readonly KernelEvent[] {
    return this._events;
  }

  private _recordEvent(type: string, data?: unknown): void {
    this._events.push({
      id: `${this.id}-${this._events.length}`,
      type,
      source: this.id,
      timestamp: new Date(),
      data,
    });
  }

  // ── Helpers ──

  private _assertState(expected: string, action: string): void {
    if (this._state !== expected) {
      throw new Error(
        `Cannot ${action} process ${this.id}: expected state "${expected}" but got "${this._state}"`,
      );
    }
  }

  toString(): string {
    return `Process(${this.id}, agent=${this.agentName}, state=${this._state})`;
  }
}
