export const SIDEBAR_WIDTH = 300;
export const RIGHT_PANEL_WIDTH = 345;
export const LAYOUT_COMPACT_BREAKPOINT = 1023;
export const LAYOUT_COMPACT_MEDIA_QUERY = `(max-width: ${LAYOUT_COMPACT_BREAKPOINT}px)`;

export const TITLE_GENERATION_PROMPT = `You are a conversation title generator. Your job is to generate a title for the following conversation between the USER and the ASSISTANT. Generate a concise, descriptive title (max 15 tokens) for this conversation. Output ONLY the title, nothing else.`;
export const TITLE_GENERATION_MODEL = "qwen/qwen-2.5-7b-instruct";
