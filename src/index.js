#!/usr/bin/env node

import { createInterface } from 'readline';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { loadConfig, saveConfig, getApiKey, removeApiKey, getModel, interactiveConfig, getKnownModels, getAllKnownModels, testConnection, fetchOpenRouterModels, fetchGroqModels, fetchGoogleModels, fetchOllamaModels, PROVIDERS } from './config.js';
import { createProvider } from './providers/index.js';
import { Agent } from './agent.js';
import { generateSessionId, saveSession, loadSession, loadLatestSession, listSessions, compactMessages, trimMessages } from './memory.js';
import { listToolNames } from './tools/index.js';
import { printWelcome, printSystem, printError, printSuccess, printStatusBar, promptText, printTokens, printConnectionStatus, printModelList, printUserMessage, printSeparator } from './ui.js';

// Parse args
const args = process.argv.slice(2);
const flags = {};
const positional = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config') { flags.config = true; }
  else if (args[i] === '--provider' && args[i + 1]) { flags.provider = args[++i]; }
  else if (args[i] === '--model' && args[i + 1]) { flags.model = args[++i]; }
  else if (args[i] === '--no-tools') { flags.noTools = true; }
  else if (args[i] === '--dangerously-allow-all') { flags.dangerouslyAllowAll = true; }
  else if (args[i] === '--session' && args[i + 1]) { flags.session = args[++i]; }
  else if (args[i] === '--new-session') { flags.newSession = true; }
  else if (args[i] === '--verbose') { flags.verbose = true; }
  else if (args[i] === '--api') { flags.api = true; }
  else if (args[i] === '--port' && args[i + 1]) { flags.port = parseInt(args[++i]); }
  else if (args[i] === '--help' || args[i] === '-h') { flags.help = true; }
  else if (!args[i].startsWith('--')) { positional.push(args[i]); }
}

if (flags.help) {
  console.log(`
Midas - Agente de desenvolvimento autônomo no terminal

Uso:
  midas                              Modo interativo (REPL)
  midas "tarefa"                     Executa tarefa e sai
  cat arquivo | midas "prompt"       Modo pipe

Flags:
  --provider <nome>                  anthropic, openrouter, groq, google ou bonsai
  --model <modelo>                   Nome do modelo
  --no-tools                         Modo conversa sem tools
  --dangerously-allow-all            Sem confirmações de segurança
  --session <id>                     Carrega sessão específica
  --new-session                      Força nova sessão
  --verbose                          Mostra detalhes de tool calls
  --api                              Inicia servidor HTTP API
  --port <porta>                     Porta do servidor API (default: 4141)
  --config                           Configuração interativa
  --help                             Mostra esta ajuda
`);
  process.exit(0);
}

if (flags.config) {
  await interactiveConfig();
  process.exit(0);
}

// Mutable state
let config = loadConfig();
let currentProvider = flags.provider || config.provider;
let currentModel = flags.model || getModel(config, currentProvider);
let currentApiKey = getApiKey(config, currentProvider);
let provider = null;
let connected = false;

function initProvider() {
  currentApiKey = getApiKey(config, currentProvider);
  if (!currentApiKey) {
    connected = false;
    provider = null;
    return false;
  }
  try {
    provider = createProvider(currentProvider, currentApiKey, currentModel);
    connected = true;
    return true;
  } catch (e) {
    printError(e.message);
    connected = false;
    provider = null;
    return false;
  }
}

if (currentApiKey) initProvider();

// Load project context
let projectContext = '';
const midasMdPath = path.join(process.cwd(), 'MIDAS.md');
if (fs.existsSync(midasMdPath)) {
  projectContext = fs.readFileSync(midasMdPath, 'utf-8');
}

// Session management
let sessionId;
let messages = [];
let sessionMeta = { created: new Date().toISOString(), provider: currentProvider, model: currentModel };

if (flags.session) {
  const s = loadSession(flags.session);
  if (s) { sessionId = s.id; messages = s.messages || []; sessionMeta = s; }
  else { printError(`Sessão não encontrada: ${flags.session}`); process.exit(1); }
}
// Always start a fresh session unless --session was given
if (!sessionId) sessionId = generateSessionId();

