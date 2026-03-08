// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IMarketRegistry {
    enum MarketState {
        Active,
        MonitoringEventB,
        Settled
    }
    
    struct Market {
        bytes32 marketId;
        address creator;
        string ipfsHash;
        address creWorkflowAddress;
        MarketState state;
        uint256 createdAt;
        uint256 expiresAt;
    }
    
    function getMarket(bytes32 marketId) external view returns (Market memory);
}

contract TradingEngine is ReentrancyGuard {
    struct LiquidityPool {
        uint256 yesReserve;
        uint256 noReserve;
        uint256 totalLiquidity;
    }

    struct Position {
        uint256 yesShares;
        uint256 noShares;
    }

    // mapping marketId => isEventA => Pool
    mapping(bytes32 => mapping(bool => LiquidityPool)) public pools;

    // mapping marketId => isEventA => user => Position
    mapping(bytes32 => mapping(bool => mapping(address => Position))) public positions;

    event PositionBought(bytes32 indexed marketId, bool indexed isEventA, address indexed buyer, bool isYes, uint256 stakeAmount, uint256 shares);
    event PositionSold(bytes32 indexed marketId, bool indexed isEventA, address indexed seller, bool isYes, uint256 shares, uint256 payout);
    event PoolInitialized(bytes32 indexed marketId, address indexed creator, uint256 initialLiquidity);

    error PoolNotFound(bytes32 marketId);
    error InsufficientShares(uint256 available, uint256 required);
    error InvalidStakeAmount();
    error InvalidShareAmount();
    error PoolAlreadyExists(bytes32 marketId);
    error InvalidInitialLiquidity();
    error MarketSettled(bytes32 marketId);

    IMarketRegistry public marketRegistry;

    function setMarketRegistry(address _marketRegistry) external {
        require(address(marketRegistry) == address(0), "MarketRegistry already set");
        require(_marketRegistry != address(0), "Invalid MarketRegistry address");
        marketRegistry = IMarketRegistry(_marketRegistry);
    }

    modifier onlyUnsettled(bytes32 marketId) {
        if (address(marketRegistry) != address(0)) {
            IMarketRegistry.Market memory market = marketRegistry.getMarket(marketId);
            if (market.state == IMarketRegistry.MarketState.Settled) revert MarketSettled(marketId);
        }
        _;
    }

    function initializePool(bytes32 marketId, uint256 initialLiquidity) external payable {
        if (initialLiquidity == 0) revert InvalidInitialLiquidity();
        if (pools[marketId][true].totalLiquidity != 0) revert PoolAlreadyExists(marketId);
        if (msg.value < initialLiquidity) revert InvalidStakeAmount();

        uint256 halfLiquidity = initialLiquidity / 2;
        uint256 quarterLiquidity = halfLiquidity / 2;
        
        pools[marketId][true].yesReserve = quarterLiquidity;
        pools[marketId][true].noReserve = quarterLiquidity;
        pools[marketId][true].totalLiquidity = halfLiquidity;

        pools[marketId][false].yesReserve = quarterLiquidity;
        pools[marketId][false].noReserve = quarterLiquidity;
        pools[marketId][false].totalLiquidity = halfLiquidity;

        emit PoolInitialized(marketId, msg.sender, initialLiquidity);
    }

    function getPool(bytes32 marketId, bool isEventA) external view returns (LiquidityPool memory) {
        if (pools[marketId][isEventA].totalLiquidity == 0) revert PoolNotFound(marketId);
        return pools[marketId][isEventA];
    }

    function calculateShares(bytes32 marketId, bool isEventA, bool isYes, uint256 stakeAmount) public view returns (uint256 shares) {
        LiquidityPool storage pool = pools[marketId][isEventA];
        if (pool.totalLiquidity == 0) revert PoolNotFound(marketId);
        if (stakeAmount == 0) revert InvalidStakeAmount();

        uint256 k = pool.yesReserve * pool.noReserve;
        if (isYes) {
            uint256 newYesReserve = pool.yesReserve + stakeAmount;
            uint256 newNoReserve = k / newYesReserve;
            shares = pool.noReserve - newNoReserve;
        } else {
            uint256 newNoReserve = pool.noReserve + stakeAmount;
            uint256 newYesReserve = k / newNoReserve;
            shares = pool.yesReserve - newYesReserve;
        }
    }

    function buyPosition(bytes32 marketId, bool isEventA, bool isYes, uint256 stakeAmount) external payable onlyUnsettled(marketId) nonReentrant returns (uint256 shares) {
        LiquidityPool storage pool = pools[marketId][isEventA];
        if (pool.totalLiquidity == 0) revert PoolNotFound(marketId);
        if (stakeAmount == 0 || msg.value < stakeAmount) revert InvalidStakeAmount();

        shares = calculateShares(marketId, isEventA, isYes, stakeAmount);

        if (isYes) {
            pool.yesReserve += stakeAmount;
            pool.noReserve -= shares;
            positions[marketId][isEventA][msg.sender].yesShares += shares;
        } else {
            pool.noReserve += stakeAmount;
            pool.yesReserve -= shares;
            positions[marketId][isEventA][msg.sender].noShares += shares;
        }

        emit PositionBought(marketId, isEventA, msg.sender, isYes, stakeAmount, shares);
        return shares;
    }

    function calculatePayout(bytes32 marketId, bool isEventA, bool isYes, uint256 sharesToSell) public view returns (uint256 payout) {
        LiquidityPool storage pool = pools[marketId][isEventA];
        if (pool.totalLiquidity == 0) revert PoolNotFound(marketId);
        if (sharesToSell == 0) revert InvalidShareAmount();

        uint256 k = pool.yesReserve * pool.noReserve;
        if (isYes) {
            uint256 newNoReserve = pool.noReserve + sharesToSell;
            uint256 newYesReserve = k / newNoReserve;
            payout = pool.yesReserve - newYesReserve;
        } else {
            uint256 newYesReserve = pool.yesReserve + sharesToSell;
            uint256 newNoReserve = k / newYesReserve;
            payout = pool.noReserve - newNoReserve;
        }
    }

    function sellPosition(bytes32 marketId, bool isEventA, bool isYes, uint256 sharesToSell) external onlyUnsettled(marketId) nonReentrant returns (uint256 payout) {
        LiquidityPool storage pool = pools[marketId][isEventA];
        if (pool.totalLiquidity == 0) revert PoolNotFound(marketId);
        if (sharesToSell == 0) revert InvalidShareAmount();

        Position storage position = positions[marketId][isEventA][msg.sender];
        uint256 availableShares = isYes ? position.yesShares : position.noShares;
        if (availableShares < sharesToSell) revert InsufficientShares(availableShares, sharesToSell);

        payout = calculatePayout(marketId, isEventA, isYes, sharesToSell);

        if (isYes) {
            pool.yesReserve -= payout;
            pool.noReserve += sharesToSell;
            position.yesShares -= sharesToSell;
        } else {
            pool.noReserve -= payout;
            pool.yesReserve += sharesToSell;
            position.noShares -= sharesToSell;
        }

        (bool success, ) = payable(msg.sender).call{value: payout}("");
        require(success, "Transfer failed");

        emit PositionSold(marketId, isEventA, msg.sender, isYes, sharesToSell, payout);
        return payout;
    }

    function burnShares(bytes32 marketId, bool isEventA, address user, uint256 yesSharesToBurn, uint256 noSharesToBurn) external {
        Position storage position = positions[marketId][isEventA][user];
        if (position.yesShares < yesSharesToBurn) revert InsufficientShares(position.yesShares, yesSharesToBurn);
        if (position.noShares < noSharesToBurn) revert InsufficientShares(position.noShares, noSharesToBurn);
        
        position.yesShares -= yesSharesToBurn;
        position.noShares -= noSharesToBurn;
    }
    
    function getPosition(bytes32 marketId, bool isEventA, address user) external view returns (uint256 yesShares, uint256 noShares) {
        Position storage position = positions[marketId][isEventA][user];
        return (position.yesShares, position.noShares);
    }

    function withdrawPayout(bytes32 marketId, address payable user, uint256 amount) external {
        // Pool existence simply validates market exists 
        if (pools[marketId][true].totalLiquidity == 0) revert PoolNotFound(marketId);
        if (amount > 0) {
            (bool success, ) = user.call{value: amount}("");
            require(success, "Transfer failed");
        }
    }
}
