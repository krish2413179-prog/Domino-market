// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
// Assume DataValidator is provided in the actual directory
import "./DataValidator.sol"; 

interface IMarketRegistry {
    enum MarketState {
        Active,
        MonitoringEventB,
        Settled
    }
    
    struct EventDefinition {
        string description;
        string[] dataSources;
        bytes detectionCriteria;
        uint256 monitoringDuration;
    }
    
    struct Market {
        bytes32 marketId;
        address creator;
        EventDefinition eventA;
        EventDefinition eventB;
        address creWorkflowAddress;
        MarketState state;
        uint256 createdAt;
        uint256 expiresAt;
    }
    
    function getMarket(bytes32 marketId) external view returns (Market memory);
    function updateMarketState(bytes32 marketId, MarketState newState) external;
}

interface ITradingEngine {
    struct LiquidityPool {
        uint256 yesReserve;
        uint256 noReserve;
        uint256 totalLiquidity;
    }
    
    function getPool(bytes32 marketId, bool isEventA) external view returns (LiquidityPool memory);
    function getPosition(bytes32 marketId, bool isEventA, address user) external view returns (uint256 yesShares, uint256 noShares);
    function burnShares(bytes32 marketId, bool isEventA, address user, uint256 yesSharesToBurn, uint256 noSharesToBurn) external;
    function withdrawPayout(bytes32 marketId, address payable user, uint256 amount) external;
}

