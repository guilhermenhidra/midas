// Bonsai provider — uses raw fetch + SSE instead of Anthropic SDK
// to avoid auth header conflicts

export class BonsaiProvider {
  constructor(apiKey, model = 'bonsai') {
    this.apiKey = apiKey;
    this.model = model;
    this.name = 'bonsai';
    this.baseURL = 'https://go.trybons.ai';
  }

  formatTools(tools) {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema || t.parameters
    }));
  }

  async *stream(messages, systemPrompt, tools, maxTokens = 8096) {
    const params = {
      model: this.model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      stream: true
    };
    if (tools && tools.length > 0) {
      params.tools = this.formatTools(tools);
    }

    const res = await fetch(`${this.baseURL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(params)
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}${body ? ': ' + body.slice(0, 200) : ''}`);
    }

    let fullText = '';
    let toolCalls = [];
    let usage = { input_tokens: 0, output_tokens: 0 };
    let stopReason = 'end_turn';
    let currentToolCall = null;
    let inputJsonBuf = '';

    // Parse SSE stream
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
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        let event;
        try { event = JSON.parse(data); } catch { continue; }

        if (event.type === 'message_start' && event.message?.usage) {
          usage.input_tokens = event.message.usage.input_tokens || 0;
        }

        if (event.type === 'content_block_start') {
          if (event.content_block?.type === 'tool_use') {
            currentToolCall = {
              id: event.content_block.id,
              name: event.content_block.name,
              input: {}
            };
            inputJsonBuf = '';
          }
        }

        if (event.type === 'content_block_delta') {
          if (event.delta?.type === 'text_delta') {
            const text = event.delta.text;
            fullText += text;
            yield { type: 'text', text };
          }
          if (event.delta?.type === 'input_json_delta') {
            inputJsonBuf += event.delta.partial_json;
          }
        }

        if (event.type === 'content_block_stop' && currentToolCall) {
          try {
            currentToolCall.input = inputJsonBuf ? JSON.parse(inputJsonBuf) : {};
          } catch {
            currentToolCall.input = {};
          }
          toolCalls.push(currentToolCall);
          currentToolCall = null;
          inputJsonBuf = '';
        }

        if (event.type === 'message_delta') {
          if (event.usage) {
            usage.output_tokens = event.usage.output_tokens || 0;
          }
          if (event.delta?.stop_reason) {
            stopReason = event.delta.stop_reason;
          }
        }
      }
    }

    yield {
      type: 'done',
      text: fullText,
      toolCalls,
      stopReason,
      usage
    };
  }

  buildAssistantMessage(text, toolCalls) {
    const content = [];
    if (text) content.push({ type: 'text', text });
    for (const tc of toolCalls) {
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.name,
        input: tc.input
      });
    }
    return { role: 'assistant', content };
  }

  buildToolResultMessage(toolResults) {
    return {
      role: 'user',
      content: toolResults.map(r => ({
        type: 'tool_result',
        tool_use_id: r.id,
        content: String(r.result)
      }))
    };
  }
}
