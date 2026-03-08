import { DataSourceAdapter, DataSourceConfig } from './DataSourceAdapter';
import { validateConsensus } from './utils/dataValidator';
import get from 'lodash.get';
import { GoogleGenAI } from '@google/genai';

export interface DataSourceResponse {
  source: string;
  timestamp: number;
  value: any;
  error?: string;
}

export interface EventEvaluation {
  isMet: boolean;
  timestamp?: number;
  metricValue?: number;
  error?: string;
}

export class EventMonitor {
  private adapter: DataSourceAdapter;

  constructor(adapter: DataSourceAdapter = new DataSourceAdapter()) {
    this.adapter = adapter;
  }

  async pollDataSources(dataSources: string[]): Promise<DataSourceResponse[]> {
    const pollPromises = dataSources.map(async (url) => {
      try {
        const value = await this.adapter.fetchWithRetry({ url });
        return {
          source: url,
          timestamp: Date.now(),
          value
        };
      } catch (error) {
        return {
          source: url,
          timestamp: Date.now(),
          value: null,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

    const results = await Promise.all(pollPromises);
    
    const successCount = results.filter(r => !r.error).length;
    if (successCount === 0 && dataSources.length > 0) {
      console.warn('Total failure: All data sources are unavailable');
    }

    return results;
  }

  evaluateCriteria(
    responses: DataSourceResponse[],
    criteria: any,
    consensusThreshold: number
  ): EventEvaluation {
    const successfulResponses = responses.filter(r => !r.error);
    
    if (successfulResponses.length === 0) {
      return { isMet: false, error: 'No successful data responses available' };
    }

    try {
      const values = successfulResponses.map(r => {
        let val = r.value;
        if (criteria.path) {
          val = get(val, criteria.path);
        }
        return val;
      });
      
      if (criteria.type === 'BOOLEAN') {
        const positiveCount = values.filter(v => !!v).length;
        const ratio = positiveCount / values.length;
        
        return {
          isMet: ratio >= consensusThreshold,
          timestamp: Date.now()
        };
      } else if (criteria.type === 'THRESHOLD') {
        const numericValues = values.filter(v => typeof v === 'number') as number[];
        
        if (numericValues.length === 0) {
          return { isMet: false, error: 'No numeric values for threshold criteria' };
        }

        const thresholdCount = Math.ceil(values.length * consensusThreshold);
        if (numericValues.length < thresholdCount) {
          return { isMet: false, error: 'Insufficient agreeing sources' };
        }

        const sorted = [...numericValues].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        
        if (criteria.bounds) {
          if (median < criteria.bounds.min || median > criteria.bounds.max) {
             return { isMet: false, error: `Consensus value ${median} out of bounds [${criteria.bounds.min}, ${criteria.bounds.max}]` };
          }
        }
        
        const threshold = criteria.value || 0;
        const condition = criteria.condition || '';
        
        let isMet = false;
        if (condition.includes('>=')) isMet = median >= parseFloat(condition.split('>=')[1]);
        else if (condition.includes('<=')) isMet = median <= parseFloat(condition.split('<=')[1]);
        else if (condition.includes('>')) isMet = median > parseFloat(condition.split('>')[1]);
        else if (condition.includes('<')) isMet = median < parseFloat(condition.split('<')[1]);
        else if (threshold !== undefined) isMet = median >= threshold;

        return {
          isMet,
          timestamp: Date.now(),
          metricValue: median
        };
      }

      return { isMet: false, error: `Unsupported criteria type: ${criteria.type}` };
    } catch (error) {
      return { 
        isMet: false, 
        error: `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  async pollAndEvaluate(definition: any): Promise<{ isMet: boolean; timestamp: number; value?: number }> {
    if (definition.detectionCriteria && definition.detectionCriteria.type === 'AI_ORACLE') {
      return this.evaluateAIOracle(definition);
    }

    const responses = await this.pollDataSources(definition.dataSources);
    const evaluation = this.evaluateCriteria(
      responses,
      definition.detectionCriteria,
      definition.consensusThreshold
    );

    if (evaluation.error) {
      throw new Error(evaluation.error);
    }

    return {
      isMet: evaluation.isMet,
      timestamp: evaluation.timestamp || Date.now(),
      value: evaluation.metricValue
    };
  }

  private async evaluateAIOracle(definition: any): Promise<{ isMet: boolean; timestamp: number; value?: number }> {
    const aiKey = process.env.GEMINI_API_KEY;
    if (!aiKey) {
      throw new Error("GEMINI_API_KEY is not set in environment variables. Cannot execute AI_ORACLE market.");
    }

    const ai = new GoogleGenAI({ apiKey: aiKey });
    const url = definition.dataSources[0];
    const condition = definition.detectionCriteria.condition;

    // console.log(`[AI Oracle] Fetching content from ${url}...`);
    let rawText = "";
    try {
      const resp = await fetch(url);
      rawText = await resp.text();
      if (rawText.length > 30000) rawText = rawText.slice(0, 30000);
    } catch (e) {
      throw new Error(`AI Oracle failed to fetch source URL: ${url}`);
    }

    const prompt = `
    You are an AI Smart Contract Oracle. Your job is to read raw text from a website and objectively verify if a condition is met.
    
    Condition to verify: "${condition}"

    Raw Website Text:
    ---
    ${rawText}
    ---

    Is the condition met?
    You must answer strictly with the word "YES" or "NO". Do not include any other text, explanation, or punctuation.
    `;

    // console.log(`[AI Oracle] Querying Gemini 2.5 Flash to verify: "${condition}"`);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      const text = response.text?.trim().toUpperCase() || "";
      // console.log(`[AI Oracle] Gemini Response: ${text}`);

      return {
        isMet: text === "YES",
        timestamp: Date.now()
      };
    } catch (error) {
       throw new Error(`AI Oracle LLM evaluation failed: ${error}`);
    }
  }
}
