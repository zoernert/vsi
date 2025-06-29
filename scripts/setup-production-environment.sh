#!/bin/bash

# Production Environment Setup Script for VSI Agent System
# Run this script on your production server to configure environment variables

echo "🏭 VSI Agent System - Production Environment Setup"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_warning "Running as root. Consider running as a non-root user for security."
fi

# Detect current environment
print_info "Detecting current environment..."

# Get server details
SERVER_IP=$(hostname -I | awk '{print $1}')
HOSTNAME=$(hostname)
PORT=${PORT:-3000}

print_info "Server IP: $SERVER_IP"
print_info "Hostname: $HOSTNAME"
print_info "Port: $PORT"

# Check if VSI is running
print_info "Checking if VSI service is running..."

if curl -f http://localhost:$PORT/api/health >/dev/null 2>&1; then
    print_success "VSI service is running and accessible on localhost:$PORT"
    LOCAL_AVAILABLE=true
else
    print_warning "VSI service is not accessible on localhost:$PORT"
    LOCAL_AVAILABLE=false
fi

# Check external access
if [[ -n "$SERVER_IP" ]]; then
    if curl -f http://$SERVER_IP:$PORT/api/health >/dev/null 2>&1; then
        print_success "VSI service is accessible via server IP: $SERVER_IP:$PORT"
        EXTERNAL_AVAILABLE=true
    else
        print_warning "VSI service is not accessible via server IP: $SERVER_IP:$PORT"
        EXTERNAL_AVAILABLE=false
    fi
fi

# Recommend API base URL
print_info "Determining optimal API base URL..."

if [[ "$LOCAL_AVAILABLE" == true ]]; then
    RECOMMENDED_API_URL="http://localhost:$PORT"
    print_success "Recommended API_BASE_URL: $RECOMMENDED_API_URL"
elif [[ "$EXTERNAL_AVAILABLE" == true ]]; then
    RECOMMENDED_API_URL="http://$SERVER_IP:$PORT"
    print_success "Recommended API_BASE_URL: $RECOMMENDED_API_URL"
else
    RECOMMENDED_API_URL="http://localhost:$PORT"
    print_error "VSI service not accessible. Using fallback: $RECOMMENDED_API_URL"
    print_info "Please ensure VSI service is running before starting agents"
fi

# Create production environment file
ENV_FILE="/opt/vsi/.env.production"
print_info "Creating production environment file: $ENV_FILE"

# Create directory if it doesn't exist
mkdir -p "$(dirname "$ENV_FILE")"

cat > "$ENV_FILE" << EOF
# VSI Production Environment Configuration
# Generated on $(date)

# Server Configuration
NODE_ENV=production
PORT=$PORT
API_BASE_URL=$RECOMMENDED_API_URL
BASE_URL=$RECOMMENDED_API_URL

# Network Configuration
BIND_ADDRESS=0.0.0.0
HOST=0.0.0.0

# Agent System Configuration
AGENT_TIMEOUT=300000
AGENT_MAX_RETRIES=5
AGENT_RETRY_DELAY=5000

# Database Configuration (update with your production values)
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-vsi_db}
DB_USER=${DB_USER:-vsi_user}
# DB_PASSWORD should be set securely

# JWT Configuration (IMPORTANT: Set a secure secret in production)
# JWT_SECRET should be set to a secure random string
JWT_EXPIRES_IN=24h

# AI/LLM Configuration
# GOOGLE_AI_API_KEY should be set for production use
# GEMINI_API_KEY should be set for production use
GEMINI_MODEL=gemini-2.0-flash
EMBEDDING_MODEL=text-embedding-004

# File Upload Configuration
MAX_FILE_SIZE=50MB
UPLOAD_PATH=/opt/vsi/uploads

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=/opt/vsi/logs/vsi.log

# Security Configuration
ALLOW_SELF_REGISTRATION=false
CORS_ORIGINS=*

# Qdrant Configuration
QDRANT_URL=${QDRANT_URL:-http://localhost:6333}

EOF

print_success "Environment file created: $ENV_FILE"

# Create systemd service file if systemd is available
if command -v systemctl >/dev/null 2>&1; then
    print_info "Creating systemd service file..."
    
    cat > /etc/systemd/system/vsi-agent-system.service << EOF
[Unit]
Description=VSI Agent System
After=network.target

[Service]
Type=simple
User=vsi
WorkingDirectory=/opt/vsi
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    print_success "Systemd service file created: /etc/systemd/system/vsi-agent-system.service"
    print_info "Enable with: systemctl enable vsi-agent-system"
    print_info "Start with: systemctl start vsi-agent-system"
fi

# Create agent connectivity test script
TEST_SCRIPT="/opt/vsi/scripts/test-production-connectivity.sh"
print_info "Creating connectivity test script: $TEST_SCRIPT"

mkdir -p "$(dirname "$TEST_SCRIPT")"

cat > "$TEST_SCRIPT" << 'EOF'
#!/bin/bash

# Test agent connectivity in production
source /opt/vsi/.env.production

echo "Testing agent connectivity..."
echo "API Base URL: $API_BASE_URL"

# Test health endpoint
echo "Testing health endpoint..."
if curl -f "$API_BASE_URL/api/health"; then
    echo "✅ Health endpoint accessible"
else
    echo "❌ Health endpoint failed"
    exit 1
fi

# Run diagnostic script
if [ -f "/opt/vsi/scripts/diagnose-agent-connectivity.js" ]; then
    echo "Running detailed diagnostics..."
    cd /opt/vsi && node scripts/diagnose-agent-connectivity.js
else
    echo "⚠️ Diagnostic script not found"
fi
EOF

chmod +x "$TEST_SCRIPT"
print_success "Test script created: $TEST_SCRIPT"

# Final recommendations
echo ""
print_info "🎯 Production Setup Complete!"
print_info "=========================================="
print_info "1. Review and update environment variables in: $ENV_FILE"
print_info "2. Set secure values for JWT_SECRET, DB_PASSWORD, and API keys"
print_info "3. Test connectivity with: $TEST_SCRIPT"
print_info "4. If using systemd, enable the service: systemctl enable vsi-agent-system"
print_info "5. Monitor logs for any connection issues"

echo ""
print_warning "🔒 Security Reminders:"
print_warning "- Set a strong JWT_SECRET (minimum 32 characters)"
print_warning "- Use secure database credentials"
print_warning "- Restrict CORS_ORIGINS in production"
print_warning "- Ensure firewall allows necessary ports"

echo ""
print_success "🚀 Ready for production deployment!"

exit 0
