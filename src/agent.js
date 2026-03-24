import { getToolDefinitions, executeTool, allTools } from './tools/index.js';
import {
  printToolCall, printToolResult, printToolSkipped, printTokens,
  printConfirmBox, printConfirmResult,
  startSpinner, stopSpinner,
  startAssistantMessage, writeAssistantToken, endAssistantMessage
} from './ui.js';
import chalk from 'chalk';

const SYSTEM_PROMPT = `Você é Midas, um agente de desenvolvimento autônomo e altamente capaz rodando diretamente no terminal do usuário. Você tem acesso completo ao sistema de arquivos e ao shell da máquina.

# Modo conversa vs modo ação
- Para conversas normais, saudações, perguntas ou explicações: RESPONDA COM TEXTO. NÃO use ferramentas.
- Use ferramentas APENAS quando o usuário pedir uma AÇÃO concreta (criar arquivo, executar comando, buscar algo, etc).
- NUNCA use bash para exibir texto ou responder perguntas.

# Raciocínio antes de agir (CRÍTICO)
Quando receber uma tarefa de desenvolvimento, siga SEMPRE esta ordem:

1. **EXPLORAR** — Antes de qualquer mudança, entenda o contexto:
   - Use glob para descobrir a estrutura do projeto
   - Use read_file para ler os arquivos relevantes
   - Use search_files para encontrar padrões, imports, usos
   - NUNCA modifique um arquivo que você não leu primeiro

2. **PLANEJAR** — Decomponha tarefas complexas:
   - Identifique todos os arquivos que precisam mudar
   - Determine a ordem correta das mudanças
   - Considere dependências e efeitos colaterais
   - Para tarefas com 3+ passos, liste o plano brevemente antes de executar

3. **EXECUTAR** — Faça as mudanças de forma cirúrgica:
   - Prefira edit_file (edição cirúrgica) a write_file (reescrita completa)
   - Quando usar edit_file, use old_str com contexto suficiente para ser único
   - Agrupe mudanças relacionadas, mas faça uma de cada vez
   - Leia arquivos relacionados antes de editar (imports, tipos, interfaces)

4. **VERIFICAR** — Confirme que funcionou:
   - Use read_file para verificar que a edição foi aplicada corretamente
   - Use bash para rodar testes, linters, ou o programa
   - Se algo falhou, leia o erro, entenda a causa, e corrija

# Princípios de execução
- Seja autônomo: execute toda a cadeia sem perguntar a cada passo
- Seja direto e técnico nas respostas
- Se um comando falhar, tente abordagem alternativa
- Entenda o contexto completo: leia arquivos adjacentes (package.json, configs, imports)
- Para bugs: leia o código, reproduza o erro, identifique a causa raiz, corrija, verifique
- Para features: entenda a arquitetura existente, siga os padrões do projeto
- Se precisar de informação externa, use web_search
- Pode usar spawn_agent para delegar sub-tarefas complexas a agentes focados
- Pode usar api_call para chamar APIs externas configuradas pelo usuário`;

const CONFIRM_TOOLS = new Set(['bash', 'write_file', 'create_file']);

const TOOL_LABELS = {
  bash: 'Executar comando',
  write_file: 'Escrever arquivo',
  create_file: 'Criar arquivo',
};

// Read a single keypress from stdin (no readline needed)
function waitForKey() {
  return new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    const onData = (key) => {
      process.stdin.removeListener('data', onData);
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(wasRaw || false);
      }
      // Ctrl+C
      if (key[0] === 3) { process.exit(0); }
      const char = String(key).toLowerCase();
      resolve(char);
    };

    process.stdin.on('data', onData);
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

    // Inject provider into spawn_agent tool so sub-agents can use it
    const spawnTool = allTools.find(t => t.name === 'spawn_agent');
    if (spawnTool) {
      spawnTool._provider = this.provider;
      spawnTool._projectContext = this.projectContext;
    }

    let iterations = 0;
    const maxIterations = 25;

    while (iterations < maxIterations) {
      iterations++;

      if (iterations > 1 && iterations % 10 === 1) {
        console.log(chalk.yellow(`\n  ⚠ ${iterations - 1} iterações. Continuando...`));
      }

      let fullText = '';
      let toolCalls = [];
      let stopReason = 'end_turn';
      let usage = {};
      let firstToken = true;

      startSpinner('Pensando');

      try {
        const stream = this.provider.stream(
          this.messages,
          this.getSystemPrompt(),
          tools,
          8096
        );

        for await (const chunk of stream) {
          if (chunk.type === 'text') {
            if (firstToken) {
              stopSpinner();
              startAssistantMessage();
              firstToken = false;
            }
            writeAssistantToken(chunk.text);
          } else if (chunk.type === 'done') {
            stopSpinner();
            fullText = chunk.text;
            toolCalls = chunk.toolCalls || [];
            stopReason = chunk.stopReason;
            usage = chunk.usage || {};
          }
        }
      } catch (e) {
        stopSpinner();
        console.error(chalk.red(`\n  ✗ Erro do provider: ${e.message}`));
        return;
      }

      this.totalUsage.input_tokens += usage.input_tokens || 0;
      this.totalUsage.output_tokens += usage.output_tokens || 0;

      const assistantMsg = this.provider.buildAssistantMessage(fullText, toolCalls);
      this.messages.push(assistantMsg);

      if (stopReason !== 'tool_use' || toolCalls.length === 0) {
        if (!firstToken) endAssistantMessage();
        printTokens(this.totalUsage, this.sessionId);
        return;
      }

      if (!firstToken) endAssistantMessage();

      // Execute tool calls
      const toolResults = [];
      for (const tc of toolCalls) {
        const summary = this.verbose
          ? (typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input).slice(0, 100))
          : summarizeInput(tc.name, tc.input);

        printToolCall(tc.name, summary);

        // Confirmation for dangerous tools
        if (!this.dangerouslyAllowAll && CONFIRM_TOOLS.has(tc.name)) {
          const label = TOOL_LABELS[tc.name] || tc.name;
          const detail = tc.name === 'bash'
            ? tc.input.command?.slice(0, 70)
            : tc.input.path?.slice(0, 70);

          printConfirmBox(label, detail);

          // Wait for single keypress — S/Enter = yes, N/anything = no
          const key = await waitForKey();
          const approved = (key === 's' || key === 'y' || key === '\r' || key === '\n');
          printConfirmResult(approved);

          if (!approved) {
            printToolSkipped();
            toolResults.push({ id: tc.id, name: tc.name, result: 'Cancelado pelo usuário.' });
            continue;
          }
        }

        startSpinner(`Executando ${tc.name}`);
        const result = await executeTool(tc.name, tc.input);
        stopSpinner();

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

    console.log(chalk.yellow('\n  ⚠ Limite de iterações atingido (25).'));
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
    case 'api_call': return `${input.method || 'GET'} ${input.url || ''}`;
    case 'spawn_agent': return input.task?.slice(0, 80) || '';
    default: return JSON.stringify(input).slice(0, 80);
  }
}
