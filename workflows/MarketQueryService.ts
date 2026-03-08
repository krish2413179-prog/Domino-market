import * as fs from 'fs/promises';
import * as path from 'path';
import { WorkflowState } from './WorkflowOrchestrator';

/**
 * MarketMetadata - High-level information about a prediction market
 */
export interface MarketMetadata {
  marketId: string;
  category: string;
  descriptionA: string;
  descriptionB: string;
  phase: string;
  liquidity: number;
  volume24h: number;
  oddsA: number;
  oddsB: number;
}

/**
 * MarketQueryService - Service for discovering and querying prediction markets
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */
export class MarketQueryService {
  private stateDir: string;

  constructor(stateDir: string = './.cre/state') {
    this.stateDir = stateDir;
  }

  /**
   * List markets with pagination and filtering
   * 
   * @param filter - Filtering criteria (category, phase)
   * @param offset - Pagination offset
   * @param limit - Pagination limit
   * @returns Array of market metadata and total count
   */
  async listMarkets(
    filter: { category?: string; phase?: string } = {},
    offset: number = 0,
    limit: number = 10
  ): Promise<{ markets: MarketMetadata[]; total: number }> {
    try {
      const files = await fs.readdir(this.stateDir);
      const stateFiles = files.filter(f => f.endsWith('.state.json'));
      
      let markets: MarketMetadata[] = [];

      for (const file of stateFiles) {
        const filePath = path.join(this.stateDir, file);
        const data = await fs.readFile(filePath, 'utf8');
        const state: WorkflowState = JSON.parse(data);

        // Filter by phase if requested
        if (filter.phase && state.phase !== filter.phase) continue;

        // In a real system, we'd enrichment this with config/metadata
        // For now, we populate with state info and mock financial data
        markets.push({
          marketId: state.marketId,
          category: 'Finance', // Placeholder
          descriptionA: 'Event A', // Placeholder
          descriptionB: 'Event B', // Placeholder
          phase: state.phase,
          liquidity: 1000 + (Math.random() * 5000),
          volume24h: 200 + (Math.random() * 1000),
          ...this.calculateOdds(500 + (Math.random() * 200), 500 + (Math.random() * 200))
        });
      }

      // Apply pagination
      const total = markets.length;
      markets = markets.slice(offset, offset + limit);

      return { markets, total };
    } catch (error) {
      console.error(`Error listing markets: ${error}`);
      return { markets: [], total: 0 };
    }
  }

  /**
   * Get detailed information for a specific market
   * 
   * @param marketId - Unique identifier of the market
   * @returns Detailed market metadata including odds
   */
  async getMarketDetails(marketId: string): Promise<MarketMetadata | null> {
    try {
      const filePath = path.join(this.stateDir, `${marketId}.state.json`);
      const data = await fs.readFile(filePath, 'utf8');
      const state: WorkflowState = JSON.parse(data);

      return {
        marketId: state.marketId,
        category: 'Finance',
        descriptionA: 'Event A occurs',
        descriptionB: 'Event B exceeds threshold',
        phase: state.phase,
        liquidity: 5000,
        volume24h: 1200,
        ...this.calculateOdds(2500, 2500)
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate odds for both outcomes based on liquidity pool balances
   * 
   * Requirements: 8.2
   * 
   * @param reserveA - Balance of collateral backing Event A
   * @param reserveB - Balance of collateral backing Event B (No)
   * @returns Probability-based odds (0-1)
   */
  calculateOdds(reserveA: number, reserveB: number): { oddsA: number; oddsB: number } {
    if (reserveA === 0 && reserveB === 0) {
      return { oddsA: 0.5, oddsB: 0.5 };
    }
    
    const total = reserveA + reserveB;
    return {
      oddsA: reserveA / total,
      oddsB: reserveB / total
    };
  }
}
