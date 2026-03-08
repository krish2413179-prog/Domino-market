import { ethers } from "hardhat";

async function main() {
  console.log("Deploying Domino Prediction Market contracts...");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy TradingEngine
  console.log("\nDeploying TradingEngine...");
  const TradingEngine = await ethers.getContractFactory("TradingEngine");
  const tradingEngine = await TradingEngine.deploy();
  await tradingEngine.waitForDeployment();
  const tradingEngineAddress = await tradingEngine.getAddress();
  console.log("TradingEngine deployed to:", tradingEngineAddress);

  // Deploy MarketRegistry
  console.log("\nDeploying MarketRegistry...");
  const MarketRegistry = await ethers.getContractFactory("MarketRegistry");
  const marketRegistry = await MarketRegistry.deploy(tradingEngineAddress);
  await marketRegistry.waitForDeployment();
  const marketRegistryAddress = await marketRegistry.getAddress();
  console.log("MarketRegistry deployed to:", marketRegistryAddress);

  // Deploy SettlementManager
  console.log("\nDeploying SettlementManager...");
  const SettlementManager = await ethers.getContractFactory("SettlementManager");
  const settlementManager = await SettlementManager.deploy(marketRegistryAddress, tradingEngineAddress);
  await settlementManager.waitForDeployment();
  const settlementManagerAddress = await settlementManager.getAddress();
  console.log("SettlementManager deployed to:", settlementManagerAddress);

  // Link SettlementManager to MarketRegistry
  console.log("\nConfiguring MarketRegistry...");
  await marketRegistry.setSettlementManager(settlementManagerAddress);
  console.log("SettlementManager linked to MarketRegistry");

  // Link MarketRegistry to TradingEngine
  console.log("\nConfiguring TradingEngine...");
  await tradingEngine.setMarketRegistry(marketRegistryAddress);
  console.log("MarketRegistry linked to TradingEngine");

  console.log("\n=== Deployment Summary ===");
  console.log("MarketRegistry:", marketRegistryAddress);
  console.log("TradingEngine:", tradingEngineAddress);
  console.log("SettlementManager:", settlementManagerAddress);
  console.log("\nUpdate your .env file with these addresses.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
