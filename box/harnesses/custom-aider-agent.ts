#!/usr/bin/env tsx
/**
 * box/harnesses/custom-aider-agent.ts
 *
 * Aider custom agent harness inside an Upstash Box (github.com/Aider-AI/aider).
 * Aider is a Python-based coding agent. Uses uv to install aider-chat with Python 3.12.
 * Runs with --message for headless execution. Sessions persist via history files.
 *
 * Requires: ANTHROPIC_API_KEY or OPENAI_API_KEY
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... ANTHROPIC_API_KEY=... npx tsx harnesses/custom-aider-agent.ts
 */

import { Agent, Box } from "@upstash/box";

const AGENT_SOURCE = `
import sys, os, json, subprocess, uuid, re

args = sys.argv[1:]

def read_arg(name, fallback=""):
    try:
        idx = args.index(name)
        return args[idx + 1] if idx + 1 < len(args) else fallback
    except ValueError:
        return fallback

def emit(event, data):
    sys.stdout.write("event: " + event + "\\n")
    sys.stdout.write("data: " + json.dumps(data) + "\\n\\n")
    sys.stdout.flush()

def strip_ansi(text):
    return re.sub(r"\\x1b\\[[0-9;]*m", "", text)

def is_text_mime(mime):
    if mime.startswith("text/"): return True
    return mime.split(";")[0] in ["application/json","application/javascript",
        "application/typescript","application/xml","application/yaml","application/toml","application/sql"]

def build_prompt(base):
    path = os.environ.get("PROMPT_FILES_PATH")
    if not path: return base
    try:
        import base64
        with open(path) as f: files = json.load(f)
        try: os.unlink(path)
        except: pass
        parts = [base]
        for fi in files:
            if is_text_mime(fi.get("media_type","")):
                content = base64.b64decode(fi["data"]).decode("utf-8")
                parts.append("\\n\\nAttached file: " + (fi.get("filename") or "unnamed") + "\\n" + content)
            else:
                print("[aider] Skipping unsupported file type: " + fi.get("media_type","") + " (" + fi.get("filename") or "unnamed") + ")", file=sys.stderr)
        return "".join(parts)
    except: return base

TOKEN_RE = re.compile(r"Tokens:\\s+([\\d.,]+)\\s*([kKmM]?)\\s+sent,\\s+([\\d.,]+)\\s*([kKmM]?)\\s+received")
COST_RE = re.compile(r"Cost:\\s+\\$([\\d.]+)\\s+message")

def parse_count(num, suffix):
    n = float(num.replace(",", ""))
    s = suffix.lower()
    if s == "k": n *= 1_000
    elif s == "m": n *= 1_000_000
    return int(n)

WORK_DIR = "/workspace/home"
os.chdir(WORK_DIR)

prompt = read_arg("-p")
model  = read_arg("--model", "claude-sonnet-4-5-20250929")
session_id = read_arg("--session") or str(uuid.uuid4())

if not prompt:
    emit("error", {"error": "no prompt provided", "session_id": session_id})
    sys.exit(1)

has_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENAI_API_KEY")
if not has_key:
    emit("error", {"error": "ANTHROPIC_API_KEY or OPENAI_API_KEY is required", "session_id": session_id})
    sys.exit(1)

SESSIONS_DIR = "/workspace/home/.aider-sessions"
session_dir  = os.path.join(SESSIONS_DIR, session_id)
os.makedirs(session_dir, exist_ok=True)
chat_history_file  = os.path.join(session_dir, "chat.history.md")
input_history_file = os.path.join(session_dir, "input.history")
llm_history_file   = os.path.join(session_dir, "llm.history")
is_resume = os.path.exists(chat_history_file)

full_prompt = build_prompt(prompt)

extra_args = []
context_files = []
agent_opts = os.environ.get("AGENT_OPTIONS")
if agent_opts:
    try:
        parsed_opts = json.loads(agent_opts)
        if "agentOptions" in parsed_opts: parsed_opts = parsed_opts["agentOptions"]
        context_files = parsed_opts.pop("files", [])
        for k, v in parsed_opts.items():
            extra_args += ["--" + k, str(v)]
    except Exception as e:
        print("[aider] Warning: Failed to parse AGENT_OPTIONS: " + str(e), file=sys.stderr)

emit("tool", {"name": "aider", "toolCallId": session_id, "input": {"model": model, "session": session_id, "resume": is_resume}})

output = ""; input_tokens = 0; output_tokens = 0; total_cost_usd = 0.0

aider_cmd = [
    "aider", "--message", full_prompt, "--model", model, "--no-git",
    "--yes-always", "--no-auto-commits", "--no-pretty",
    "--chat-history-file", chat_history_file,
    "--input-history-file", input_history_file,
    "--llm-history-file", llm_history_file,
]
if is_resume: aider_cmd.append("--restore-chat-history")

proc = subprocess.Popen(
    aider_cmd + extra_args + context_files,
    cwd=WORK_DIR, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
)

for line in proc.stdout:
    clean = strip_ansi(line)
    output += clean
    emit("text", {"text": clean})
    tm = TOKEN_RE.search(clean)
    if tm:
        input_tokens  = parse_count(tm.group(1), tm.group(2))
        output_tokens = parse_count(tm.group(3), tm.group(4))
    cm = COST_RE.search(clean)
    if cm:
        try: total_cost_usd = float(cm.group(1))
        except: pass

proc.wait()

if proc.returncode != 0:
    emit("error", {"error": "aider exited with code " + str(proc.returncode), "input_tokens": input_tokens, "output_tokens": output_tokens, "cached_input_tokens": 0, "total_cost_usd": total_cost_usd, "session_id": session_id})
    sys.exit(1)

emit("done", {"output": output.strip(), "input_tokens": input_tokens, "output_tokens": output_tokens, "cached_input_tokens": 0, "total_cost_usd": total_cost_usd, "session_id": session_id})
`;

