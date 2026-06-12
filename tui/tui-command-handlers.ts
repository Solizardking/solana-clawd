import type { Component, TUI } from "@mariozechner/pi-tui";
import {
  formatThinkingLevels,
  normalizeUsageDisplay,
  resolveResponseUsageMode,
} from "../auto-reply/thinking.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { formatRelativeTime } from "../utils/time-format.js";
import { helpText, parseCommand } from "./commands.js";
import type { ChatLog } from "./components/chat-log.js";
import {
  createFilterableSelectList,
  createSearchableSelectList,
  createSettingsList,
} from "./components/selectors.js";
import type { GatewayChatClient } from "./gateway-chat.js";
import {
  attestSkill,
  connectAgent,
  formatJson,
  getAttestationStatus,
  getFeaturedSkills,
  getMarketplace,
  getNewMarketplace,
  getPrices,
  getRegistrationInfo,
  getSupportedPayments,
  getSystemStatus,
  getTrendingMarketplace,
  getWalletInfo,
  listAgents,
  listSkills,
  searchSkills,
  settlePayment,
  verifyAttestation,
  verifyPayment,
} from "./tui-clawd-api.js";
import { formatStatusSummary } from "./tui-status-summary.js";
import type {
  AgentSummary,
  GatewayStatusSummary,
  TuiOptions,
  TuiStateAccess,
} from "./tui-types.js";

type CommandHandlerContext = {
  client: GatewayChatClient;
  chatLog: ChatLog;
  tui: TUI;
  opts: TuiOptions;
  state: TuiStateAccess;
  deliverDefault: boolean;
  openOverlay: (component: Component) => void;
  closeOverlay: () => void;
  refreshSessionInfo: () => Promise<void>;
  loadHistory: () => Promise<void>;
  setSession: (key: string) => Promise<void>;
  refreshAgents: () => Promise<void>;
  abortActive: () => Promise<void>;
  setActivityStatus: (text: string) => void;
  formatSessionKey: (key: string) => string;
};

