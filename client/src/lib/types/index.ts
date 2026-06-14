export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image_url?: string;
}

export interface CreateTokenMetadata {
  name: string;
  symbol: string;
  description: string;
  file: Blob;
  twitter?: string;
  telegram?: string;
  website?: string;
}

export interface PriorityFee {
  unitLimit: number;
  unitPrice: number;
}

export interface TransactionResult {
  success: boolean;
  error?: string;
  signature?: string;
  transaction?: any;
}
