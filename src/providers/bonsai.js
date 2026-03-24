// Bonsai provider — Anthropic-compatible proxy at go.trybons.ai
// Uses Bearer token auth instead of x-api-key

import Anthropic from '@anthropic-ai/sdk';

export class BonsaiProvider {
  constructor(apiKey, model = 'claude-sonnet-4-5-20250514') {
    // Bonsai uses ANTHROPIC_AUTH_TOKEN (Bearer) not x-api-key
    // The Anthropic SDK sends x-api-key by default, but Bonsai accepts it via authToken
    this.client = new Anthropic({
      apiKey,
      baseURL: 'https://go.trybons.ai',
      defaultHeaders: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    this.model = model;
    this.name = 'bonsai';
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
    };
    if (tools && tools.length > 0) {
      params.tools = this.formatTools(tools);
    }

    const stream = this.client.messages.stream(params);

    let fullText = '';
    let toolCalls = [];
    let usage = { input_tokens: 0, output_tokens: 0 };
    let stopReason = 'end_turn';
    let currentToolCall = null;
    let inputJsonBuf = '';

    for await (const event of stream) {
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
