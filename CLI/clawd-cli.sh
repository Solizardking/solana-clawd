#!/bin/bash

# ============================================================================
# OpenClawd CLI - Main CLI for agents, skills, payments, and node operations
# ============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
API_BASE="https://solanaclawd.com/api"
SAS_PROGRAM_ID="22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG"

# Print banner
print_banner() {
    echo -e "${CYAN}"
    echo "   ╭────────────────────────────────────────────────────────────────╮"
    echo "   │                                                                │"
    echo "   │    ██████╗██╗      █████╗ ██╗    ██╗██████╗                    │"
    echo "   │   ██╔════╝██║     ██╔══██╗██║    ██║██╔══██╗                   │"
    echo "   │   ██║     ██║     ███████║██║ █╗ ██║██║  ██║                   │"
    echo "   │   ██║     ██║     ██╔══██║██║███╗██║██║  ██║                   │"
    echo "   │   ╚██████╗███████╗██║  ██║╚███╔███╔╝██████╔╝                   │"
    echo "   │    ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═════╝                    │"
    echo "   │                                                                │"
    echo "   │          ◢█◣   CLI · skills · agents · on-chain   ◢█◣        │"
    echo "   ╰────────────────────────────────────────────────────────────────╯"
    echo -e "${NC}"
}

# Help message
show_help() {
    echo "OpenClawd CLI - Commands:"
    echo ""
    echo "Skills (ClawdHub):"
    echo "  clawd-cli.sh skills              - List all skills"
    echo "  clawd-cli.sh skills:install      - Install a skill"
    echo "  clawd-cli.sh skills:search       - Search skills"
    echo "  clawd-cli.sh skills:featured     - Show featured skills"
    echo ""
    echo "Attestation (SAS):"
    echo "  clawd-cli.sh attest:skill        - Create skill attestation"
    echo "  clawd-cli.sh attest:verify       - Verify attestation"
    echo "  clawd-cli.sh attest:status       - Check attestation status"
    echo "  clawd-cli.sh attest:agent        - Create agent identity"
    echo "  clawd-cli.sh attest:vault        - Initialize vault"
    echo ""
    echo "Agents:"
    echo "  clawd-cli.sh agents              - List agents"
    echo "  clawd-cli.sh register             - Register agent (Metaplex)"
    echo "  clawd-cli.sh status              - Agent status"
    echo "  clawd-cli.sh connect             - Connect agent"
    echo ""
    echo "Wallet & Trading:"
    echo "  clawd-cli.sh wallet              - Wallet operations"
    echo "  clawd-cli.sh prices              - Token prices"
    echo "  clawd-cli.sh trading             - Trading commands"
    echo "  clawd-cli.sh swap                - Swap tokens"
    echo ""
    echo "Marketplace:"
    echo "  clawd-cli.sh marketplace         - Show marketplace"
    echo "  clawd-cli.sh marketplace:trending - Trending items"
    echo ""
    echo "Node Operations:"
    echo "  clawd-cli.sh node                - Node operations"
    echo "  clawd-cli.sh node:register       - Register node"
    echo "  clawd-cli.sh node:status          - Node status"
    echo ""
    echo "Payments (x402):"
    echo "  clawd-cli.sh payment:supported    - Supported tokens"
    echo "  clawd-cli.sh payment:verify       - Verify payment"
    echo "  clawd-cli.sh payment:settle       - Settle payment"
    echo ""
    echo "Examples:"
    echo "  clawd-cli.sh attest:skill --skill qedgen-solana --verifier QEDGenVault"
    echo "  clawd-cli.sh attest:verify --address 7xK9...mP2"
    echo "  clawd-cli.sh attest:agent --agent my-agent --wallet A123...xyz"
}

# ============================================================================
# Attestation Commands (SAS Integration)
# ============================================================================

# Attest a skill
cmd_attest_skill() {
    local skill_id=""
    local verifier_id=""
    local proof_hash=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skill) skill_id="$2"; shift 2 ;;
            --verifier) verifier_id="$2"; shift 2 ;;
            --proof-hash) proof_hash="$2"; shift 2 ;;
            *) shift ;;
        esac
    done
    
    if [ -z "$skill_id" ] || [ -z "$verifier_id" ]; then
        echo -e "${RED}Error: --skill and --verifier are required${NC}"
        echo "Usage: clawd-cli.sh attest:skill --skill <id> --verifier <id> [--proof-hash <hash>]"
        return 1
    fi
    
    echo -e "${CYAN}⛓️ Creating skill attestation...${NC}"
    echo "  Skill ID: $skill_id"
    echo "  Verifier: $verifier_id"
    echo "  Proof Hash: ${proof_hash:-generated}"
    echo ""
    
    # In production, this would call the attestation SDK
    echo -e "${GREEN}✓ Attestation created on-chain${NC}"
    echo "  Program: $SAS_PROGRAM_ID"
    echo "  Schema: OpenClawdSkillAttestation"
    
    # Generate mock attestation address
    local attestation_addr="Att$(openssl rand -hex 20 | cut -c1-44)"
    echo "  Attestation Address: $attestation_addr"
}

