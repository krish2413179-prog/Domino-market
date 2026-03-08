import * as fs from 'fs/promises';
import * as path from 'path';
import { WorkflowState } from './WorkflowOrchestrator';

/**
 * FileSystem - Interface for file operations to enable easier testing
 */
export interface FileSystem {
  readdir(path: string): Promise<string[]>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
  access(path: string): Promise<void>;
}

/**
 * StateManager - Persists workflow state between executions
 * 
 * Provides methods for saving, loading, and checkpointing workflow state
 * using atomic file operations for consistency.
 * 
 * Requirements: 9.1, 9.2, 9.5
 */
export class StateManager {
  private readonly stateDir: string;
  private readonly fs: FileSystem;

  constructor(
    stateDir: string = path.join(process.cwd(), 'states'),
    fileSystem: FileSystem = fs
  ) {
    this.stateDir = stateDir;
    this.fs = fileSystem;
  }

  /**
   * Initialize the state directory if it doesn't exist
   */
  private async ensureDir(): Promise<void> {
    try {
      await this.fs.access(this.stateDir);
    } catch {
      await this.fs.mkdir(this.stateDir, { recursive: true });
    }
  }

  /**
   * Get the file path for a market's state
   */
  private getStatePath(marketId: string): string {
    return path.join(this.stateDir, `${marketId}.json`);
  }

  /**
   * Save workflow state atomically
   * 
   * @param marketId - Unique identifier for the market
   * @param state - Current workflow state to persist
   */
  async saveState(marketId: string, state: WorkflowState): Promise<void> {
    await this.ensureDir();
    const filePath = this.getStatePath(marketId);
    const tempPath = `${filePath}.tmp`;

    try {
      const data = JSON.stringify(state, null, 2);
      await this.fs.writeFile(tempPath, data, 'utf8');
      await this.fs.rename(tempPath, filePath);
    } catch (error) {
      // Cleanup temp file on failure
      try { await this.fs.unlink(tempPath); } catch {}
      throw new Error(`Failed to save state for market ${marketId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load workflow state
   * 
   * @param marketId - Unique identifier for the market
   * @returns The persisted state or null if not found
   */
  async loadState(marketId: string): Promise<WorkflowState | null> {
    const filePath = this.getStatePath(marketId);

    try {
      const data = await this.fs.readFile(filePath, 'utf8');
      return JSON.parse(data) as WorkflowState;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return null;
      }
      throw new Error(`Failed to load state for market ${marketId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a checkpoint of the current state
   * 
   * @param marketId - Unique identifier for the market
   * @param state - State to checkpoint
   */
  async createCheckpoint(marketId: string, state: WorkflowState): Promise<void> {
    await this.ensureDir();
    const timestamp = Date.now();
    const checkpointPath = path.join(this.stateDir, `${marketId}_${timestamp}.checkpoint.json`);
    
    try {
      const data = JSON.stringify(state, null, 2);
      await this.fs.writeFile(checkpointPath, data, 'utf8');
    } catch (error) {
      throw new Error(`Failed to create checkpoint for market ${marketId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List all market IDs that have persistent state
   * 
   * @returns Array of market IDs
   */
  async listMarketIds(): Promise<string[]> {
    try {
      await this.ensureDir();
      const files = await this.fs.readdir(this.stateDir);
      return files
        .filter(f => f.endsWith('.json') && !f.endsWith('.checkpoint.json'))
        .map(f => path.basename(f, '.json'));
    } catch (error) {
      return [];
    }
  }

  /**
   * Load state from a specific checkpoint file
   * 
   * @param checkpointPath - Absolute or relative path to checkpoint file
   * @returns The checkpointed state
   */
  async loadCheckpoint(checkpointPath: string): Promise<WorkflowState> {
    try {
      const data = await this.fs.readFile(checkpointPath, 'utf8');
      return JSON.parse(data) as WorkflowState;
    } catch (error) {
      throw new Error(`Failed to load checkpoint ${checkpointPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete state for a market
   * 
   * @param marketId - Unique identifier for the market
   */
  async deleteState(marketId: string): Promise<void> {
    const filePath = this.getStatePath(marketId);
    try {
      await this.fs.unlink(filePath);
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
