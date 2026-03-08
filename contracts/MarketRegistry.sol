// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TradingEngine.sol";
import "./DataValidator.sol";

/**
 * @title MarketRegistry
 * @notice Manages market lifecycle and metadata for the Domino Effect Prediction Market
 * @dev Stores market definitions, event configurations, and state transitions
 */
contract MarketRegistry {
    /// @notice Possible states for a prediction market
    enum MarketState {
        Active,              // Monitoring Event A
        MonitoringEventB,    // Event A occurred, monitoring Event B
        Settled              // Final outcome determined
    }

    /// @notice Complete market configuration and state
    struct Market {
        bytes32 marketId;                // Unique market identifier
        address creator;                 // Address that created the market
        string ipfsHash;                 // IPFS CID containing market JSON metadata
        address creWorkflowAddress;      // CRE workflow contract address
        MarketState state;               // Current market state
        uint256 createdAt;               // Timestamp of market creation
        uint256 expiresAt;               // Timestamp when market expires
    }

    /// @notice Mapping from market ID to market data
    mapping(bytes32 => Market) public markets;

    /// @notice Array of all market IDs for enumeration
    bytes32[] public marketIds;

    /// @notice Emitted when a new market is created
    event MarketCreated(
        bytes32 indexed marketId,
        address indexed creator,
        uint256 createdAt,
        uint256 expiresAt
    );

    /// @notice Emitted when a market state changes
    event MarketStateUpdated(
        bytes32 indexed marketId,
        MarketState previousState,
        MarketState newState
    );

    /// @notice Error thrown when market ID already exists
    error MarketAlreadyExists(bytes32 marketId);

    /// @notice Error thrown when market is not found
    error MarketNotFound(bytes32 marketId);

    /// @notice Error thrown when caller is not authorized
    error Unauthorized(address caller);

    /// @notice Error thrown when monitoring duration is invalid
    error InvalidMonitoringDuration(uint256 duration);

    /// @notice Error thrown when event definition is invalid
    error InvalidEventDefinition(string reason);

    /// @notice Minimum monitoring duration in seconds (1 hour for demo)
    uint256 public constant MIN_MONITORING_DURATION = 1 hours;

    /// @notice Maximum monitoring duration in seconds (90 days)
    uint256 public constant MAX_MONITORING_DURATION = 90 days;

    /// @notice Reference to the TradingEngine contract
    TradingEngine public immutable tradingEngine;

    /// @notice Reference to the SettlementManager contract
    address public settlementManager;

    /**
     * @notice Constructor to set the TradingEngine address
     * @param _tradingEngine Address of the TradingEngine contract
     */
    constructor(address _tradingEngine) {
        require(_tradingEngine != address(0), "Invalid TradingEngine address");
        tradingEngine = TradingEngine(_tradingEngine);
    }

    /**
     * @notice Sets the SettlementManager address
     * @dev Can only be called once during initialization
     * @param _settlementManager Address of the SettlementManager contract
     */
    function setSettlementManager(address _settlementManager) external {
        require(settlementManager == address(0), "SettlementManager already set");
        require(_settlementManager != address(0), "Invalid SettlementManager address");
        settlementManager = _settlementManager;
    }

    /**
     * @notice Sets the workflow address for a market
     * @dev Only the market creator can set the workflow address
     * @param marketId The market identifier
     * @param workflowAddress The CRE workflow contract address
     */
    function setWorkflowAddress(bytes32 marketId, address workflowAddress) external {
        Market storage market = markets[marketId];
        
        // Validate market exists
        if (market.creator == address(0)) {
            revert MarketNotFound(marketId);
        }
        
        // Only creator can set workflow address
        if (msg.sender != market.creator) {
            revert Unauthorized(msg.sender);
        }
        
        // Set workflow address
        market.creWorkflowAddress = workflowAddress;
    }

    /**
     * @notice Creates a new prediction market with IPFS metadata
     * @dev Generates unique market ID, and initializes liquidity pool
     * @param ipfsHash IPFS CID containing the market definitions
     * @param monitoringDuration Duration in seconds for monitoring Event B
     * @param initialLiquidity Initial liquidity amount to add to the pool
     * @return marketId The unique identifier for the created market
     */
    function createMarket(
        string memory ipfsHash,
        uint256 monitoringDuration,
        uint256 initialLiquidity
    ) external payable returns (bytes32 marketId) {
        // Validate monitoring duration is between 1 and 90 days
        if (monitoringDuration < MIN_MONITORING_DURATION || 
            monitoringDuration > MAX_MONITORING_DURATION) {
            revert InvalidMonitoringDuration(monitoringDuration);
        }
        
        // Validate initial liquidity is provided
        if (initialLiquidity == 0) {
            revert InvalidEventDefinition("Initial liquidity must be greater than zero");
        }

        // Validate sufficient funds sent
        if (msg.value < initialLiquidity) {
            revert InvalidEventDefinition("Insufficient funds sent for initial liquidity");
        }
        
        // Validate IPFS hash isn't empty
        DataValidator.validateNonEmptyString(ipfsHash);
        
        // Generate unique market ID based on creator, timestamp, and IPFS hash
        marketId = keccak256(abi.encodePacked(
            msg.sender,
            block.timestamp,
            ipfsHash
        ));
        
        // Ensure market ID doesn't already exist (extremely unlikely but check anyway)
        if (markets[marketId].creator != address(0)) {
            revert MarketAlreadyExists(marketId);
        }
        
        // Store market parameters onchain
        Market storage market = markets[marketId];
        market.marketId = marketId;
        market.creator = msg.sender;
        market.ipfsHash = ipfsHash;
        market.creWorkflowAddress = address(0); // Will be set later when workflow is deployed
        market.state = MarketState.Active;
        market.createdAt = block.timestamp;
        market.expiresAt = block.timestamp + monitoringDuration; // Market expires after monitoring duration
        
        // Add to market IDs array for enumeration
        marketIds.push(marketId);
        
        // Initialize liquidity pool in TradingEngine
        // Transfer funds to TradingEngine and initialize the pool
        tradingEngine.initializePool{value: initialLiquidity}(marketId, initialLiquidity);
        
        // Set MarketRegistry reference in TradingEngine if not already set
        try tradingEngine.setMarketRegistry(address(this)) {} catch {}
        
        // Emit MarketCreated event
        emit MarketCreated(marketId, msg.sender, market.createdAt, market.expiresAt);
        
        return marketId;
    }



    /**
     * @notice Checks if bytes start with a specific prefix
     * @param data The bytes to check
     * @param prefix The prefix to look for
     * @return True if data starts with prefix
     */
    function _startsWith(bytes memory data, string memory prefix) internal pure returns (bool) {
        bytes memory prefixBytes = bytes(prefix);
        if (data.length < prefixBytes.length) {
            return false;
        }
        
        for (uint256 i = 0; i < prefixBytes.length; i++) {
            if (data[i] != prefixBytes[i]) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * @notice Checks if bytes contain a specific substring
     * @param data The bytes to search in
     * @param substring The substring to look for
     * @return True if data contains substring
     */
    function _contains(bytes memory data, string memory substring) internal pure returns (bool) {
        bytes memory substringBytes = bytes(substring);
        if (data.length < substringBytes.length) {
            return false;
        }
        
        for (uint256 i = 0; i <= data.length - substringBytes.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < substringBytes.length; j++) {
                if (data[i + j] != substringBytes[j]) {
                    found = false;
                    break;
                }
            }
            if (found) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * @notice Retrieves a market by its ID
     * @param marketId The unique identifier of the market
     * @return The market data
     */
    function getMarket(bytes32 marketId) external view returns (Market memory) {
        if (markets[marketId].creator == address(0)) {
            revert MarketNotFound(marketId);
        }
        return markets[marketId];
    }

    /**
     * @notice Updates the state of a market
     * @dev Can only be called by the authorized CRE workflow or SettlementManager
     * @param marketId The unique identifier of the market
     * @param newState The new state to set
     */
    function updateMarketState(bytes32 marketId, MarketState newState) external {
        Market storage market = markets[marketId];
        
        if (market.creator == address(0)) {
            revert MarketNotFound(marketId);
        }
        
        // Only the authorized workflow or SettlementManager can update market state
        if (msg.sender != market.creWorkflowAddress && msg.sender != settlementManager) {
            revert Unauthorized(msg.sender);
        }
        
        MarketState previousState = market.state;
        market.state = newState;
        
        emit MarketStateUpdated(marketId, previousState, newState);
    }

    /**
     * @notice Lists markets with optional state filtering and pagination
     * @param stateFilter The state to filter by (use Active for no filter)
     * @param offset The starting index for pagination
     * @param limit The maximum number of markets to return
     * @return An array of markets matching the criteria
     */
    function listMarkets(
        MarketState stateFilter,
        uint256 offset,
        uint256 limit
    ) external view returns (Market[] memory) {
        // Count matching markets
        uint256 matchCount = 0;
        for (uint256 i = offset; i < marketIds.length && matchCount < limit; i++) {
            Market storage market = markets[marketIds[i]];
            if (market.state == stateFilter || stateFilter == MarketState.Active) {
                matchCount++;
            }
        }
        
        // Allocate result array
        Market[] memory result = new Market[](matchCount);
        
        // Fill result array
        uint256 resultIndex = 0;
        for (uint256 i = offset; i < marketIds.length && resultIndex < matchCount; i++) {
            Market storage market = markets[marketIds[i]];
            if (market.state == stateFilter || stateFilter == MarketState.Active) {
                result[resultIndex] = market;
                resultIndex++;
            }
        }
        
        return result;
    }

    /**
     * @notice Returns the total number of markets
     * @return The count of all markets
     */
    function getMarketCount() external view returns (uint256) {
        return marketIds.length;
    }
}
