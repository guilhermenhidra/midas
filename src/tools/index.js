import { bashTool } from './bash.js';
import { readFileTool, readMultipleFilesTool, writeFileTool, editFileTool, createFileTool, listDirTool } from './files.js';
import { globTool, searchFilesTool } from './search.js';
import { webSearchTool, webFetchTool } from './web.js';

export const allTools = [
  bashTool,
  readFileTool,
  readMultipleFilesTool,
  writeFileTool,
  editFileTool,
  createFileTool,
  listDirTool,
  globTool,
  searchFilesTool,
  webSearchTool,
  webFetchTool
];

const toolMap = new Map(allTools.map(t => [t.name, t]));

export function getToolDefinitions() {
  return allTools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema
  }));
}

export async function executeTool(name, input) {
  const tool = toolMap.get(name);
  if (!tool) return `Erro: ferramenta desconhecida: ${name}`;
  try {
    return await tool.execute(input);
  } catch (err) {
    return `Erro ao executar ${name}: ${err.message}`;
  }
}

export function listToolNames() {
  return allTools.map(t => `${t.name} - ${t.description}`);
}
