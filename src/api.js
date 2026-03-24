// Midas HTTP API Server — native http, no Express
import http from 'http';
import crypto from 'crypto';
import { Agent } from './agent.js';
import { createProvider } from './providers/index.js';
import { getToolDefinitions, executeTool, listToolNames } from './tools/index.js';
import { loadConfig, getApiKey, getModel } from './config.js';
import chalk from 'chalk';

export class MidasAPI {
  constructor(options = {}) {
    this.port = options.port || 4141;
    this.host = options.host || '127.0.0.1';
    this.token = options.token || crypto.randomBytes(32).toString('hex');
    this.corsOrigins = options.corsOrigins || '*';
    this.server = null;
    this.agent = null;
    this.provider = null;
    this.config = loadConfig();
    this.providerName = options.provider || this.config.provider;
    this.modelName = options.model || getModel(this.config, this.providerName);
  }

  initProvider() {
    const apiKey = getApiKey(this.config, this.providerName);
    if (!apiKey) throw new Error(`Sem API key para ${this.providerName}. Configure com: midas --config`);
    this.provider = createProvider(this.providerName, apiKey, this.modelName);
    this.agent = new Agent(this.provider, { noTools: false });
  }

  start() {
    this.initProvider();

    this.server = http.createServer(async (req, res) => {
      // CORS
      res.setHeader('Access-Control-Allow-Origin', this.corsOrigins);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Auth check
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${this.token}`) {
        this.json(res, 401, { error: 'Unauthorized. Use Authorization: Bearer <token>' });
        return;
      }

      const url = new URL(req.url, `http://${this.host}:${this.port}`);
      const pathname = url.pathname;

      try {
        if (pathname === '/status' && req.method === 'GET') {
          await this.handleStatus(req, res);
        } else if (pathname === '/chat' && req.method === 'POST') {
          await this.handleChat(req, res);
        } else if (pathname === '/tools' && req.method === 'POST') {
          await this.handleTools(req, res);
        } else {
          this.json(res, 404, { error: 'Not found. Endpoints: GET /status, POST /chat, POST /tools' });
        }
      } catch (err) {
        this.json(res, 500, { error: err.message });
      }
    });

    this.server.listen(this.port, this.host, () => {
      console.log('');
      console.log(chalk.hex('#FFD700').bold('  Midas API Server'));
      console.log(chalk.gray('  ─────────────────────────────────────────'));
      console.log(chalk.gray('  URL:   ') + chalk.cyan(`http://${this.host}:${this.port}`));
      console.log(chalk.gray('  Token: ') + chalk.yellow(this.token));
      console.log(chalk.gray('  Provider: ') + chalk.cyan(this.providerName) + chalk.gray(' · ') + chalk.white.bold(this.modelName));
      console.log(chalk.gray('  ─────────────────────────────────────────'));
      console.log('');
      console.log(chalk.gray('  Teste:'));
      console.log(chalk.gray(`  curl -X POST http://${this.host}:${this.port}/chat \\`));
      console.log(chalk.gray(`    -H "Authorization: Bearer ${this.token}" \\`));
      console.log(chalk.gray(`    -H "Content-Type: application/json" \\`));
      console.log(chalk.gray(`    -d '{"message":"olá"}'`));
      console.log('');
    });

    return this;
  }

  stop() {
    if (this.server) this.server.close();
  }

  async readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('Invalid JSON body')); }
      });
      req.on('error', reject);
    });
  }

  json(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  async handleStatus(req, res) {
    this.json(res, 200, {
      status: 'running',
      provider: this.providerName,
      model: this.modelName,
      tools: listToolNames().map(t => t.split(' - ')[0]),
      usage: this.agent?.totalUsage || { input_tokens: 0, output_tokens: 0 },
      messages: this.agent?.messages?.length || 0
    });
  }

  async handleChat(req, res) {
    const body = await this.readBody(req);
    if (!body.message) {
      this.json(res, 400, { error: 'Missing "message" field' });
      return;
    }

    // Create a fresh agent for each request but keep conversation if session
    const agent = new Agent(this.provider, {
      messages: body.messages || [],
      noTools: body.no_tools || false,
      dangerouslyAllowAll: true // API mode — no confirmations
    });

    // Collect response by intercepting console output
    const response = { text: '', toolCalls: [], usage: {} };

    // Override the agent's run to collect instead of print
    agent.messages.push({ role: 'user', content: body.message });
    const tools = body.no_tools ? [] : getToolDefinitions();
    let iterations = 0;
    const maxIterations = body.max_iterations || 25;

    while (iterations < maxIterations) {
      iterations++;

      let fullText = '';
      let toolCalls = [];
      let stopReason = 'end_turn';
      let usage = {};

      const stream = this.provider.stream(
        agent.messages,
        agent.getSystemPrompt(),
        tools,
        body.max_tokens || 8096
      );

      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          fullText += '';  // we collect from done
        } else if (chunk.type === 'done') {
          fullText = chunk.text;
          toolCalls = chunk.toolCalls || [];
          stopReason = chunk.stopReason;
          usage = chunk.usage || {};
        }
      }

      agent.totalUsage.input_tokens += usage.input_tokens || 0;
      agent.totalUsage.output_tokens += usage.output_tokens || 0;

      const assistantMsg = this.provider.buildAssistantMessage(fullText, toolCalls);
      agent.messages.push(assistantMsg);

      if (stopReason !== 'tool_use' || toolCalls.length === 0) {
        response.text = fullText;
        response.usage = agent.totalUsage;
        break;
      }

      // Execute tools automatically
      const toolResults = [];
      for (const tc of toolCalls) {
        const result = await executeTool(tc.name, tc.input);
        toolResults.push({ id: tc.id, name: tc.name, result });
        response.toolCalls.push({ name: tc.name, input: tc.input, result: String(result).slice(0, 500) });
      }

      const resultMsg = this.provider.buildToolResultMessage(toolResults);
      if (Array.isArray(resultMsg)) {
        agent.messages.push(...resultMsg);
      } else {
        agent.messages.push(resultMsg);
      }
    }

    this.json(res, 200, {
      response: response.text,
      tool_calls: response.toolCalls,
      usage: response.usage,
      iterations
    });
  }

  async handleTools(req, res) {
    const body = await this.readBody(req);
    if (!body.tool || !body.input) {
      this.json(res, 400, { error: 'Missing "tool" and/or "input" fields' });
      return;
    }

    const result = await executeTool(body.tool, body.input);
    this.json(res, 200, { tool: body.tool, result: String(result) });
  }
}
