import OpenAI from 'openai';

export class GroqProvider {
  constructor(apiKey, model = 'llama-3.3-70b-versatile') {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1'
    });
    this.model = model;
    this.name = 'groq';
  }

  formatTools(tools) {
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema || t.parameters
      }
    }));
  }

  async *stream(messages, systemPrompt, tools, maxTokens = 8096) {
    const msgs = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const params = {
      model: this.model,
      max_tokens: maxTokens,
      messages: msgs,
      stream: true
    };
    if (tools && tools.length > 0) {
      params.tools = this.formatTools(tools);
    }

    const stream = await this.client.chat.completions.create(params);

    let fullText = '';
    let toolCalls = [];
    let toolCallMap = {};

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        fullText += delta.content;
        yield { type: 'text', text: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCallMap[idx]) {
            toolCallMap[idx] = { id: tc.id || `call_${idx}`, name: '', arguments: '' };
          }
          if (tc.function?.name) toolCallMap[idx].name = tc.function.name;
          if (tc.function?.arguments) toolCallMap[idx].arguments += tc.function.arguments;
        }
      }

      if (chunk.choices?.[0]?.finish_reason) {
        break;
      }
    }

    for (const idx of Object.keys(toolCallMap).sort((a, b) => a - b)) {
      const tc = toolCallMap[idx];
      let input = {};
      try { input = JSON.parse(tc.arguments); } catch {}
      toolCalls.push({ id: tc.id, name: tc.name, input });
    }

    const stopReason = toolCalls.length > 0 ? 'tool_use' : 'end_turn';

    yield {
      type: 'done',
      text: fullText,
      toolCalls,
      stopReason,
      usage: { input_tokens: 0, output_tokens: 0 }
    };
  }

  buildAssistantMessage(text, toolCalls) {
    const msg = { role: 'assistant', content: text || '' };
    if (toolCalls.length > 0) {
      msg.tool_calls = toolCalls.map((tc, i) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.input) }
      }));
    }
    return msg;
  }

  buildToolResultMessage(toolResults) {
    return toolResults.map(r => ({
      role: 'tool',
      tool_call_id: r.id,
      content: String(r.result)
    }));
  }
}
