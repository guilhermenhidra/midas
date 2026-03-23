import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SESSIONS_DIR, ensureDirs } from './config.js';

export function generateSessionId() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(3).toString('hex');
  return `${ts}-${rand}`;
}

export function saveSession(sessionId, messages, meta = {}) {
  ensureDirs();
  const file = path.join(SESSIONS_DIR, `${sessionId}.json`);
  const data = {
    id: sessionId,
    created: meta.created || new Date().toISOString(),
    updated: new Date().toISOString(),
    provider: meta.provider || 'anthropic',
    model: meta.model || '',
    usage: meta.usage || { input_tokens: 0, output_tokens: 0 },
    messages
  };
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function loadSession(sessionId) {
  const file = path.join(SESSIONS_DIR, `${sessionId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

export function loadLatestSession() {
  ensureDirs();
  const files = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({
      name: f,
      time: fs.statSync(path.join(SESSIONS_DIR, f)).mtimeMs
    }))
    .sort((a, b) => b.time - a.time);

  if (files.length === 0) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, files[0].name), 'utf-8'));
  } catch {
    return null;
  }
}

export function listSessions(limit = 10) {
  ensureDirs();
  const files = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const filepath = path.join(SESSIONS_DIR, f);
      try {
        const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        const firstUser = data.messages?.find(m => m.role === 'user');
        const preview = firstUser
          ? (typeof firstUser.content === 'string' ? firstUser.content : JSON.stringify(firstUser.content)).slice(0, 60)
          : '(vazio)';
        return {
          id: data.id,
          created: data.created,
          updated: data.updated,
          preview,
          msgCount: data.messages?.length || 0
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updated) - new Date(a.updated))
    .slice(0, limit);

  return files;
}

export function compactMessages(messages) {
  if (messages.length <= 10) return messages;

  const oldMessages = messages.slice(0, -10);
  const recentMessages = messages.slice(-10);

  let summary = 'Resumo da conversa anterior:\n';
  for (const msg of oldMessages) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    const short = content.slice(0, 100);
    summary += `[${msg.role}]: ${short}...\n`;
  }

  return [
    { role: 'user', content: summary },
    { role: 'assistant', content: 'Entendido, tenho o contexto da conversa anterior.' },
    ...recentMessages
  ];
}

export function trimMessages(messages, maxMessages = 100) {
  if (messages.length <= maxMessages) return messages;
  return compactMessages(messages);
}
