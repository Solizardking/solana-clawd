import { IDL } from "./types";

export const PumpFun: IDL = {
  version: "0.1.0",
  name: "pump_fun",
  instructions: [
    {
      name: "create",
      accounts: [
        {
          name: "mint",
          isMut: true,
          isSigner: true
        },
        {
          name: "associatedBondingCurve",
          isMut: true,
          isSigner: false
        },
        {
          name: "metadata",
          isMut: true,
          isSigner: false
        },
        {
          name: "user",
          isMut: true,
          isSigner: true
        }
      ],
      args: [
        {
          name: "name",
          type: "string"
        },
        {
          name: "symbol",
          type: "string"
        },
        {
          name: "uri",
          type: "string"
        },
        {
          name: "creator",
          type: "publicKey"
        }
      ]
    },
    {
      name: "buy",
      accounts: [
        {
          name: "feeRecipient",
          isMut: true,
          isSigner: false
        },
        {
          name: "mint",
          isMut: true,
          isSigner: false
        },
        {
          name: "associatedBondingCurve",
          isMut: true,
          isSigner: false
        },
        {
          name: "associatedUser",
          isMut: true,
          isSigner: false
        },
        {
          name: "user",
          isMut: true,
          isSigner: true
        }
      ],
      args: [
        {
          name: "amount",
          type: "u64"
        },
        {
          name: "solAmount",
          type: "u64"
        }
      ]
    },
    {
      name: "sell",
      accounts: [
        {
          name: "feeRecipient",
          isMut: true,
          isSigner: false
        },
        {
          name: "mint",
          isMut: true,
          isSigner: false
        },
        {
          name: "associatedBondingCurve",
          isMut: true,
          isSigner: false
        },
        {
          name: "associatedUser",
          isMut: true,
          isSigner: false
        },
        {
          name: "user",
          isMut: true,
          isSigner: true
        }
      ],
      args: [
        {
          name: "amount",
          type: "u64"
        },
        {
          name: "minSolOutput",
          type: "u64"
        }
      ]
    }
  ],
  events: [
    {
      name: "CreateEvent",
      fields: [
        {
          name: "mint",
          type: "publicKey",
          index: false
        },
        {
          name: "creator",
          type: "publicKey",
          index: false
        }
      ]
    },
    {
      name: "TradeEvent",
      fields: [
        {
          name: "mint",
          type: "publicKey",
          index: false
        },
        {
          name: "trader",
          type: "publicKey",
          index: false
        },
        {
          name: "tokenAmount",
          type: "u64",
          index: false
        },
        {
          name: "solAmount",
          type: "u64",
          index: false
        },
        {
          name: "isBuy",
          type: "bool",
          index: false
        }
      ]
    }
  ]
};

export type { IDL };
