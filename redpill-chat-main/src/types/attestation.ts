export interface AttestationReport {
  signing_address: string;
  nvidia_payload: string;
  intel_quote: string;
  all_attestations: Array<{
    signing_address: string;
    nvidia_payload: string;
    intel_quote: string;
  }>;
}

export interface NvidiaPayload {
  nonce: string;
  evidence_list: string;
  arch: string;
}
