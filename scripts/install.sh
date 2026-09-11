#!/bin/bash

# Diren Installation Script
# Supports: npm global install, Docker, and local development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Detect package manager
detect_package_manager() {
    if command_exists npm; then
        echo "npm"
    elif command_exists yarn; then
        echo "yarn"
    elif command_exists pnpm; then
        echo "pnpm"
    else
        echo ""
    fi
}

# Install via npm/yarn/pnpm
install_npm() {
    local pm=$(detect_package_manager)
    
    if [ -z "$pm" ]; then
        print_error "No Node.js package manager found. Please install Node.js first."
        exit 1
    fi
    
    print_status "Installing Diren globally using $pm..."
    
    case $pm in
        npm)
            npm install -g diren
            ;;
        yarn)
            yarn global add diren
            ;;
        pnpm)
            pnpm install -g diren
            ;;
    esac
    
    print_success "Diren installed globally!"
}

# Install via Docker
install_docker() {
    if ! command_exists docker; then
        print_error "Docker not found. Please install Docker first."
        exit 1
    fi
    
    print_status "Pulling Diren Docker image..."
    docker pull diren/diren:latest
    
    print_status "Creating Docker Compose setup..."
    
    # Create docker-compose.yml if it doesn't exist
    if [ ! -f "docker-compose.yml" ]; then
        cat > docker-compose.yml << EOF
version: '3.8'

services:
  diren:
    image: diren/diren:latest
    container_name: diren-server
    ports:
      - "3000:3000"
    volumes:
      - diren-data:/data
    environment:
      - NODE_ENV=production
      - DIREN_PORT=3000
    restart: unless-stopped

volumes:
  diren-data:
    driver: local
EOF
    fi
    
    print_success "Docker setup created!"
    print_status "Run 'docker-compose up -d' to start Diren"
}

# Development setup
setup_development() {
    local pm=$(detect_package_manager)
    
    if [ -z "$pm" ]; then
        print_error "No Node.js package manager found. Please install Node.js first."
        exit 1
    fi
    
    print_status "Setting up development environment..."
    
    # Install dependencies
    case $pm in
        npm)
            npm install
            ;;
        yarn)
            yarn install
            ;;
        pnpm)
            pnpm install
            ;;
    esac
    
    # Build project
    print_status "Building project..."
    case $pm in
        npm)
            npm run build
            ;;
        yarn)
            yarn build
            ;;
        pnpm)
            pnpm build
            ;;
    esac
    
    print_success "Development environment ready!"
    print_status "Run 'npm run dev' to start development server"
}

# Quick setup for common tools
setup_tools() {
    print_status "Setting up common AI tools integration..."
    
    # Check if diren is available
    if ! command_exists diren; then
        print_error "Diren CLI not found. Please install Diren first."
        exit 1
    fi
    
    # Start diren in background if not running
    if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
        print_status "Starting Diren server..."
        diren start --port 3000 &
        sleep 5
    fi
    
    # Configure Claude CLI if available
    if [ -d "$HOME/.claude" ] || command_exists claude; then
        print_status "Configuring Claude CLI..."
        diren tools configure claude-cli
        print_success "Claude CLI configured!"
    fi
    
    # Configure Cursor if available (macOS/Windows paths)
    cursor_paths=(
        "$HOME/Library/Application Support/Cursor"
        "$HOME/.cursor"
        "$APPDATA/Cursor"
    )
    
    for path in "${cursor_paths[@]}"; do
        if [ -d "$path" ]; then
            print_status "Configuring Cursor IDE..."
            diren tools configure cursor
            print_success "Cursor IDE configured!"
            break
        fi
    done
    
    print_success "Tool setup completed!"
}

# Show usage information
show_usage() {
    cat << EOF
Diren Installation Script

Usage: $0 [OPTION]

Options:
  --npm, -n        Install via npm/yarn/pnpm globally
  --docker, -d     Setup Docker installation
  --dev           Setup development environment
  --tools, -t      Setup integration with AI coding tools
  --help, -h       Show this help message

Examples:
  $0 --npm              # Install globally via npm
  $0 --docker           # Setup Docker installation
  $0 --dev              # Setup for development
  $0 --tools            # Configure AI tools integration

For more information, visit: https://github.com/diren-ai/diren
EOF
}

# Main installation logic
main() {
    echo -e "${BLUE}"
    cat << "EOF"
    ____  _                 
   |  _ \(_)_ __ ___ _ __  
   | | | | | '__/ _ \ '_ \ 
   | |_| | | | |  __/ | | |
   |____/|_|_|  \___|_| |_|
                          
   AI API Cost Optimizer
EOF
    echo -e "${NC}"
    
    case "${1:-}" in
        --npm|-n)
            install_npm
            ;;
        --docker|-d)
            install_docker
            ;;
        --dev)
            setup_development
            ;;
        --tools|-t)
            setup_tools
            ;;
        --help|-h|"")
            show_usage
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
    
    if [ "$1" != "--help" ] && [ "$1" != "-h" ] && [ -n "$1" ]; then
        echo ""
        print_success "Installation completed successfully!"
        echo ""
        echo -e "${YELLOW}Next steps:${NC}"
        echo "1. Configure your API keys: ${BLUE}diren config set openai --key sk-your-key${NC}"
        echo "2. Start the server: ${BLUE}diren start${NC}"
        echo "3. Open dashboard: ${BLUE}http://localhost:3000/dashboard${NC}"
        echo ""
        echo -e "${GREEN}💰 Start saving money on AI API costs today!${NC}"
    fi
}

# Run main function with all arguments
main "$@"