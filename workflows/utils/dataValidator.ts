/**
 * @file dataValidator.ts
 * @notice TypeScript utilities for validating external data from oracles and data sources
 * @dev Provides validation for data format, bounds checking, and string sanitization
 * Requirements: 10.6 - External Data Validation
 */

/**
 * Custom error class for validation errors
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Configuration for numeric validation
 */
export interface NumericBounds {
  min: number;
  max: number;
}

/**
 * Configuration for string validation
 */
export interface StringValidationConfig {
  maxLength?: number;
  allowEmpty?: boolean;
  allowControlChars?: boolean;
}

/**
 * Oracle response structure
 */
export interface OracleResponse {
  timestamp: number;
  value: number | string | boolean;
  source: string;
  metadata?: Record<string, any>;
}

/**
 * Constants for validation
 */
export const VALIDATION_CONSTANTS = {
  MAX_STRING_LENGTH: 1024,
  MAX_ARRAY_LENGTH: 100,
  MAX_PROOF_SIZE: 10240, // 10KB
  TEN_YEARS_MS: 10 * 365 * 24 * 60 * 60 * 1000,
  BASIS_POINTS_MAX: 10000, // 100% in basis points
};

/**
 * Validates that a numeric value is within specified bounds
 * @param value The value to validate
 * @param min The minimum allowed value (inclusive)
 * @param max The maximum allowed value (inclusive)
 * @throws ValidationError if value is out of bounds
 */
export function validateNumericBounds(
  value: number,
  min: number,
  max: number
): void {
  if (value < min || value > max) {
    throw new ValidationError(
      `Value ${value} is out of bounds [${min}, ${max}]`
    );
  }
}

/**
 * Validates that a timestamp is reasonable (not too far in past or future)
 * @param timestamp The timestamp to validate (in milliseconds)
 * @throws ValidationError if timestamp is unreasonable
 */
export function validateTimestamp(timestamp: number): void {
  const now = Date.now();
  const minTimestamp = now - VALIDATION_CONSTANTS.TEN_YEARS_MS;
  const maxTimestamp = now + VALIDATION_CONSTANTS.TEN_YEARS_MS;

  if (timestamp < minTimestamp || timestamp > maxTimestamp) {
    throw new ValidationError(
      `Timestamp ${timestamp} is outside reasonable range [${minTimestamp}, ${maxTimestamp}]`
    );
  }

  // Also check it's not in the future
  if (timestamp > now) {
    throw new ValidationError(
      `Timestamp ${timestamp} is in the future (current: ${now})`
    );
  }
}

/**
 * Validates that a percentage value is between 0 and 100
 * @param percentage The percentage value (0-100)
 * @throws ValidationError if percentage is out of range
 */
export function validatePercentage(percentage: number): void {
  if (percentage < 0 || percentage > 100) {
    throw new ValidationError(
      `Percentage ${percentage} must be between 0 and 100`
    );
  }
}

/**
 * Validates that a percentage value in basis points is between 0 and 10000
 * @param basisPoints The percentage value in basis points (0-10000)
 * @throws ValidationError if value is out of range
 */
export function validateBasisPoints(basisPoints: number): void {
  if (basisPoints < 0 || basisPoints > VALIDATION_CONSTANTS.BASIS_POINTS_MAX) {
    throw new ValidationError(
      `Basis points ${basisPoints} must be between 0 and ${VALIDATION_CONSTANTS.BASIS_POINTS_MAX}`
    );
  }
}

/**
 * Sanitizes a string by checking length and content
 * @param input The string to sanitize
 * @param config Optional configuration for validation
 * @returns The sanitized string (same as input if valid)
 * @throws ValidationError if string is invalid
 */
export function sanitizeString(
  input: string,
  config: StringValidationConfig = {}
): string {
  const {
    maxLength = VALIDATION_CONSTANTS.MAX_STRING_LENGTH,
    allowEmpty = false,
    allowControlChars = false,
  } = config;

  // Check length
  if (input.length > maxLength) {
    throw new ValidationError(
      `String exceeds maximum length of ${maxLength} characters`
    );
  }

  // Check for empty string
  if (!allowEmpty && input.length === 0) {
    throw new ValidationError('String cannot be empty');
  }

  // Check for control characters and null bytes
  for (let i = 0; i < input.length; i++) {
    const charCode = input.charCodeAt(i);

    // Reject null bytes
    if (charCode === 0x00) {
      throw new ValidationError('String contains null byte');
    }

    // Reject control characters (except newline, carriage return, tab)
    if (!allowControlChars && charCode < 0x20 && charCode !== 0x09 && charCode !== 0x0a && charCode !== 0x0d) {
      throw new ValidationError(
        `String contains invalid control character at position ${i}`
      );
    }

    // Reject DEL character
    if (charCode === 0x7f) {
      throw new ValidationError('String contains DEL character');
    }
  }

  return input;
}

