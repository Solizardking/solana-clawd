import { useState, useCallback } from 'react';
import CryptoJS from 'crypto-js';

interface AgentDNAOptions {
  name: string;
  type: string;
  personality: string;
  capabilities: string[];
  complexity: number;
  seed?: string;
}

export function useAgentDNA() {
  const [dnaHash, setDnaHash] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const generateDNA = useCallback(async (options: AgentDNAOptions): Promise<string> => {
    try {
      setIsGenerating(true);
      setError(null);

      // Extract options
      const { name, type, personality, capabilities, complexity, seed } = options;

      // Create a combined string for hashing
      const timestamp = Date.now();
      const randomSeed = seed || Math.random().toString(36).substring(2, 15);
      
      const dataString = `${name}|${type}|${personality}|${capabilities.join(',')}|${complexity}|${timestamp}|${randomSeed}`;
      
      // Generate SHA-256 hash
      const hash = CryptoJS.SHA256(dataString).toString(CryptoJS.enc.Hex);
      
      // Store the result
      setDnaHash(hash);
      setIsGenerating(false);
      
      return hash;
    } catch (err) {
      console.error("Error generating agent DNA:", err);
      setError(err instanceof Error ? err : new Error("Failed to generate agent DNA"));
      setIsGenerating(false);
      throw err;
    }
  }, []);

  const clearDNA = useCallback(() => {
    setDnaHash(null);
    setError(null);
  }, []);

  return {
    dnaHash,
    isGenerating,
    error,
    generateDNA,
    clearDNA
  };
}

// Helper to convert hex string to Uint8Array (for Solana programs)
export function hexToUint8Array(hexString: string): Uint8Array {
  // Ensure even length
  if (hexString.length % 2 !== 0) {
    hexString = '0' + hexString;
  }
  
  // Convert to byte array
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
  }
  
  return bytes;
}

// Helper to truncate and format DNA hash for display
export function formatDNA(dnaHash: string, length: number = 8): string {
  if (!dnaHash) return '';
  
  // Take first 'length' characters
  const prefix = dnaHash.substring(0, length);
  
  // Format with hyphens for readability (e.g., ABCD-1234)
  if (length >= 8) {
    return `${prefix.substring(0, 4)}-${prefix.substring(4, 8)}`;
  }
  
  return prefix;
}