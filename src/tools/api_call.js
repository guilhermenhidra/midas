// api_call tool — lets the LLM call whitelisted external APIs
import { loadConfig } from '../config.js';

// Block internal/private IPs (SSRF protection)
function isPrivateUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    if (host.startsWith('10.') || host.startsWith('192.168.')) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    if (host.endsWith('.local') || host.endsWith('.internal')) return true;
    return false;
  } catch { return true; }
}

export const apiCallTool = {
  name: 'api_call',
  description: 'Faz uma requisição HTTP para uma API externa. Apenas domínios na whitelist do config são permitidos. Use para integrar com APIs que o usuário configurou.',
  input_schema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL completa da API (ex: https://api.example.com/data)' },
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'Método HTTP (default: GET)' },
      headers: { type: 'object', description: 'Headers adicionais (objeto chave-valor)' },
      body: { type: 'string', description: 'Body da requisição (JSON string para POST/PUT/PATCH)' },
      timeout: { type: 'number', description: 'Timeout em ms (default: 15000, max: 60000)' }
    },
    required: ['url']
  },

  async execute(input) {
    const { url, method = 'GET', headers = {}, body, timeout = 15000 } = input;

    // SSRF check
    if (isPrivateUrl(url)) {
      return 'Erro: URLs privadas/internas não são permitidas.';
    }

    // Whitelist check
    const config = loadConfig();
    const whitelist = config.api_whitelist || [];
    if (whitelist.length > 0) {
      const urlHost = new URL(url).hostname;
      const allowed = whitelist.some(domain => {
        if (domain.startsWith('*.')) {
          return urlHost.endsWith(domain.slice(1)) || urlHost === domain.slice(2);
        }
        return urlHost === domain;
      });
      if (!allowed) {
        return `Erro: Domínio "${urlHost}" não está na whitelist. Domínios permitidos: ${whitelist.join(', ')}. Configure em ~/.midas/config.json → api_whitelist.`;
      }
    }

    // Merge configured endpoint headers
    const endpoints = config.api_endpoints || {};
    let finalHeaders = { ...headers };
    for (const [pattern, endpointConfig] of Object.entries(endpoints)) {
      if (url.includes(pattern) && endpointConfig.headers) {
        finalHeaders = { ...endpointConfig.headers, ...finalHeaders };
      }
    }

    const effectiveTimeout = Math.min(timeout, 60000);

    try {
      const fetchOptions = {
        method,
        headers: finalHeaders,
        signal: AbortSignal.timeout(effectiveTimeout)
      };

      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOptions.body = body;
        if (!finalHeaders['Content-Type'] && !finalHeaders['content-type']) {
          fetchOptions.headers['Content-Type'] = 'application/json';
        }
      }

      const res = await fetch(url, fetchOptions);
      const contentType = res.headers.get('content-type') || '';
      let responseBody;

      if (contentType.includes('application/json')) {
        responseBody = JSON.stringify(await res.json(), null, 2);
      } else {
        responseBody = await res.text();
      }

      // Truncate large responses
      if (responseBody.length > 10000) {
        responseBody = responseBody.slice(0, 10000) + '\n... (truncado, resposta original: ' + responseBody.length + ' chars)';
      }

      return `HTTP ${res.status} ${res.statusText}\n${responseBody}`;
    } catch (err) {
      return `Erro na requisição: ${err.message}`;
    }
  }
};
