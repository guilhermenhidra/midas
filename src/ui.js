import chalk from 'chalk';

const LOGO = `
  ${chalk.hex('#FFD700').bold('╔══════════════════════════════════════╗')}
  ${chalk.hex('#FFD700').bold('║')}        ${chalk.hex('#FFD700').bold('███╗   ███╗██╗██████╗  █████╗ ███████╗')}
  ${chalk.hex('#FFD700').bold('║')}        ${chalk.hex('#FFD700').bold('████╗ ████║██║██╔══██╗██╔══██╗██╔════╝')}
  ${chalk.hex('#FFD700').bold('║')}        ${chalk.hex('#FFD700').bold('██╔████╔██║██║██║  ██║███████║███████╗')}
  ${chalk.hex('#FFD700').bold('║')}        ${chalk.hex('#FFD700').bold('██║╚██╔╝██║██║██║  ██║██╔══██║╚════██║')}
  ${chalk.hex('#FFD700').bold('║')}        ${chalk.hex('#FFD700').bold('██║ ╚═╝ ██║██║██████╔╝██║  ██║███████║')}
  ${chalk.hex('#FFD700').bold('║')}        ${chalk.hex('#FFD700').bold('╚═╝     ╚═╝╚═╝╚═════╝ ╚═╝  ╚═╝╚══════╝')}
  ${chalk.hex('#FFD700').bold('╚══════════════════════════════════════╝')}
`;

export function printWelcome(providerName, modelName, connected, sessionId) {
  console.clear();
  console.log(LOGO);
  console.log(chalk.gray('  Agente de desenvolvimento autônomo no terminal'));
  console.log(chalk.gray('  ─────────────────────────────────────────────'));

  if (connected) {
    const dot = chalk.green('●');
    console.log(`  ${dot} ${chalk.cyan(providerName)} ${chalk.gray('→')} ${chalk.white.bold(modelName)}`);
  } else {
    console.log(`  ${chalk.red('●')} ${chalk.yellow('Nenhum provider conectado')} ${chalk.gray('— use')} ${chalk.cyan('/connect')}`);
  }

  console.log(chalk.gray(`  Sessão: ${sessionId?.slice(0, 8) || 'nova'}`));
  console.log('');
  console.log(chalk.gray('  Dica: ') + chalk.cyan('/help') + chalk.gray(' para comandos, ') + chalk.cyan('/connect') + chalk.gray(' para configurar provider'));
  console.log(chalk.gray('  ─────────────────────────────────────────────\n'));
}

export function printToolCall(name, input) {
  const summary = typeof input === 'string' ? input : JSON.stringify(input).slice(0, 120);
  console.log(chalk.yellow(`\n[${name}] `) + chalk.gray(summary));
}

export function printToolResult(result) {
  const lines = String(result).split('\n');
  const display = lines.slice(0, 30).join('\n');
  console.log(chalk.gray('  ' + display.replace(/\n/g, '\n  ')));
  if (lines.length > 30) {
    console.log(chalk.gray(`  ... (${lines.length - 30} linhas omitidas)`));
  }
}

export function printError(msg) {
  console.error(chalk.red('  ✗ ' + msg));
}

export function printSystem(msg) {
  console.log(chalk.blue('  ' + msg));
}

export function printSuccess(msg) {
  console.log(chalk.green('  ✓ ' + msg));
}

export function printTokens(usage, sessionId) {
  if (!usage) return;
  const i = usage.input_tokens || 0;
  const o = usage.output_tokens || 0;
  console.log(chalk.gray(`\n  (tokens: ${i.toLocaleString()} in / ${o.toLocaleString()} out${sessionId ? ' | sessão: ' + sessionId.slice(0, 8) : ''})`));
}

export function printStatusBar(providerName, modelName, connected) {
  const dot = connected ? chalk.green('●') : chalk.red('●');
  console.log('');
  console.log(chalk.gray('  ┌──────────────────────────────────────────────────'));
  console.log(chalk.gray('  │ ') + dot + chalk.gray(' Provider: ') + chalk.cyan.bold(providerName) + chalk.gray('  │  Modelo: ') + chalk.white.bold(modelName));
  console.log(chalk.gray('  └──────────────────────────────────────────────────'));
  console.log('');
}

export function promptText(providerName, modelName) {
  if (!providerName || providerName === 'none') {
    return chalk.hex('#FFD700').bold('  midas> ');
  }
  const tag = chalk.gray(`[${providerName}/${shortModel(modelName)}]`);
  return `  ${tag} ${chalk.hex('#FFD700').bold('midas>')} `;
}

function shortModel(model) {
  if (!model) return '?';
  if (model.length <= 25) return model;
  const parts = model.split('/');
  const name = parts[parts.length - 1];
  return name.length > 25 ? name.slice(0, 23) + '..' : name;
}

export function printConnectionStatus(providers) {
  console.log('');
  console.log(chalk.hex('#FFD700').bold('  Conexões'));
  console.log(chalk.gray('  ─────────────────────────────────────'));
  for (const p of providers) {
    const dot = p.connected ? chalk.green('● Conectado   ') : chalk.red('● Desconectado');
    const key = p.hasKey ? chalk.gray(' (key: ****' + p.keyPreview + ')') : chalk.yellow(' (sem API key)');
    console.log(`  ${dot}  ${chalk.cyan.bold(p.name.padEnd(12))}${key}`);
  }
  console.log(chalk.gray('  ─────────────────────────────────────'));
  console.log('');
}

export function printModelList(models, currentModel) {
  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    const num = chalk.gray(`  ${String(i + 1).padStart(2)}.`);
    const isCurrent = m.id === currentModel;
    const name = isCurrent ? chalk.green.bold(m.id + ' ← atual') : chalk.white(m.id);
    const provider = chalk.cyan(`[${m.provider}]`);
    const desc = m.description ? chalk.gray(` — ${m.description}`) : '';
    console.log(`${num} ${provider} ${name}${desc}`);
  }
}
