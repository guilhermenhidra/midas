import chalk from 'chalk';

// ── Colors ──
const gold = chalk.hex('#FFD700');
const goldBold = gold.bold;
const dim = chalk.gray;
const dimBold = chalk.gray.bold;
const accent = chalk.cyan;
const accentBold = chalk.cyan.bold;
const success = chalk.green;
const warn = chalk.yellow;
const err = chalk.red;
const white = chalk.white;
const whiteBold = chalk.white.bold;

// ── Tool icons ──
const TOOL_ICONS = {
  bash: '  $',
  read_file: '  ',
  read_multiple_files: '  ',
  write_file: '  ',
  create_file: '  +',
  edit_file: '  ~',
  list_dir: '  ',
  glob: '  ',
  search_files: '  ',
  web_search: '  ',
  web_fetch: '  '
};

// ── Spinner ──
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerInterval = null;
let spinnerFrame = 0;

export function startSpinner(text = 'Pensando') {
  spinnerFrame = 0;
  spinnerInterval = setInterval(() => {
    const frame = gold(SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length]);
    process.stdout.write(`\r  ${frame} ${dim(text + '...')}  `);
    spinnerFrame++;
  }, 80);
}

export function stopSpinner() {
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
  }
}

// ── Logo ──
const LOGO = [
  '  ███╗   ███╗██╗██████╗  █████╗ ███████╗',
  '  ████╗ ████║██║██╔══██╗██╔══██╗██╔════╝',
  '  ██╔████╔██║██║██║  ██║███████║███████╗',
  '  ██║╚██╔╝██║██║██║  ██║██╔══██║╚════██║',
  '  ██║ ╚═╝ ██║██║██████╔╝██║  ██║███████║',
  '  ╚═╝     ╚═╝╚═╝╚═════╝ ╚═╝  ╚═╝╚══════╝',
];

export function printWelcome(providerName, modelName, connected, sessionId) {
  console.log('');
  for (const line of LOGO) {
    console.log(goldBold(line));
  }
  console.log('');
  console.log(dim('  ─────────────────────────────────────────'));

  if (connected) {
    console.log(`  ${success('●')} ${accentBold(providerName)} ${dim('→')} ${whiteBold(modelName)}`);
  } else {
    console.log(`  ${err('●')} ${warn('Nenhum provider conectado')} ${dim('— digite')} ${accent('/connect')}`);
  }

  console.log(dim(`  Sessão: ${sessionId?.slice(0, 8) || 'nova'} │ ${new Date().toLocaleDateString('pt-BR')}`));
  console.log(dim('  ─────────────────────────────────────────'));
  console.log('');
  console.log(dim('  Dicas: ') + accent('/help') + dim(' comandos · ') + accent('/connect') + dim(' provider · ') + accent('/model') + dim(' trocar LLM'));
  console.log('');
}

// ── Chat formatting ──

export function printUserMessage(msg) {
  console.log('');
  console.log(goldBold('  ❯ ') + whiteBold(msg));
  console.log('');
}

export function startAssistantMessage() {
  // Called before streaming begins — print the left border start
  process.stdout.write(dim('  │ '));
}

export function writeAssistantToken(token) {
  // Handle newlines to keep the border
  const replaced = token.replace(/\n/g, '\n' + dim('  │ '));
  process.stdout.write(replaced);
}

export function endAssistantMessage() {
  console.log('');
}

// ── Tool calls ──

export function printToolCall(name, input) {
  const icon = TOOL_ICONS[name] || '  ⚡';
  const summary = typeof input === 'string' ? input : JSON.stringify(input).slice(0, 100);

  console.log('');
  console.log(dim('  ┌─') + warn.bold(` ${icon} ${name} `) + dim('─'.repeat(Math.max(0, 45 - name.length))));
  console.log(dim('  │ ') + white(summary.slice(0, 90)));
}

export function printToolResult(result) {
  const text = String(result);
  const lines = text.split('\n');
  const show = lines.slice(0, 20);

  for (const line of show) {
    console.log(dim('  │  ') + dim(line.slice(0, 120)));
  }
  if (lines.length > 20) {
    console.log(dim(`  │  ... (${lines.length - 20} linhas omitidas)`));
  }
  console.log(dim('  └─────────────────────────────────────────────'));
}

