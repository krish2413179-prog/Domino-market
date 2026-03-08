import { ethers } from "ethers";

const REGISTRY_ADDR = "0x90959444AeDfd16189423DA428144Cf29845a382";
const ABI = ["function depositLiquidity() external payable"];

async function main() {
  const pk = "4f2f402e4fa4fe0b24025ac812e7ff84118b80239728baebe5866795c560fa01";
  const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
  const wallet = new ethers.Wallet(pk, provider);
  const registry = new ethers.Contract(REGISTRY_ADDR, ABI, wallet);

  const amount = ethers.parseEther("0.1");
  console.log("Depositing 0.1 ETH into registry for auto-seeding...");
  const tx = await registry.depositLiquidity({ value: amount });
  console.log("Tx sent:", tx.hash);
  await tx.wait();
  const balance = await provider.getBalance(REGISTRY_ADDR);
  console.log("Registry ETH balance:", ethers.formatEther(balance), "ETH");
  console.log("Each new market will be auto-seeded with 0.01 ETH (10 markets total capacity).");
}

main().catch(console.error);
