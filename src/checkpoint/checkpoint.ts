/**
 * Checkpointing — Serialize and restore agent process state.
 *
 * Checkpoints capture a process's metadata and memory so it can be
 * resumed later, even across restarts. Useful for long-running agents,
 * crash recovery, and pausing/resuming expensive workflows.
 *
 * @example
 * ```ts
 * import { Kernel } from '@llmhut/agentvm';
 * import { checkpoint, restore } from '@llmhut/agentvm';
 *
 * const kernel = new Kernel();
 * // ... register agents, spawn, execute ...
 *
 * // Save checkpoint
 * await checkpoint(kernel, proc.id, './checkpoints/proc-1.json');
 *
 * // Later: restore from checkpoint
 * const restored = await restore(kernel, './checkpoints/proc-1.json');
 * const result = await kernel.execute(restored.id, { task: 'continue' });
 * ```
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Kernel } from '../core/kernel';
import type { Process } from '../core/process';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface CheckpointData {
  /** Checkpoint format version */
  version: 1;
  /** Timestamp when checkpoint was created */
  createdAt: string;
  /** Process ID */
  processId: string;
  /** Agent name */
  agentName: string;
  /** Process metadata */
  metadata: Record<string, unknown>;
  /** Memory snapshot — all key-value pairs from the process namespace */
  memory: Record<string, unknown>;
}

// ──────────────────────────────────────────────
// Checkpoint
// ──────────────────────────────────────────────

/**
 * Create a checkpoint of a process's state and memory.
 *
 * @param kernel — The kernel containing the process
 * @param processId — The process to checkpoint
 * @param filePath — Where to save the checkpoint file
 */
export async function checkpoint(
  kernel: Kernel,
  processId: string,
  filePath: string,
): Promise<CheckpointData> {
  const process = kernel.getProcess(processId);
  if (!process) {
    throw new Error(`Process "${processId}" not found`);
  }

  // Collect memory
  const accessor = kernel.memory.getAccessor(processId);
  const keys = await accessor.list();
  const memory: Record<string, unknown> = {};
  for (const key of keys) {
    memory[key] = await accessor.get(key);
  }

  const data: CheckpointData = {
    version: 1,
    createdAt: new Date().toISOString(),
    processId: process.id,
    agentName: process.agentName,
    metadata: { ...process.info.metadata },
    memory,
  };

  // Ensure directory exists
  await fs.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });

  // Write checkpoint file
  await fs.writeFile(path.resolve(filePath), JSON.stringify(data, null, 2), 'utf-8');

  return data;
}

// ──────────────────────────────────────────────
// Restore
// ──────────────────────────────────────────────

/**
 * Restore a process from a checkpoint file.
 *
 * Creates a new process for the agent and restores its memory.
 * The agent must be registered with the kernel.
 *
 * @param kernel — The kernel to restore into
 * @param filePath — Path to the checkpoint file
 * @returns The restored (running) process
 */
export async function restore(kernel: Kernel, filePath: string): Promise<Process> {
  const raw = await fs.readFile(path.resolve(filePath), 'utf-8');
  const data = JSON.parse(raw) as CheckpointData;

  if (data.version !== 1) {
    throw new Error(`Unsupported checkpoint version: ${data.version}`);
  }

  // Verify the agent is registered
  const agent = kernel.getAgent(data.agentName);
  if (!agent) {
    throw new Error(`Agent "${data.agentName}" is not registered. Register it before restoring.`);
  }

  // Spawn a new process with the original ID
  const process = await kernel.spawn(data.agentName, {
    id: data.processId,
    metadata: data.metadata,
  });

  // Restore memory
  const accessor = kernel.memory.getAccessor(process.id);
  for (const [key, value] of Object.entries(data.memory)) {
    await accessor.set(key, value);
  }

  return process;
}

/**
 * Read a checkpoint file without restoring it.
 * Useful for inspecting checkpoint contents.
 */
export async function readCheckpoint(filePath: string): Promise<CheckpointData> {
  const raw = await fs.readFile(path.resolve(filePath), 'utf-8');
  return JSON.parse(raw) as CheckpointData;
}
