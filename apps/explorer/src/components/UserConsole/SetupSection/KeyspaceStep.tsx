"use client";
import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import * as Keysmith from "@filoz/keysmith";
import { getAllDataSetMetadata, getClientDataSets } from "@filoz/synapse-core/warm-storage";
import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";
import CopyButton from "@/components/shared/CopyButton";
import { Notice } from "@/components/shared/Notice";
import { getChain } from "@/constants/chains";
import type { Network } from "@/types";
import { type KeyspaceRequest, verifyKeyAgreementKey } from "@/utils/setupLink";
import { SetupStep, type StepTone } from "./SetupStep";

/** Where the keyspace's commitment stands: an existing keyspace is checked against the one its datasets record. */
type Commitment =
  | { state: "loading" }
  | { state: "new" }
  | { state: "found"; value: string }
  | { state: "missing" }
  | { state: "unreadable" };

/**
 * The commitment a dataset this wallet pays for records for the keyspace. The
 * page refuses a keyspace it finds none for: without one, nothing checks that
 * the wallet's signature gives the key the keyspace was made with.
 */
function useCommitment(network: Network, account: Hex, keyspace: Hex | "new"): Commitment {
  const client = usePublicClient({ chainId: getChain(network).id });
  const [commitment, setCommitment] = useState<Commitment>({ state: keyspace === "new" ? "new" : "loading" });
  useEffect(() => {
    if (keyspace === "new" || !client) return;
    let live = true;
    (async () => {
      const { items } = await getClientDataSets(client, { address: account });
      for (const { dataSetId } of items) {
        const metadata = await getAllDataSetMetadata(client, { dataSetId: BigInt(dataSetId) });
        const recorded = metadata[Keysmith.COMMITMENT_KEY];
        if (metadata[Keysmith.KEYSPACE_ID_KEY]?.toLowerCase() === keyspace && recorded) {
          return { state: "found", value: recorded } as const;
        }
      }
      return { state: "missing" } as const;
    })()
      .then((found) => live && setCommitment(found))
      .catch(() => live && setCommitment({ state: "unreadable" }));
    return () => {
      live = false;
    };
  }, [client, account, keyspace]);
  return commitment;
}

/** Wallets that passed Keysmith's same-signature check in this browser: new keyspaces then cost one prompt. */
const vettedKey = (owner: Hex) => `keysmith:vetted:${owner.toLowerCase()}`;
function vetted(owner: Hex): boolean {
  try {
    return window.localStorage.getItem(vettedKey(owner)) === "1";
  } catch {
    return false;
  }
}
function markVetted(owner: Hex): void {
  try {
    window.localStorage.setItem(vettedKey(owner), "1");
  } catch {
    // Storage can be blocked; the next new keyspace then checks again, at the cost of one prompt.
  }
}

/**
 * An existing keyspace is checked against its commitment, with one signature. A new one signs twice so
 * Keysmith can check the wallet signs the same way each time, unless this wallet passed that check here before.
 */
