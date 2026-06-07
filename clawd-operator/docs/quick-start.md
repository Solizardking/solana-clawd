# Quick Start Guide

Get OpenClawd Operator up and running in 5 minutes!

## Prerequisites

Before you begin, ensure you have:

- Python 3.8 or higher
- Git (for checkpointing features)
- At least one AI CLI tool installed

## Step 1: Install an AI Agent

OpenClawd Operator works with multiple AI agents. Install at least one:

=== "Claude (Recommended)"

    ```bash
    npm install -g @anthropic-ai/claude-code
    # Or visit https://claude.ai/code for setup instructions
    ```

=== "Q Chat"

    ```bash
    pip install q-cli
    # Or follow instructions at https://github.com/qchat/qchat
    ```

=== "Gemini"

    ```bash
    npm install -g @google/gemini-cli
    # Configure with your API key
    ```

=== "ACP Agent"

    ```bash
    # Any ACP-compliant agent can be used
    # Example: Gemini CLI with ACP mode
    npm install -g @google/gemini-cli
    # Run with: ralph run -a acp --acp-agent gemini
    ```

## Step 2: Clone OpenClawd Operator

```bash
# Clone the repository
git clone https://github.com/mikeyobrien/ralph-orchestrator.git
cd ralph-orchestrator

# Install optional dependencies for monitoring
pip install psutil  # Recommended for system metrics
```

## Step 3: Create Your First Task

Create a `PROMPT.md` file with your task:

```markdown
# Task: Create a Todo List CLI

Build a Python command-line todo list application with:

- Add tasks
- List tasks
- Mark tasks as complete
- Save tasks to a JSON file

Include proper error handling and a help command.

The orchestrator will continue iterations until all requirements are met or limits reached.
```

## Step 4: Run OpenClawd Operator

```bash
# Basic execution (auto-detects available agent)
python ralph_orchestrator.py --prompt PROMPT.md

# Or specify an agent explicitly
python ralph_orchestrator.py --agent claude --prompt PROMPT.md

# Or use an ACP-compliant agent
python ralph_orchestrator.py --agent acp --acp-agent gemini --prompt PROMPT.md
```

## Step 5: Monitor Progress

OpenClawd Operator will now:

1. Read your prompt file
2. Execute the AI agent
3. Check for completion
4. Iterate until done or limits reached

You'll see output like:

```
2025-09-08 10:30:45 - INFO - Starting OpenClawd Operator v1.0.0
2025-09-08 10:30:45 - INFO - Using agent: claude
2025-09-08 10:30:45 - INFO - Starting iteration 1/100
2025-09-08 10:30:52 - INFO - Iteration 1 complete
2025-09-08 10:30:52 - INFO - Task not complete, continuing...
```

## What Happens Next?

OpenClawd Operator will continue iterating until one of these conditions is met:

- 🎯 All requirements appear to be satisfied
- ⏱️ Maximum iterations reached (default: 100)
- ⏰ Maximum runtime exceeded (default: 4 hours)
- 💰 Token or cost limits reached
- ❌ Unrecoverable error occurs
- ✅ Completion marker detected in prompt file
- 🔄 Loop detection triggers (repetitive outputs)

## Signaling Completion

Add a completion marker to your PROMPT.md when the task is done:

```markdown
## Status

- [x] Created todo.py with CLI interface
- [x] Implemented add, list, complete commands
- [x] Added JSON persistence
- [x] Wrote unit tests
- [x] TASK_COMPLETE
```

OpenClawd Operator will detect the `- [x] TASK_COMPLETE` marker and stop orchestration immediately. This allows the AI agent to signal "I'm done" rather than relying solely on iteration limits.

## Basic Configuration

Control OpenClawd Operator's behavior with command-line options:

```bash
# Limit iterations
python ralph_orchestrator.py --prompt PROMPT.md --max-iterations 50

# Set cost limit
python ralph_orchestrator.py --prompt PROMPT.md --max-cost 10.0

# Enable verbose logging
python ralph_orchestrator.py --prompt PROMPT.md --verbose

# Dry run (test without executing)
python ralph_orchestrator.py --prompt PROMPT.md --dry-run
```

## Example Tasks

### Simple Function

```markdown
Write a Python function that validates email addresses using regex.
Include comprehensive unit tests.
```

### Web Scraper

```markdown
Create a web scraper that:

1. Fetches the HackerNews homepage
2. Extracts the top 10 stories
3. Saves them to a JSON file
   Use requests and BeautifulSoup.
```

### CLI Tool

```markdown
Build a markdown to HTML converter CLI tool:

- Accept input/output file arguments
- Support basic markdown syntax
- Add --watch mode for auto-conversion
```

## Next Steps

Now that you've run your first OpenClawd Operator task:

- 📖 Read the [User Guide](guide/overview.md) for detailed configuration
- 🔒 Learn about [Security Features](advanced/security.md)
- 💰 Understand [Cost Management](guide/cost-management.md)
- 📊 Set up [Monitoring](advanced/monitoring.md)
- 🚀 Deploy to [Production](advanced/production-deployment.md)

## Troubleshooting

### Agent Not Found

If OpenClawd Operator can't find an AI agent:

```bash
ERROR: No AI agents detected. Please install claude, q, gemini, or an ACP-compliant agent.
```

**Solution**: Install one of the supported agents (see Step 1)

### Permission Denied

If you get permission errors:

```bash
chmod +x ralph_orchestrator.py
```

### Task Not Completing

If your task runs indefinitely:

- Check that your prompt includes clear completion criteria
- Ensure the agent can modify files and work towards completion
- Review iteration logs in `.agent/metrics/`

## Getting Help

- Check the [FAQ](faq.md)
- Read the [Troubleshooting Guide](troubleshooting.md)
- Open an [issue on GitHub](https://github.com/mikeyobrien/ralph-orchestrator/issues)
- Join the [discussions](https://github.com/mikeyobrien/ralph-orchestrator/discussions)

---

🎉 **Congratulations!** You've successfully run your first OpenClawd Operator orchestration!
