#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { PipedriveClient } from './pipedrive-client.js';
import { logger } from './utils/logger.js';
import { handleToolError } from './utils/error-handler.js';
import { metricsCollector } from './utils/metrics.js';
import { DEFAULT_TOOLSETS, findToolset } from './utils/toolset-filter.js';
import { isWriteOperation } from './utils/read-only.js';

// Import all tool functions
import { getDealTools } from './tools/deals/index.js';
import { getPersonTools } from './tools/persons/index.js';
import { getOrganizationTools } from './tools/organizations/index.js';
import { getActivityTools } from './tools/activities/index.js';
import { getFileTools } from './tools/files/index.js';
import { getSearchTools } from './tools/search/index.js';
import { getPipelineTools } from './tools/pipelines/index.js';
import { getStageTools } from './tools/stages/index.js';
import { getNoteTools } from './tools/notes/index.js';
import { getFieldTools } from './tools/fields/index.js';
import { getSystemTools } from './tools/system/index.js';
import { getProductTools } from './tools/products/index.js';
import { getLeadTools } from './tools/leads/index.js';
import { getUserTools } from './tools/users/index.js';
import { getRoleTools } from './tools/roles/index.js';
import { getWebhookTools } from './tools/webhooks/index.js';
import { getFilterTools } from './tools/filters/index.js';
import { getProjectTools } from './tools/projects/index.js';
import { getProjectTemplateTools } from './tools/project-templates/index.js';
import { getGoalTools } from './tools/goals/index.js';
import { getTaskTools } from './tools/tasks/index.js';
import { getActivityTypeTools } from './tools/activity-types/index.js';
import { getCallLogTools } from './tools/call-logs/index.js';
import { getMailboxTools } from './tools/mailbox/index.js';
import { getTeamsTools } from './tools/teams/index.js';
import { getOrganizationRelationshipsTools } from './tools/org-relationships/index.js';
import { getPermissionSetTools } from './tools/permission-sets/index.js';
import { getChannelTools } from './tools/channels/index.js';
import { getMeetingTools } from './tools/meetings/index.js';

// Import resources and prompts
import { setupResources } from './resources/index.js';
import { setupPrompts } from './prompts/index.js';

// Tool type definition
interface Tool {
  name?: string; // Optional since deals tools don't include name in the object
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: readonly string[] | string[];
  };
  handler: (args: unknown) => Promise<unknown>;
}

// Validate environment
const API_TOKEN = process.env.PIPEDRIVE_API_TOKEN;
if (!API_TOKEN) {
  console.error('Error: PIPEDRIVE_API_TOKEN environment variable is required');
  console.error('');
  console.error('Get your API token from: https://app.pipedrive.com/settings/api');
  console.error('');
  console.error('Set it in your Claude Desktop config:');
  console.error('{');
  console.error('  "mcpServers": {');
  console.error('    "pipedrive": {');
  console.error('      "command": "npx",');
  console.error('      "args": ["-y", "@iamsamuelfraga/mcp-pipedrive"],');
  console.error('      "env": {');
  console.error('        "PIPEDRIVE_API_TOKEN": "your_token_here"');
  console.error('      }');
  console.error('    }');
  console.error('  }');
  console.error('}');
  process.exit(1);
}

// Initialize client
const client = new PipedriveClient(API_TOKEN);

// Read-only mode
const READ_ONLY = process.env.PIPEDRIVE_READ_ONLY === 'true';

// Toolset filtering
const enabledToolsets = process.env.PIPEDRIVE_TOOLSETS
  ? process.env.PIPEDRIVE_TOOLSETS.split(',').map((t) => t.trim())
  : [...DEFAULT_TOOLSETS];

// Helper function to convert array of tools to object
function arrayToToolsObject(tools: Tool[]): Record<string, Tool> {
  return tools.reduce(
    (acc, tool) => {
      if (tool.name) {
        acc[tool.name] = tool;
      }
      return acc;
    },
    {} as Record<string, Tool>
  );
}

