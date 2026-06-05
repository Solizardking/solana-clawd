/**
 * Oracle Account Parsing Utilities
 * 
 * Chainlink/Pyth oracle data parsing.
 * 
 * @module solana/oracle
 */

/** Minimum buffer size to read Chainlink price data */
const CHAINLINK_MIN_SIZE = 224;

/** Maximum reasonable decimals for a price feed */
const MAX_DECIMALS = 18;

/** Offset of decimals field in Chainlink aggregator account */
const CHAINLINK_DECIMALS_OFFSET = 138;

/** Offset of latest answer in Chainlink aggregator account */
const CHAINLINK_ANSWER_OFFSET = 216;

export interface OraclePrice {
  price: bigint;
  decimals: number;
}

/**
 * Parse price data from a Chainlink aggregator account buffer.
 */
export function parseChainlinkPrice(data: Buffer): OraclePrice {
  if (data.length < CHAINLINK_MIN_SIZE) {
    throw new Error(
      `Oracle account data too small: ${data.length} bytes (need at least ${CHAINLINK_MIN_SIZE})`
    );
  }

  const decimals = data.readUInt8(CHAINLINK_DECIMALS_OFFSET);
  if (decimals > MAX_DECIMALS) {
    throw new Error(
      `Oracle decimals out of range: ${decimals} (max ${MAX_DECIMALS})`
    );
  }

  const price = data.readBigInt64LE(CHAINLINK_ANSWER_OFFSET);
  if (price <= 0n) {
    throw new Error(
      `Oracle price is non-positive: ${price}`
    );
  }

  return { price, decimals };
}
