# 🔴 RedPill Chat

**Privacy-First AI Chat Interface with TEE-Protected Gateway**

A modern, privacy-focused chat interface powered by [RedPill Gateway](https://github.com/redpill-ai/redpill-gateway). Built with Next.js 15, React 19, and Assistant UI, featuring cryptographic verification of all AI responses through hardware-protected Trusted Execution Environments (TEE).

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://reactjs.org/)

## 🌟 Key Features

- 🔒 **TEE-Protected Chat** - All requests verified through hardware-protected gateway
- 🛡️ **Cryptographic Verification** - Verify AI responses with attestation reports
- 🌐 **250+ AI Models** - Access OpenAI, Anthropic, Google, Meta, DeepSeek, and more
- ✅ **Message Integrity** - Optional signature verification for every response
- 🎨 **Modern UI** - Beautiful interface with Assistant UI components
- 🚀 **Lightning Fast** - Next.js 15 with Turbopack and React 19
- 📱 **Responsive Design** - Works seamlessly on desktop and mobile

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- RedPill API key (get one at [redpill.ai](https://redpill.ai))
- RedPill Gateway API endpoint

### Installation

```bash
# Clone the repository
git clone https://github.com/redpill-ai/redpill-chat.git
cd redpill-chat

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your API key and endpoint

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the chat interface.

## ⚙️ Configuration

Create a `.env.local` file:

```bash
# RedPill Gateway API
API_URL=https://api.redpill.ai/v1
REDPILL_API_KEY=sk-your-api-key-here

# Optional - Enable TEE verification features
NEXT_PUBLIC_ENABLE_ATTESTATION=true
NEXT_PUBLIC_ENABLE_SIGNATURE_VERIFICATION=true
```

## 🎯 Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) with App Router
- **React**: [React 19](https://reactjs.org/) with Server Components
- **AI SDK**: [Vercel AI SDK](https://sdk.vercel.ai/) with OpenAI-compatible provider
- **Chat UI**: [Assistant UI](https://www.assistant-ui.com/) for beautiful chat components
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/) with motion animations
- **Components**: [Radix UI](https://www.radix-ui.com/) primitives
- **State**: [Zustand](https://github.com/pmndrs/zustand) for client state
- **Code Quality**: [Biome](https://biomejs.dev/) for linting and formatting
- **Icons**: [Lucide React](https://lucide.dev/)

## 📖 Usage

### Basic Chat

Simply open the interface and start chatting! The chat automatically:
1. Connects to RedPill Gateway
2. Routes requests through TEE-protected infrastructure
3. Returns verified AI responses

### Model Selection

Click the model selector to choose from 250+ available models:
- **OpenAI**: GPT-5, GPT-5 Mini, O3, O4 Mini
- **Anthropic**: Claude Sonnet 4.5, Claude Opus 4.1
- **Phala Confidential**: TEE-protected inference models
- **And many more**: Google, Meta, DeepSeek, Mistral, etc.

### TEE Verification (Optional)

Enable attestation verification to get cryptographic proof that responses came from genuine TEE hardware:

1. Toggle "Verify TEE" in settings
2. Each message shows verification status
3. View full attestation reports for complete hardware proof

### Message Signatures (Optional)

Enable signature verification for maximum security:

1. Toggle "Verify Signatures" in settings
2. Each response includes cryptographic signature
3. Verify signatures match TEE attestation reports

## 🏗️ Project Structure

```
redpill-chat/
├── src/
│   ├── app/              # Next.js app router pages
│   ├── components/       # React components
│   │   ├── chat-interface.tsx
│   │   └── ui/          # Shadcn/Radix UI components
│   ├── state/           # Zustand state management
│   │   ├── attestation.ts
│   │   ├── models.ts
│   │   └── message-verification.ts
│   └── types/           # TypeScript type definitions
│       ├── attestation.ts
│       ├── model.ts
│       └── message-verification.ts
├── public/              # Static assets
└── package.json
```

## 🔧 Development

```bash
# Run development server with Turbopack
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Format code
npm run format
```

## 📦 Deployment

### Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/redpill-ai/redpill-chat)

1. Click the "Deploy" button above
2. Add environment variables:
   - `API_URL`
   - `REDPILL_API_KEY`
3. Deploy!

### Docker

```bash
# Build image
docker build -t redpill-chat .

# Run container
docker run -p 3000:3000 \
  -e API_URL=https://api.redpill.ai/v1 \
  -e REDPILL_API_KEY=sk-your-key \
  redpill-chat
```

### Self-Hosted

```bash
# Build the application
npm run build

# Start production server
npm start
```

## 🛡️ Privacy & Security

RedPill Chat is built with privacy-first principles:

- **No Data Collection** - Chat messages never stored on our servers
- **TEE Protection** - All requests processed in hardware-protected enclaves
- **Cryptographic Verification** - Optional attestation reports prove genuine TEE execution
- **Open Source** - Fully auditable codebase
- **Client-Side State** - Messages stored only in your browser

## 🔗 Integration with RedPill Gateway

This chat interface connects to [RedPill Gateway](https://github.com/redpill-ai/redpill-gateway), which provides:

- TEE-protected request routing
- Access to 250+ AI models
- Cryptographic attestation
- Hardware-enforced privacy

See [RedPill Gateway documentation](https://docs.redpill.ai) for API details.

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run linter and formatter (`npm run lint && npm run format`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Attribution

Built with:
- [Next.js](https://nextjs.org/) by Vercel
- [Assistant UI](https://www.assistant-ui.com/) by Assistant UI team
- [Vercel AI SDK](https://sdk.vercel.ai/) by Vercel
- [Radix UI](https://www.radix-ui.com/) by Modulz
- [Tailwind CSS](https://tailwindcss.com/) by Tailwind Labs

Powered by [RedPill Gateway](https://github.com/redpill-ai/redpill-gateway) and [Phala Network](https://phala.network) TEE infrastructure.

## 🔗 Links

- **Website**: https://redpill.ai
- **Documentation**: https://docs.redpill.ai
- **Gateway**: https://github.com/redpill-ai/redpill-gateway
- **Discord**: https://discord.gg/redpill
- **Support**: support@redpill.ai

---

**Built with 💜 by the RedPill team** • *Making AI privacy-first, one chat at a time.*
