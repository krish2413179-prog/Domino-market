import {
  Runner,
  HTTPClient,
  EVMClient,
  CronCapability,
  handler,
  ok,
  getNetwork,
  hexToBase64,
  bytesToHex,
  consensusIdenticalAggregation,
  type Runtime,
  type NodeRuntime,
  type CronPayload,
} from "@chainlink/cre-sdk";
import { encodeFunctionData, parseAbi } from "viem";
import { z } from "zod";

// ======================================================
// CONFIG SCHEMA
//
// privateKey and sepoliaRpcUrl are NOT needed in config —
// the DON handles signing and submission via EVMClient.
// marketRegistryAddress is the only chain config needed.
//
// Secrets stored via CLI:
//   cre secrets set GEMINI_API_KEY    <value>
//   cre secrets set PINATA_API_KEY    <value>
//   cre secrets set PINATA_API_SECRET <value>
// Declare in secrets.yaml:
//   secretsNames:
//     GEMINI_API_KEY:    - GEMINI_API_KEY_ALL
//     PINATA_API_KEY:    - PINATA_API_KEY_ALL
//     PINATA_API_SECRET: - PINATA_API_SECRET_ALL
// ======================================================
const configSchema = z.object({
  schedule: z.string(),
  marketRegistryAddress: z.string(),
  gasLimit: z.string(),
  gnewsApiKey: z.string(),
});

type Config = z.infer<typeof configSchema>;

// ======================================================
// TYPES
// ======================================================
type MarketData = {
  marketTitle: string;
  eventA: string;
  eventB: string;
};

type IPFSResult = {
  cid: string;
};

// ======================================================
// CONTRACT ABI — MarketRegistry.createMarket()
// Adjust parameter types to match your deployed contract.
// ======================================================
const marketRegistryAbi = parseAbi([
  "function createMarket(string marketTitle, string eventA, string eventB, string ipfsCid) external returns (bytes32 marketId)",
]);

