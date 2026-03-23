import fs from 'fs';
import path from 'path';

export const readFileTool = {
  name: 'read_file',
  description: 'Lê o conteúdo de um arquivo. Opcionalmente especifique start_line e end_line para leitura parcial.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Caminho do arquivo' },
      start_line: { type: 'number', description: 'Linha inicial (1-indexed, opcional)' },
      end_line: { type: 'number', description: 'Linha final (1-indexed, opcional)' }
    },
    required: ['path']
  },
  async execute({ path: filePath, start_line, end_line }) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) return `Erro: arquivo não encontrado: ${resolved}`;
    const content = fs.readFileSync(resolved, 'utf-8');
    const lines = content.split('\n');
    const start = (start_line || 1) - 1;
    const end = end_line || lines.length;
    const slice = lines.slice(start, end);
    const numbered = slice.map((l, i) => `${start + i + 1}\t${l}`).join('\n');
    return `${resolved} (${lines.length} linhas)\n${numbered}`;
  }
};

export const readMultipleFilesTool = {
  name: 'read_multiple_files',
  description: 'Lê o conteúdo de múltiplos arquivos de uma vez.',
  input_schema: {
    type: 'object',
    properties: {
      paths: { type: 'array', items: { type: 'string' }, description: 'Array de caminhos de arquivos' }
    },
    required: ['paths']
  },
  async execute({ paths }) {
    const results = [];
    for (const p of paths) {
      const resolved = path.resolve(p);
      if (!fs.existsSync(resolved)) {
        results.push(`═══ ${resolved} ═══\nErro: arquivo não encontrado`);
        continue;
      }
      const content = fs.readFileSync(resolved, 'utf-8');
      const lines = content.split('\n');
      const numbered = lines.map((l, i) => `${i + 1}\t${l}`).join('\n');
      results.push(`═══ ${resolved} (${lines.length} linhas) ═══\n${numbered}`);
    }
    return results.join('\n\n');
  }
};

export const writeFileTool = {
  name: 'write_file',
  description: 'Cria ou sobrescreve um arquivo. Cria diretórios intermediários automaticamente.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Caminho do arquivo' },
      content: { type: 'string', description: 'Conteúdo a escrever' }
    },
    required: ['path', 'content']
  },
  async execute({ path: filePath, content }, options = {}) {
    const resolved = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content);
    const lines = content.split('\n').length;
    return `Arquivo escrito: ${resolved} (${lines} linhas)`;
  }
};

export const editFileTool = {
  name: 'edit_file',
  description: 'Edição cirúrgica: busca old_str e substitui por new_str no arquivo. Falha se old_str não for encontrado.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Caminho do arquivo' },
      old_str: { type: 'string', description: 'Texto exato a ser substituído' },
      new_str: { type: 'string', description: 'Novo texto' }
    },
    required: ['path', 'old_str', 'new_str']
  },
  async execute({ path: filePath, old_str, new_str }) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) return `Erro: arquivo não encontrado: ${resolved}`;
    const content = fs.readFileSync(resolved, 'utf-8');
    if (!content.includes(old_str)) {
      return `Erro: old_str não encontrado no arquivo. Verifique se o texto está exatamente correto incluindo espaços e indentação.`;
    }
    const count = content.split(old_str).length - 1;
    if (count > 1) {
      return `Erro: old_str encontrado ${count} vezes. Forneça mais contexto para tornar a busca única.`;
    }
    const newContent = content.replace(old_str, new_str);
    fs.writeFileSync(resolved, newContent);
    return `Arquivo editado: ${resolved} (substituição aplicada)`;
  }
};

export const createFileTool = {
  name: 'create_file',
  description: 'Cria um novo arquivo. Falha se o arquivo já existir.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Caminho do arquivo' },
      content: { type: 'string', description: 'Conteúdo do arquivo' }
    },
    required: ['path', 'content']
  },
  async execute({ path: filePath, content }) {
    const resolved = path.resolve(filePath);
    if (fs.existsSync(resolved)) return `Erro: arquivo já existe: ${resolved}. Use write_file para sobrescrever.`;
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content);
    return `Arquivo criado: ${resolved} (${content.split('\n').length} linhas)`;
  }
};

export const listDirTool = {
  name: 'list_dir',
  description: 'Lista arquivos e pastas de um diretório com tipo e tamanho.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Caminho do diretório' },
      recursive: { type: 'boolean', description: 'Listar recursivamente (padrão: false)' },
      max_depth: { type: 'number', description: 'Profundidade máxima na recursão (padrão: 3)' }
    },
    required: ['path']
  },
  async execute({ path: dirPath, recursive, max_depth }) {
    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved)) return `Erro: diretório não encontrado: ${resolved}`;

    const results = [];
    const maxD = max_depth || 3;

    function walk(dir, depth) {
      if (depth > maxD) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const rel = path.relative(resolved, full);
        if (entry.isDirectory()) {
          results.push(`[DIR]  ${rel}/`);
          if (recursive) walk(full, depth + 1);
        } else {
          try {
            const stat = fs.statSync(full);
            const size = stat.size < 1024 ? `${stat.size}B` : stat.size < 1048576 ? `${(stat.size/1024).toFixed(1)}KB` : `${(stat.size/1048576).toFixed(1)}MB`;
            results.push(`[FILE] ${rel} (${size})`);
          } catch {
            results.push(`[FILE] ${rel}`);
          }
        }
      }
    }

    walk(resolved, 0);
    return results.length > 0 ? results.join('\n') : '(diretório vazio)';
  }
};
