import type { PipedriveClient } from '../../pipedrive-client.js';
import { ListDealsSchema, type ListDealsInput } from '../../schemas/deal.js';
import { enrichEntityWithCustomFields } from '../../utils/custom-fields.js';
import { applyDateFilter } from '../../utils/date-filter.js';

/**
 * Response shape returned by GET /api/v2/deals — a cursor-paginated collection.
 * `additional_data.next_cursor` is null once the last page has been fetched.
 */
interface V2DealsListResponse {
  success: boolean;
  data?: unknown[];
  additional_data?: { next_cursor?: string | null };
}

type DealListFilters = Omit<
  ListDealsInput,
  'start' | 'limit' | 'cursor' | 'add_time_from' | 'add_time_until'
>;

/**
 * Resolves the authenticated user's id for `owned_by_you=1` → API v2's `owner_id` filter.
 * Cached for 10 minutes via the shared GET /users/me cache key (same one used by
 * the users_get_current tool), so this rarely costs an extra HTTP round-trip.
 */
async function resolveCurrentUserId(client: PipedriveClient): Promise<number | undefined> {
  const response = await client.get<{ success: boolean; data?: { id?: number } }>(
    '/users/me',
    undefined,
    { enabled: true, ttl: 600000 }
  );
  return response.data?.id;
}

/**
 * Maps the deals_list / deals_list_all_auto filter surface (kept stable across the
 * v1 → v2 migration so existing callers don't break) onto API v2's GET /deals query
 * parameters.
 *
 * Key deviations from a 1:1 param passthrough:
 * - `user_id` and `owned_by_you=1` both resolve to v2's `owner_id`. `owned_by_you`
 *   requires a GET /users/me lookup (cached) to find the caller's id — v2 dropped the
 *   boolean-flag shortcut v1 had.
 * - `sort` (field name) + `sort_by` (asc/desc) become v2's `sort_by` (field name) +
 *   `sort_direction` (asc/desc). NOTE: v2's `sort_by` only accepts a small enum of
 *   fields — confirmed working: id, add_time, update_time. Arbitrary v1 sort fields
 *   (e.g. title, value, stage_order_nr) are NOT valid in v2 and the API will reject
 *   them with a 400 ERR_SCHEMA_VALIDATION_FAILED.
 * - `status: 'all_not_deleted'` has no v2 equivalent (v2's status enum is only
 *   open/won/lost/deleted), so the status param is omitted entirely in that case,
 *   matching v1's "no filter" behavior.
 */
async function buildV2Params(
  client: PipedriveClient,
  filters: DealListFilters
): Promise<Record<string, string | number | boolean>> {
  const {
    stage_id,
    user_id,
    person_id,
    org_id,
    pipeline_id,
    filter_id,
    sort,
    sort_by,
    status,
    owned_by_you,
  } = filters;

  const params: Record<string, string | number | boolean> = {};

  if (status && status !== 'all_not_deleted') params.status = status;
  if (stage_id !== undefined) params.stage_id = stage_id;
  if (person_id !== undefined) params.person_id = person_id;
  if (org_id !== undefined) params.org_id = org_id;
  if (pipeline_id !== undefined) params.pipeline_id = pipeline_id;
  if (filter_id !== undefined) params.filter_id = filter_id;
  if (sort) params.sort_by = sort;
  if (sort_by) params.sort_direction = sort_by;

  let ownerId = user_id;
  if (owned_by_you) {
    ownerId = await resolveCurrentUserId(client);
  }
  if (ownerId !== undefined) params.owner_id = ownerId;

  return params;
}

