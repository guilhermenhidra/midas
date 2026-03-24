// Ollama provider — uses Ollama cloud API (ollama.com) or local server

export class OllamaProvider {
  constructor(apiKey, model = 'qwen3-coder:480b') {
    this.apiKey = apiKey || '';
    // If apiKey looks like a URL, use it as custom server; otherwise use ollama.com cloud
    if (apiKey && (apiKey.startsWith('http://') || apiKey.startsWith('https://'))) {
      this.baseURL = apiKey.replace(/\/+$/, '');
      this.authHeader = null;
    } else {
      this.baseURL = 'https://ollama.com';
      this.authHeader = apiKey ? `Bearer ${apiKey}` : null;
    }
    this.model = model;
    this.name = 'ollama';
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

    const body = {
      model: this.model,
      messages: msgs,
      stream: true,
      options: {
        num_predict: maxTokens
      }
    };
    if (tools && tools.length > 0) {
      body.tools = this.formatTools(tools);
    }

    const headers = { 'Content-Type': 'application/json' };
    if (this.authHeader) {
      headers['Authorization'] = this.authHeader;
    }

    const res = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}${errBody ? ': ' + errBody.slice(0, 200) : ''}`);
    }

    let fullText = '';
    let toolCalls = [];
    let usage = { input_tokens: 0, output_tokens: 0 };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        let chunk;
        try { chunk = JSON.parse(line); } catch { continue; }

        // Text content
        if (chunk.message?.content) {
          fullText += chunk.message.content;
          yield { type: 'text', text: chunk.message.content };
        }

        // Tool calls
        if (chunk.message?.tool_calls) {
          for (const tc of chunk.message.tool_calls) {
            toolCalls.push({
              id: `call_${toolCalls.length}`,
              name: tc.function?.name || '',
              input: tc.function?.arguments || {}
            });
          }
        }

        // Usage info (comes in final chunk where done=true)
        if (chunk.done && chunk.prompt_eval_count != null) {
          usage.input_tokens = chunk.prompt_eval_count || 0;
          usage.output_tokens = chunk.eval_count || 0;
        }
      }
    }

    const stopReason = toolCalls.length > 0 ? 'tool_use' : 'end_turn';

    yield {
      type: 'done',
      text: fullText,
      toolCalls,
      stopReason,
      usage
    };
  }

  buildAssistantMessage(text, toolCalls) {
    const msg = { role: 'assistant', content: text || '' };
    if (toolCalls.length > 0) {
      msg.tool_calls = toolCalls.map((tc) => ({
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
