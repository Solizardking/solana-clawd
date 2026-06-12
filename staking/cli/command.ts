import { program } from "commander";
import {
  initProject,
  claimRewards,
  printStakeStatus,
  stakeAgent,
  unstakeAgent,
  setClusterConfig,
} from "./scripts";
import { DEFAULT_DEVNET_RPC } from "../lib/constant";

// program.version('0.0.1');

programCommand("init")
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const { env, keypair, rpc } = cmd.opts();

    console.log("Solana Cluster:", env);
    console.log("Keypair Path:", keypair);
    console.log("RPC URL:", rpc);

    await setClusterConfig(env, keypair, rpc);

    await initProject();
  });

function stakeCommand(name: string) {
  programCommand(name)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .option("-t, --nftType <string>", "NFT standard to stake", "Corenft")
    .option("-m, --mint <string>")
    .option("-a, --asset <string>", "Metaplex Core asset address")
    .option(
      "-c, --collection <string>",
      "Metaplex Core collection address (auto-derived from the asset if omitted)",
    )
    .action(async (directory, cmd) => {
      const { env, keypair, rpc, mint, asset, nftType, collection } =
        cmd.opts();
      const assetAddress = mint ?? asset;

      await setClusterConfig(env, keypair, rpc);
      if (assetAddress === undefined) {
        console.log("Missing agent asset address");
        return;
      }

      switch (nftType) {
        case "Corenft": {
          await stakeAgent(assetAddress, collection, keypair);
          break;
        }
        default: {
          console.log("Nft Type is invalid");
          return;
        }
      }
    });
}

function unstakeCommand(name: string) {
  programCommand(name)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .option("-t, --nftType <string>", "NFT standard to unlock", "Corenft")
    .option("-m, --mint <string>")
    .option("-a, --asset <string>", "Metaplex Core asset address")
    .option(
      "-c, --collection <string>",
      "Metaplex Core collection address (auto-derived from the asset if omitted)",
    )
    .action(async (directory, cmd) => {
      const { env, keypair, rpc, mint, asset, nftType, collection } =
        cmd.opts();
      const assetAddress = mint ?? asset;

      await setClusterConfig(env, keypair, rpc);
      if (assetAddress === undefined) {
        console.log("Missing agent asset address");
        return;
      }

      switch (nftType) {
        case "Corenft": {
          await unstakeAgent(assetAddress, collection, keypair);
          break;
        }
        default: {
          console.log("Nft Type is invalid");
          return;
        }
      }
    });
}

function claimCommand(name: string) {
  programCommand(name)
    .option("-m, --mint <string>")
    .option("-a, --asset <string>", "Metaplex Core asset address")
    .action(async (directory, cmd) => {
      const { env, keypair, rpc, mint, asset } = cmd.opts();
      const assetAddress = mint ?? asset;

      await setClusterConfig(env, keypair, rpc);
      if (assetAddress === undefined) {
        console.log("Missing agent asset address");
        return;
      }

      await claimRewards(assetAddress, keypair);
    });
}

function statusCommand(name: string) {
  programCommand(name)
    .option("-m, --mint <string>")
    .option("-a, --asset <string>", "Metaplex Core asset address")
    .action(async (directory, cmd) => {
      const { env, keypair, rpc, mint, asset } = cmd.opts();
      const assetAddress = mint ?? asset;

      await setClusterConfig(env, keypair, rpc);
      if (assetAddress === undefined) {
        console.log("Missing agent asset address");
        return;
      }

      await printStakeStatus(assetAddress, keypair);
    });
}

stakeCommand("stake");
stakeCommand("lock");
unstakeCommand("unstake");
unstakeCommand("unlock");
claimCommand("claim");
statusCommand("status");

function programCommand(name: string) {
  return program
    .command(name)
    .option("-e, --env <string>", "Solana cluster env name", "devnet") // mainnet-beta, testnet, devnet
    .option("-r, --rpc <string>", "Solana cluster RPC name", DEFAULT_DEVNET_RPC)
    .option(
      "-k, --keypair <string>",
      "Solana wallet Keypair Path",
      process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`,
    );
}

program.parse(process.argv);