export function getListDealsTools(client: PipedriveClient) {
  return {
    deals_list: {
      description: `List deals with cursor-based pagination and filtering options. Backed by Pipedrive API v2 (GET /api/v2/deals).

Returns a page of deals. Use filters to narrow results by status, stage, owner, person, organization, or pipeline.

Workflow tips:
- Use status filter to get only 'open', 'won', 'lost', or 'deleted' deals; omit status entirely for all non-deleted deals (v1's 'all_not_deleted' has no v2 equivalent, so it is dropped rather than sent)
- Set owned_by_you=1 to see only your deals (resolves your user id via GET /users/me, cached)
- Combine with filter_id to use pre-configured Pipedrive filters
- Paginate with cursor: pass the cursor from the previous response's additional_data.next_cursor to get the next page; omit it (or pass null) for the first page. A null next_cursor means you're on the last page. 'start' is deprecated and ignored — v2 does not support offset pagination.
- sort_by only accepts a small set of v2 fields (confirmed working: id, add_time, update_time) — arbitrary v1 sort fields like 'title' or 'value' will be rejected by the API
- For all deals without manual pagination, use deals/list_all_auto instead
- Use add_time_from / add_time_until to filter by creation date (client-side). NOTE: this only filters the current page; for complete date-range results use deals/list_all_auto

Common use cases:
- List all open deals: { "status": "open" }
- List my won deals: { "status": "won", "owned_by_you": 1 }
- List deals in a specific stage: { "stage_id": 123 }
- Get the next page: { "cursor": "<next_cursor from previous response>" }`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          status: {
            type: 'string',
            enum: ['open', 'won', 'lost', 'deleted', 'all_not_deleted'],
            description:
              "Filter by deal status. 'all_not_deleted' is v1-only and is translated to 'no status filter' since v2 has no such value.",
          },
          stage_id: { type: 'number', description: 'Filter by stage ID' },
          user_id: {
            type: 'number',
            description: 'Filter by user (owner) ID — sent as owner_id to v2',
          },
          person_id: { type: 'number', description: 'Filter by person ID' },
          org_id: { type: 'number', description: 'Filter by organization ID' },
          pipeline_id: { type: 'number', description: 'Filter by pipeline ID' },
          filter_id: { type: 'number', description: 'ID of the filter to use' },
          sort: {
            type: 'string',
            description:
              'Field to sort by. v2 only accepts a small enum — confirmed working: id, add_time, update_time.',
          },
          sort_by: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort direction',
          },
          owned_by_you: {
            type: 'number',
            enum: [0, 1],
            description: 'Filter deals owned by the authorized user (1 = yes, 0 = no)',
          },
          add_time_from: {
            type: 'string',
            description:
              'Filter deals created on or after this date (YYYY-MM-DD). Applied client-side.',
          },
          add_time_until: {
            type: 'string',
            description:
              'Filter deals created on or before this date (YYYY-MM-DD). Applied client-side.',
          },
          cursor: {
            type: 'string',
            description:
              'Opaque cursor from a previous response (additional_data.next_cursor) to fetch the next page.',
          },
          start: {
            type: 'number',
            description: 'DEPRECATED — ignored. v2 uses cursor-based pagination; see "cursor".',
            default: 0,
          },
          limit: { type: 'number', description: 'Number of items to return', default: 100 },
        },
      },
      handler: async (args: unknown) => {
        const validated = ListDealsSchema.parse(args);
        const { limit, cursor, add_time_from, add_time_until, ...filters } = validated;

        const params = await buildV2Params(client, filters);
        if (cursor) params.cursor = cursor;
        params.limit = limit ?? 100;

        const response = await client.get<V2DealsListResponse>('/api/v2/deals', params, {
          enabled: true,
          ttl: 300000,
        });
        const enriched = await enrichEntityWithCustomFields(client, 'deal', response);
        return applyDateFilter(enriched, add_time_from, add_time_until);
      },
    },

    deals_list_all_auto: {
      description: `Automatically fetch ALL deals with pagination handling. Backed by Pipedrive API v2 (GET /api/v2/deals), paginated via cursor.

This tool automatically handles cursor pagination and fetches all deals matching the filters.
Unlike deals/list, this returns ALL results in a single response.

WARNING: This can return large datasets. Use filters to limit results.

Workflow tips:
- Same filters as deals/list (status, stage_id, user_id, person_id, org_id, etc.)
- Specify max_items to limit total results if needed
- No need to manage cursor - pagination is automatic (loops until additional_data.next_cursor is null)
- Best for exports, reports, or comprehensive analysis
- Use add_time_from / add_time_until to filter by creation date (client-side)
- sort_by only accepts a small set of v2 fields (confirmed working: id, add_time, update_time)

Common use cases:
- Get all open deals: { "status": "open" }
- Export all deals for a pipeline: { "pipeline_id": 1 }
- Get old unqualified deals: { "pipeline_id": 4, "add_time_until": "2023-12-31" }`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          status: {
            type: 'string',
            enum: ['open', 'won', 'lost', 'deleted', 'all_not_deleted'],
            description:
              "Filter by deal status. 'all_not_deleted' is v1-only and is translated to 'no status filter'.",
          },
          stage_id: { type: 'number', description: 'Filter by stage ID' },
          user_id: {
            type: 'number',
            description: 'Filter by user (owner) ID — sent as owner_id to v2',
          },
          person_id: { type: 'number', description: 'Filter by person ID' },
          org_id: { type: 'number', description: 'Filter by organization ID' },
          pipeline_id: { type: 'number', description: 'Filter by pipeline ID' },
          filter_id: { type: 'number', description: 'ID of the filter to use' },
          sort: {
            type: 'string',
            description:
              'Field to sort by. v2 only accepts a small enum — confirmed: id, add_time, update_time.',
          },
          sort_by: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort direction',
          },
          owned_by_you: {
            type: 'number',
            enum: [0, 1],
            description: 'Filter deals owned by the authorized user',
          },
          add_time_from: {
            type: 'string',
            description:
              'Filter deals created on or after this date (YYYY-MM-DD). Applied client-side.',
          },
          add_time_until: {
            type: 'string',
            description:
              'Filter deals created on or before this date (YYYY-MM-DD). Applied client-side.',
          },
          max_items: { type: 'number', description: 'Maximum number of items to return' },
        },
      },
      handler: async (args: unknown) => {
        const validated = ListDealsSchema.omit({ start: true, limit: true, cursor: true })
          .extend({
            max_items: ListDealsSchema.shape.limit.optional(),
          })
          .parse(args);

        const { max_items, add_time_from, add_time_until, ...filters } = validated;

        const params = await buildV2Params(client, filters);
        const pageSize = 100;

        const allDeals: unknown[] = [];
        let cursor: string | undefined;
        do {
          const pageParams = { ...params, limit: pageSize, ...(cursor ? { cursor } : {}) };
          const page = await client.get<V2DealsListResponse>('/api/v2/deals', pageParams);
          const items = page.data ?? [];
          allDeals.push(...items);

          cursor = page.additional_data?.next_cursor ?? undefined;

          if (max_items && allDeals.length >= max_items) {
            allDeals.length = max_items;
            break;
          }
        } while (cursor);

        const response = {
          success: true,
          data: allDeals,
          additional_data: { total_count: allDeals.length },
        };
        const enriched = await enrichEntityWithCustomFields(client, 'deal', response);
        return applyDateFilter(enriched, add_time_from, add_time_until);
      },
    },

    deals_list_archived: {
      description: `List archived deals with pagination and filtering options.

Returns a paginated list of archived deals. Archived deals are deals that have been removed from active pipelines.

Workflow tips:
- Use same filters as deals/list (status, stage_id, user_id, person_id, org_id, etc.)
- Filter by user_id to see archived deals by specific user
- Combine with filter_id to use pre-configured Pipedrive filters
- Use start/limit for pagination (default limit: 100, max: 500)
- Useful for historical analysis and cleanup

Common use cases:
- List all archived deals: {}
- List archived deals by user: { "user_id": 123 }
- List archived deals in a specific stage: { "stage_id": 5 }
- List archived deals for a person: { "person_id": 456 }`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          status: {
            type: 'string',
            enum: ['open', 'won', 'lost', 'deleted', 'all_not_deleted'],
            description: 'Filter by deal status',
          },
          stage_id: { type: 'number', description: 'Filter by stage ID' },
          user_id: { type: 'number', description: 'Filter by user (owner) ID' },
          person_id: { type: 'number', description: 'Filter by person ID' },
          org_id: { type: 'number', description: 'Filter by organization ID' },
          pipeline_id: { type: 'number', description: 'Filter by pipeline ID' },
          filter_id: { type: 'number', description: 'ID of the filter to use' },
          sort: { type: 'string', description: 'Field to sort by (e.g., title, value, stage_id)' },
          owned_by_you: {
            type: 'number',
            enum: [0, 1],
            description: 'Filter deals owned by the authorized user (1 = yes, 0 = no)',
          },
          start: { type: 'number', description: 'Pagination start', default: 0 },
          limit: { type: 'number', description: 'Number of items to return', default: 100 },
        },
      },
      handler: async (args: unknown) => {
        const validated = ListDealsSchema.parse(args);
        const { start, limit, ...filters } = validated;

        const response = await client.get<{ success: boolean; data?: unknown }>(
          '/deals/archived',
          {
            ...filters,
            start: start ?? 0,
            limit: limit ?? 100,
          },
          { enabled: true, ttl: 300000 } // Cache for 5 minutes
        );
        return enrichEntityWithCustomFields(client, 'deal', response);
      },
    },
  };
}
