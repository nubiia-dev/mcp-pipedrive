import { describe, it, expect } from 'vitest';
import { isWriteOperation } from '../read-only.js';
import { createMockClient } from '../../__tests__/mocks/client.mock.js';

import { getDealTools } from '../../tools/deals/index.js';
import { getPersonTools } from '../../tools/persons/index.js';
import { getOrganizationTools } from '../../tools/organizations/index.js';
import { getActivityTools } from '../../tools/activities/index.js';
import { getFileTools } from '../../tools/files/index.js';
import { getSearchTools } from '../../tools/search/index.js';
import { getPipelineTools } from '../../tools/pipelines/index.js';
import { getStageTools } from '../../tools/stages/index.js';
import { getNoteTools } from '../../tools/notes/index.js';
import { getFieldTools } from '../../tools/fields/index.js';
import { getSystemTools } from '../../tools/system/index.js';
import { getProductTools } from '../../tools/products/index.js';
import { getLeadTools } from '../../tools/leads/index.js';
import { getUserTools } from '../../tools/users/index.js';
import { getRoleTools } from '../../tools/roles/index.js';
import { getWebhookTools } from '../../tools/webhooks/index.js';
import { getFilterTools } from '../../tools/filters/index.js';
import { getProjectTools } from '../../tools/projects/index.js';
import { getProjectTemplateTools } from '../../tools/project-templates/index.js';
import { getGoalTools } from '../../tools/goals/index.js';
import { getTaskTools } from '../../tools/tasks/index.js';
import { getActivityTypeTools } from '../../tools/activity-types/index.js';
import { getCallLogTools } from '../../tools/call-logs/index.js';
import { getMailboxTools } from '../../tools/mailbox/index.js';
import { getTeamsTools } from '../../tools/teams/index.js';
import { getOrganizationRelationshipsTools } from '../../tools/org-relationships/index.js';
import { getPermissionSetTools } from '../../tools/permission-sets/index.js';
import { getChannelTools } from '../../tools/channels/index.js';
import { getMeetingTools } from '../../tools/meetings/index.js';

/**
 * Guard against read-only mode drifting out of sync with the tools themselves.
 *
 * `isWriteOperation` classifies by name, so a tool whose name uses an unfamiliar verb could
 * silently be misclassified. Here every registered tool is checked against what its handler
 * actually does: any handler issuing a POST/PUT/PATCH/DELETE or a file upload must be blocked in
 * read-only mode, and any handler that only issues GETs must stay available.
 *
 * If this fails after adding a tool, fix the classification in `src/utils/read-only.ts` (add the
 * tool to `READ_ONLY_EXCEPTIONS` when it is a read whose name carries no read verb) rather than
 * relaxing the assertion.
 */

type ToolLike = { name?: string; handler: (args: unknown) => Promise<unknown> };

const client = createMockClient();

const toObject = (tools: ToolLike[]): Record<string, ToolLike> =>
  Object.fromEntries(tools.filter((t) => t.name).map((t) => [t.name as string, t]));

const allTools: Record<string, ToolLike> = {
  ...getDealTools(client),
  ...toObject(getPersonTools(client)),
  ...toObject(getOrganizationTools(client)),
  ...toObject(getActivityTools(client)),
  ...getFileTools(client),
  ...getSearchTools(client),
  ...getPipelineTools(client),
  ...getStageTools(client),
  ...getNoteTools(client),
  ...getFieldTools(client),
  ...getSystemTools(client),
  ...toObject(getProductTools(client)),
  ...getLeadTools(client),
  ...getUserTools(client),
  ...getRoleTools(client),
  ...getWebhookTools(client),
  ...getFilterTools(client),
  ...toObject(getProjectTools(client)),
  ...toObject(getProjectTemplateTools(client)),
  ...getGoalTools(client),
  ...getTaskTools(client),
  ...getActivityTypeTools(client),
  ...getCallLogTools(client),
  ...toObject(getMailboxTools(client)),
  ...toObject(getTeamsTools(client)),
  ...toObject(getOrganizationRelationshipsTools(client)),
  ...getPermissionSetTools(client),
  ...getChannelTools(client),
  ...getMeetingTools(client),
} as Record<string, ToolLike>;

const MUTATING_CALL = /\.(post|put|patch|delete)\s*\(|\buploadFile\s*\(/;
const READ_CALL = /\.get\s*\(/;

const entries = Object.entries(allTools).map(([name, tool]) => {
  const source = String(tool.handler);
  return { name, mutates: MUTATING_CALL.test(source), reads: READ_CALL.test(source) };
});

describe('read-only classification vs actual handler behaviour', () => {
  it('registers the full tool catalogue', () => {
    // Sanity check: a broken import would otherwise make the assertions below vacuous.
    expect(entries.length).toBeGreaterThan(250);
  });

  const mutating = entries.filter((e) => e.mutates);

  it('finds handlers that mutate data', () => {
    expect(mutating.length).toBeGreaterThan(100);
  });

  it('blocks every tool whose handler mutates data', () => {
    const escaping = mutating.filter((e) => !isWriteOperation(e.name)).map((e) => e.name);
    expect(escaping).toEqual([]);
  });

  it('keeps every read-only tool available', () => {
    const overBlocked = entries
      .filter((e) => !e.mutates && e.reads && isWriteOperation(e.name))
      .map((e) => e.name);
    expect(overBlocked).toEqual([]);
  });
});