function createAgent() {
  return new Agent(provider, {
    messages: [...messages],
    verbose: flags.verbose || config.verbose,
    noTools: flags.noTools,
    dangerouslyAllowAll: flags.dangerouslyAllowAll || false,
    sessionId,
    projectContext
  });
}

function save(agent) {
  if (config.auto_save_sessions !== false) {
    messages = agent.messages;
    messages = trimMessages(messages);
    saveSession(sessionId, messages, { ...sessionMeta, usage: agent.totalUsage });
  }
}

function getPromptString() {
  return promptText(currentProvider, currentModel);
}

// ─── /connect handler ────────────────────────────────────────────
async function handleConnect(arg, rl) {
  const ask = (q) => new Promise(r => rl.question(q, (a) => r(a.trim())));

  // /connect remove <provider>
  if (arg && arg.startsWith('remove')) {
    const parts = arg.split(/\s+/);
    const target = parts[1];
    if (!target || !PROVIDERS.includes(target)) {
      printError(`Uso: /connect remove <${PROVIDERS.join('|')}>`);
      return;
    }
    removeApiKey(config, target);
    config = loadConfig();
    printSuccess(`API key removida para ${target}.`);
    if (currentProvider === target) {
      connected = false;
      provider = null;
      console.log(chalk.yellow(`  Provider ativo (${target}) desconectado.`));
    }
    return;
  }

  // /connect <provider>
  if (arg && PROVIDERS.includes(arg)) {
    return await connectToProvider(arg, ask);
  }

  // Show status of all providers
  const statuses = PROVIDERS.map(p => {
    const key = getApiKey(config, p);
    return {
      name: p,
      hasKey: !!key,
      keyPreview: key ? key.slice(-4) : '',
      connected: p === currentProvider && connected
    };
  });
  printConnectionStatus(statuses);

  console.log(chalk.blue('  Conectar a qual provider?'));
  PROVIDERS.forEach((p, i) => console.log(chalk.gray(`  ${i + 1}. ${p}`)));
  console.log(chalk.gray(`  r. Remover uma API key`));
  console.log('');

  const choice = await ask(chalk.green('  Escolha: '));

  if (choice.toLowerCase() === 'r') {
    console.log('');
    PROVIDERS.forEach((p, i) => {
      const key = getApiKey(config, p);
      console.log(chalk.gray(`  ${i + 1}. ${p} ${key ? '(key: ****' + key.slice(-4) + ')' : '(sem key)'}`));
    });
    const rem = await ask(chalk.green('\n  Remover key de qual provider (1-' + PROVIDERS.length + '): '));
    const idx = parseInt(rem) - 1;
    if (idx >= 0 && idx < PROVIDERS.length) {
      const target = PROVIDERS[idx];
      removeApiKey(config, target);
      config = loadConfig();
      printSuccess(`API key removida para ${target}.`);
      if (currentProvider === target) { connected = false; provider = null; }
    }
    return;
  }

  const numMap = {};
  PROVIDERS.forEach((p, i) => numMap[String(i + 1)] = p);
  const selected = numMap[choice] || choice;

  if (!PROVIDERS.includes(selected)) {
    printError('Provider inválido.');
    return;
  }

  await connectToProvider(selected, ask);
}

