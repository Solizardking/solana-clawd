/**
 * Utility functions for the server
 */
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';

/**
 * Simple logging utility that prefixes log messages with a component name
 * @param component The component name to use as a prefix
 * @returns An object with info, warn, error, and debug methods
 */
export function getLogger(component: string) {
  return {
    info: (message: string, ...args: any[]) => {
      console.info(`[${component}] ${message}`, ...args);
    },
    warn: (message: string, ...args: any[]) => {
      console.warn(`[${component}] ${message}`, ...args);
    },
    error: (message: string, ...args: any[]) => {
      console.error(`[${component}] ${message}`, ...args);
    },
    debug: (message: string, ...args: any[]) => {
      console.debug(`[${component}] ${message}`, ...args);
    }
  };
}

/**
 * Verify a signature using nacl
 * @param publicKey The public key that signed the message
 * @param message The message that was signed
 * @param signature The signature to verify
 * @returns True if the signature is valid, false otherwise
 */
export function verifySignature(
  publicKey: PublicKey,
  message: Buffer,
  signature: Buffer
): boolean {
  return nacl.sign.detached.verify(
    message,
    signature,
    publicKey.toBytes()
  );
}