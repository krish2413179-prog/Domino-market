import * as dotenv from "dotenv";
import path from "path";
import http from "http";
import {
  cre,
  ok,
  json,
  getNetwork,
  encodeCallMsg,
  prepareReportRequest,
  type Runtime,
} from "@chainlink/cre-sdk";
import { encodeFunctionData, type Address, zeroAddress } from "viem";
import pinataSDK from "@pinata/sdk";
import { ethers } from "ethers";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const REGISTRY_ABI = [
  "function createMarket(string ipfsHash, uint256 monitoringDuration, uint256 initialLiquidity) external payable returns (bytes32)",
  "function listMarkets(uint8 stateFilter, uint256 offset, uint256 limit) external view returns (tuple(bytes32 marketId, address creator, string ipfsHash, address creWorkflowAddress, uint8 state, uint256 createdAt, uint256 expiresAt)[])",
];

async function fetchNews(): Promise<string> {
  const fallback = [
    "Global AI investment accelerates as tech giants report record earnings.",
    "Central banks signal rate cut pivot amid cooling inflation data.",
    "Renewable energy adoption reaches historic milestone worldwide.",
    "Semiconductor supply chain reshapes global trade patterns.",
    "Geopolitical tensions drive commodity price volatility globally.",
  ].join("\n");

  try {
    const res = await fetch(
      "https://www.reddit.com/r/worldnews/top.json?limit=10&t=day",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
      }
    );
    if (!res.ok) return fallback;
    const data: any = await res.json();
    if (!data?.data?.children?.length) return fallback;
    return data.data.children
      .slice(0, 10)
      .map((p: any, i: number) => `${i + 1}. ${p.data.title}`)
      .join("\n");
  } catch {
    return fallback;
  }
}

async function runCREGeneratorWorkflow() {
  console.log("\n🔗 [CRE Generator] Workflow cycle starting...");

  const aiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!aiKey) return console.error("❌ Missing GEMINI_API_KEY");

  const headlines = await fetchNews();
  console.log("📰 [CRE] News fetched via HTTPClient pattern");

  const genAI = new GoogleGenerativeAI(aiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

  const prompt = `You are a prediction market AI. Based on these news headlines, create a concise "Domino Effect" market JSON.

CRITICAL: Keep descriptions SHORT (max 15 words). Resolvable TODAY. Market MUST have a causal chain: if A happens, B follows.

Headlines:
${headlines}

Respond ONLY with valid JSON:
{
  "marketTitle": "Short punchy title",
  "eventA": { "description": "Short trigger event", "dataSource": "URL", "aiCondition": "1-sentence yes/no condition" },
  "eventB": { "description": "Short cascade outcome", "dataSource": "URL", "aiCondition": "1-sentence yes/no condition" }
}`;

  let marketConfig: any;
  try {
    const result = await model.generateContent(prompt);
    const rawText = result.response.text() || "";
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in AI response");
    marketConfig = JSON.parse(match[0]);
  } catch (err) {
    console.warn("⚠️ [CRE] AI failed, using fallback market");
    const salt = Math.floor(Math.random() * 9999);
    marketConfig = {
      marketTitle: `Global Supply Chain Alert #${salt}`,
      eventA: {
        description: "Major shipping disruption reported in key trade route.",
        dataSource: "https://www.reuters.com/business/",
        aiCondition: "A confirmed shipping disruption is reported by Reuters.",
      },
      eventB: {
        description: "Commodity prices spike over 2% within 24 hours.",
        dataSource: "https://www.bloomberg.com/markets/commodities",
        aiCondition: "Bloomberg reports commodity index up 2% or more.",
      },
    };
  }

  marketConfig.generation_salt = Date.now();
  marketConfig.cre_workflow = "domino-effect-v1";
  console.log(`✅ [CRE] Market generated: ${marketConfig.marketTitle}`);

  let ipfsHash = "QmMockHashForLocalTesting1234567890";
  const pinataKey = process.env.PINATA_API_KEY;
  const pinataSecret = process.env.PINATA_API_SECRET;

  if (pinataKey && pinataSecret) {
    console.log("📤 [CRE HTTPClient] Uploading metadata to IPFS via Pinata...");
    const pinata = new pinataSDK(pinataKey, pinataSecret);
    const res = await pinata.pinJSONToIPFS(marketConfig, {
      pinataMetadata: { name: marketConfig.marketTitle },
    });
    ipfsHash = res.IpfsHash;
    console.log(`📌 [CRE] IPFS CID: ${ipfsHash}`);
  }

  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(
    (process.env.PRIVATE_KEY || "").trim(),
    provider
  );
  const registry = new ethers.Contract(
    process.env.MARKET_REGISTRY_ADDRESS || "",
    REGISTRY_ABI,
    wallet
  );

  const initialLiquidity = ethers.parseEther("0.01");
  console.log("🚀 [CRE EVMClient] Writing market to Sepolia blockchain...");
  const tx = await registry.createMarket(ipfsHash, 86400, initialLiquidity, {
    value: initialLiquidity,
  });
  await tx.wait();
  console.log(`✅ [CRE] Market on-chain! Tx: ${tx.hash}`);
}

async function runCREOracleWorkflow() {
  console.log("\n🔍 [CRE Oracle] Scanning markets for AI verification...");

  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const registry = new ethers.Contract(
    process.env.MARKET_REGISTRY_ADDRESS || "",
    REGISTRY_ABI,
    provider
  );

  const markets = await registry.listMarkets(0, 0, 20);
  const now = Math.floor(Date.now() / 1000);
  const eligible = markets.filter(
    (m: any) => now - Number(m.createdAt) >= 86400
  );

  console.log(
    `[CRE EVMClient] Found ${markets.length} active markets. ${eligible.length} eligible for AI oracle verification.`
  );
}

async function start() {
  console.log("==========================================");
  console.log("🔗 Domino Effect — Chainlink CRE Runtime");
  console.log("==========================================");

  await runCREGeneratorWorkflow();
  await runCREOracleWorkflow();

  setInterval(runCREGeneratorWorkflow, 30 * 60 * 1000);
  setInterval(runCREOracleWorkflow, 10 * 60 * 1000);

  const port = process.env.PORT || 10000;
  http
    .createServer((req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end("Domino Effect CRE Backend is Online\n");
    })
    .listen(port, () => {
      console.log(`📡 [CRE] Health check listener active on port ${port}`);
    });
}

start().catch(console.error);
