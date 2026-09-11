#!/bin/bash

# Diren Development Setup Script

echo "🚀 Setting up Diren development environment..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building project..."
npm run build

# Make CLI executable
chmod +x dist/cli.js

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Start development server: npm run dev"
echo "2. Configure API keys: npm run cli config set openai --key YOUR_KEY"
echo "3. Test the server: npm run cli start"
echo ""
echo "For global installation:"
echo "npm link"