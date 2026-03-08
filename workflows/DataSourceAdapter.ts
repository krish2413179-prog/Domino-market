/**
 * DataSourceConfig - Configuration for an external data source request
 */
export interface DataSourceConfig {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * DataSourceAdapter - Abstracts external API interactions with retry logic
 * 
 * Requirements: 7.1, 7.2, 2.6, 3.6
 */
export class DataSourceAdapter {
  /**
   * Fetch data from a single source
   * 
   * @param config - Request configuration
   * @returns Parsed JSON response
   */
  async fetchData(config: DataSourceConfig): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 10000);

    let finalUrl = config.url;

    try {
      const response = await fetch(finalUrl, {
        method: config.method || 'GET',
        headers: config.headers,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetch data with exponential backoff retry logic
   * 
   * @param config - Request configuration
   * @param maxRetries - Maximum number of retry attempts
   * @param baseDelayMs - Initial delay before first retry
   * @returns Parsed JSON response
   */
  async fetchWithRetry(
    config: DataSourceConfig,
    maxRetries: number = 5,
    baseDelayMs: number = 1000
  ): Promise<any> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.fetchData(config);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Failed after ${maxRetries} retries. Last error: ${lastError?.message}`);
  }
}