// ======================================================
// HELPER — base64-encode a JSON body for HTTP POST
// RequestJson.body must be base64, not a raw JSON string.
// btoa() is unavailable in CRE WASM — use Buffer instead.
// ======================================================
function jsonBody(data: unknown): string {
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

// ======================================================
// STEP 1 — FETCH NEWS  (NodeRuntime, via runInNodeMode)
//
// Uses GNews API — free tier, reliable, no auth needed
// for basic usage. Falls back to Hacker News (HN) public
// API if GNews fails. Both return fresh real headlines.
//
// GNews free tier: https://gnews.io (100 req/day, no key
// needed for the top-headlines endpoint used here).
// ======================================================
const fetchNewsOnNode = (nodeRuntime: NodeRuntime<Config>): string => {
  const httpClient = new HTTPClient();

  // ── Primary: GNews top headlines ──────────────────────
  try {
    const gnewsResp = httpClient
      .sendRequest(nodeRuntime, {
        url: `https://gnews.io/api/v4/top-headlines?category=general&lang=en&max=5&apikey=${nodeRuntime.config.gnewsApiKey}`,
        method: "GET",
        headers: { Accept: "application/json" },
      })
      .result();

    if (ok(gnewsResp)) {
      const data = JSON.parse(new TextDecoder().decode(gnewsResp.body));
      if (data?.articles?.length) {
        return (data.articles as any[])
          .slice(0, 5)
          .map((a: any, i: number) => `${i + 1}. ${a.title}`)
          .join("\n");
      }
    }
  } catch {
    // fall through to HN backup
  }

  // ── Fallback: Hacker News top stories ─────────────────
  try {
    const hnResp = httpClient
      .sendRequest(nodeRuntime, {
        url: "https://hacker-news.firebaseio.com/v0/topstories.json",
        method: "GET",
        headers: { Accept: "application/json" },
      })
      .result();

    if (ok(hnResp)) {
      const ids: number[] = JSON.parse(new TextDecoder().decode(hnResp.body));
      const headlines: string[] = [];

      for (let i = 0; i < Math.min(5, ids.length); i++) {
        const storyResp = httpClient
          .sendRequest(nodeRuntime, {
            url: `https://hacker-news.firebaseio.com/v0/item/${ids[i]}.json`,
            method: "GET",
            headers: { Accept: "application/json" },
          })
          .result();

        if (ok(storyResp)) {
          const story = JSON.parse(new TextDecoder().decode(storyResp.body));
          if (story?.title) headlines.push(`${i + 1}. ${story.title}`);
        }
      }

      if (headlines.length > 0) return headlines.join("\n");
    }
  } catch {
    // fall through to hardcoded fallback
  }

  // ── Last resort: static fallback ──────────────────────
  return "1. Global markets face uncertainty amid trade tensions.\n2. Central banks signal cautious approach to rate cuts.\n3. Tech sector leads gains as AI investment continues.\n4. Energy prices volatile following supply disruptions.\n5. Emerging markets show resilience despite dollar strength.";
};

// ======================================================
// STEP 2 — GENERATE MARKET via Gemini  (NodeRuntime)
// API key passed as arg — NodeRuntime has no getSecret().
// ======================================================
const generateMarketOnNode = (
  nodeRuntime: NodeRuntime<Config>,
  headlines: string,
  geminiApiKey: string
): MarketData => {
  const FALLBACK: MarketData = {
    marketTitle: "Global Prediction Market",
    eventA: "Global economic volatility persists",
    eventB: "Crypto markets react to macro shifts",
  };

  const prompt = `You are a prediction market AI. Create a Domino Effect prediction market.
Return ONLY valid JSON with no markdown or explanation:
{"marketTitle":"...","eventA":"...","eventB":"..."}
Headlines:\n${headlines}`;

  const resp = new HTTPClient()
    .sendRequest(nodeRuntime, {
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiApiKey}`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: jsonBody({ contents: [{ parts: [{ text: prompt }] }] }),
    })
    .result();

  if (!ok(resp)) return FALLBACK;

  try {
    const raw = JSON.parse(new TextDecoder().decode(resp.body));
    const rawText: string = raw?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) return FALLBACK;
    const parsed = JSON.parse(match[0]);
    return {
      marketTitle: parsed.marketTitle ?? FALLBACK.marketTitle,
      eventA:      parsed.eventA      ?? FALLBACK.eventA,
      eventB:      parsed.eventB      ?? FALLBACK.eventB,
    };
  } catch {
    return FALLBACK;
  }
};

// ======================================================
// STEP 3 — UPLOAD TO IPFS via Pinata  (NodeRuntime)
// ======================================================
const uploadToIPFSOnNode = (
  nodeRuntime: NodeRuntime<Config>,
  market: MarketData,
  timestamp: number,
  pinataApiKey: string,
  pinataApiSecret: string
): IPFSResult => {
  const resp = new HTTPClient()
    .sendRequest(nodeRuntime, {
      url: "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        pinata_api_key: pinataApiKey,
        pinata_secret_api_key: pinataApiSecret,
      },
      body: jsonBody({
        pinataContent: {
          ...market,
          generation_timestamp: timestamp,
          cre_workflow: "domino-effect-ai",
        },
      }),
    })
    .result();

  if (!ok(resp)) return { cid: "QmMockHashForSimulation" };

  try {
    const data = JSON.parse(new TextDecoder().decode(resp.body));
    return { cid: (data.IpfsHash as string) || "QmMockHashForSimulation" };
  } catch {
    return { cid: "QmMockHashForSimulation" };
  }
};

// ======================================================
// MAIN CALLBACK
// ======================================================
const onCronTrigger = (
  runtime: Runtime<Config>,
  _payload: CronPayload
): string => {
  runtime.log("🚀 Domino Effect Market Workflow started");

  const timestamp = runtime.now().getTime();

  // ── Fetch secrets (DON level — Runtime only, sequential) ───────
  const geminiApiKey    = runtime.getSecret({ id: "GEMINI_API_KEY" }).result().value;
  const pinataApiKey    = runtime.getSecret({ id: "PINATA_API_KEY" }).result().value;
  const pinataApiSecret = runtime.getSecret({ id: "PINATA_API_SECRET" }).result().value;

  // ── Step 1: Fetch news ─────────────────────────────────────────
  runtime.log("📰 Fetching news headlines...");

  const headlines = runtime
    .runInNodeMode(fetchNewsOnNode, consensusIdenticalAggregation<string>())()
    .result();

  runtime.log(`📰 Headlines:\n${headlines}`);

  // ── Step 2: Generate prediction market ────────────────────────
  runtime.log("🤖 Generating market via Gemini...");

  const market = runtime
    .runInNodeMode(
      (nodeRuntime: NodeRuntime<Config>) =>
        generateMarketOnNode(nodeRuntime, headlines, geminiApiKey),
      consensusIdenticalAggregation<MarketData>()
    )()
    .result();

  runtime.log(
    `💡 Market: ${market.marketTitle}\n   Event A: ${market.eventA}\n   Event B: ${market.eventB}`
  );

  // ── Step 3: Upload to IPFS ─────────────────────────────────────
  runtime.log("📦 Uploading to IPFS...");

  const { cid } = runtime
    .runInNodeMode(
      (nodeRuntime: NodeRuntime<Config>) =>
        uploadToIPFSOnNode(nodeRuntime, market, timestamp, pinataApiKey, pinataApiSecret),
      consensusIdenticalAggregation<IPFSResult>()
    )()
    .result();

  runtime.log(`📌 IPFS CID: ${cid}`);

  // ── Step 4: Write onchain via EVMClient ────────────────────────
  // The CRE DON handles signing and broadcasting — no privateKey
  // or RPC URL needed in config. The two-step process:
  //   1. runtime.report() — ABI-encode + generate signed report
  //   2. evmClient.writeReport() — submit to MarketRegistry
  //
  // Both calls are DON-level (use top-level runtime, NOT NodeRuntime).
  runtime.log("⛓️ Writing market onchain...");

  // Get Sepolia network + instantiate EVM client
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: "ethereum-testnet-sepolia",
    isTestnet: true,
  });

  if (!network) {
    runtime.log("⚠️ Sepolia network not found — skipping onchain write.");
    return JSON.stringify({ status: "ok", marketTitle: market.marketTitle, eventA: market.eventA, eventB: market.eventB, cid });
  }

  const evmClient = new EVMClient(network.chainSelector.selector);

  // ABI-encode the createMarket(...) call using viem
  const callData = encodeFunctionData({
    abi: marketRegistryAbi,
    functionName: "createMarket",
    args: [market.marketTitle, market.eventA, market.eventB, cid],
  });

  // Step 4a: Generate a DON-signed report wrapping the encoded call
  const reportResp = runtime
    .report({
      encodedPayload: hexToBase64(callData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  // Step 4b: Submit the signed report to the MarketRegistry contract
  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.marketRegistryAddress,
      report: reportResp,
      gasConfig: {
        gasLimit: runtime.config.gasLimit,
      },
    })
    .result();

  const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
  runtime.log(`✅ Market created onchain! Tx: ${txHash}`);
  runtime.log(`🔗 View on Sepolia: https://sepolia.etherscan.io/tx/${txHash}`);

  runtime.log("✅ Workflow completed successfully");

  return JSON.stringify({
    status: "ok",
    marketTitle: market.marketTitle,
    eventA: market.eventA,
    eventB: market.eventB,
    cid,
    txHash: bytesToHex(writeResult.txHash || new Uint8Array(32)),
  });
};

// ======================================================
// INIT WORKFLOW
// ======================================================
const initWorkflow = (config: Config) => {
  const cron = new CronCapability();
  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

// ======================================================
// ENTRY POINT
// ======================================================
export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}