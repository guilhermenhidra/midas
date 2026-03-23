import { execSync } from 'child_process';

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
  async execute({ command, cwd }) {
    try {
      const output = execSync(command, {
        cwd: cwd || process.cwd(),
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
      const out = (err.stdout || '') + '\n' + (err.stderr || '');
      return `Erro (código ${err.status || 'desconhecido'}):\n${out.trim()}`;
    }
  }
};
