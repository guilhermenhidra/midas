import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

const CONFIG_DIR = path.join(os.homedir(), '.midas');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const SESSIONS_DIR = path.join(CONFIG_DIR, 'sessions');

const PROVIDERS = ['anthropic', 'openrouter', 'groq', 'google', 'bonsai'];

const DEFAULT_CONFIG = {
  provider: 'anthropic',
  models: {
    anthropic: 'claude-sonnet-4-5',
    openrouter: 'anthropic/claude-sonnet-4-5',
    groq: 'llama-3.3-70b-versatile',
    google: 'gemini-2.5-flash',
    bonsai: 'claude-sonnet-4-5-20250514'
  },
  api_keys: {
    anthropic: '',
    openrouter: '',
    groq: '',
    google: '',
    bonsai: ''
  },
  max_tokens: 8096,
  auto_save_sessions: true,
  verbose: false,
  api_whitelist: [],
  api_endpoints: {},
  api_server: {
    port: 4141,
    host: '127.0.0.1',
    cors_origins: '*'
  }
};

const KNOWN_MODELS = {
  anthropic: [
    { id: 'claude-opus-4-5', description: 'Mais capaz, raciocínio avançado' },
    { id: 'claude-sonnet-4-5', description: 'Equilíbrio velocidade/qualidade' },
    { id: 'claude-haiku-3-5', description: 'Rápido e econômico' },
    { id: 'claude-3-5-sonnet-20241022', description: 'Sonnet 3.5 v2' },
    { id: 'claude-3-5-haiku-20241022', description: 'Haiku 3.5' },
  ],
  openrouter: [
    { id: 'anthropic/claude-sonnet-4-5', description: 'Claude Sonnet 4.5' },
    { id: 'anthropic/claude-opus-4-5', description: 'Claude Opus 4.5' },
    { id: 'google/gemini-2.5-pro-preview', description: 'Gemini 2.5 Pro' },
    { id: 'google/gemini-2.5-flash-preview', description: 'Gemini 2.5 Flash' },
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
  ],
  google: [
    { id: 'gemini-2.5-pro', description: 'Gemini 2.5 Pro — mais capaz' },
    { id: 'gemini-2.5-flash', description: 'Gemini 2.5 Flash — rápido e barato' },
    { id: 'gemini-2.0-flash', description: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-pro', description: 'Gemini 1.5 Pro — 1M context' },
    { id: 'gemini-1.5-flash', description: 'Gemini 1.5 Flash' },
  ],
  bonsai: [
    { id: 'claude-sonnet-4-5-20250514', description: 'Claude Sonnet 4.5 via Bonsai' },
    { id: 'claude-opus-4-5-20250414', description: 'Claude Opus 4.5 via Bonsai' },
    { id: 'claude-haiku-3-5-20241022', description: 'Claude Haiku 3.5 via Bonsai' },
  ]
};

// ── Security: sanitize parsed JSON to prevent prototype pollution ──
function sanitize(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  const clean = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    clean[k] = (typeof v === 'object' && v !== null) ? sanitize(v) : v;
  }
  return clean;
}

export function ensureDirs() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(SESSIONS_DIR, { recursive: true, mode: 0o700 });
  // Fix permissions on existing dirs (mkdir doesn't change existing)
  try { fs.chmodSync(CONFIG_DIR, 0o700); } catch {}
  try { fs.chmodSync(SESSIONS_DIR, 0o700); } catch {}
}

export function loadConfig() {
  ensureDirs();
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), { mode: 0o600 });
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = sanitize(JSON.parse(raw));
    return { ...DEFAULT_CONFIG, ...parsed, api_keys: { ...DEFAULT_CONFIG.api_keys, ...parsed.api_keys }, models: { ...DEFAULT_CONFIG.models, ...parsed.models } };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config) {
  ensureDirs();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function getApiKey(config, provider) {
  const p = provider || config.provider;
  if (!PROVIDERS.includes(p)) return '';
  const fromConfig = config.api_keys?.[p];
  if (fromConfig) return fromConfig;
  const envMap = {
    anthropic: 'ANTHROPIC_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    groq: 'GROQ_API_KEY',
    google: 'GOOGLE_API_KEY',
    bonsai: 'BONSAI_API_KEY'
  };
  return process.env[envMap[p]] || '';
}

export function removeApiKey(config, provider) {
  if (config.api_keys?.[provider]) {
    config.api_keys[provider] = '';
    saveConfig(config);
  }
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

export async function testConnection(providerName, apiKey) {
  if (!apiKey) return { ok: false, error: 'Sem API key' };
  try {
    switch (providerName) {
      case 'anthropic': {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-haiku-3-5', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
          signal: AbortSignal.timeout(10000)
        });
        if (res.status === 401 || res.status === 403) return { ok: false, error: 'API key inválida' };
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
      case 'google': {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
          signal: AbortSignal.timeout(10000)
        });
        if (res.ok) return { ok: true };
        if (res.status === 400 || res.status === 401 || res.status === 403) return { ok: false, error: 'API key inválida' };
        return { ok: false, error: `HTTP ${res.status}` };
      }
      case 'bonsai': {
        const res = await fetch('https://go.trybons.ai/v1/messages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({ model: 'claude-haiku-3-5-20241022', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
          signal: AbortSignal.timeout(10000)
        });
        if (res.status === 401 || res.status === 403) return { ok: false, error: 'API key inválida' };
        return { ok: true };
      }
      default:
        return { ok: false, error: 'Provider desconhecido' };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function fetchOpenRouterModels(apiKey) {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.map(m => ({ id: m.id, description: m.name || '', provider: 'openrouter' })) || null;
  } catch { return null; }
}

export async function fetchGroqModels(apiKey) {
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.map(m => ({ id: m.id, description: m.owned_by || '', provider: 'groq' })) || null;
  } catch { return null; }
}

export async function fetchGoogleModels(apiKey) {
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.models?.filter(m => m.name?.includes('gemini')).map(m => ({
      id: m.name.replace('models/', ''),
      description: m.displayName || '',
      provider: 'google'
    })) || null;
  } catch { return null; }
}

export async function interactiveConfig() {
  const config = loadConfig();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  console.log('\n⚙️  Configuração do Midas\n');
  const provider = await ask(`Provider padrão (${config.provider}): `);
  if (provider) config.provider = provider;

  for (const p of PROVIDERS) {
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

export { CONFIG_DIR, CONFIG_FILE, SESSIONS_DIR, DEFAULT_CONFIG, PROVIDERS };