contract SettlementManager is ReentrancyGuard, AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant WORKFLOW_ROLE = keccak256("WORKFLOW_ROLE");
    
    struct SettlementData {
        bytes32 marketId;
        bool eventAOccurred;
        bool eventBOccurred;
        uint256 eventATimestamp;
        uint256 eventBTimestamp;
        bytes proof;
    }

    mapping(bytes32 => SettlementData) public settlements;
    mapping(bytes32 => mapping(address => bool)) public hasClaimed;
    mapping(bytes32 => mapping(bool => uint256)) public payoutRatios;

    event MarketSettled(bytes32 indexed marketId, bool eventAOccurred, bool eventBOccurred, uint256 settledAt);
    event PayoutClaimed(bytes32 indexed marketId, address indexed user, uint256 amount);

    error MarketAlreadySettled(bytes32 marketId);
    error MarketNotSettled(bytes32 marketId);
    error InvalidSettlementSignature();
    error UnauthorizedWorkflow(address caller);
    error PayoutAlreadyClaimed(bytes32 marketId, address user);
    error NoPositionToClaim(bytes32 marketId, address user);

    IMarketRegistry public marketRegistry;
    ITradingEngine public tradingEngine;

    constructor(address _marketRegistry, address _tradingEngine) {
        require(_marketRegistry != address(0), "Invalid MarketRegistry address");
        require(_tradingEngine != address(0), "Invalid TradingEngine address");
        marketRegistry = IMarketRegistry(_marketRegistry);
        tradingEngine = ITradingEngine(_tradingEngine);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    function submitSettlement(SettlementData memory data, bytes memory signature) external onlyRole(WORKFLOW_ROLE) {
        _validateSettlementData(data);
        IMarketRegistry.Market memory market = marketRegistry.getMarket(data.marketId);
        if (market.state == IMarketRegistry.MarketState.Settled) revert MarketAlreadySettled(data.marketId);
        if (!verifySettlementSignature(data, signature, msg.sender)) revert InvalidSettlementSignature();
        
        settlements[data.marketId] = data;
        marketRegistry.updateMarketState(data.marketId, IMarketRegistry.MarketState.Settled);
        
        // true = Event A, false = Event B
        payoutRatios[data.marketId][true] = data.eventAOccurred ? 10000 : 0;
        payoutRatios[data.marketId][false] = data.eventBOccurred ? 10000 : 0;
        
        emit MarketSettled(data.marketId, data.eventAOccurred, data.eventBOccurred, block.timestamp);
    }
    
    function _validateSettlementData(SettlementData memory data) internal view {
        if (data.eventAOccurred && data.eventATimestamp > 0) DataValidator.validateTimestamp(data.eventATimestamp);
        if (data.eventBOccurred && data.eventBTimestamp > 0) DataValidator.validateTimestamp(data.eventBTimestamp);
        if (data.proof.length > 0) DataValidator.validateBytesLength(data.proof, 10240);
        if (data.eventAOccurred && data.eventBOccurred && data.eventATimestamp >= data.eventBTimestamp && data.eventATimestamp > 0 && data.eventBTimestamp > 0) revert InvalidSettlementSignature();
        if (data.eventBOccurred && !data.eventAOccurred) revert InvalidSettlementSignature();
    }

    function verifySettlementSignature(SettlementData memory data, bytes memory signature, address expectedSigner) internal pure returns (bool) {
        bytes32 messageHash = keccak256(abi.encodePacked(data.marketId, data.eventAOccurred, data.eventBOccurred, data.eventATimestamp, data.eventBTimestamp, data.proof));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        
        if (signature.length != 65) return false;
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        return ecrecover(ethSignedMessageHash, v, r, s) == expectedSigner;
    }

    function calculateUserPayout(bytes32 marketId, address user) public view returns (uint256 amount) {
        amount += calculateEventPayout(marketId, user, true); // Event A pool
        amount += calculateEventPayout(marketId, user, false); // Event B pool
    }
    
    function calculateEventPayout(bytes32 marketId, address user, bool isEventA) internal view returns (uint256 amount) {
        (uint256 yesShares, uint256 noShares) = tradingEngine.getPosition(marketId, isEventA, user);
        if (yesShares == 0 && noShares == 0) return 0;
        
        uint256 ratio = payoutRatios[marketId][isEventA];
        if (ratio == 10000) return calculateWinningPayout(marketId, yesShares, isEventA, true);
        else return calculateWinningPayout(marketId, noShares, isEventA, false);
    }

    function calculateWinningPayout(bytes32 marketId, uint256 shares, bool isEventA, bool isYes) internal view returns (uint256 payout) {
        if (shares == 0) return 0;
        ITradingEngine.LiquidityPool memory pool = tradingEngine.getPool(marketId, isEventA);
        if (isYes) payout = (shares * pool.totalLiquidity) / pool.yesReserve;
        else payout = (shares * pool.totalLiquidity) / pool.noReserve;
        return payout;
    }

    function claimPayout(bytes32 marketId) external nonReentrant returns (uint256 amount) {
        IMarketRegistry.Market memory market = marketRegistry.getMarket(marketId);
        if (market.state != IMarketRegistry.MarketState.Settled) revert MarketNotSettled(marketId);
        if (hasClaimed[marketId][msg.sender]) revert PayoutAlreadyClaimed(marketId, msg.sender);
        
        amount = calculateUserPayout(marketId, msg.sender);
        if (amount == 0) revert NoPositionToClaim(marketId, msg.sender);
        hasClaimed[marketId][msg.sender] = true;
        
        (uint256 aYes, uint256 aNo) = tradingEngine.getPosition(marketId, true, msg.sender);
        if (aYes > 0 || aNo > 0) tradingEngine.burnShares(marketId, true, msg.sender, aYes, aNo);
        
        (uint256 bYes, uint256 bNo) = tradingEngine.getPosition(marketId, false, msg.sender);
        if (bYes > 0 || bNo > 0) tradingEngine.burnShares(marketId, false, msg.sender, bYes, bNo);
        
        tradingEngine.withdrawPayout(marketId, payable(msg.sender), amount);
        emit PayoutClaimed(marketId, msg.sender, amount);
        return amount;
    }

    function grantWorkflowRole(address workflowAddress) external onlyRole(ADMIN_ROLE) {
        require(workflowAddress != address(0), "Invalid workflow address");
        _grantRole(WORKFLOW_ROLE, workflowAddress);
    }
    function revokeWorkflowRole(address workflowAddress) external onlyRole(ADMIN_ROLE) { _revokeRole(WORKFLOW_ROLE, workflowAddress); }
    function updateMarketRegistry(address _marketRegistry) external onlyRole(ADMIN_ROLE) {
        require(_marketRegistry != address(0), "Invalid MarketRegistry address");
        marketRegistry = IMarketRegistry(_marketRegistry);
    }
    function updateTradingEngine(address _tradingEngine) external onlyRole(ADMIN_ROLE) {
        require(_tradingEngine != address(0), "Invalid TradingEngine address");
        tradingEngine = ITradingEngine(_tradingEngine);
    }
}