async function connectToProvider(providerName, ask) {
  let key = getApiKey(config, providerName);

  if (providerName === 'ollama' && !key) {
    console.log(chalk.yellow(`\n  Ollama — escolha o modo de conexão:`));
    console.log(chalk.gray('  1. Cloud (ollama.com) — precisa de API key'));
    console.log(chalk.gray('  2. Local (localhost:11434) — precisa de ollama serve rodando'));
    console.log(chalk.gray('  3. URL customizada\n'));
    const mode = await ask(chalk.green('  Escolha (1/2/3): '));
    if (mode === '2') {
      key = 'http://localhost:11434';
    } else if (mode === '3') {
      key = await ask(chalk.green('  URL do servidor Ollama: '));
      if (!key) { printError('Cancelado.'); return; }
    } else {
      console.log(chalk.gray('  Gere sua key em: https://ollama.com/settings/keys\n'));
      key = await ask(chalk.green('  API Key do Ollama: '));
      if (!key) { printError('Cancelado.'); return; }
    }
    config.api_keys.ollama = key;
    saveConfig(config);
  } else if (!key) {
    console.log(chalk.yellow(`\n  Nenhuma API key configurada para ${providerName}.`));
    console.log(chalk.gray('  A key é salva apenas localmente em ~/.midas/config.json'));
    console.log(chalk.gray('  Nunca é enviada para nenhum lugar exceto a API do provider.\n'));
    key = await ask(chalk.green(`  API Key para ${providerName}: `));
    if (!key) { printError('Cancelado.'); return; }
    config.api_keys[providerName] = key;
    saveConfig(config);
    printSuccess('API key salva localmente.');
  }

  console.log(chalk.gray(`\n  Testando conexão com ${providerName}...`));
  const result = await testConnection(providerName, key);

  if (result.ok) {
    printSuccess(`Conectado a ${providerName}!`);
    currentProvider = providerName;
    currentModel = getModel(config, providerName);
    currentApiKey = key;
    initProvider();
    config.provider = providerName;
    saveConfig(config);
    printStatusBar(currentProvider, currentModel, connected);
  } else {
    printError(`Falha na conexão: ${result.error}`);
    const retry = await ask(chalk.yellow('  Inserir outra API key? (s/n): '));
    if (retry.toLowerCase() === 's') {
      const newKey = await ask(chalk.green(`  Nova API Key para ${providerName}: `));
      if (newKey) {
        config.api_keys[providerName] = newKey;
        saveConfig(config);
        const r2 = await testConnection(providerName, newKey);
        if (r2.ok) {
          printSuccess(`Conectado a ${providerName}!`);
          currentProvider = providerName;
          currentModel = getModel(config, providerName);
          currentApiKey = newKey;
          initProvider();
          config.provider = providerName;
          saveConfig(config);
          printStatusBar(currentProvider, currentModel, connected);
        } else {
          printError(`Falha novamente: ${r2.error}`);
        }
      }
    }
  }
}