export function printToolSkipped() {
  console.log(dim('  │  ') + dim.italic('(cancelado pelo usuário)'));
  console.log(dim('  └─────────────────────────────────────────────'));
}

// ── Confirmation dialog ──

export function printConfirmBox(action, detail) {
  console.log('');
  console.log(warn('  ┌──────────────────────────────────────────────'));
  console.log(warn('  │ ') + warn.bold('⚠  Permissão necessária'));
  console.log(warn('  │'));
  console.log(warn('  │ ') + white(action));
  if (detail) {
    const short = detail.length > 70 ? detail.slice(0, 67) + '...' : detail;
    console.log(warn('  │ ') + dim(short));
  }
  console.log(warn('  │'));
  process.stdout.write(warn('  │ ') + success.bold(' S ') + dim('Sim') + dim('  │  ') + err.bold('N ') + dim('Não') + dim('  │  ') + dim.italic('Enter = Sim'));
}

export function printConfirmResult(accepted) {
  if (accepted) {
    console.log(success('  │ ✓ Permitido'));
  } else {
    console.log(err('  │ ✗ Negado'));
  }
  console.log(warn('  └──────────────────────────────────────────────'));
}

// ── Status, errors, system ──

export function printError(msg) {
  console.log(err('  ✗ ') + err(msg));
}

export function printSystem(msg) {
  console.log(accent('  ' + msg));
}

export function printSuccess(msg) {
  console.log(success('  ✓ ') + success(msg));
}

export function printTokens(usage, sessionId) {
  if (!usage) return;
  const i = usage.input_tokens || 0;
  const o = usage.output_tokens || 0;
  console.log('');
  console.log(dim(`  ──── tokens: ${i.toLocaleString()} in · ${o.toLocaleString()} out${sessionId ? ' │ sessão: ' + sessionId.slice(0, 8) : ''} ────`));
}

export function printStatusBar(providerName, modelName, connected) {
  const dot = connected ? success('●') : err('●');
  console.log('');
  console.log(dim('  ┌──────────────────────────────────────────────────'));
  console.log(dim('  │ ') + dot + dim(' Provider: ') + accentBold(providerName) + dim('  ·  Modelo: ') + whiteBold(modelName));
  console.log(dim('  └──────────────────────────────────────────────────'));
  console.log('');
}

// ── Prompt ──

export function promptText(providerName, modelName) {
  if (!providerName || providerName === 'none') {
    return goldBold('  ❯ ');
  }
  const tag = dim(`${providerName}/${shortModel(modelName)}`);
  return `  ${tag} ${goldBold('❯')} `;
}

function shortModel(model) {
  if (!model) return '?';
  if (model.length <= 25) return model;
  const parts = model.split('/');
  const name = parts[parts.length - 1];
  return name.length > 25 ? name.slice(0, 23) + '..' : name;
}

// ── Connection status ──

export function printConnectionStatus(providers) {
  console.log('');
  console.log(goldBold('  Conexões'));
  console.log(dim('  ─────────────────────────────────────────'));
  for (const p of providers) {
    const dot = p.connected ? success('●') : (p.hasKey ? warn('●') : err('●'));
    const status = p.connected ? success('Conectado   ') : (p.hasKey ? warn('Com key     ') : dim('Sem key     '));
    const keyInfo = p.hasKey ? dim(' ····' + p.keyPreview) : '';
    console.log(`  ${dot} ${status} ${accentBold(p.name.padEnd(12))}${keyInfo}`);
  }
  console.log(dim('  ─────────────────────────────────────────'));
  console.log('');
}

// ── Model list ──

export function printModelList(models, currentModel) {
  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    const num = dim(`  ${String(i + 1).padStart(2)}.`);
    const isCurrent = m.id === currentModel;
    const name = isCurrent ? success.bold(`${m.id} ← atual`) : white(m.id);
    const provider = accent(`[${m.provider}]`);
    const desc = m.description ? dim(` — ${m.description}`) : '';
    console.log(`${num} ${provider} ${name}${desc}`);
  }
}

// ── Separator ──

export function printSeparator() {
  console.log(dim('\n  ─────────────────────────────────────────\n'));
}
