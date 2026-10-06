import { createConfig } from "@privy-io/wagmi";
import { calibration, devnet, mainnet, SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { createChainTransport } from "./transports";

const devnetChains = devnet ? [devnet] : [];
export const supportedChains = [mainnet, calibration, ...devnetChains] as const;
const walletChains = [calibration, ...devnetChains, ...SQUID_SOURCE_CHAINS] as const;

export const config = createConfig({
  chains: walletChains,
  ssr: true,
  transports: Object.fromEntries(walletChains.map((chain) => [chain.id, createChainTransport(chain.id)])),
});