// ─── /model handler ──────────────────────────────────────────────
async function handleModel(arg, rl) {
  const ask = (q) => new Promise(r => rl.question(q, (a) => r(a.trim())));

  // Direct set: /model gemini-2.5-pro
  if (arg && !['list', 'search', 'all'].includes(arg)) {
    currentModel = arg;
    if (provider) provider.model = arg;
    config.models[currentProvider] = arg;
    saveConfig(config);
    printSuccess(`Modelo alterado para: ${arg}`);
    printStatusBar(currentProvider, currentModel, connected);
    return;
  }

  console.log('');
  console.log(chalk.hex('#FFD700').bold('  Modelos disponíveis'));
  console.log(chalk.gray(`  Provider ativo: ${chalk.cyan(currentProvider)} | Modelo atual: ${chalk.white.bold(currentModel)}`));
  console.log('');

  console.log(chalk.gray('  1. Modelos do provider atual (' + currentProvider + ')'));
  console.log(chalk.gray('  2. Todos os modelos (todos os providers)'));
  if (['openrouter', 'groq', 'google', 'ollama'].includes(currentProvider)) {
    console.log(chalk.gray('  3. Buscar modelos online (API do provider)'));
  }
  console.log('');

  const choice = await ask(chalk.green('  Escolha: '));
  let models = [];

  if (choice === '1' || !choice) {
    models = getKnownModels(currentProvider).map(m => ({ ...m, provider: currentProvider }));
  } else if (choice === '2') {
    models = getAllKnownModels();
  } else if (choice === '3') {
    console.log(chalk.gray('\n  Buscando modelos online...'));
    let live = null;
    if (currentProvider === 'openrouter') live = await fetchOpenRouterModels(currentApiKey);
    else if (currentProvider === 'groq') live = await fetchGroqModels(currentApiKey);
    else if (currentProvider === 'google') live = await fetchGoogleModels(currentApiKey);
    else if (currentProvider === 'ollama') live = await fetchOllamaModels(currentApiKey);

    if (live) {
      models = live;
      console.log(chalk.gray(`  ${live.length} modelos encontrados.`));
    } else {
      printError('Não foi possível buscar modelos. Usando catálogo local.');
      models = getKnownModels(currentProvider).map(m => ({ ...m, provider: currentProvider }));
    }
  }

  if (models.length === 0) { printError('Nenhum modelo disponível.'); return; }

  const filter = await ask(chalk.green('  Filtrar por nome (ou Enter para ver todos): '));
  if (filter) {
    const f = filter.toLowerCase();
    models = models.filter(m => m.id.toLowerCase().includes(f) || (m.description || '').toLowerCase().includes(f));
  }

  if (models.length === 0) { printError('Nenhum modelo corresponde ao filtro.'); return; }

  const pageSize = 15;
  let page = 0;
  const totalPages = Math.ceil(models.length / pageSize);

  while (true) {
    const start = page * pageSize;
    const pageModels = models.slice(start, start + pageSize);
    console.log('');
    console.log(chalk.gray(`  ${start + 1}-${start + pageModels.length} de ${models.length}${totalPages > 1 ? ` (pág ${page + 1}/${totalPages})` : ''}`));
    console.log('');
    printModelList(pageModels, currentModel);
    console.log('');

    let promptMsg = chalk.green('  Número para selecionar');
    if (totalPages > 1) promptMsg += chalk.gray(', "n" próxima, "p" anterior');
    promptMsg += chalk.gray(', Enter para cancelar: ');

    const sel = await ask(promptMsg);

    if (!sel) return;
    if (sel === 'n' && page < totalPages - 1) { page++; continue; }
    if (sel === 'p' && page > 0) { page--; continue; }

    const idx = parseInt(sel) - 1;
    if (idx >= 0 && idx < models.length) {
      const selected = models[idx];
      currentModel = selected.id;
      if (provider) provider.model = selected.id;

      if (selected.provider && selected.provider !== currentProvider) {
        const key = getApiKey(config, selected.provider);
        if (!key) {
          printError(`Sem API key para ${selected.provider}. Use /connect ${selected.provider} primeiro.`);
          return;
        }
        currentProvider = selected.provider;
        currentApiKey = key;
        initProvider();
        config.provider = currentProvider;
      }

      config.models[currentProvider] = currentModel;
      saveConfig(config);
      printSuccess(`Modelo alterado para: ${selected.id}`);
      printStatusBar(currentProvider, currentModel, connected);
      return;
    }

    printError('Seleção inválida.');
    return;
  }
}

// Check for piped input
let pipedInput = '';
if (!process.stdin.isTTY) {
  pipedInput = await new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
  });
}

// Single task mode
if (positional.length > 0) {
  if (!provider) {
    printError(`API key não configurada para "${currentProvider}". Use: midas --config`);
    process.exit(1);
  }
  const task = positional.join(' ');
  const fullInput = pipedInput ? `Contexto (stdin):\n${pipedInput}\n\n${task}` : task;
  const agent = createAgent();
  await agent.run(fullInput);
  save(agent);
  process.exit(0);
}

if (pipedInput) {
  if (!provider) { printError('API key não configurada.'); process.exit(1); }
  const agent = createAgent();
  await agent.run(pipedInput);
  save(agent);
  process.exit(0);
}

// API server mode
if (flags.api) {
  const { MidasAPI } = await import('./api.js');
  const apiConfig = config.api_server || {};
  const api = new MidasAPI({
    port: flags.port || apiConfig.port || 4141,
    host: apiConfig.host || '127.0.0.1',
    corsOrigins: apiConfig.cors_origins || '*',
    provider: currentProvider,
    model: currentModel
  });
  api.start();
  // Keep process alive
  process.on('SIGINT', () => { api.stop(); process.exit(0); });
  // Don't fall through to REPL
  await new Promise(() => {}); // block forever
}

// Interactive REPL mode
printWelcome(currentProvider, currentModel, connected, sessionId);

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: getPromptString()
});

rl.prompt();