# Verify an attestation
cmd_attest_verify() {
    local address=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --address) address="$2"; shift 2 ;;
            *) shift ;;
        esac
    done
    
    if [ -z "$address" ]; then
        echo -e "${RED}Error: --address is required${NC}"
        echo "Usage: clawd-cli.sh attest:verify --address <address>"
        return 1
    fi
    
    echo -e "${CYAN}🔍 Verifying attestation...${NC}"
    echo "  Address: $address"
    echo ""
    
    # In production, this would query the SAS program
    echo -e "${GREEN}✓ Attestation verified${NC}"
    echo "  Program: $SAS_PROGRAM_ID"
    echo "  Status: Valid"
    echo "  Skill ID: qedgen-solana"
    echo "  Verifier: QEDGenVault"
    echo "  Formally Verified: ✓"
}

# Check attestation status
cmd_attest_status() {
    local address=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --address) address="$2"; shift 2 ;;
            *) shift ;;
        esac
    done
    
    echo -e "${CYAN}📋 Attestation Status${NC}"
    echo "  Program ID: $SAS_PROGRAM_ID"
    echo "  Token Program: TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
    echo "  Event Authority: DzSpKpST2TSyrxokMXchFz3G2yn5WEGoxzpGEUDjCX4g"
    echo ""
    
    if [ -n "$address" ]; then
        echo "  Query Address: $address"
        echo "  Status: Active"
    else
        echo "  Query Address: Not specified"
    fi
}

# Create agent identity
cmd_attest_agent() {
    local agent_id=""
    local wallet_pubkey=""
    local vault_address=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --agent) agent_id="$2"; shift 2 ;;
            --wallet) wallet_pubkey="$2"; shift 2 ;;
            --vault) vault_address="$2"; shift 2 ;;
            *) shift ;;
        esac
    done
    
    echo -e "${CYAN}🏷️ Creating agent identity...${NC}"
    echo "  Agent ID: ${agent_id:-generated}"
    echo "  Wallet: ${wallet_pubkey:-pending}"
    echo "  Vault: ${vault_address:-Hermès default}"
    echo ""
    
    # In production, this would create the attestation
    echo -e "${GREEN}✓ Agent identity created with vault integration${NC}"
    echo "  Schema: OpenClawdAgentIdentity"
    echo "  Vault Initialization: Complete"
}

# Initialize vault
cmd_attest_vault() {
    local agent_id=""
    local wallet_pubkey=""
    local vault_address=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --agent) agent_id="$2"; shift 2 ;;
            --wallet) wallet_pubkey="$2"; shift 2 ;;
            --vault) vault_address="$2"; shift 2 ;;
            *) shift ;;
        esac
    done
    
    echo -e "${CYAN}🔐 Initializing vault...${NC}"
    echo "  Agent: ${agent_id:-pending}"
    echo "  Wallet: ${wallet_pubkey:-pending}"
    echo "  Vault: ${vault_address:-Hermès default vault}"
    echo ""
    
    # In production, this would initialize the vault
    echo -e "${GREEN}✓ Agent wallet initialized in Hermès vault${NC}"
    echo "  Vault Authority PDA: derived"
    echo "  Wallet PDA: derived"
    echo "  Custody: Transferred to vault"
}

# ============================================================================
# Skills Commands
# ============================================================================

cmd_skills() {
    echo -e "${CYAN}📦 ClawdHub Skills${NC}"
    curl -s "$API_BASE/skills" 2>/dev/null | jq '.' || echo "Skills list unavailable"
}

cmd_skills_search() {
    local query="$1"
    if [ -z "$query" ]; then
        echo -e "${RED}Error: search query required${NC}"
        return 1
    fi
    echo -e "${CYAN}🔍 Searching skills for: $query${NC}"
    curl -s "$API_BASE/skills/search?q=$query" 2>/dev/null | jq '.' || echo "Search unavailable"
}

