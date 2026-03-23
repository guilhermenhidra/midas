// ── SSRF protection: block internal/private URLs ──
function validateUrl(urlStr) {
  let parsed;
  try { parsed = new URL(urlStr); } catch { throw new Error('URL inválida'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Apenas HTTP/HTTPS são permitidos');
  }
  const h = parsed.hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0' ||
      h.startsWith('10.') || h.startsWith('192.168.') ||
      h.startsWith('172.16.') || h.startsWith('172.17.') || h.startsWith('172.18.') ||
      h.startsWith('172.19.') || h.startsWith('172.2') || h.startsWith('172.30.') || h.startsWith('172.31.') ||
      h === '169.254.169.254' || h.endsWith('.internal') || h.endsWith('.local') ||
      h.endsWith('.localhost')) {
    throw new Error('Acesso a endereços internos/privados bloqueado');
  }
  return parsed.toString();
}

export const webSearchTool = {
  name: 'web_search',
  description: 'Pesquisa na web usando DuckDuckGo (com fallback para Playwright/Google). Retorna título, URL e snippet.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Termo de pesquisa' }
    },
    required: ['query']
  },
  async execute({ query }) {
    // Estratégia 1: DuckDuckGo API
    try {
      const encoded = encodeURIComponent(query);
      const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_redirect=1&no_html=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = await res.json();

      const results = [];
      if (data.AbstractText) {
        results.push({ title: data.Heading || 'Resultado', url: data.AbstractURL || '', snippet: data.AbstractText });
      }
      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics.slice(0, 5)) {
          if (topic.Text && topic.FirstURL) {
            results.push({ title: topic.Text.slice(0, 80), url: topic.FirstURL, snippet: topic.Text });
          }
        }
      }
      if (data.Results) {
        for (const r of data.Results.slice(0, 5)) {
          results.push({ title: r.Text || '', url: r.FirstURL || '', snippet: r.Text || '' });
        }
      }
      if (results.length > 0) {
        return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n');
      }
    } catch {}

    // Estratégia 2: Playwright fallback
    try {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 15000 });

      const results = await page.evaluate(() => {
        const items = document.querySelectorAll('div.g');
        const out = [];
        items.forEach((el, i) => {
          if (i >= 5) return;
          const titleEl = el.querySelector('h3');
          const linkEl = el.querySelector('a');
          const snippetEl = el.querySelector('.VwiC3b, .IsZvec, span.st');
          out.push({
            title: titleEl?.textContent || '',
            url: linkEl?.href || '',
            snippet: snippetEl?.textContent || ''
          });
        });
        return out;
      });

      await browser.close();
      if (results.length > 0) {
        return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n');
      }
    } catch {}

    return `Não foi possível realizar a pesquisa para: "${query}". Verifique sua conexão com a internet.`;
  }
};

export const webFetchTool = {
  name: 'web_fetch',
  description: 'Busca o conteúdo de uma URL e retorna como texto limpo (HTML convertido para texto).',
  input_schema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL para buscar' }
    },
    required: ['url']
  },
  async execute({ url }) {
    // Validate URL to prevent SSRF
    let safeUrl;
    try { safeUrl = validateUrl(url); } catch (err) { return `Erro: ${err.message}`; }

    try {
      const res = await fetch(safeUrl, {
        headers: { 'User-Agent': 'Midas/1.0' },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow'
      });

      const contentType = res.headers.get('content-type') || '';

      if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/json')) {
        return `Tipo de conteúdo não suportado: ${contentType}. Apenas HTML, texto e JSON são processados.`;
      }

      const text = await res.text();

      if (contentType.includes('application/json')) {
        return text.slice(0, 5000) + (text.length > 5000 ? '\n\n⚠️  Truncado (5000 chars)' : '');
      }

      // Strip HTML
      const clean = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();

      const limited = clean.slice(0, 5000);
      return limited + (clean.length > 5000 ? '\n\n⚠️  Truncado para 5000 caracteres.' : '');
    } catch (err) {
      return `Erro ao buscar URL: ${err.message}`;
    }
  }
};
