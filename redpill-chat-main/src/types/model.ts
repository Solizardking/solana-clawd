export interface Model {
  id: string;
  name: string;
  providers: string[];
  specs?: {
    context_length?: number;
    input_modalities?: string[];
    output_modalities?: string[];
  };
}
