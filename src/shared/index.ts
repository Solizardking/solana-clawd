/** shared barrel — cross-cutting types and constants. */
export { DEVICE_AUTH_PAYLOAD_VERSION } from './device-auth.js';
export type {
  GatewayRole,
  GatewayClientIdentity,
  SignedDeviceDescriptor,
  GatewayConnectCredentials,
  DeviceAuthPayloadV3Fields,
} from './device-auth.js';

export type {
  MessageRole,
  AssistantMessage,
  ToolUseMessage,
  ToolResultMessage,
  GroupedToolUseMessage,
  UserMessage,
  BashOutputMessage,
  AttachmentMessage,
  ChannelMessage,
  MemoryInputMessage,
  PlanApprovalMessage,
  SystemMessage,
  RateLimitMessage,
  ShutdownMessage,
  APIErrorMessage,
  AgentNotificationMessage,
  TaskAssignmentMessage,
  AdvisorMessage,
  HookProgressMessage,
  SolanaOSMessage,
  SolanaOSMessageType,
} from './message-types.js';

export type { ModelCatalogEntry } from './model-catalog.js';
export { DEFAULT_MODEL_CATALOG } from './model-catalog.js';

export type { ToolPolicy, ToolPolicies, ToolPolicyProfile } from './tool-policy-shared.js';
export { DEFAULT_TOOL_GROUPS } from './tool-policy-shared.js';