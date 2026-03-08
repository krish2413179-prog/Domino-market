import { EventEmitter } from 'events';
import { EventMonitor } from './EventMonitor';
import { ethers } from 'ethers';

export type WorkflowPhase = 
  | 'MONITORING_EVENT_A'
  | 'MONITORING_EVENT_B'
  | 'SETTLING'
  | 'COMPLETED';

export interface WorkflowState {
  marketId: string;
  phase: WorkflowPhase;
  eventAOccurred: boolean;
  eventATimestamp?: number;
  eventBHighestValue: number;
  eventBStartTime?: number;
  eventBOccurred: boolean;
  lastPollTime: number;
  retryCount: number;
  isPaused: boolean;
  lastError?: string;
}

export interface EventDefinition {
  description: string;
  dataSources: string[];
  detectionCriteria: any;
  monitoringDuration?: number;
  consensusThreshold: number;
}

export interface WorkflowConfig {
  marketId: string;
  eventADefinition: EventDefinition;
  eventBDefinition: EventDefinition;
  contractAddress: string;
  pollIntervalSeconds: number;
  expiresAt: number;
  createdAt: number;
}

export class WorkflowOrchestrator extends EventEmitter {
  private eventMonitor: EventMonitor;
  private signer?: ethers.Signer;

  constructor(signer?: ethers.Signer, eventMonitor: EventMonitor = new EventMonitor()) {
    super();
    this.signer = signer;
    this.eventMonitor = eventMonitor;
  }

  async execute(
    state: WorkflowState,
    config: WorkflowConfig
  ): Promise<WorkflowState> {
    if (state.isPaused) {
      console.warn(`Market ${config.marketId} is paused. Skipping execution.`);
      return state;
    }

    const marketAge = Date.now() - (config.createdAt * 1000);
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    
    if (marketAge < TWENTY_FOUR_HOURS && state.phase !== 'COMPLETED' && state.phase !== 'SETTLING') {
      return state;
    }

    const oldPhase = state.phase;
    let nextState: WorkflowState;

    try {
      switch (state.phase) {
        case 'MONITORING_EVENT_A':
          nextState = await this.monitorEventA(state, config);
          break;
        case 'MONITORING_EVENT_B':
          nextState = await this.monitorEventB(state, config);
          break;
        case 'SETTLING':
          nextState = await this.settleMarket(state, config);
          break;
        case 'COMPLETED':
          return state;
        default:
          throw new Error(`Unknown workflow phase: ${state.phase}`);
      }
    } catch (error) {
      const newRetryCount = state.retryCount + 1;
      nextState = {
        ...state,
        retryCount: newRetryCount,
        isPaused: newRetryCount >= 3,
        lastError: `Orchestration Error: ${error instanceof Error ? error.message : 'Unknown'}`
      };
    }

    if (nextState.phase !== oldPhase) {
      this.emit('phaseTransition', {
        marketId: config.marketId,
        from: oldPhase,
        to: nextState.phase,
        timestamp: Date.now()
      });
    }

    return nextState;
  }

  private async monitorEventA(
    state: WorkflowState,
    config: WorkflowConfig
  ): Promise<WorkflowState> {
    const now = Date.now();
    
    if (now >= config.expiresAt) {
      return {
        ...state,
        phase: 'SETTLING',
        eventAOccurred: false,
        lastPollTime: now,
        retryCount: 0
      };
    }

    try {
      const evaluation = await this.eventMonitor.pollAndEvaluate(config.eventADefinition);
      
      if (evaluation.isMet) {
        return {
          ...state,
          phase: 'MONITORING_EVENT_B',
          eventAOccurred: true,
          eventATimestamp: evaluation.timestamp ?? now,
          eventBStartTime: now,
          lastPollTime: now,
          retryCount: 0,
          lastError: undefined
        };
      }

      return {
        ...state,
        lastPollTime: now,
        retryCount: 0
      };
    } catch (error) {
      const newRetryCount = state.retryCount + 1;
      return {
        ...state,
        retryCount: newRetryCount,
        isPaused: newRetryCount >= 3,
        lastError: `Event A Error: ${error instanceof Error ? error.message : 'Unknown'}`,
        lastPollTime: now
      };
    }
  }

