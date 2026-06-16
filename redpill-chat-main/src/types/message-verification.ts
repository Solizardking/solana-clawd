export interface SignatureData {
  text: string;
  signature: string;
  signing_algo: string;
  signing_address?: string;
}

export interface MessageVerificationState {
  isVerifying: boolean;
  signatureData: SignatureData | null;
  error: string | null;
}