rl.on('line', async (line) => {
  const input = line.trim();
  if (!input) { rl.prompt(); return; }

  if (input.startsWith('/')) {
    const [cmd, ...rest] = input.split(' ');
    const arg = rest.join(' ').trim();

    switch (cmd) {
      case '/exit':
      case '/quit':
        if (provider) save(createAgent());
        printSystem('Sessão salva. Até logo!');
        process.exit(0);
        break;

      case '/connect':
        await handleConnect(arg, rl);
        rl.setPrompt(getPromptString());
        break;

      case '/model':
        await handleModel(arg, rl);
        rl.setPrompt(getPromptString());
        break;

      case '/status':
        printStatusBar(currentProvider, currentModel, connected);
        break;

      case '/clear':
        messages = [];
        printSystem('Histórico limpo.');
        break;

      case '/new':
        if (provider) save(createAgent());
        sessionId = generateSessionId();
        messages = [];
        sessionMeta = { created: new Date().toISOString(), provider: currentProvider, model: currentModel };
        printSystem(`Nova sessão: ${sessionId.slice(0, 8)}`);
        break;

      case '/history': {
        const sessions = listSessions(10);
        if (sessions.length === 0) { printSystem('Nenhuma sessão salva.'); break; }
        for (const s of sessions) {
          console.log(`  ${s.id.slice(0, 8)}  ${s.updated?.slice(0, 16) || '?'}  (${s.msgCount} msgs)  ${s.preview}`);
        }
        break;
      }

      case '/load':
        if (!arg) { printError('Uso: /load SESSION_ID'); break; }
        const found = loadSession(arg) || (() => {
          const sessions = listSessions(50);
          const match = sessions.find(s => s.id.startsWith(arg));
          return match ? loadSession(match.id) : null;
        })();
        if (found) {
          sessionId = found.id; messages = found.messages || [];
          printSystem(`Sessão carregada: ${sessionId.slice(0, 8)} (${messages.length} mensagens)`);
        } else { printError('Sessão não encontrada.'); }
        break;

      case '/compact':
        messages = compactMessages(messages);
        printSystem(`Mensagens compactadas para ${messages.length}.`);
        break;

      case '/provider':
        if (arg && PROVIDERS.includes(arg)) {
          await handleConnect(arg, rl);
          rl.setPrompt(getPromptString());
        } else {
          printSystem(`Provider atual: ${chalk.cyan.bold(currentProvider)}`);
          printSystem('Use /connect para trocar.');
        }
        break;

      case '/tokens': {
        if (provider) {
          const agent = createAgent();
          printTokens(agent.totalUsage, sessionId);
        } else { printSystem('Nenhum provider conectado.'); }
        break;
      }

      case '/tools':
        for (const t of listToolNames()) console.log(`  ${t}`);
        break;

      case '/verbose':
        flags.verbose = !flags.verbose;
        printSystem(`Modo verbose: ${flags.verbose ? 'ON' : 'OFF'}`);
        break;

      case '/help':
        console.log(`
  ${chalk.cyan('/connect')}                Conecta a um provider (anthropic, google, openrouter, groq, bonsai)
  ${chalk.cyan('/connect remove <p>')}     Remove API key de um provider
  ${chalk.cyan('/model')}                  Seleciona modelo interativamente (com filtro)
  ${chalk.cyan('/model NOME')}             Troca modelo diretamente
  ${chalk.cyan('/status')}                 Mostra provider e modelo ativos
  ${chalk.cyan('/clear')}                  Limpa histórico da sessão
  ${chalk.cyan('/new')}                    Nova sessão
  ${chalk.cyan('/history')}                Lista sessões recentes
  ${chalk.cyan('/load ID')}                Carrega sessão
  ${chalk.cyan('/compact')}                Resume mensagens antigas
  ${chalk.cyan('/tokens')}                 Mostra uso de tokens
  ${chalk.cyan('/tools')}                  Lista ferramentas disponíveis
  ${chalk.cyan('/verbose')}                Toggle modo verbose
  ${chalk.cyan('/help')}                   Este menu
  ${chalk.cyan('/exit')}                   Sai e salva sessão
`);
        break;

      default:
        printError(`Comando desconhecido: ${cmd}. Use /help`);
    }

    rl.prompt();
    return;
  }

  if (!provider) {
    printError('Nenhum provider conectado. Use /connect primeiro.');
    rl.prompt();
    return;
  }

  printUserMessage(input);
  const agent = createAgent();
  await agent.run(input);
  save(agent);
  printSeparator();
  rl.prompt();
});

rl.on('close', () => {
  if (provider) save(createAgent());
  process.exit(0);
});