async function main() {
  if (!process.env.UPSTASH_BOX_API_KEY) throw new Error("UPSTASH_BOX_API_KEY required");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY required");

  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  Aider Custom Agent Harness (In Box)         │");
  console.log("└──────────────────────────────────────────────┘");

  console.log("\n🚀 Creating Box with custom Aider harness (Python runtime)...");
  const box = await Box.create({
    apiKey: process.env.UPSTASH_BOX_API_KEY!,
    runtime: "python",
    agent: {
      harness: Agent.Custom,
      model: "claude-sonnet-4-5-20250929",
      customHarness: {
        command: "python3",
        args: ["/workspace/home/custom-aider-agent.py"],
        protocol: "box-sse-v1",
      },
    },
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
      PATH: "/home/boxuser/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    },
  });
  console.log(`  Box: ${box.id}`);

  try {
    console.log("\n📦 Installing aider-chat via uv...");
    await box.exec.command(`
      curl -LsSf https://astral.sh/uv/install.sh | sh 2>&1 | tail -2
      export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
      uv python install 3.12 2>&1 | tail -1
      uv tool install aider-chat --python 3.12 2>&1 | tail -2
    `);

    console.log("\n📝 Writing harness...");
    await box.files.write({ path: "custom-aider-agent.py", content: AGENT_SOURCE });

    console.log("\n=== Turn 1 ===");
    const run1 = await box.agent.run({ prompt: "Create a file called hello.py that prints 'Hello from Aider!'" });
    console.log(run1.result);

    console.log("\n=== Turn 2 (follow-up) ===");
    const run2 = await box.agent.run({
      prompt: "Now add a second print statement to hello.py that prints 'Session memory works!'",
      options: { agentOptions: { files: ["hello.py"] } } as any,
    });
    console.log(run2.result);

  } finally {
    console.log("\n🧹 Cleaning up...");
    await box.delete();
  }
}

main().catch((err) => { console.error("FATAL:", err); process.exit(1); });