import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { NextConfig } from "next";

/**
 * A local foc-devnet (github.com/FilOzone/foc-devnet), for development only:
 * enabled by FOC_DEVNET=1 or DEVNET_INFO_PATH, never in a deployment. The
 * client gets devnet-info.json without its `users`, so no devnet private key
 * is bundled, and reaches Lotus through /api/devnet-rpc because Lotus sends no
 * CORS headers (and same-origin keeps the CSP unchanged).
 */
function loadDevnetInfo() {
  const path =
    process.env.DEVNET_INFO_PATH ??
    (process.env.FOC_DEVNET === "1" ? join(homedir(), ".foc-devnet", "state", "latest", "devnet-info.json") : null);
  if (!path) return null;
  const { version, info } = JSON.parse(readFileSync(path, "utf8"));
  const { users: _privateKeys, ...publicInfo } = info;
  return { version, info: publicInfo };
}
const devnetInfo = loadDevnetInfo();

const svgrRule = {
  test: /\.svg$/,
  use: ["@svgr/webpack"],
};

const markdownRule = {
  test: /\.md$/,
  loader: "frontmatter-markdown-loader",
  options: {
    mode: ["body", "attributes", "react-component"],
  },
};

const isDevelopment = process.env.NODE_ENV === "development";
// Playwright's default mode swaps Privy for a local fake; `test:e2e:real` runs the real one.
const privyAlias =
  process.env.E2E_MODE === "mock" && isDevelopment ? { "@privy-io/react-auth": "./e2e/fake-privy.tsx" } : undefined;
const isVercelPreview = process.env.VERCEL_ENV === "preview";

const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-inline': the Next runtime and the Plausible init snippet are inline scripts.
  `script-src 'self' 'unsafe-inline' ${isDevelopment ? "'unsafe-eval' " : ""}https://plausible.io https://challenges.cloudflare.com https://*.stripe.com${isVercelPreview ? " https://vercel.live" : ""}`,
  `style-src 'self' 'unsafe-inline'${isVercelPreview ? " https://vercel.live" : ""}`,
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org",
  `frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://*.stripe.com${isVercelPreview ? " https://vercel.live" : ""}`,
  // eth.merkle.io through 56.rpc.thirdweb.com are viem chain defaults; createChainTransport falls back to them.
  // Loopback: a CLI waiting on 127.0.0.1 for the keyspace grant the setup page sends it.
  `connect-src 'self' https://auth.privy.io https://*.rpc.privy.systems https://api.moonpay.com https://*.stripe.com wss://relay.walletconnect.com wss://relay.walletconnect.org https://*.walletconnect.com https://*.walletconnect.org wss://www.walletlink.org https://api.goldsky.com https://*.glif.io https://*.publicnode.com https://*.drpc.org https://eth.merkle.io https://arb1.arbitrum.io https://mainnet.base.org https://mainnet.optimism.io https://api.avax.network https://56.rpc.thirdweb.com https://v2.api.squidrouter.com https://*.filbeam.com https://*.filoz.workers.dev https://plausible.io https://filecoin.blockscout.com https://filecoin-testnet.blockscout.com http://127.0.0.1:* http://localhost:*${isVercelPreview ? " https://vercel.live wss://ws-us3.pusher.com" : ""}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.*"],
  headers: async () => [{ source: "/(.*)", headers: securityHeaders }],
  env: devnetInfo ? { NEXT_PUBLIC_FOC_DEVNET_INFO: JSON.stringify(devnetInfo) } : {},
  rewrites: async () =>
    devnetInfo ? [{ source: "/api/devnet-rpc", destination: devnetInfo.info.lotus.host_rpc_url }] : [],
  images: {
    qualities: [75, 100],
  },
  webpack: (config) => {
    config.module.rules.push(svgrRule);
    config.module.rules.push(markdownRule);
    return config;
  },
  turbopack: {
    resolveAlias: privyAlias,
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
      "*.md": {
        loaders: ["frontmatter-markdown-loader"],
      },
    },
  },
};

export default nextConfig;
