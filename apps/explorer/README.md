# Filecoin Pay Explorer

Web application for exploring Filecoin pay Rails, Accounts, Operators and their analytics.

## Setup

> **Note:** For complete setup instructions including dependency installation and building shared packages, see the [main README](../../README.md) in the repository root.

### Environment Variables

This app requires the following environment variables:

| Variable                               | Description                                   | Required |
| -------------------------------------- | --------------------------------------------- | -------- |
| `NEXT_PUBLIC_SUBGRAPH_URL_MAINNET`     | Subgraph URL for Filecoin Mainnet (chain 314) | Yes      |
| `NEXT_PUBLIC_SUBGRAPH_URL_CALIBRATION` | Subgraph URL for Calibration testnet (314159) | Yes      |
| `NEXT_PUBLIC_SQUID_INTEGRATOR_ID`      | Optional Squid integrator ID override          | No       |
| `NEXT_PUBLIC_PRIVY_APP_ID`             | Public Privy application ID override          | No       |
| `NEXT_PUBLIC_PRIVY_CLIENT_ID`          | Public Privy web client ID override            | No       |
| `NEXT_PUBLIC_PRIVY_ONRAMP_SANDBOX`     | Use Privy's fiat onramp sandbox when `true`   | No       |

Squid route quotes use the public `filecoin-testing-94a4a25a-d40b-41cb-b148-e96098862` integrator ID by default.

The console defaults to the development Privy app shown in `.env.example`. Its dashboard must enable email, Google, and external-wallet login, and allow the exact local or preview origin being tested (including the port). Configure origins on the `dev` app client, because client settings override app-level settings, and do not add a broad `*.vercel.app` origin. PR previews are aliased to `pr-<number>.preview.pay.filecoin.cloud`, which the `https://*.preview.pay.filecoin.cloud` origin covers. Production must override both values with a separately provisioned Privy app (see issue #382); no Privy app secret is used by the browser.

**Setup:**

1. Copy the example file:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and set your subgraph URLs:

   ```bash
   NEXT_PUBLIC_SUBGRAPH_URL_MAINNET=https://api.goldsky.com/api/public/project_xxx/subgraphs/filecoin-pay-mainnet/version/gn
   NEXT_PUBLIC_SUBGRAPH_URL_CALIBRATION=https://api.goldsky.com/api/public/project_xxx/subgraphs/filecoin-pay-calibration/version/gn
   NEXT_PUBLIC_PRIVY_APP_ID=cmtkfb83p04du0bk0kofldq4e
   NEXT_PUBLIC_PRIVY_CLIENT_ID=client-WY6d6QKpTJMyLAHudjThbGxFZiCsX4oQwkvMVSLRUKmLf
   NEXT_PUBLIC_PRIVY_ONRAMP_SANDBOX=false
   ```

## Running Locally

**Prerequisites:**

- Dependencies installed (`pnpm install` from root)
- Shared packages built (`pnpm build --filter @filecoin-pay/types --filter @filecoin-pay/ui` from root)
- Environment variables configured (see above)

**Development:**

```bash
pnpm dev
```

App runs on [http://localhost:3000](http://localhost:3000)

**Production:**

```bash
pnpm build
pnpm start
```

## Against a local foc-devnet

For developing against [foc-devnet](https://github.com/FilOzone/foc-devnet), the console
can add a third network, `devnet`, for wallets on chain 31415926:

```bash
FOC_DEVNET=1 pnpm dev
```

It reads `~/.foc-devnet/state/latest/devnet-info.json` (or `DEVNET_INFO_PATH`) at
startup, so restart it after restarting the devnet. Without the variable nothing
changes, and a `network=devnet` link is refused as unknown.

- The browser reaches Lotus through `/api/devnet-rpc`, a rewrite in `next.config.ts`,
  because Lotus sends no CORS headers. No devnet private key reaches the client.
- Session-key history is read from Lotus directly, since a devnet has no Blockscout.
- A devnet has no subgraph, so the subgraph-backed pages (rails, funds, services)
  show errors unless `NEXT_PUBLIC_SUBGRAPH_URL_DEVNET` points at one. The
  session-keys page, including its `?authorize=…&network=devnet` pairing link,
  works without it. The app still needs some value for the mainnet and
  calibration subgraph variables to start.

## Available Scripts

| Command       | Description                                            |
| ------------- | ------------------------------------------------------ |
| `pnpm dev`    | Start development server with Turbopack and hot-reload |
| `pnpm build`  | Build the application for production                   |
| `pnpm start`  | Start the production server (requires build first)     |
| `pnpm lint`   | Run Biome linter and auto-fix issues                   |
| `pnpm format` | Format code with Biome                                 |

## Tech Stack

- Next.js 15
- React 19 with TypeScript

## Dependencies

This app depends on the following workspace packages:

- `@filecoin-pay/types` - Shared TypeScript types
- `@filecoin-pay/ui` - Shared UI components and theming
- `@filecoin-pay/configs` - Shared configurations
