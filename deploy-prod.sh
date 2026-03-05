#!/bin/bash
# =============================================================================
# ULE RPA Service - Deploy to Production
# =============================================================================
# Este script hace push a GitHub y despliega en el Mac servidor automáticamente
#
# Uso: ./deploy-prod.sh [mensaje-commit]
# Ejemplo: ./deploy-prod.sh "fix: corregir error en login"
# =============================================================================

set -e  # Salir si hay error

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuración
SERVER_HOST="ule-server"  # Usa Cloudflare Tunnel (funciona desde cualquier red)
SERVER_RPA_PATH="~/ule-rpa"
RPA_DOMAIN="https://rpa.ulecolombia.com"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}       ULE RPA Service - Deploy to Production       ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Paso 1: Verificar cambios locales
echo -e "\n${YELLOW}[1/5]${NC} Verificando cambios locales..."
if [[ -z $(git status --porcelain) ]]; then
    echo -e "${GREEN}✓${NC} No hay cambios pendientes"
    SKIP_COMMIT=true
else
    echo -e "${GREEN}✓${NC} Cambios detectados:"
    git status --short
    SKIP_COMMIT=false
fi

# Paso 2: Commit y push (si hay cambios)
if [[ "$SKIP_COMMIT" != true ]]; then
    echo -e "\n${YELLOW}[2/5]${NC} Haciendo commit y push..."

    COMMIT_MSG="${1:-feat: Update RPA service}"
    git add -A
    git commit -m "$COMMIT_MSG"
    git push

    echo -e "${GREEN}✓${NC} Push completado"
else
    echo -e "\n${YELLOW}[2/5]${NC} Saltando commit (sin cambios)"
fi

# Paso 3: Verificar conexión SSH
echo -e "\n${YELLOW}[3/5]${NC} Verificando conexión al servidor..."
if ssh -o ConnectTimeout=15 ${SERVER_HOST} "echo 'ok'" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Servidor accesible via Cloudflare Tunnel"
else
    echo -e "${RED}✗${NC} No se puede conectar al servidor"
    echo -e "${YELLOW}  Asegúrate que el Mac servidor esté encendido y el túnel activo${NC}"
    exit 1
fi

# Paso 4: Deploy en servidor
echo -e "\n${YELLOW}[4/5]${NC} Desplegando en servidor..."
ssh ${SERVER_HOST} "cd ${SERVER_RPA_PATH} && bash deploy.sh"

# Paso 5: Verificar deploy
echo -e "\n${YELLOW}[5/5]${NC} Verificando deploy..."
sleep 15  # Esperar que los servicios reinicien completamente

HEALTH_RESPONSE=$(curl -s "${RPA_DOMAIN}/health" 2>/dev/null || echo "error")

if echo "$HEALTH_RESPONSE" | grep -q '"status":"healthy"'; then
    echo -e "${GREEN}✓${NC} Servidor saludable"
    echo -e "  Response: $HEALTH_RESPONSE"
else
    echo -e "${RED}✗${NC} El servidor no responde correctamente"
    echo -e "  Response: $HEALTH_RESPONSE"
    exit 1
fi

echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}       ✅ Deploy completado exitosamente!            ${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "\n  🌐 ${RPA_DOMAIN}/health"
echo -e "  📦 Servidor: ${SERVER_HOST} (via Cloudflare Tunnel)"
echo ""
