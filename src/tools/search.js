import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Simple ReDoS detector: flag patterns with nested quantifiers
function isSafeRegex(pattern) {
  // Block patterns like (a+)+, (a*)*b, (a|b+)+ etc.
  if (/(\+|\*|\{)\s*\)(\+|\*|\?)|\(\?[^)]*(\+|\*)\)(\+|\*)/.test(pattern)) return false;
  // Block excessive quantifiers
  if ((pattern.match(/(\+|\*)/g) || []).length > 10) return false;
  return true;
}

export const globTool = {
  name: 'glob',
  description: 'Busca arquivos por padrão glob. Ex: **/*.js, src/**/*.ts',
  input_schema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Padrão glob' },
      cwd: { type: 'string', description: 'Diretório base (opcional)' }
    },
    required: ['pattern']
  },
  async execute({ pattern, cwd }) {
    const base = cwd || process.cwd();
    try {
      const files = await glob(pattern, { cwd: base, nodir: false, dot: false, ignore: ['**/node_modules/**'] });
      if (files.length === 0) return 'Nenhum arquivo encontrado.';
      return files.slice(0, 100).join('\n') + (files.length > 100 ? `\n... (${files.length - 100} mais)` : '');
    } catch (err) {
      return `Erro: ${err.message}`;
    }
  }
};

export const searchFilesTool = {
  name: 'search_files',
  description: 'Busca por texto ou regex dentro de arquivos. Retorna arquivo, linha e conteúdo.',
  input_schema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Texto ou regex a buscar' },
      directory: { type: 'string', description: 'Diretório onde buscar (padrão: cwd)' },
      file_extensions: { type: 'array', items: { type: 'string' }, description: 'Extensões de arquivo (ex: [".js", ".ts"])' },
      case_sensitive: { type: 'boolean', description: 'Busca case-sensitive (padrão: false)' }
    },
    required: ['pattern']
  },
  async execute({ pattern, directory, file_extensions, case_sensitive }) {
    const dir = path.resolve(directory || process.cwd());
    const flags = case_sensitive ? 'g' : 'gi';

    let regex;
    try {
      if (isSafeRegex(pattern)) {
        regex = new RegExp(pattern, flags);
      } else {
        // Unsafe pattern — treat as literal
        regex = new RegExp(escapeRegex(pattern), flags);
      }
    } catch {
      regex = new RegExp(escapeRegex(pattern), flags);
    }

    const results = [];
    const maxResults = 50;

    function walk(d, depth) {
      if (results.length >= maxResults || depth > 8) return;
      let entries;
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) { walk(full, depth + 1); continue; }
        if (file_extensions && file_extensions.length > 0) {
          const ext = path.extname(entry.name);
          if (!file_extensions.includes(ext)) continue;
        }
        // Skip large files
        try {
          const stat = fs.statSync(full);
          if (stat.size > 1048576) continue; // skip > 1MB
        } catch { continue; }
        try {
          const content = fs.readFileSync(full, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (results.length >= maxResults) break;
            if (regex.test(lines[i])) {
              regex.lastIndex = 0;
              results.push(`${path.relative(dir, full)}:${i + 1}: ${lines[i].trim()}`);
            }
          }
        } catch {}
      }
    }

    walk(dir, 0);
    let output = results.join('\n');
    if (results.length >= maxResults) output += `\n\n⚠️  Limitado a ${maxResults} resultados. Refine a busca para ver mais.`;
    return output || 'Nenhum resultado encontrado.';
  }
};
