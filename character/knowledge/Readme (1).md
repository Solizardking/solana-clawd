# Cheshire IDE: An AI-Powered Creative Coding Environment

## Overview

Cheshire IDE is a next-generation integrated development environment that combines the power of AI with creative coding tools. It features a unique blend of code analysis, live previews, and data extraction capabilities, making it an innovative platform for developers, creative coders, and AI enthusiasts.

## Key Features

### 1. Multi-Language Support
- JavaScript
- HTML
- CSS
- Python
- JSON
- P5.js with live preview
- Extensible language system

### 2. AI-Powered Code Analysis
- Real-time code analysis using advanced AI models
- Intelligent suggestions and improvements
- Code pattern recognition
- Context-aware assistance

### 3. Live Creative Coding Environment
- **P5.js Integration**: Real-time preview of creative coding sketches
- **Interactive Preview**: Immediate visual feedback for code changes
- **Error Handling**: Real-time error detection and display
- **Auto-cleanup**: Efficient resource management for smooth performance

### 4. Web Data Extraction
- Extract structured data from websites using AI
- Support for multiple URLs
- Web search capability for enriched data
- Asynchronous processing with status tracking
- JSON output formatting

### 5. Modern Development Features
- Split-pane interface
- Syntax highlighting
- Code execution
- File download
- Copy/paste functionality
- Vision analysis capabilities

## Getting Started

### Prerequisites
```bash
# Install Node.js and npm first, then:
npm install
```

### Environment Setup
Create a `.env` file with the following variables:
```
VITE_FIRECRAWL_API_KEY=your_firecrawl_key
```

### Running the Application
```bash
npm run dev
```

## Usage Guide

### Basic Editor
1. Select your programming language from the dropdown
2. Write or paste your code in the editor
3. Use the toolbar buttons for various operations:
   - Analyze: AI-powered code analysis
   - Run: Execute the code
   - Vision Analysis: AI vision capabilities
   - Extract: Web data extraction
   - Copy/Download: File operations

### P5.js Creative Coding
1. Select "P5.js" from the language dropdown
2. Default sketch template is provided
3. Edit the code to see live updates
4. Use standard p5.js functions:
```javascript
function setup() {
  createCanvas(400, 400);
}

function draw() {
  background(220);
  ellipse(mouseX, mouseY, 50, 50);
}
```

### Web Data Extraction
1. Enter URLs (one per line)
2. Click "Extract" to process
3. View structured JSON output
4. Data is automatically formatted and displayed

## Innovation Highlights

### 1. Unified Creative Environment
- Seamlessly combines traditional coding with creative programming
- Real-time preview system reduces development iteration time
- Split-pane interface maintains focus while providing immediate feedback

### 2. AI Integration
- Deep integration of AI capabilities throughout the IDE
- Code analysis provides intelligent insights
- Vision analysis opens new possibilities for creative coding
- Web data extraction powered by AI understanding

### 3. Modern Architecture
- React-based component system
- Efficient state management
- Modular design for easy extension
- Real-time synchronization between components

### 4. Developer Experience
- Intuitive interface design
- Minimal setup requirements
- Comprehensive error handling
- Immediate feedback loop

## Technical Architecture

### Component Structure
```
src/
├── components/
│   ├── Editor.tsx        # Main editor component
│   ├── P5Editor.tsx      # P5.js specific editor
│   └── CheshireChat.tsx  # AI interaction component
├── services/
│   ├── ai.ts            # AI service integration
│   ├── firecrawl.ts     # Web extraction service
│   └── database.ts      # Data persistence
└── types/
    └── index.ts         # TypeScript definitions
```

### Key Technologies
- React + TypeScript
- Monaco Editor
- P5.js
- AI Services Integration
- Web Extraction API

## Future Roadmap

1. **Enhanced AI Features**
   - Code completion
   - Automated refactoring
   - Pattern learning

2. **Creative Coding Extensions**
   - Three.js integration
   - WebGL support
   - Audio visualization

3. **Collaboration Features**
   - Real-time collaboration
   - Project sharing
   - Community features

4. **Additional Tools**
   - Version control integration
   - Plugin system
   - Custom themes

## Contributing

We welcome contributions! Please see our contributing guidelines for more details.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- P5.js community
- Monaco Editor team
- AI service providers
- Open source community

---

Built with ❤️ by the Cheshire IDE team
