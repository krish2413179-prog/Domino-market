// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DataValidator
 * @notice Library for validating external data from oracles and data sources
 * @dev Provides validation utilities for data format, bounds checking, and string sanitization
 * Requirements: 10.6 - External Data Validation
 */
library DataValidator {
    /// @notice Error thrown when data format is invalid
    error InvalidDataFormat(string reason);
    
    /// @notice Error thrown when numeric value is out of bounds
    error ValueOutOfBounds(int256 value, int256 min, int256 max);
    
    /// @notice Error thrown when string contains invalid characters
    error InvalidStringContent(string reason);
    
    /// @notice Maximum allowed string length for external data
    uint256 public constant MAX_STRING_LENGTH = 1024;
    
    /// @notice Maximum allowed array length for external data
    uint256 public constant MAX_ARRAY_LENGTH = 100;
    
    /**
     * @notice Validates that a numeric value is within specified bounds
     * @dev Reverts if value is outside the [min, max] range
     * @param value The value to validate
     * @param min The minimum allowed value (inclusive)
     * @param max The maximum allowed value (inclusive)
     */
    function validateNumericBounds(int256 value, int256 min, int256 max) internal pure {
        if (value < min || value > max) {
            revert ValueOutOfBounds(value, min, max);
        }
    }
    
    /**
     * @notice Validates that an unsigned numeric value is within specified bounds
     * @dev Reverts if value is outside the [min, max] range
     * @param value The value to validate
     * @param min The minimum allowed value (inclusive)
     * @param max The maximum allowed value (inclusive)
     */
    function validateUnsignedBounds(uint256 value, uint256 min, uint256 max) internal pure {
        if (value < min || value > max) {
            revert ValueOutOfBounds(int256(value), int256(min), int256(max));
        }
    }
    
    /**
     * @notice Validates that a timestamp is reasonable (not too far in past or future)
     * @dev Checks timestamp is within 10 years of current block timestamp
     * @param timestamp The timestamp to validate
     */
    function validateTimestamp(uint256 timestamp) internal view {
        uint256 tenYears = 10 * 365 days;
        uint256 minTimestamp = block.timestamp > tenYears ? block.timestamp - tenYears : 0;
        uint256 maxTimestamp = block.timestamp + tenYears;
        
        if (timestamp < minTimestamp || timestamp > maxTimestamp) {
            revert ValueOutOfBounds(int256(timestamp), int256(minTimestamp), int256(maxTimestamp));
        }
    }
    
    /**
     * @notice Validates that a percentage value is between 0 and 100
     * @dev Accepts values in basis points (0-10000 representing 0-100%)
     * @param percentage The percentage value in basis points
     */
    function validatePercentage(uint256 percentage) internal pure {
        if (percentage > 10000) {
            revert ValueOutOfBounds(int256(percentage), 0, 10000);
        }
    }
    
    /**
     * @notice Sanitizes a string by checking length and content
     * @dev Validates string length and checks for control characters
     * @param input The string to sanitize
     * @return sanitized The sanitized string (same as input if valid)
     */
    function sanitizeString(string memory input) internal pure returns (string memory sanitized) {
        bytes memory inputBytes = bytes(input);
        
        // Check length
        if (inputBytes.length > MAX_STRING_LENGTH) {
            revert InvalidStringContent("String exceeds maximum length");
        }
        
        // Check for control characters and null bytes
        for (uint256 i = 0; i < inputBytes.length; i++) {
            bytes1 char = inputBytes[i];
            
            // Reject null bytes
            if (char == 0x00) {
                revert InvalidStringContent("String contains null byte");
            }
            
            // Reject control characters (except newline, carriage return, tab)
            if (uint8(char) < 0x20 && char != 0x09 && char != 0x0A && char != 0x0D) {
                revert InvalidStringContent("String contains invalid control characters");
            }
            
            // Reject DEL character
            if (uint8(char) == 0x7F) {
                revert InvalidStringContent("String contains DEL character");
            }
        }
        
        return input;
    }
    
    /**
     * @notice Validates that a string is not empty after trimming
     * @dev Checks that string contains at least one non-whitespace character
     * @param input The string to validate
     */
    function validateNonEmptyString(string memory input) internal pure {
        bytes memory inputBytes = bytes(input);
        
        if (inputBytes.length == 0) {
            revert InvalidStringContent("String is empty");
        }
        
        // Check if string contains at least one non-whitespace character
        bool hasContent = false;
        for (uint256 i = 0; i < inputBytes.length; i++) {
            bytes1 char = inputBytes[i];
            if (char != 0x20 && char != 0x09 && char != 0x0A && char != 0x0D) {
                hasContent = true;
                break;
            }
        }
        
        if (!hasContent) {
            revert InvalidStringContent("String contains only whitespace");
        }
    }
    
    /**
     * @notice Validates an array length is within acceptable bounds
     * @dev Prevents DoS attacks via excessively large arrays
     * @param length The array length to validate
     */
    function validateArrayLength(uint256 length) internal pure {
        if (length == 0) {
            revert InvalidDataFormat("Array is empty");
        }
        
        if (length > MAX_ARRAY_LENGTH) {
            revert InvalidDataFormat("Array exceeds maximum length");
        }
    }
    
    /**
     * @notice Validates that a bytes array is not empty and within size limits
     * @dev Checks bytes length is reasonable to prevent DoS
     * @param data The bytes array to validate
     * @param maxLength The maximum allowed length
     */
    function validateBytesLength(bytes memory data, uint256 maxLength) internal pure {
        if (data.length == 0) {
            revert InvalidDataFormat("Bytes data is empty");
        }
        
        if (data.length > maxLength) {
            revert InvalidDataFormat("Bytes data exceeds maximum length");
        }
    }
    
    /**
     * @notice Validates that an address is not the zero address
     * @dev Common validation for address parameters
     * @param addr The address to validate
     */
    function validateAddress(address addr) internal pure {
        if (addr == address(0)) {
            revert InvalidDataFormat("Address is zero address");
        }
    }
    
    /**
     * @notice Validates oracle response data structure
     * @dev Checks that oracle data contains required fields and valid values
     * @param timestamp The timestamp from the oracle
     * @param value The numeric value from the oracle
     * @param source The source identifier
     */
    function validateOracleResponse(
        uint256 timestamp,
        int256 value,
        string memory source
    ) internal view {
        // Validate timestamp is reasonable
        validateTimestamp(timestamp);
        
        // Validate source is not empty
        validateNonEmptyString(source);
        
        // Validate source string is sanitized
        sanitizeString(source);
        
        // Note: Value bounds should be validated by caller based on specific use case
    }
    
    /**
     * @notice Validates a price value from an oracle
     * @dev Ensures price is positive and within reasonable bounds
     * @param price The price value to validate (in wei or smallest unit)
     * @param minPrice The minimum acceptable price
     * @param maxPrice The maximum acceptable price
     */
    function validatePrice(uint256 price, uint256 minPrice, uint256 maxPrice) internal pure {
        if (price == 0) {
            revert ValueOutOfBounds(0, int256(minPrice), int256(maxPrice));
        }
        
        validateUnsignedBounds(price, minPrice, maxPrice);
    }
    
    /**
     * @notice Validates a boolean flag from external data
     * @dev Ensures the value is explicitly true or false (not undefined)
     * @param data The bytes data containing the boolean
     * @return The validated boolean value
     */
    function validateBoolean(bytes memory data) internal pure returns (bool) {
        if (data.length != 1) {
            revert InvalidDataFormat("Boolean data must be exactly 1 byte");
        }
        
        bytes1 value = data[0];
        if (value != 0x00 && value != 0x01) {
            revert InvalidDataFormat("Boolean must be 0x00 or 0x01");
        }
        
        return value == 0x01;
    }
    
    /**
     * @notice Validates JSON-like string data for basic structure
     * @dev Performs basic checks for balanced braces and quotes
     * @param jsonString The JSON string to validate
     */
    function validateJSONStructure(string memory jsonString) internal pure {
        bytes memory jsonBytes = bytes(jsonString);
        
        // Validate length
        if (jsonBytes.length == 0) {
            revert InvalidDataFormat("JSON string is empty");
        }
        
        if (jsonBytes.length > MAX_STRING_LENGTH) {
            revert InvalidDataFormat("JSON string exceeds maximum length");
        }
        
        // Count braces and brackets for basic structure validation
        int256 braceCount = 0;
        int256 bracketCount = 0;
        bool inString = false;
        
        for (uint256 i = 0; i < jsonBytes.length; i++) {
            bytes1 char = jsonBytes[i];
            
            // Track string boundaries
            if (char == '"' && (i == 0 || jsonBytes[i-1] != '\\')) {
                inString = !inString;
            }
            
            // Only count structural characters outside strings
            if (!inString) {
                if (char == '{') braceCount++;
                else if (char == '}') braceCount--;
                else if (char == '[') bracketCount++;
                else if (char == ']') bracketCount--;
                
                // Check for negative counts (closing before opening)
                if (braceCount < 0 || bracketCount < 0) {
                    revert InvalidDataFormat("JSON has unbalanced braces or brackets");
                }
            }
        }
        
        // Verify all braces and brackets are balanced
        if (braceCount != 0 || bracketCount != 0) {
            revert InvalidDataFormat("JSON has unbalanced braces or brackets");
        }
        
        // Verify we're not ending inside a string
        if (inString) {
            revert InvalidDataFormat("JSON has unclosed string");
        }
    }
    
    /**
     * @notice Validates consensus data from multiple oracle sources
     * @dev Checks that consensus threshold is met and values are consistent
     * @param values Array of values from different sources
     * @param threshold Minimum number of agreeing sources required
     * @param tolerance Maximum allowed deviation between values (in basis points)
     * @return consensusValue The consensus value (median of agreeing values)
     */
    function validateConsensus(
        int256[] memory values,
        uint256 threshold,
        uint256 tolerance
    ) internal pure returns (int256 consensusValue) {
        // Validate array length
        validateArrayLength(values.length);
        
        // Validate threshold is reasonable
        if (threshold == 0 || threshold > values.length) {
            revert InvalidDataFormat("Invalid consensus threshold");
        }
        
        // Validate tolerance is a valid percentage
        validatePercentage(tolerance);
        
        // Calculate median value
        int256[] memory sortedValues = _sortArray(values);
        uint256 medianIndex = sortedValues.length / 2;
        consensusValue = sortedValues[medianIndex];
        
        // Count how many values are within tolerance of median
        uint256 agreeingCount = 0;
        for (uint256 i = 0; i < sortedValues.length; i++) {
            int256 deviation = sortedValues[i] > consensusValue 
                ? sortedValues[i] - consensusValue 
                : consensusValue - sortedValues[i];
            
            // Calculate percentage deviation
            uint256 percentDeviation = consensusValue != 0 
                ? uint256(deviation * 10000 / _abs(consensusValue))
                : 0;
            
            if (percentDeviation <= tolerance) {
                agreeingCount++;
            }
        }
        
        // Verify consensus threshold is met
        if (agreeingCount < threshold) {
            revert InvalidDataFormat("Consensus threshold not met");
        }
        
        return consensusValue;
    }
    
    /**
     * @notice Helper function to sort an array of integers
     * @dev Uses bubble sort (acceptable for small arrays)
     * @param arr The array to sort
     * @return sorted The sorted array
     */
    function _sortArray(int256[] memory arr) private pure returns (int256[] memory) {
        int256[] memory sorted = new int256[](arr.length);
        for (uint256 i = 0; i < arr.length; i++) {
            sorted[i] = arr[i];
        }
        
        for (uint256 i = 0; i < sorted.length; i++) {
            for (uint256 j = i + 1; j < sorted.length; j++) {
                if (sorted[i] > sorted[j]) {
                    int256 temp = sorted[i];
                    sorted[i] = sorted[j];
                    sorted[j] = temp;
                }
            }
        }
        
        return sorted;
    }
    
    /**
     * @notice Helper function to get absolute value of an integer
     * @param x The integer value
     * @return The absolute value
     */
    function _abs(int256 x) private pure returns (int256) {
        return x >= 0 ? x : -x;
    }
}