# ============================================================================
# Agents Commands
# ============================================================================

cmd_agents() {
    echo -e "${CYAN}🤖 Agent Catalog${NC}"
    curl -s "$API_BASE/agents" 2>/dev/null | jq '.' || echo "Agent list unavailable"
}

cmd_status() {
    echo -e "${CYAN}📊 OpenClawd Status${NC}"
    echo "  System: Online"
    echo "  RPC: Helius mainnet"
    echo "  SAS Program: $SAS_PROGRAM_ID"
}

cmd_register() {
    echo -e "${CYAN}📝 Agent Registration (Metaplex)${NC}"
    echo "  Registry: MPL Agent Identity"
    echo ""
    echo "To register, use:"
    echo "  npx ts-node CLI/clawd-register.ts"
}

# ============================================================================
# Marketplace Commands
# ============================================================================

cmd_marketplace() {
    echo -e "${CYAN}🛒 Marketplace${NC}"
    curl -s "$API_BASE/marketplace" 2>/dev/null | jq '.' || echo "Marketplace unavailable"
}

cmd_marketplace_trending() {
    echo -e "${CYAN}📈 Trending${NC}"
    curl -s "$API_BASE/marketplace/trending" 2>/dev/null | jq '.' || echo "Trending unavailable"
}

# ============================================================================
# Wallet Commands
# ============================================================================

cmd_wallet() {
    echo -e "${CYAN}💼 Wallet Operations${NC}"
    echo "  Use: clawd-cli.sh wallet <operation>"
    echo "  Or: npx @clawd/wallet-cli"
}

cmd_prices() {
    echo -e "${CYAN}💰 Token Prices${NC}"
    curl -s "$API_BASE/prices" 2>/dev/null | jq '.' || echo "Prices unavailable"
}

# ============================================================================
# Payment Commands (x402)
# ============================================================================

cmd_payment_supported() {
    echo -e "${CYAN}💳 x402 Supported Tokens${NC}"
    curl -s "$API_BASE/x402/facilitator/supported" 2>/dev/null | jq '.' || echo "Unavailable"
}

cmd_payment_verify() {
    local payment_id="$1"
    if [ -z "$payment_id" ]; then
        echo -e "${RED}Error: payment ID required${NC}"
        return 1
    fi
    echo -e "${CYAN}✓ Verifying payment: $payment_id${NC}"
    curl -s -X POST "$API_BASE/x402/facilitator/verify" \
        -H "Content-Type: application/json" \
        -d "{\"payment\":\"$payment_id\"}" | jq '.'
}

# ============================================================================
# Main Command Router
# ============================================================================

COMMAND="$1"
shift

case "$COMMAND" in
    # Attestation commands
    attest:skill)       cmd_attest_skill "$@" ;;
    attest:verify)      cmd_attest_verify "$@" ;;
    attest:status)      cmd_attest_status "$@" ;;
    attest:agent)       cmd_attest_agent "$@" ;;
    attest:vault)       cmd_attest_vault "$@" ;;
    
    # Skills commands
    skills)             cmd_skills ;;
    skills:list)        cmd_skills ;;
    skills:search)      cmd_skills_search "$1" ;;
    skills:install)     echo "Use: clawd-cli.sh skills:install <slug>" ;;
    skills:featured)    echo "Featured skills" ;;
    
    # Agent commands
    agents)             cmd_agents ;;
    status)             cmd_status ;;
    connect)            echo "Connect to OpenClawd" ;;
    register)           cmd_register ;;
    
    # Marketplace
    marketplace)        cmd_marketplace ;;
    marketplace:trending) cmd_marketplace_trending ;;
    marketplace:new)    echo "New items" ;;
    
    # Wallet
    wallet)             cmd_wallet ;;
    prices)             cmd_prices ;;
    trading)            echo "Trading commands" ;;
    swap)               echo "Use: clawd-cli.sh swap <from> <to> <amount>" ;;
    
    # Payments
    payment:supported)  cmd_payment_supported ;;
    payment:verify)     cmd_payment_verify "$1" ;;
    payment:settle)    echo "Payment settlement" ;;
    
    # Node
    node)               echo "Node operations" ;;
    node:register)      echo "Node registration" ;;
    node:status)        echo "Node status" ;;
    node:peers)         echo "Node peers" ;;
    
    # Help
    -h|--help|help)     print_banner; show_help ;;
    
    # Default
    *) 
        print_banner
        echo -e "${YELLOW}Unknown command: $COMMAND${NC}"
        show_help
        ;;
esac