function keysOptions(commitment: Commitment, owner: Hex): Keysmith.KeyspaceKeysOptions {
  if (commitment.state === "found") return { commitment: commitment.value };
  return vetted(owner) ? { verifySigner: false } : {};
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

type Delivery = "none" | "sending" | "sent" | "unreachable";

/** Send the grant to the tool's loopback listener. It answers with CORS for this origin, so the page can tell it arrived. */
async function deliver(callback: string, code: string): Promise<Delivery> {
  try {
    const response = await fetch(callback, { method: "POST", headers: { "content-type": "text/plain" }, body: code });
    return response.ok ? "sent" : "unreachable";
  } catch {
    return "unreachable";
  }
}

const COMMITMENT_STATUS: Record<Commitment["state"], { tone: StepTone; label: string }> = {
  loading: { tone: "waiting", label: "Finding the keyspace" },
  missing: { tone: "problem", label: "Keyspace not found" },
  unreadable: { tone: "problem", label: "Could not read the keyspace" },
  found: { tone: "todo", label: "Not shared" },
  new: { tone: "todo", label: "Not shared" },
};

const DELIVERY_COPY: Record<Delivery, string> = {
  none: "Paste this code into your terminal:",
  sending: "Sending to your terminal…",
  sent: "Sent to your terminal. If it is still asking, paste this code:",
  unreachable: "Your terminal could not be reached from this page. Paste this code into it:",
};

const Detail = ({ term, children }: { term: string; children: React.ReactNode }) => (
  <div className='grid gap-1 py-2.5 sm:grid-cols-[7rem_1fr] sm:gap-4'>
    <dt className='text-muted-foreground'>{term}</dt>
    <dd className='min-w-0 text-foreground'>{children}</dd>
  </div>
);

interface KeyspaceStepProps {
  number: number;
  network: Network;
  account: Hex;
  request: KeyspaceRequest;
  /** The session key the link authorizes; the grant goes only to a key-agreement key it signed. */
  sessionKey: Hex | null;
  /** When the session key's authorization ends, in unix seconds; null until it is authorized. The claim ends with it. */
  expires: bigint | null;
  onShared: () => void;
}

/**
 * Share a Keysmith keyspace with the link's session key. The wallet signs the
 * keyspace message (twice for a new keyspace); the page derives the keyspace
 * key, wraps it to the session key's public key, and forgets it. The wallet
 * then signs the claim's root, which gating providers check offline and which
 * ends when the session key does. The delivery goes back to the tool by its
 * loopback listener, or as a code to paste. Nothing is written on chain, so a
 * reload offers the step again.
 */
export const KeyspaceStep = ({
  number,
  network,
  account,
  request,
  sessionKey,
  expires,
  onShared,
}: KeyspaceStepProps) => {
  const { data: wallet } = useWalletClient({ chainId: getChain(network).id });
  const commitment = useCommitment(network, account, request.keyspace);
  const [bound, setBound] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    if (sessionKey) void verifyKeyAgreementKey(sessionKey, request).then((ok) => live && setBound(ok));
    return () => {
      live = false;
    };
  }, [sessionKey, request]);
  // Minted once, so the id shown is the one signed.
  const [minted] = useState<Hex>(() => Keysmith.newKeyspace());
  const keyspace = request.keyspace === "new" ? minted : request.keyspace;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<Delivery>("none");

  const share = async () => {
    if (!wallet || !sessionKey || expires === null) return;
    setBusy(true);
    setError(null);
    try {
      const signer = {
        signTypedData: (args: Parameters<typeof wallet.signTypedData>[0]) => wallet.signTypedData(args),
      };
      const { kk } = await Keysmith.keyspaceKeys(
        signer as Keysmith.TypedDataSigner,
        { owner: account, keyspace },
        keysOptions(commitment, account),
      );
      markVetted(account);
      // A role is a Keysmith scope: its key derives from the keyspace key, and opens only what is under it.
      const node = (request.role ? `scope:${request.role}` : "keyspace") as Keysmith.GrantNode;
      // The claim's root: one more prompt. Providers check it with what the request carries, no chain
      // reads, so it ends at the session key's expiry and revoking the key does not end it sooner.
      // rootClaim derives the node key from kk itself, so the key wrapped is the one the owner signed for.
      const { chain, nodeKey } = await Keysmith.rootClaim(signer, {
        owner: account,
        keyspace,
        chainId: BigInt(getChain(network).id),
        kk,
        node,
        bearer: sessionKey,
        maxDepth: 0,
        expires: Number(expires),
      });
      const grant = await Keysmith.wrapTo(
        request.publicKey,
        nodeKey,
        Keysmith.grantDescriptor({ owner: account, keyspace }, node),
      );
      const encoded = base64url(Keysmith.encodeDelivery(chain, grant));
      kk.fill(0);
      nodeKey.fill(0);
      setCode(encoded);
      onShared();
      if (request.callback) {
        setDelivery("sending");
        setDelivery(await deliver(request.callback, encoded));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const status: { tone: StepTone; label: string } = code
    ? { tone: "done", label: "Shared" }
    : COMMITMENT_STATUS[commitment.state];
  const ready = expires !== null && bound === true && (commitment.state === "found" || commitment.state === "new");
  const until = expires === null ? null : new Date(Number(expires) * 1000).toLocaleString();

  return (
    <SetupStep
      number={number}
      title='Share an encryption keyspace'
      description={
        <>
          Lets the tool encrypt, decrypt and fetch files in one keyspace without your wallet. Your wallet signs two
          messages here (three the first time it starts a keyspace in this browser): one for the key, one allowing
          providers to serve its files to the session key until it expires.
        </>
      }
      status={status}
    >
      <dl className='divide-y rounded-lg border px-4 text-sm'>
        <Detail term='Keyspace'>
          <span className='font-mono text-xs break-all leading-5'>{keyspace}</span>
          {request.keyspace === "new" && (
            <span className='mt-0.5 block text-xs text-muted-foreground'>A new keyspace.</span>
          )}
        </Detail>
        {request.role && (
          <Detail term='Role'>
            <span className='font-mono text-xs'>{request.role}</span>
          </Detail>
        )}
        <Detail term='Can read'>
          {request.role
            ? `What is stored under role ${request.role} and the roles beneath it, including later. Nothing else in the keyspace.`
            : "Everything in this keyspace, including what is stored in it later."}
        </Detail>
        <Detail term='Expires'>
          {until ? `${until}, with the session key.` : "With the session key, once it is authorized above."} Then it can
          no longer store files or fetch them from providers. Files it already has stay readable to it.
        </Detail>
        <Detail term='Revoking'>
          Revoking the session key stops it storing files at once, but not fetching them: providers check this signature
          without the chain, so fetching ends at the expiry. The key it was given cannot be taken back.
        </Detail>
        <Detail term='Returned'>
          {request.callback ? "Sent to the tool on this computer." : "As a code you paste into your terminal."}
        </Detail>
      </dl>

      {bound === false && (
        <Notice tone='error' role='alert' title='The session key did not sign this encryption key' className='mt-4'>
          <p className='mt-1 text-xs'>
            The link's encryption key is not signed by the session key above, so the grant could go to someone else.
            Nothing was shared. Run the command again for a new link.
          </p>
        </Notice>
      )}
      {commitment.state === "missing" && (
        <Notice tone='error' role='alert' title='This wallet has no such keyspace' className='mt-4'>
          <p className='mt-1 text-xs'>
            None of its datasets records keyspace {keyspace}. Check the id, or run the command with a new keyspace.
          </p>
        </Notice>
      )}
      {error && (
        <Notice tone='error' role='alert' title='The keyspace was not shared' className='mt-4'>
          <p className='mt-1 text-xs break-words'>{error}</p>
        </Notice>
      )}

      {expires === null && !code && (
        <p className='mt-4 text-sm text-muted-foreground'>
          Authorize the session key first: this sharing ends when it does.
        </p>
      )}
      {code ? (
        <div className='mt-4 flex flex-col gap-2'>
          <p className='text-sm'>{DELIVERY_COPY[delivery]}</p>
          <div className='flex items-start gap-2 rounded-lg border bg-muted/40 p-3'>
            <code className='min-w-0 flex-1 font-mono text-xs break-all'>{code}</code>
            <CopyButton value={code} tooltipText='Copy keyspace grant' successMessage='Keyspace grant copied' />
          </div>
        </div>
      ) : (
        <div className='mt-4'>
          <Button variant='primary' size='compact' disabled={!ready || !wallet || busy} onClick={() => void share()}>
            {busy ? "Waiting for your wallet…" : "Sign and share"}
          </Button>
        </div>
      )}
    </SetupStep>
  );
};