// Aggregate all tools
const allTools: Record<string, Tool> = {
  ...getDealTools(client),
  ...arrayToToolsObject(getPersonTools(client)),
  ...arrayToToolsObject(getOrganizationTools(client)),
  ...arrayToToolsObject(getActivityTools(client)),
  ...getFileTools(client),
  ...getSearchTools(client),
  ...getPipelineTools(client),
  ...getStageTools(client),
  ...getNoteTools(client),
  ...getFieldTools(client),
  ...getSystemTools(client),
  ...arrayToToolsObject(getProductTools(client)),
  ...getLeadTools(client),
  ...getUserTools(client),
  ...getRoleTools(client),
  ...getWebhookTools(client),
  ...getFilterTools(client),
  ...arrayToToolsObject(getProjectTools(client)),
  ...arrayToToolsObject(getProjectTemplateTools(client)),
  ...getGoalTools(client),
  ...getTaskTools(client),
  ...getActivityTypeTools(client),
  ...getCallLogTools(client),
  ...arrayToToolsObject(getMailboxTools(client)),
  ...arrayToToolsObject(getTeamsTools(client)),
  ...arrayToToolsObject(getOrganizationRelationshipsTools(client)),
  ...getPermissionSetTools(client),
  ...getChannelTools(client),
  ...getMeetingTools(client),
};

// Filter by toolset and read-only mode
const tools = Object.fromEntries(
  Object.entries(allTools).filter(([name, _tool]) => {
    const toolset = findToolset(name, enabledToolsets);
    if (!toolset) {
      logger.debug('Toolset disabled, skipping tool', { tool: name });
      return false;
    }

    if (READ_ONLY && isWriteOperation(name)) {
      logger.warn('Skipping write operation in read-only mode', { tool: name });
      return false;
    }

    return true;
  })
);

// Create MCP server
const server = new Server(
  {
    name: 'pipedrive-mcp',
    version: '0.0.0-development',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.debug('Listing available tools', { count: Object.keys(tools).length });

  return {
    tools: Object.entries(tools).map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  logger.info('Tool called', { tool: name, hasArgs: !!args });

  const startTime = Date.now();
  let success = true;

  try {
    const tool = tools[name];
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const result = await tool.handler(args || {});

    const duration = Date.now() - startTime;
    logger.info('Tool executed successfully', { tool: name, duration });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    success = false;
    const duration = Date.now() - startTime;
    logger.error('Tool execution failed', error as Error, { tool: name, duration });

    // Record metrics for the tool call
    metricsCollector.recordRequest(name, duration, true);

    return handleToolError(error);
  } finally {
    if (success) {
      const duration = Date.now() - startTime;
      metricsCollector.recordRequest(name, duration, false);
    }
  }
});

// Setup MCP Resources and Prompts
setupResources(server, client);
setupPrompts(server);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Pipedrive MCP server started', {
    toolCount: Object.keys(tools).length,
    enabledToolsets,
    readOnly: READ_ONLY,
  });

  // Log available tools by category
  const toolsByCategory: Record<string, number> = {};
  Object.keys(tools).forEach((name) => {
    const category = findToolset(name, enabledToolsets) ?? name;
    toolsByCategory[category] = (toolsByCategory[category] || 0) + 1;
  });

  logger.debug('Tools by category', toolsByCategory);
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully (SIGINT)...');

  // Log final metrics
  const metrics = metricsCollector.getMetrics();
  logger.info('Final metrics', metrics as unknown as Record<string, unknown>);

  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully (SIGTERM)...');

  // Log final metrics
  const metrics = metricsCollector.getMetrics();
  logger.info('Final metrics', metrics as unknown as Record<string, unknown>);

  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', new Error(String(reason)), {
    promise: String(promise),
  });
  process.exit(1);
});

main().catch((error) => {
  logger.error('Fatal error during startup', error);
  process.exit(1);
});
