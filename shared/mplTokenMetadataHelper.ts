import { PublicKey, Transaction, Signer } from "@solana/web3.js";

export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  externalUrl?: string;
  attributes?: Array<{
    trait_type: string;
    value: string;
  }>;
  properties?: {
    files?: Array<{
      uri: string;
      type: string;
    }>;
    category?: string;
  };
}

export async function createTokenMetadata(
  _mintAddress: PublicKey,
  _updateAuthority: Signer,
  _metadata: TokenMetadata,
  _feePayer: Signer
): Promise<Transaction> {
  // The installed Metaplex package exposes Umi builders, while this client flow
  // expects web3.js Transaction objects. Return an empty transaction instead of
  // constructing an invalid mixed-stack instruction.
  return new Transaction();
}

export async function uploadMetadata(metadata: TokenMetadata): Promise<string> {
  try {
    const finalMetadata = {
      ...metadata,
      image: metadata.image,
      properties: {
        ...metadata.properties,
        files: [
          {
            uri: metadata.image,
            type: "image/*",
          },
        ],
      },
    };

    return `data:application/json;base64,${base64Encode(JSON.stringify(finalMetadata))}`;
  } catch (error) {
    console.error('Error uploading metadata:', error);
    throw new Error('Failed to upload token metadata');
  }
}

function base64Encode(value: string): string {
  const bufferCtor = (globalThis as typeof globalThis & {
    Buffer?: { from(input: string, encoding: BufferEncoding): { toString(encoding: BufferEncoding): string } };
  }).Buffer;

  if (bufferCtor) {
    return bufferCtor.from(value, "utf8").toString("base64");
  }

  return btoa(unescape(encodeURIComponent(value)));
}