/**
 * Validates that a string is not empty after trimming
 * @param input The string to validate
 * @throws ValidationError if string is empty or only whitespace
 */
export function validateNonEmptyString(input: string): void {
  if (input.trim().length === 0) {
    throw new ValidationError('String is empty or contains only whitespace');
  }
}

/**
 * Validates an array length is within acceptable bounds
 * @param length The array length to validate
 * @param maxLength Optional maximum length (defaults to MAX_ARRAY_LENGTH)
 * @throws ValidationError if array length is invalid
 */
export function validateArrayLength(length: number, maxLength?: number): void {
  const max = maxLength ?? VALIDATION_CONSTANTS.MAX_ARRAY_LENGTH;

  if (length === 0) {
    throw new ValidationError('Array is empty');
  }

  if (length > max) {
    throw new ValidationError(
      `Array length ${length} exceeds maximum of ${max}`
    );
  }
}

/**
 * Validates that a bytes/buffer is not empty and within size limits
 * @param data The data to validate
 * @param maxLength The maximum allowed length
 * @throws ValidationError if data is invalid
 */
export function validateBytesLength(data: Buffer | Uint8Array, maxLength: number): void {
  if (data.length === 0) {
    throw new ValidationError('Data is empty');
  }

  if (data.length > maxLength) {
    throw new ValidationError(
      `Data length ${data.length} exceeds maximum of ${maxLength}`
    );
  }
}

/**
 * Validates that an address is not the zero address
 * @param address The address to validate (hex string)
 * @throws ValidationError if address is invalid
 */
export function validateAddress(address: string): void {
  // Check format
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new ValidationError(`Invalid address format: ${address}`);
  }

  // Check for zero address
  if (address === '0x0000000000000000000000000000000000000000') {
    throw new ValidationError('Address is zero address');
  }
}

/**
 * Validates oracle response data structure
 * @param response The oracle response to validate
 * @throws ValidationError if response is invalid
 */
export function validateOracleResponse(response: OracleResponse): void {
  // Validate timestamp
  validateTimestamp(response.timestamp);

  // Validate source is not empty
  validateNonEmptyString(response.source);

  // Sanitize source string
  sanitizeString(response.source);

  // Validate value based on type
  if (typeof response.value === 'number') {
    // Check for NaN and Infinity
    if (!Number.isFinite(response.value)) {
      throw new ValidationError('Numeric value must be finite');
    }
  } else if (typeof response.value === 'string') {
    sanitizeString(response.value);
  }
  // Boolean values are inherently valid
}

/**
 * Validates a price value from an oracle
 * @param price The price value to validate
 * @param minPrice The minimum acceptable price
 * @param maxPrice The maximum acceptable price
 * @throws ValidationError if price is invalid
 */
export function validatePrice(
  price: number,
  minPrice: number,
  maxPrice: number
): void {
  if (price <= 0) {
    throw new ValidationError('Price must be greater than zero');
  }

  validateNumericBounds(price, minPrice, maxPrice);
}

/**
 * Validates JSON structure for basic correctness
 * @param jsonString The JSON string to validate
 * @throws ValidationError if JSON is invalid
 */
