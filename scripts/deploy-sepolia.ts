import { ethers } from "hardhat";

async function main() {
  console.log("Starting Sepolia Deployment...");

  // 1. Deploy TradingEngine (No constructor args)
  console.log("Deploying TradingEngine...");
  const TradingEngine = await ethers.getContractFactory("TradingEngine");
  const tradingEngine = await TradingEngine.deploy();
  await tradingEngine.waitForDeployment();
  const tradingEngineAddress = await tradingEngine.getAddress();
  console.log("TradingEngine deployed to:", tradingEngineAddress);

  // 2. Deploy MarketRegistry (Needs TradingEngine address)
  console.log("Deploying MarketRegistry...");
  const MarketRegistry = await ethers.getContractFactory("MarketRegistry");
  const marketRegistry = await MarketRegistry.deploy(tradingEngineAddress);
  await marketRegistry.waitForDeployment();
  const marketRegistryAddress = await marketRegistry.getAddress();
  console.log("MarketRegistry deployed to:", marketRegistryAddress);

  // 3. Deploy SettlementManager (Needs MarketRegistry and TradingEngine addresses)
  console.log("Deploying SettlementManager...");
  const SettlementManager = await ethers.getContractFactory("SettlementManager");
  const settlementManager = await SettlementManager.deploy(marketRegistryAddress, tradingEngineAddress);
  await settlementManager.waitForDeployment();
  const settlementManagerAddress = await settlementManager.getAddress();
  console.log("SettlementManager deployed to:", settlementManagerAddress);

  // 4. Link TradingEngine -> MarketRegistry
  console.log("Linking MarketRegistry in TradingEngine...");
  await (await tradingEngine.setMarketRegistry(marketRegistryAddress)).wait();
  console.log("TradingEngine linked.");

  // 5. Link MarketRegistry -> SettlementManager
  console.log("Linking SettlementManager in MarketRegistry...");
  await (await marketRegistry.setSettlementManager(settlementManagerAddress)).wait();
  console.log("MarketRegistry linked.");

  console.log("\n--- Sepolia Deployment Summary ---");
  console.log("MARKET_REGISTRY_ADDRESS=" + marketRegistryAddress);
  console.log("TRADING_ENGINE_ADDRESS=" + tradingEngineAddress);
  console.log("SETTLEMENT_MANAGER_ADDRESS=" + settlementManagerAddress);
  console.log("----------------------------------\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
