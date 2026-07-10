import type { EventEmitter } from 'node:events';

export type LoopControlState = 'idle' | 'running' | 'paused' | 'cancelling' | 'cancelled' | 'completed' | 'failed';
export interface LoopStateEvent { type: 'loop:state'; projectId: string; operationId: string; state: LoopControlState; previousState: LoopControlState; action: string }
export interface LoopControllerOptions {
  projectId: string;
  realtime?: EventEmitter;
  persist?: (event: LoopStateEvent) => void | Promise<void>;
}

export class ProjectLoopController {
  private state: LoopControlState = 'idle';
  private operationId?: string;
  private abort?: AbortController;
  constructor(private readonly options: LoopControllerOptions) {}

  snapshot() { return { projectId: this.options.projectId, operationId: this.operationId, state: this.state }; }

  async execute<T>(action: string, operationId: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T | { state: LoopControlState }> {
    if (action === 'pause') { await this.transition('paused', action, operationId, ['running']); return { state: this.state }; }
    if (action === 'resume') { await this.transition('running', action, operationId, ['paused']); return { state: this.state }; }
    if (action === 'cancel') {
      await this.transition('cancelling', action, operationId, ['running', 'paused']); this.abort?.abort();
      await this.transition('cancelled', action, operationId, ['cancelling']); return { state: this.state };
    }
    if (this.state === 'running' || this.state === 'paused' || this.state === 'cancelling') throw new Error(`Project ${this.options.projectId} already has an active operation.`);
    this.operationId = operationId; this.abort = new AbortController(); await this.transition('running', action, operationId);
    try { const result = await operation(this.abort.signal); await this.transition('completed', action, operationId, ['running']); return result; }
    catch (error) { if (this.state !== 'cancelled') await this.transition('failed', action, operationId); throw error; }
    finally { this.abort = undefined; }
  }

  private async transition(next: LoopControlState, action: string, operationId: string, allowed?: LoopControlState[]): Promise<void> {
    if (allowed && !allowed.includes(this.state)) throw new Error(`Cannot ${action} while project is ${this.state}.`);
    const previousState = this.state; this.state = next;
    const event: LoopStateEvent = { type: 'loop:state', projectId: this.options.projectId, operationId: this.operationId ?? operationId, state: next, previousState, action };
    await this.options.persist?.(event); this.options.realtime?.emit('event', event);
  }
}
