import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

const CONFIG_DIR = path.join(os.homedir(), '.midas');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const SESSIONS_DIR = path.join(CONFIG_DIR, 'sessions');

const DEFAULT_CONFIG = {
  provider: 'anthropic',
  models: {
    anthropic: 'claude-opus-4-5',
    openrouter: 'anthropic/claude-opus-4-5',
    groq: 'llama-3.3-70b-versatile'
  },
  api_keys: {
    anthropic: '',
    openrouter: '',
    groq: ''
  },
  max_tokens: 8096,
  auto_save_sessions: true,
  verbose: false,
  dangerously_allow_all: false
};

// Known models per provider (offline catalog for instant selection)
const KNOWN_MODELS = {
  anthropic: [
    { id: 'claude-opus-4-5', description: 'Mais capaz, raciocínio avançado' },
    { id: 'claude-sonnet-4-5', description: 'Equilíbrio velocidade/qualidade' },
    { id: 'claude-sonnet-4-5-20250514', description: 'Sonnet 4.5 snapshot' },
    { id: 'claude-haiku-3-5', description: 'Rápido e econômico' },
    { id: 'claude-3-5-sonnet-20241022', description: 'Sonnet 3.5 v2' },
    { id: 'claude-3-5-haiku-20241022', description: 'Haiku 3.5' },
  ],
  openrouter: [
    { id: 'anthropic/claude-opus-4-5', description: 'Claude Opus 4.5 via OpenRouter' },
    { id: 'anthropic/claude-sonnet-4-5', description: 'Claude Sonnet 4.5 via OpenRouter' },
    { id: 'google/gemini-2.5-pro-preview', description: 'Gemini 2.5 Pro' },
    { id: 'google/gemini-2.0-flash-001', description: 'Gemini 2.0 Flash' },
    { id: 'openai/gpt-4o', description: 'GPT-4o' },
    { id: 'openai/gpt-4o-mini', description: 'GPT-4o Mini' },
    { id: 'meta-llama/llama-3.3-70b-instruct', description: 'Llama 3.3 70B' },
    { id: 'deepseek/deepseek-chat-v3-0324', description: 'DeepSeek V3' },
    { id: 'deepseek/deepseek-r1', description: 'DeepSeek R1' },
    { id: 'qwen/qwen-2.5-72b-instruct', description: 'Qwen 2.5 72B' },
    { id: 'mistralai/mistral-large-2411', description: 'Mistral Large' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', description: 'Llama 3.3 70B — rápido' },
    { id: 'llama-3.1-8b-instant', description: 'Llama 3.1 8B — ultra rápido' },
    { id: 'llama-3.2-90b-vision-preview', description: 'Llama 3.2 90B Vision' },
    { id: 'mixtral-8x7b-32768', description: 'Mixtral 8x7B — 32K context' },
    { id: 'gemma2-9b-it', description: 'Gemma 2 9B' },
  ]
};

export function ensureDirs() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

export function loadConfig() {
  ensureDirs();
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config) {
  ensureDirs();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getApiKey(config, provider) {
  const p = provider || config.provider;
  const fromConfig = config.api_keys?.[p];
  if (fromConfig) return fromConfig;
  const envMap = {
    anthropic: 'ANTHROPIC_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    groq: 'GROQ_API_KEY'
  };
  return process.env[envMap[p]] || '';
}

export function getModel(config, provider) {
  const p = provider || config.provider;
  return config.models?.[p] || DEFAULT_CONFIG.models[p];
}

export function getKnownModels(provider) {
  return KNOWN_MODELS[provider] || [];
}

export function getAllKnownModels() {
  const all = [];
  for (const [provider, models] of Object.entries(KNOWN_MODELS)) {
    for (const m of models) {
      all.push({ ...m, provider });
    }
  }
  return all;
}

// Test connection to a provider by making a minimal API call
export async function testConnection(providerName, apiKey) {
  if (!apiKey) return { ok: false, error: 'Sem API key' };

  try {
    switch (providerName) {
      case 'anthropic': {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-haiku-3-5',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }]
          }),
          signal: AbortSignal.timeout(10000)
        });
        // 200 or 400 (bad request but authenticated) both mean key is valid
        if (res.status === 401 || res.status === 403) {
          return { ok: false, error: 'API key inválida' };
        }
        return { ok: true };
      }
      case 'openrouter': {
        const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000)
        });
        if (res.ok) return { ok: true };
        return { ok: false, error: `HTTP ${res.status}` };
      }
      case 'groq': {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000)
        });
        if (res.ok) return { ok: true };
        if (res.status === 401) return { ok: false, error: 'API key inválida' };
        return { ok: false, error: `HTTP ${res.status}` };
      }
      default:
        return { ok: false, error: 'Provider desconhecido' };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Fetch live models from OpenRouter API
export async function fetchOpenRouterModels(apiKey) {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.map(m => ({
      id: m.id,
      description: m.name || '',
      provider: 'openrouter',
      context: m.context_length,
      pricing: m.pricing
    })) || null;
  } catch {
    return null;
  }
}

// Fetch live models from Groq API
export async function fetchGroqModels(apiKey) {
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.map(m => ({
      id: m.id,
      description: m.owned_by || '',
      provider: 'groq'
    })) || null;
  } catch {
    return null;
  }
}

export async function interactiveConfig() {
  const config = loadConfig();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  console.log('\n⚙️  Configuração do Midas\n');

  const provider = await ask(`Provider padrão (${config.provider}): `);
  if (provider) config.provider = provider;

  for (const p of ['anthropic', 'openrouter', 'groq']) {
    const model = await ask(`Modelo ${p} (${config.models[p]}): `);
    if (model) config.models[p] = model;
    const key = await ask(`API Key ${p} (${config.api_keys[p] ? '****' + config.api_keys[p].slice(-4) : 'vazio'}): `);
    if (key) config.api_keys[p] = key;
  }

  const maxTokens = await ask(`Max tokens (${config.max_tokens}): `);
  if (maxTokens) config.max_tokens = parseInt(maxTokens) || config.max_tokens;

  rl.close();
  saveConfig(config);
  console.log('\n✅ Configuração salva em ' + CONFIG_FILE);
}

export { CONFIG_DIR, CONFIG_FILE, SESSIONS_DIR, DEFAULT_CONFIG };