  private async monitorEventB(
    state: WorkflowState,
    config: WorkflowConfig
  ): Promise<WorkflowState> {
    const now = Date.now();
    const startTime = state.eventBStartTime || now;
    const duration = config.eventBDefinition.monitoringDuration || 0;
    const expiresAt = startTime + (duration * 1000);

    try {
      const evaluation = await this.eventMonitor.pollAndEvaluate(config.eventBDefinition);
      
      const newHighestValue = evaluation.value !== undefined 
        ? Math.max(state.eventBHighestValue, evaluation.value)
        : state.eventBHighestValue;

      if (evaluation.isMet) {
        return {
          ...state,
          phase: 'SETTLING',
          eventBOccurred: true,
          eventBHighestValue: newHighestValue,
          lastPollTime: now,
          retryCount: 0,
          lastError: undefined
        };
      }

      if (now >= expiresAt) {
        return {
          ...state,
          phase: 'SETTLING',
          eventBOccurred: false,
          eventBHighestValue: newHighestValue,
          lastPollTime: now,
          retryCount: 0,
          lastError: undefined
        };
      }

      return {
        ...state,
        eventBHighestValue: newHighestValue,
        lastPollTime: now,
        retryCount: 0
      };
    } catch (error) {
      const newRetryCount = state.retryCount + 1;
      return {
        ...state,
        retryCount: newRetryCount,
        isPaused: newRetryCount >= 3,
        lastError: `Event B Error: ${error instanceof Error ? error.message : 'Unknown'}`,
        lastPollTime: now
      };
    }
  }

  private async settleMarket(
    state: WorkflowState,
    config: WorkflowConfig
  ): Promise<WorkflowState> {
    const now = Date.now();

    try {
      if (!this.isAuthorizedToSettle(config)) {
        throw new Error('Unauthorized: No settlement signer configured for this market');
      }

      const settlementData = {
        marketId: config.marketId,
        eventAOccurred: state.eventAOccurred,
        eventBOccurred: state.eventBOccurred,
        eventATimestamp: state.eventATimestamp || 0,
        eventBTimestamp: state.eventBOccurred ? now : 0,
        proof: ethers.toUtf8Bytes(JSON.stringify({
          highestValue: state.eventBHighestValue,
          lastPollTime: state.lastPollTime
        }))
      };

      console.log(`Submitting settlement for market ${config.marketId}...`);
      await this.submitToBlockchain(config.contractAddress, settlementData);

      return {
        ...state,
        phase: 'COMPLETED',
        lastPollTime: now,
        retryCount: 0,
        lastError: undefined
      };
    } catch (error) {
      const newRetryCount = state.retryCount + 1;
      return {
        ...state,
        retryCount: newRetryCount,
        isPaused: newRetryCount >= 3,
        lastError: `Settlement Error: ${error instanceof Error ? error.message : 'Unknown'}`,
        lastPollTime: now
      };
    }
  }

  private isAuthorizedToSettle(config: WorkflowConfig): boolean {
    return !!config.contractAddress;
  }

  private async submitToBlockchain(address: string, data: any): Promise<void> {
    if (!this.signer) {
      throw new Error("No signer provided for blockchain settlement");
    }

    const settlementManager = new ethers.Contract(address, [
      "function submitSettlement(tuple(bytes32 marketId, bool eventAOccurred, bool eventBOccurred, uint256 eventATimestamp, uint256 eventBTimestamp, bytes proof) data, bytes signature) external"
    ], this.signer);

    const messageHash = ethers.solidityPackedKeccak256(
      ["bytes32", "bool", "bool", "uint256", "uint256", "bytes"],
      [
        data.marketId,
        data.eventAOccurred,
        data.eventBOccurred,
        data.eventATimestamp,
        data.eventBTimestamp,
        data.proof
      ]
    );

    const signature = await this.signer.signMessage(ethers.getBytes(messageHash));

    console.log(`Submitting on-chain settlement for market ${data.marketId} with signature...`);
    
    const tx = await settlementManager.submitSettlement(data, signature, { 
      gasLimit: 500000 
    });
    
    const receipt = await tx.wait();
    console.log(`Settlement confirmed in block ${receipt.blockNumber}. Transaction: ${receipt.hash}`);
  }
}
