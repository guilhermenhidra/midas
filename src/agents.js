// Sub-agent system — spawn focused agents with their own context
import { Agent } from './agent.js';
import { getToolDefinitions, executeTool } from './tools/index.js';

// Tool definition for spawning sub-agents
export const spawnAgentTool = {
  name: 'spawn_agent',
  description: 'Cria um sub-agente focado em uma tarefa específica. O sub-agente tem seu próprio contexto e executa autonomamente até completar. Use para delegar tarefas complexas que podem ser resolvidas independentemente (ex: "pesquise sobre X", "refatore o módulo Y", "crie testes para Z").',
  input_schema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'Descrição detalhada da tarefa para o sub-agente' },
      context: { type: 'string', description: 'Contexto adicional (conteúdo de arquivos, informações relevantes)' },
      max_iterations: { type: 'number', description: 'Máximo de iterações do sub-agente (default: 15)' }
    },
    required: ['task']
  },

  // Will be set by the Agent when executing
  _provider: null,
  _projectContext: '',

  async execute(input) {
    const { task, context = '', max_iterations = 15 } = input;

    if (!this._provider) {
      return 'Erro: provider não configurado para sub-agentes.';
    }

    const subAgent = new Agent(this._provider, {
      messages: [],
      noTools: false,
      dangerouslyAllowAll: true, // sub-agents run without confirmation
      projectContext: this._projectContext
    });

    // Build the sub-agent's task message
    let fullTask = `Você é um sub-agente focado. Complete esta tarefa e retorne o resultado de forma concisa.\n\nTAREFA: ${task}`;
    if (context) {
      fullTask += `\n\nCONTEXTO:\n${context}`;
    }

    // Run the sub-agent with its own message loop
    subAgent.messages.push({ role: 'user', content: fullTask });

    const tools = getToolDefinitions();
    let iterations = 0;
    let lastResponse = '';

    while (iterations < max_iterations) {
      iterations++;

      let fullText = '';
      let toolCalls = [];
      let stopReason = 'end_turn';
      let usage = {};

      try {
        const stream = this._provider.stream(
          subAgent.messages,
          subAgent.getSystemPrompt(),
          tools,
          8096
        );

        for await (const chunk of stream) {
          if (chunk.type === 'done') {
            fullText = chunk.text;
            toolCalls = chunk.toolCalls || [];
            stopReason = chunk.stopReason;
            usage = chunk.usage || {};
          }
        }
      } catch (e) {
        return `Erro no sub-agente: ${e.message}`;
      }

      subAgent.totalUsage.input_tokens += usage.input_tokens || 0;
      subAgent.totalUsage.output_tokens += usage.output_tokens || 0;

      const assistantMsg = this._provider.buildAssistantMessage(fullText, toolCalls);
      subAgent.messages.push(assistantMsg);

      if (stopReason !== 'tool_use' || toolCalls.length === 0) {
        lastResponse = fullText;
        break;
      }

      // Execute tools
      const toolResults = [];
      for (const tc of toolCalls) {
        const result = await executeTool(tc.name, tc.input);
        toolResults.push({ id: tc.id, name: tc.name, result });
      }

      const resultMsg = this._provider.buildToolResultMessage(toolResults);
      if (Array.isArray(resultMsg)) {
        subAgent.messages.push(...resultMsg);
      } else {
        subAgent.messages.push(resultMsg);
      }
    }

    const usageStr = `[Sub-agente: ${iterations} iterações, ${subAgent.totalUsage.input_tokens} in / ${subAgent.totalUsage.output_tokens} out tokens]`;
    return `${lastResponse}\n\n${usageStr}`;
  }
};