export function validateJSONStructure(jsonString: string): void {
  // Validate length
  if (jsonString.length === 0) {
    throw new ValidationError('JSON string is empty');
  }

  if (jsonString.length > VALIDATION_CONSTANTS.MAX_STRING_LENGTH) {
    throw new ValidationError(
      `JSON string exceeds maximum length of ${VALIDATION_CONSTANTS.MAX_STRING_LENGTH}`
    );
  }

  // Try to parse JSON
  try {
    JSON.parse(jsonString);
  } catch (error) {
    throw new ValidationError(
      `Invalid JSON structure: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Validates consensus data from multiple oracle sources
 * @param values Array of values from different sources
 * @param threshold Minimum number of agreeing sources required
 * @param tolerancePercent Maximum allowed deviation between values (as percentage)
 * @returns The consensus value (median of agreeing values)
 * @throws ValidationError if consensus cannot be reached
 */
export function validateConsensus(
  values: number[],
  threshold: number,
  tolerancePercent: number
): number {
  // Validate array length
  validateArrayLength(values.length);

  // Validate threshold is reasonable
  if (threshold === 0 || threshold > values.length) {
    throw new ValidationError(
      `Invalid consensus threshold ${threshold} for ${values.length} values`
    );
  }

  // Validate tolerance is a valid percentage
  validatePercentage(tolerancePercent);

  // Calculate median value
  const sortedValues = [...values].sort((a, b) => a - b);
  const medianIndex = Math.floor(sortedValues.length / 2);
  const consensusValue = sortedValues[medianIndex];

  // Count how many values are within tolerance of median
  let agreeingCount = 0;
  for (const value of sortedValues) {
    const deviation = Math.abs(value - consensusValue);
    const percentDeviation = consensusValue !== 0
      ? (deviation / Math.abs(consensusValue)) * 100
      : 0;

    if (percentDeviation <= tolerancePercent) {
      agreeingCount++;
    }
  }

  // Verify consensus threshold is met
  if (agreeingCount < threshold) {
    throw new ValidationError(
      `Consensus threshold not met: only ${agreeingCount} of ${threshold} required sources agree`
    );
  }

  return consensusValue;
}

/**
 * Validates URL format for data sources
 * @param url The URL to validate
 * @throws ValidationError if URL is invalid
 */
export function validateDataSourceURL(url: string): void {
  // Validate URL is not empty
  if (url.length === 0) {
    throw new ValidationError('Data source URL cannot be empty');
  }

  // Validate URL length is reasonable
  if (url.length > 512) {
    throw new ValidationError(
      'Data source URL too long (max 512 characters)'
    );
  }

  // Validate URL starts with http:// or https://
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new ValidationError(
      'Data source must start with http:// or https://'
    );
  }

  // Validate URL doesn't contain localhost or private IP patterns
  const lowerUrl = url.toLowerCase();
  if (
    lowerUrl.includes('localhost') ||
    lowerUrl.includes('127.0.0.1') ||
    lowerUrl.includes('0.0.0.0')
  ) {
    throw new ValidationError(
      'Data source cannot reference localhost or loopback addresses'
    );
  }

  // Try to parse as URL
  try {
    new URL(url);
  } catch (error) {
    throw new ValidationError(
      `Invalid URL format: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Validates detection criteria data
 * @param criteria The detection criteria to validate (as bytes/buffer)
 * @throws ValidationError if criteria is invalid
 */
export function validateDetectionCriteria(criteria: Buffer | Uint8Array): void {
  // Validate criteria is not empty
  if (criteria.length === 0) {
    throw new ValidationError('Detection criteria cannot be empty');
  }

  // Validate criteria is not excessively large
  if (criteria.length > 1024) {
    throw new ValidationError(
      'Detection criteria too large (max 1024 bytes)'
    );
  }
}

/**
 * Validates monitoring duration
 * @param duration Duration in seconds
 * @param minDuration Minimum allowed duration (default: 1 day)
 * @param maxDuration Maximum allowed duration (default: 90 days)
 * @throws ValidationError if duration is invalid
 */
export function validateMonitoringDuration(
  duration: number,
  minDuration: number = 86400, // 1 day in seconds
  maxDuration: number = 7776000 // 90 days in seconds
): void {
  if (duration < minDuration || duration > maxDuration) {
    throw new ValidationError(
      `Monitoring duration ${duration} must be between ${minDuration} and ${maxDuration} seconds`
    );
  }
}

/**
 * Validates that a value is a valid integer
 * @param value The value to validate
 * @throws ValidationError if value is not an integer
 */
export function validateInteger(value: number): void {
  if (!Number.isInteger(value)) {
    throw new ValidationError(`Value ${value} is not an integer`);
  }
}

/**
 * Validates that a value is positive
 * @param value The value to validate
 * @throws ValidationError if value is not positive
 */
export function validatePositive(value: number): void {
  if (value <= 0) {
    throw new ValidationError(`Value ${value} must be positive`);
  }
}