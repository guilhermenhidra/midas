import { execSync } from 'child_process';
import path from 'path';

// Dangerous patterns that require extra caution
const DANGEROUS_PATTERNS = [
  /rm\s+(-rf|-fr|--no-preserve-root)\s+[\/~]/i,
  /mkfs\./i,
  /dd\s+if=/i,
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;/,  // fork bomb
  />(\/dev\/sd|\/dev\/nvme)/i,
  /chmod\s+-R\s+777\s+\//i,
];

export const bashTool = {
  name: 'bash',
  description: 'Executa um comando shell no sistema. Retorna stdout e stderr. Timeout de 60 segundos.',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'O comando shell a executar' },
      cwd: { type: 'string', description: 'Diretório de trabalho (opcional)' }
    },
    required: ['command']
  },
  async execute({ command, cwd }, options = {}) {
    // Block extremely dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return `Erro: comando bloqueado por segurança. Padrão perigoso detectado: ${command.slice(0, 80)}`;
      }
    }

    // Validate cwd if provided
    const workDir = cwd ? path.resolve(cwd) : process.cwd();

    try {
      const output = execSync(command, {
        cwd: workDir,
        timeout: 60000,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      const lines = output.split('\n');
      if (lines.length > 200) {
        return `[Truncado: mostrando últimas 200 de ${lines.length} linhas]\n` + lines.slice(-200).join('\n');
      }
      return output || '(comando executado sem output)';
    } catch (err) {
      const stdout = (err.stdout || '').slice(0, 2000);
      const stderr = (err.stderr || '').slice(0, 2000);
      return `Erro (código ${err.status || 'desconhecido'}):\n${(stdout + '\n' + stderr).trim()}`;
    }
  }
};
