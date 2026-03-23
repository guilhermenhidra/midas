# ✦ MIDAS

**Agente de desenvolvimento autônomo no terminal.** Um assistente de IA que lê, escreve, edita arquivos, executa comandos e pesquisa na web — tudo pelo terminal.

Suporte a **Anthropic**, **Google Gemini**, **OpenRouter** (100+ modelos) e **Groq** (inferência ultra-rápida).

---

## Instalação (3 comandos)

**Requisitos:** [Node.js](https://nodejs.org/) 18+ instalado.

```bash
# 1. Clone o repositório
git clone https://github.com/guilhermenhidra/midas.git

# 2. Entre na pasta e instale
cd midas && npm install

# 3. Registre o comando global
npm link
```

**Pronto!** Agora digite `midas` em qualquer terminal:

```bash
midas
```

---

## Primeiro uso

Ao abrir o Midas pela primeira vez, use `/connect` para configurar seu provider:

```
  midas> /connect

  Conexões
  ─────────────────────────────────────
  ● Desconectado  anthropic     (sem API key)
  ● Desconectado  openrouter    (sem API key)
  ● Desconectado  groq          (sem API key)
  ● Desconectado  google        (sem API key)

  Conectar a qual provider?
  1. anthropic
  2. openrouter
  3. groq
  4. google
```

Escolha o provider, cole sua API key e pronto. A key é salva **apenas localmente** em `~/.midas/config.json` com permissões restritas.

### Onde conseguir API keys

| Provider | Link | Vantagem |
|----------|------|----------|
| **Anthropic** | https://console.anthropic.com/settings/keys | Melhor qualidade de raciocínio |
| **Google** | https://aistudio.google.com/apikey | Gemini 2.5 Pro/Flash, plano free generoso |
| **OpenRouter** | https://openrouter.ai/keys | 100+ modelos, um só lugar |
| **Groq** | https://console.groq.com/keys | Ultra rápido, plano free |

---

## Gerenciando conexões

```
/connect              → Conectar a um provider (mostra status de todos)
/connect google       → Conectar direto ao Google
/connect remove groq  → Remove a API key do Groq
```

Você pode ter múltiplas API keys salvas e trocar entre providers a qualquer momento.

---

## Modos de uso

### Chat interativo
```bash
midas
```

### Tarefa única (executa e sai)
```bash
midas "crie um servidor express com 3 rotas"
```

### Pipe (stdin)
```bash
cat app.js | midas "encontre bugs nesse código"
```

---

## Comandos dentro do Midas

| Comando | O que faz |
|---------|-----------|
| `/connect` | Conecta/remove providers (Anthropic, Google, OpenRouter, Groq) |
| `/model` | Seleciona modelo interativamente com filtro |
| `/model gemini-2.5-pro` | Troca modelo direto |
| `/status` | Mostra provider e modelo ativos |
| `/new` | Nova sessão |
| `/history` | Lista sessões anteriores |
| `/load ID` | Carrega sessão salva |
| `/compact` | Compacta histórico para economizar tokens |
| `/tokens` | Mostra uso de tokens da sessão |
| `/tools` | Lista ferramentas disponíveis |
| `/clear` | Limpa histórico |
| `/verbose` | Liga/desliga detalhes de tool calls |
| `/help` | Lista todos os comandos |
| `/exit` | Sai e salva sessão |

---

## Ferramentas do agente

O Midas tem acesso a 11 ferramentas que usa autonomamente:

- **bash** — Executa qualquer comando no terminal (com confirmação)
- **read_file** / **read_multiple_files** — Lê arquivos
- **write_file** / **create_file** / **edit_file** — Escreve e edita arquivos
- **list_dir** — Lista diretórios
- **glob** — Busca arquivos por padrão (`**/*.js`)
- **search_files** — Grep em arquivos (texto ou regex)
- **web_search** — Pesquisa na web
- **web_fetch** — Busca conteúdo de URLs

---

## Personalizar por projeto

Crie um arquivo `MIDAS.md` na raiz do seu projeto:

```markdown
# Meu Projeto

Stack: React + TypeScript + Tailwind
Package manager: pnpm
Testes: vitest
Commits: conventional commits em português
```

O Midas lê automaticamente esse arquivo como contexto do projeto.

---

## Flags CLI

```bash
midas --provider google          # Usa provider específico
midas --model gemini-2.5-pro     # Usa modelo específico
midas --no-tools                 # Modo conversa sem ferramentas
midas --verbose                  # Mostra detalhes de tool calls
midas --new-session              # Força nova sessão
midas --session abc123           # Carrega sessão específica
midas --config                   # Configuração interativa
```

---

## Segurança

- API keys salvas com permissões restritas (0600) — só o seu usuário lê
- Confirmação antes de executar comandos shell
- Validação de caminhos para evitar acesso fora do projeto
- Proteção contra SSRF (URLs internas bloqueadas)
- Sessões salvas localmente com permissões restritas

---

## Atualizar

```bash
cd midas && git pull && npm install
```

## Desinstalar

```bash
npm unlink -g midas-cli
```

---

**MIT License** — Use, modifique e distribua livremente.
