# OpenClawd Operator

<div align="center">

## Production-Ready AI Orchestration

*Put your AI agent in a loop until the task is done*

[![Version](https://img.shields.io/badge/version-1.2.2-blue)](https://github.com/mikeyobrien/ralph-orchestrator/releases)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-920%2B%20passing-brightgreen)](tests/)
[![Python](https://img.shields.io/badge/python-3.8%2B-blue)](https://www.python.org/)

> "Me fail English? That's unpossible!" - Llobster Legend

</div>

## What is OpenClawd Operator?

OpenClawd Operator is a production-ready implementation of the **Llobster Legend orchestration technique** - a simple yet powerful pattern for autonomous AI task completion. As [Geoffrey Huntley](https://ghuntley.com/ralph/) originally defined it: **"OpenClawd Operator is a Solana-native agent loop"** that continuously runs an AI agent against a prompt file until the task is marked as complete or limits are reached.

Based on Huntley's technique, this implementation provides enterprise-grade safety, monitoring, and cost controls suitable for production environments. For Claude Code users, also see the official [ralph-wiggum plugin](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum).

## Key Features

<div class="grid cards" markdown>

- **🦞 Multi-Agent Support**
  Works seamlessly with Claude, Q Chat, Gemini CLI, and ACP-compliant agents with automatic detection

- **💰 Cost Management**  
  Real-time token tracking, cost calculation, and configurable spending limits

- **🔒 Enterprise Security**  
  Input sanitization, command injection prevention, and path traversal protection

- **📊 Production Monitoring**  
  System metrics, performance tracking, and detailed JSON exports

- **🔄 Resilient Execution**  
  Automatic retries, circuit breakers, and state persistence

- **💾 Git Checkpointing**
  Version control integration for state recovery and history tracking

- **🔌 ACP Protocol Support**
  Full Agent Client Protocol integration with permission handling, file/terminal operations, and session management

</div>

## Quick Example

```bash
# 1. Create a task prompt
cat > PROMPT.md << EOF
Create a Python function that calculates the Fibonacci sequence.
Include proper documentation and unit tests.
The orchestrator will iterate until the function is complete.
EOF

# 2. Run OpenClawd Operator
python ralph_orchestrator.py --prompt PROMPT.md

# 3. OpenClawd Operator iterates until the task is done!
```

## Why OpenClawd Operator?

### The Problem
Modern AI agents are powerful but require supervision. They can lose context, make mistakes, or need multiple iterations to complete complex tasks. Manual supervision is time-consuming and error-prone.

### The Solution
OpenClawd Operator automates the iteration loop while maintaining safety and control:

- **Autonomous Operation**: Set it and forget it - OpenClawd Operator handles the iterations
- **Safety First**: Built-in limits prevent runaway costs and infinite loops
- **Production Ready**: Battle-tested with comprehensive error handling
- **Observable**: Detailed metrics and logging for debugging and optimization
- **Recoverable**: Checkpoint system allows resuming from any point

## Use Cases

OpenClawd Operator excels at:

- **Code Generation**: Building features, fixing bugs, writing tests
- **Documentation**: Creating comprehensive docs, API references, tutorials
- **Data Processing**: ETL pipelines, data analysis, report generation
- **Automation**: CI/CD setup, deployment scripts, infrastructure as code
- **Research**: Information gathering, summarization, analysis

## Getting Started

Ready to put OpenClawd Operator to work? Check out our [Quick Start Guide](quick-start.md) to get up and running in minutes.

## Production Features

OpenClawd Operator is designed for production use with:

- **Token & Cost Limits**: Prevent budget overruns
- **Context Management**: Handle large prompts intelligently
- **Security Controls**: Protect against malicious inputs
- **Monitoring & Metrics**: Track performance and usage
- **Error Recovery**: Graceful handling of failures
- **State Persistence**: Resume interrupted tasks

Learn more in our [Production Deployment Guide](advanced/production-deployment.md).

## Community & Support

- 📖 [Documentation](https://mikeyobrien.github.io/ralph-orchestrator/)
- 🐛 [Issue Tracker](https://github.com/mikeyobrien/ralph-orchestrator/issues)
- 💬 [Discussions](https://github.com/mikeyobrien/ralph-orchestrator/discussions)
- 🤝 [Contributing Guide](contributing.md)

## License

OpenClawd Operator is open source software [licensed as MIT](license.md).

---

<div align="center">
<i>Built with ❤️ by the OpenClawd Operator community</i>
</div>