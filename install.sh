#!/bin/bash
echo "🔧 Instalando Midas..."
npm install
echo "📦 Instalando Playwright (opcional, para web search avançado)..."
npm install playwright 2>/dev/null || echo "⚠️  Playwright não instalado (opcional)"
npx playwright install chromium 2>/dev/null || echo "⚠️  Chromium não instalado (opcional)"
npm link
echo ""
echo "✅ Midas instalado com sucesso!"
echo "   Use: midas"
echo "   Configure: midas --config"
