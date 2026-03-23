import { createInterface } from 'readline';
import { getToolDefinitions, executeTool } from './tools/index.js';
import { printToolCall, printToolResult, printTokens } from './ui.js';
import chalk from 'chalk';

const SYSTEM_PROMPT = `Você é Midas, um agente de desenvolvimento autônomo e altamente capaz rodando diretamente no terminal do usuário. Você tem acesso completo ao sistema de arquivos e ao shell da máquina.

Seu objetivo é executar tarefas de desenvolvimento com precisão e eficiência. Quando receber uma tarefa, planeje os passos necessários, execute usando as ferramentas disponíveis, verifique os resultados e corrija erros automaticamente.

Princípios de operação:
- Prefira edições cirúrgicas (edit_file) a reescritas completas quando possível
- Sempre verifique o resultado de operações críticas com read_file ou bash
- Se um comando falhar, analise o erro e tente uma abordagem alternativa
- Seja direto e técnico. Explique brevemente o que está fazendo antes de cada tool call
- Nunca peça permissão para executar tarefas que já foram solicitadas
- Se precisar de informação que não tem, use web_search ou pergunte ao usuário`;

// Tools that require user confirmation by default
const CONFIRM_TOOLS = new Set(['bash', 'write_file', 'create_file']);

function askUserConfirmation(message) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(chalk.yellow(`  ⚠ ${message} `) + chalk.gray('(s/n): '), (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 's' || answer.trim().toLowerCase() === 'y' || answer.trim() === '');
    });
  });
}

export class Agent {
  constructor(provider, options = {}) {
    this.provider = provider;
    this.messages = options.messages || [];
    this.verbose = options.verbose || false;
    this.noTools = options.noTools || false;
    this.dangerouslyAllowAll = options.dangerouslyAllowAll || false;
    this.totalUsage = { input_tokens: 0, output_tokens: 0 };
    this.sessionId = options.sessionId || '';
    this.projectContext = options.projectContext || '';
  }

  getSystemPrompt() {
    let sys = SYSTEM_PROMPT;
    if (this.projectContext) {
      sys += `\n\nContexto do projeto (do MIDAS.md):\n${this.projectContext}`;
    }
    return sys;
  }

  async run(userMessage) {
    this.messages.push({ role: 'user', content: userMessage });

    const tools = this.noTools ? [] : getToolDefinitions();
    let iterations = 0;
    const maxIterations = 25;

    while (iterations < maxIterations) {
      iterations++;

      // Warn every 10 iterations
      if (iterations > 1 && iterations % 10 === 1) {
        console.log(chalk.yellow(`\n  ⚠ ${iterations - 1} iterações executadas. Continuando...`));
      }

      let fullText = '';
      let toolCalls = [];
      let stopReason = 'end_turn';
      let usage = {};

      try {
        const stream = this.provider.stream(
          this.messages,
          this.getSystemPrompt(),
          tools,
          8096
        );

        for await (const chunk of stream) {
          if (chunk.type === 'text') {
            process.stdout.write(chunk.text);
          } else if (chunk.type === 'done') {
            fullText = chunk.text;
            toolCalls = chunk.toolCalls || [];
            stopReason = chunk.stopReason;
            usage = chunk.usage || {};
          }
        }
      } catch (err) {
        console.error(chalk.red(`\nErro do provider: ${err.message}`));
        return;
      }

      this.totalUsage.input_tokens += usage.input_tokens || 0;
      this.totalUsage.output_tokens += usage.output_tokens || 0;

      const assistantMsg = this.provider.buildAssistantMessage(fullText, toolCalls);
      this.messages.push(assistantMsg);

      if (stopReason !== 'tool_use' || toolCalls.length === 0) {
        if (fullText) console.log();
        printTokens(this.totalUsage, this.sessionId);
        return;
      }

      console.log();

      // Execute tool calls
      const toolResults = [];
      for (const tc of toolCalls) {
        if (this.verbose) {
          printToolCall(tc.name, tc.input);
        } else {
          printToolCall(tc.name, summarizeInput(tc.name, tc.input));
        }

        // User confirmation for dangerous tools
        if (!this.dangerouslyAllowAll && CONFIRM_TOOLS.has(tc.name)) {
          const desc = tc.name === 'bash' ? `Executar: ${tc.input.command?.slice(0, 100)}` : `${tc.name}: ${(tc.input.path || '').slice(0, 80)}`;
          const approved = await askUserConfirmation(desc);
          if (!approved) {
            toolResults.push({ id: tc.id, name: tc.name, result: 'Cancelado pelo usuário.' });
            console.log(chalk.gray('  (cancelado)'));
            continue;
          }
        }

        const result = await executeTool(tc.name, tc.input);
        printToolResult(result);
        toolResults.push({ id: tc.id, name: tc.name, result });
      }

      const resultMsg = this.provider.buildToolResultMessage(toolResults);
      if (Array.isArray(resultMsg)) {
        this.messages.push(...resultMsg);
      } else {
        this.messages.push(resultMsg);
      }
    }

    console.log(chalk.yellow('\n  ⚠ Limite de iterações atingido (25). Parando o loop.'));
  }
}

function summarizeInput(toolName, input) {
  switch (toolName) {
    case 'bash': return input.command || '';
    case 'read_file': return input.path || '';
    case 'write_file': return input.path || '';
    case 'edit_file': return input.path || '';
    case 'create_file': return input.path || '';
    case 'list_dir': return input.path || '';
    case 'glob': return input.pattern || '';
    case 'search_files': return `"${input.pattern}" em ${input.directory || '.'}`;
    case 'web_search': return input.query || '';
    case 'web_fetch': return input.url || '';
    default: return JSON.stringify(input).slice(0, 80);
  }
}