export function createCommandHandlers(context: CommandHandlerContext) {
  const {
    client,
    chatLog,
    tui,
    opts,
    state,
    deliverDefault,
    openOverlay,
    closeOverlay,
    refreshSessionInfo,
    loadHistory,
    setSession,
    refreshAgents,
    abortActive,
    setActivityStatus,
    formatSessionKey,
  } = context;

  const setAgent = async (id: string) => {
    state.currentAgentId = normalizeAgentId(id);
    await setSession("");
  };

  const openModelSelector = async () => {
    try {
      const models = await client.listModels();
      if (models.length === 0) {
        chatLog.addSystem("no models available");
        tui.requestRender();
        return;
      }
      const items = models.map((model) => ({
        value: `${model.provider}/${model.id}`,
        label: `${model.provider}/${model.id}`,
        description: model.name && model.name !== model.id ? model.name : "",
      }));
      const selector = createSearchableSelectList(items, 9);
      selector.onSelect = (item) => {
        void (async () => {
          try {
            await client.patchSession({
              key: state.currentSessionKey,
              model: item.value,
            });
            chatLog.addSystem(`model set to ${item.value}`);
            await refreshSessionInfo();
          } catch (err) {
            chatLog.addSystem(`model set failed: ${String(err)}`);
          }
          closeOverlay();
          tui.requestRender();
        })();
      };
      selector.onCancel = () => {
        closeOverlay();
        tui.requestRender();
      };
      openOverlay(selector);
      tui.requestRender();
    } catch (err) {
      chatLog.addSystem(`model list failed: ${String(err)}`);
      tui.requestRender();
    }
  };

  const openAgentSelector = async () => {
    await refreshAgents();
    if (state.agents.length === 0) {
      chatLog.addSystem("no agents found");
      tui.requestRender();
      return;
    }
    const items = state.agents.map((agent: AgentSummary) => ({
      value: agent.id,
      label: agent.name ? `${agent.id} (${agent.name})` : agent.id,
      description: agent.id === state.agentDefaultId ? "default" : "",
    }));
    const selector = createSearchableSelectList(items, 9);
    selector.onSelect = (item) => {
      void (async () => {
        closeOverlay();
        await setAgent(item.value);
        tui.requestRender();
      })();
    };
    selector.onCancel = () => {
      closeOverlay();
      tui.requestRender();
    };
    openOverlay(selector);
    tui.requestRender();
  };

  const openSessionSelector = async () => {
    try {
      const result = await client.listSessions({
        includeGlobal: false,
        includeUnknown: false,
        includeDerivedTitles: true,
        includeLastMessage: true,
        agentId: state.currentAgentId,
      });
      const items = result.sessions.map((session) => {
        const title = session.derivedTitle ?? session.displayName;
        const formattedKey = formatSessionKey(session.key);
        // Avoid redundant "title (key)" when title matches key
        const label = title && title !== formattedKey ? `${title} (${formattedKey})` : formattedKey;
        // Build description: time + message preview
        const timePart = session.updatedAt ? formatRelativeTime(session.updatedAt) : "";
        const preview = session.lastMessagePreview?.replace(/\s+/g, " ").trim();
        const description =
          timePart && preview ? `${timePart} · ${preview}` : (preview ?? timePart);
        return {
          value: session.key,
          label,
          description,
          searchText: [
            session.displayName,
            session.label,
            session.subject,
            session.sessionId,
            session.key,
            session.lastMessagePreview,
          ]
            .filter(Boolean)
            .join(" "),
        };
      });
      const selector = createFilterableSelectList(items, 9);
      selector.onSelect = (item) => {
        void (async () => {
          closeOverlay();
          await setSession(item.value);
          tui.requestRender();
        })();
      };
      selector.onCancel = () => {
        closeOverlay();
        tui.requestRender();
      };
      openOverlay(selector);
      tui.requestRender();
    } catch (err) {
      chatLog.addSystem(`sessions list failed: ${String(err)}`);
      tui.requestRender();
    }
  };

  const openSettings = () => {
    const items = [
      {
        id: "tools",
        label: "Tool output",
        currentValue: state.toolsExpanded ? "expanded" : "collapsed",
        values: ["collapsed", "expanded"],
      },
      {
        id: "thinking",
        label: "Show thinking",
        currentValue: state.showThinking ? "on" : "off",
        values: ["off", "on"],
      },
    ];
    const settings = createSettingsList(
      items,
      (id, value) => {
        if (id === "tools") {
          state.toolsExpanded = value === "expanded";
          chatLog.setToolsExpanded(state.toolsExpanded);
        }
        if (id === "thinking") {
          state.showThinking = value === "on";
          void loadHistory();
        }
        tui.requestRender();
      },
      () => {
        closeOverlay();
        tui.requestRender();
      },
    );
    openOverlay(settings);
    tui.requestRender();
  };

  const handleCommand = async (raw: string) => {
    const { name, args } = parseCommand(raw);
    if (!name) return;
    switch (name) {
      case "help":
        chatLog.addSystem(
          helpText({
            provider: state.sessionInfo.modelProvider,
            model: state.sessionInfo.model,
          }),
        );
        break;
      case "status":
        try {
          const status = await client.getStatus();
          if (typeof status === "string") {
            chatLog.addSystem(status);
            break;
          }
          if (status && typeof status === "object") {
            const lines = formatStatusSummary(status as GatewayStatusSummary);
            for (const line of lines) chatLog.addSystem(line);
            break;
          }
          chatLog.addSystem("status: unknown response");
        } catch (err) {
          chatLog.addSystem(`status failed: ${String(err)}`);
        }
        break;
      case "agent":
        if (!args) {
          await openAgentSelector();
        } else {
          await setAgent(args);
        }
        break;
      case "agents":
        await openAgentSelector();
        break;
      case "session":
        if (!args) {
          await openSessionSelector();
        } else {
          await setSession(args);
        }
        break;
      case "sessions":
        await openSessionSelector();
        break;
      case "model":
        if (!args) {
          await openModelSelector();
        } else {
          try {
            await client.patchSession({
              key: state.currentSessionKey,
              model: args,
            });
            chatLog.addSystem(`model set to ${args}`);
            await refreshSessionInfo();
          } catch (err) {
            chatLog.addSystem(`model set failed: ${String(err)}`);
          }
        }
        break;
      case "models":
        await openModelSelector();
        break;
      case "think":
        if (!args) {
          const levels = formatThinkingLevels(
            state.sessionInfo.modelProvider,
            state.sessionInfo.model,
            "|",
          );
          chatLog.addSystem(`usage: /think <${levels}>`);
          break;
        }
        try {
          await client.patchSession({
            key: state.currentSessionKey,
            thinkingLevel: args,
          });
          chatLog.addSystem(`thinking set to ${args}`);
          await refreshSessionInfo();
        } catch (err) {
          chatLog.addSystem(`think failed: ${String(err)}`);
        }
        break;
      case "verbose":
        if (!args) {
          chatLog.addSystem("usage: /verbose <on|off>");
          break;
        }
        try {
          await client.patchSession({
            key: state.currentSessionKey,
            verboseLevel: args,
          });
          chatLog.addSystem(`verbose set to ${args}`);
          await refreshSessionInfo();
        } catch (err) {
          chatLog.addSystem(`verbose failed: ${String(err)}`);
        }
        break;
      case "reasoning":
        if (!args) {
          chatLog.addSystem("usage: /reasoning <on|off>");
          break;
        }
        try {
          await client.patchSession({
            key: state.currentSessionKey,
            reasoningLevel: args,
          });
          chatLog.addSystem(`reasoning set to ${args}`);
          await refreshSessionInfo();
        } catch (err) {
          chatLog.addSystem(`reasoning failed: ${String(err)}`);
        }
        break;
      case "usage": {
        const normalized = args ? normalizeUsageDisplay(args) : undefined;
        if (args && !normalized) {
          chatLog.addSystem("usage: /usage <off|tokens|full>");
          break;
        }
        const currentRaw = state.sessionInfo.responseUsage;
        const current = resolveResponseUsageMode(currentRaw);
        const next =
          normalized ?? (current === "off" ? "tokens" : current === "tokens" ? "full" : "off");
        try {
          await client.patchSession({
            key: state.currentSessionKey,
            responseUsage: next === "off" ? null : next,
          });
          chatLog.addSystem(`usage footer: ${next}`);
          await refreshSessionInfo();
        } catch (err) {
          chatLog.addSystem(`usage failed: ${String(err)}`);
        }
        break;
      }
      case "elevated":
        if (!args) {
          chatLog.addSystem("usage: /elevated <on|off|ask|full>");
          break;
        }
        if (!["on", "off", "ask", "full"].includes(args)) {
          chatLog.addSystem("usage: /elevated <on|off|ask|full>");
          break;
        }
        try {
          await client.patchSession({
            key: state.currentSessionKey,
            elevatedLevel: args,
          });
          chatLog.addSystem(`elevated set to ${args}`);
          await refreshSessionInfo();
        } catch (err) {
          chatLog.addSystem(`elevated failed: ${String(err)}`);
        }
        break;
      case "activation":
        if (!args) {
          chatLog.addSystem("usage: /activation <mention|always>");
          break;
        }
        try {
          await client.patchSession({
            key: state.currentSessionKey,
            groupActivation: args === "always" ? "always" : "mention",
          });
          chatLog.addSystem(`activation set to ${args}`);
          await refreshSessionInfo();
        } catch (err) {
          chatLog.addSystem(`activation failed: ${String(err)}`);
        }
        break;
      case "new":
      case "reset":
        try {
          await client.resetSession(state.currentSessionKey);
          chatLog.addSystem(`session ${state.currentSessionKey} reset`);
          await loadHistory();
        } catch (err) {
          chatLog.addSystem(`reset failed: ${String(err)}`);
        }
        break;
      case "abort":
        await abortActive();
        break;
      case "settings":
        openSettings();
        break;
      case "exit":
      case "quit":
        client.stop();
        tui.stop();
        process.exit(0);
        break;

      // ── OpenClawd CLI ────────────────────────────────────────────────────
      case "clawd": {
        const [sub, ...subArgs] = args.split(/\s+/);
        const subCmd = sub?.toLowerCase() ?? "";
        try {
          switch (subCmd) {
            case "skills":
            case "skills:list": {
              setActivityStatus("fetching");
              const data = await listSkills();
              chatLog.addSystem(formatJson(data));
              break;
            }
            case "skills:search": {
              const q = subArgs.join(" ");
              if (!q) { chatLog.addSystem("usage: /clawd skills:search <query>"); break; }
              setActivityStatus("fetching");
              const data = await searchSkills(q);
              chatLog.addSystem(formatJson(data));
              break;
            }
            case "skills:featured": {
              setActivityStatus("fetching");
              const data = await getFeaturedSkills();
              chatLog.addSystem(formatJson(data));
              break;
            }
            case "agents": {
              setActivityStatus("fetching");
              const data = await listAgents();
              chatLog.addSystem(formatJson(data));
              break;
            }
            case "status": {
              setActivityStatus("fetching");
              const data = await getSystemStatus();
              chatLog.addSystem(formatJson(data));
              break;
            }
            case "connect": {
              setActivityStatus("connecting");
              const data = await connectAgent();
              chatLog.addSystem(formatJson(data));
              break;
            }
            case "register": {
              for (const line of getRegistrationInfo()) chatLog.addSystem(line);
              break;
            }
            case "marketplace": {
              setActivityStatus("fetching");
              const data = await getMarketplace();
              chatLog.addSystem(formatJson(data));
              break;
            }
            case "marketplace:trending": {
              setActivityStatus("fetching");
              const data = await getTrendingMarketplace();
              chatLog.addSystem(formatJson(data));
              break;
            }
            case "marketplace:new": {
              setActivityStatus("fetching");
              const data = await getNewMarketplace();
              chatLog.addSystem(formatJson(data));
              break;
            }
            case "wallet": {
              setActivityStatus("fetching");
              const data = await getWalletInfo();
              chatLog.addSystem(formatJson(data));
              break;
            }
            case "prices": {
              setActivityStatus("fetching");
              const data = await getPrices();
              chatLog.addSystem(formatJson(data));
              break;
            }
            case "payment:supported": {
              setActivityStatus("fetching");
              const data = await getSupportedPayments();
              chatLog.addSystem(formatJson(data));
              break;
            }
            case "payment:verify": {
              const id = subArgs[0];
              if (!id) { chatLog.addSystem("usage: /clawd payment:verify <id>"); break; }
              setActivityStatus("verifying");
              const data = await verifyPayment(id);
              chatLog.addSystem(formatJson(data));
              break;
            }
            case "payment:settle": {
              const tx = subArgs[0];
              if (!tx) { chatLog.addSystem("usage: /clawd payment:settle <tx>"); break; }
              setActivityStatus("settling");
              const data = await settlePayment(tx);
              chatLog.addSystem(formatJson(data));
              break;
            }
            case "node":
            case "node:register":
            case "node:status":
              chatLog.addSystem(`node operations: ${subCmd} (coming soon)`);
              break;
            default:
              chatLog.addSystem(
                args
                  ? `unknown clawd subcommand: ${subCmd}`
                  : "usage: /clawd <skills|agents|status|connect|register|marketplace|prices|payment:supported|...>",
              );
          }
        } catch (err) {
          chatLog.addSystem(`clawd ${subCmd} failed: ${String(err)}`);
        }
        setActivityStatus("");
        break;
      }

      case "connect":
        try {
          setActivityStatus("connecting");
          const data = await connectAgent();
          chatLog.addSystem(formatJson(data));
        } catch (err) {
          chatLog.addSystem(`connect failed: ${String(err)}`);
        }
        setActivityStatus("");
        break;

      case "register":
        for (const line of getRegistrationInfo()) chatLog.addSystem(line);
        break;

      case "attest": {
        const [sub, ...subArgs] = args.split(/\s+/);
        const subCmd = sub?.toLowerCase() ?? "";
        // Parse --flag value pairs from subArgs
        const flags: Record<string, string> = {};
        for (let i = 0; i < subArgs.length - 1; i++) {
          if (subArgs[i].startsWith("--")) {
            flags[subArgs[i].slice(2)] = subArgs[i + 1];
            i++;
          }
        }
        try {
          switch (subCmd) {
            case "skill": {
              const skillId = flags.skill ?? "";
              const verifier = flags.verifier ?? "";
              const proofHash = flags["proof-hash"];
              if (!skillId || !verifier) {
                chatLog.addSystem("usage: /attest skill --skill <id> --verifier <id> [--proof-hash <hash>]");
                break;
              }
              setActivityStatus("attesting");
              const result = await attestSkill(skillId, verifier, proofHash);
              chatLog.addSystem("attestation created");
              chatLog.addSystem(formatJson(result));
              break;
            }
            case "verify": {
              const address = flags.address ?? subArgs[0];
              if (!address) {
                chatLog.addSystem("usage: /attest verify --address <address>");
                break;
              }
              setActivityStatus("verifying");
              const result = await verifyAttestation(address);
              chatLog.addSystem(formatJson(result));
              break;
            }
            case "status": {
              const address = flags.address;
              setActivityStatus("fetching");
              const result = await getAttestationStatus(address);
              chatLog.addSystem(formatJson(result));
              break;
            }
            case "agent":
              chatLog.addSystem(
                `agent identity: --agent ${flags.agent ?? "<id>"} --wallet ${flags.wallet ?? "<pubkey>"} --vault ${flags.vault ?? "default"}`,
              );
              chatLog.addSystem("use CLI/clawd-register.ts for full on-chain agent identity creation");
              break;
            case "vault":
              chatLog.addSystem(
                `vault init: --agent ${flags.agent ?? "<id>"} --wallet ${flags.wallet ?? "<pubkey>"}`,
              );
              chatLog.addSystem("use CLI/clawd-register.ts for full vault initialization");
              break;
            default:
              chatLog.addSystem("usage: /attest <skill|verify|status|agent|vault> [--flag value]");
          }
        } catch (err) {
          chatLog.addSystem(`attest ${subCmd} failed: ${String(err)}`);
        }
        setActivityStatus("");
        break;
      }

      default:
        chatLog.addSystem(`unknown command: /${name}`);
        break;
    }
    tui.requestRender();
  };

  const sendMessage = async (text: string) => {
    try {
      chatLog.addUser(text);
      tui.requestRender();
      setActivityStatus("sending");
      const { runId } = await client.sendChat({
        sessionKey: state.currentSessionKey,
        message: text,
        thinking: opts.thinking,
        deliver: deliverDefault,
        timeoutMs: opts.timeoutMs,
      });
      state.activeChatRunId = runId;
      setActivityStatus("waiting");
    } catch (err) {
      chatLog.addSystem(`send failed: ${String(err)}`);
      setActivityStatus("error");
    }
    tui.requestRender();
  };

  return {
    handleCommand,
    sendMessage,
    openModelSelector,
    openAgentSelector,
    openSessionSelector,
    openSettings,
    setAgent,
  };
}
