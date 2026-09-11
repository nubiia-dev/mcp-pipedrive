import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockClient } from './mocks/client.mock.js';
import { getListDealsTools } from '../deals/list.js';
import { loadFieldDefinitions } from '../../utils/custom-fields.js';

describe('deals_list (API v2 migration)', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
    vi.clearAllMocks();
  });

  it('calls GET /api/v2/deals with no status when status is omitted', async () => {
    mockClient.get.mockResolvedValue({ success: true, data: [] });
    const tools = getListDealsTools(mockClient);

    await tools['deals_list'].handler({});

    // sort_direction is always present because ListDealsSchema's sort_by (direction)
    // field defaults to 'asc' even when omitted — an existing schema behavior, not
    // something this migration changes.
    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v2/deals',
      { limit: 100, sort_direction: 'asc' },
      expect.any(Object)
    );
  });

  it('drops status when it is all_not_deleted (v1-only value, no v2 equivalent)', async () => {
    mockClient.get.mockResolvedValue({ success: true, data: [] });
    const tools = getListDealsTools(mockClient);

    await tools['deals_list'].handler({ status: 'all_not_deleted' });

    const [, params] = mockClient.get.mock.calls[0];
    expect(params).not.toHaveProperty('status');
  });

  it('passes through status when it is a valid v2 value', async () => {
    mockClient.get.mockResolvedValue({ success: true, data: [] });
    const tools = getListDealsTools(mockClient);

    await tools['deals_list'].handler({ status: 'open' });

    const [, params] = mockClient.get.mock.calls[0];
    expect(params).toMatchObject({ status: 'open' });
  });

  it('maps user_id to owner_id', async () => {
    mockClient.get.mockResolvedValue({ success: true, data: [] });
    const tools = getListDealsTools(mockClient);

    await tools['deals_list'].handler({ user_id: 42 });

    const [, params] = mockClient.get.mock.calls[0];
    expect(params).toMatchObject({ owner_id: 42 });
    expect(params).not.toHaveProperty('user_id');
  });

  it('resolves owned_by_you=1 to owner_id via cached GET /users/me', async () => {
    mockClient.get.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/users/me') return { success: true, data: { id: 99 } };
      return { success: true, data: [] };
    });
    const tools = getListDealsTools(mockClient);

    await tools['deals_list'].handler({ owned_by_you: 1 });

    expect(mockClient.get).toHaveBeenCalledWith('/users/me', undefined, {
      enabled: true,
      ttl: 600000,
    });
    const dealsCall = mockClient.get.mock.calls.find(([endpoint]) => endpoint === '/api/v2/deals');
    expect(dealsCall?.[1]).toMatchObject({ owner_id: 99 });
  });

  it('maps sort + sort_by (direction) to sort_by (field) + sort_direction', async () => {
    mockClient.get.mockResolvedValue({ success: true, data: [] });
    const tools = getListDealsTools(mockClient);

    await tools['deals_list'].handler({ sort: 'add_time', sort_by: 'desc' });

    const [, params] = mockClient.get.mock.calls[0];
    expect(params).toMatchObject({ sort_by: 'add_time', sort_direction: 'desc' });
  });

  it('forwards a provided cursor and omits start (deprecated)', async () => {
    mockClient.get.mockResolvedValue({ success: true, data: [], additional_data: {} });
    const tools = getListDealsTools(mockClient);

    await tools['deals_list'].handler({ cursor: 'abc123', start: 50 });

    const [, params] = mockClient.get.mock.calls[0];
    expect(params).toMatchObject({ cursor: 'abc123' });
    expect(params).not.toHaveProperty('start');
  });

  it('passes filter_id, stage_id, person_id, org_id, pipeline_id through unchanged', async () => {
    mockClient.get.mockResolvedValue({ success: true, data: [] });
    const tools = getListDealsTools(mockClient);

    await tools['deals_list'].handler({
      filter_id: 5,
      stage_id: 6,
      person_id: 7,
      org_id: 8,
      pipeline_id: 9,
    });

    const [, params] = mockClient.get.mock.calls[0];
    expect(params).toMatchObject({
      filter_id: 5,
      stage_id: 6,
      person_id: 7,
      org_id: 8,
      pipeline_id: 9,
    });
  });

  it('normalizes nested v2 custom_fields into custom_fields_resolved', async () => {
    const defs = [
      {
        id: 1,
        key: 'a'.repeat(40),
        name: 'Industria',
        field_type: 'varchar',
      },
    ];
    mockClient.get = vi.fn().mockImplementation(async (endpoint: string) => {
      if (endpoint === '/dealFields') return { success: true, data: defs };
      if (endpoint === '/api/v2/deals') {
        return {
          success: true,
          data: [{ id: 1, title: 'A', custom_fields: { ['a'.repeat(40)]: 'Tech' } }],
          additional_data: { next_cursor: null },
        };
      }
      return { success: true, data: [] };
    });

    await loadFieldDefinitions(mockClient, 'deal', { fetchIfMissing: true });

    const tools = getListDealsTools(mockClient);
    const result = await tools['deals_list'].handler({});

    expect((result.data as any[])[0].custom_fields_resolved).toEqual({ Industria: 'Tech' });
  });
});

describe('deals_list_all_auto (API v2 cursor pagination)', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
    vi.clearAllMocks();
  });

  it('follows next_cursor until it is null, aggregating all pages', async () => {
    const page1 = {
      success: true,
      data: [{ id: 1 }, { id: 2 }],
      additional_data: { next_cursor: 'cursor-page-2' },
    };
    const page2 = {
      success: true,
      data: [{ id: 3 }],
      additional_data: { next_cursor: null },
    };

    mockClient.get = vi.fn().mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);

    const tools = getListDealsTools(mockClient);
    const result = await tools['deals_list_all_auto'].handler({});

    expect(mockClient.get).toHaveBeenCalledTimes(2);
    expect(mockClient.get).toHaveBeenNthCalledWith(
      1,
      '/api/v2/deals',
      expect.objectContaining({ limit: 100 })
    );
    expect(mockClient.get).toHaveBeenNthCalledWith(
      2,
      '/api/v2/deals',
      expect.objectContaining({ limit: 100, cursor: 'cursor-page-2' })
    );
    expect((result.data as any[]).map((d: any) => d.id)).toEqual([1, 2, 3]);
  });

  it('stops early and truncates once max_items is reached', async () => {
    const page1 = {
      success: true,
      data: [{ id: 1 }, { id: 2 }],
      additional_data: { next_cursor: 'cursor-page-2' },
    };

    mockClient.get = vi.fn().mockResolvedValueOnce(page1);

    const tools = getListDealsTools(mockClient);
    const result = await tools['deals_list_all_auto'].handler({ max_items: 1 });

    expect(mockClient.get).toHaveBeenCalledTimes(1);
    expect((result.data as any[]).map((d: any) => d.id)).toEqual([1]);
  });
});
