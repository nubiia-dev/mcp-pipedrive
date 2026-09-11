import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getFieldDefinitionsEndpoint,
  isHashKey,
  loadFieldDefinitions,
  findFieldDefinition,
} from '../custom-fields.js';
import { createMockClient } from '../../__tests__/mocks/client.mock.js';
import { CustomFieldResolutionError } from '../custom-fields-errors.js';
import type { FieldDefinition } from '../custom-fields.js';

describe('getFieldDefinitionsEndpoint', () => {
  it.each([
    ['deal', '/dealFields'],
    ['person', '/personFields'],
    ['organization', '/organizationFields'],
    ['product', '/productFields'],
    ['lead', '/dealFields'], // leads share deal fields
  ] as const)('maps %s to %s', (entity, endpoint) => {
    expect(getFieldDefinitionsEndpoint(entity)).toBe(endpoint);
  });
});

describe('isHashKey', () => {
  it('returns true for 40-char lowercase hex', () => {
    expect(isHashKey('abcdef0123456789abcdef0123456789abcdef01')).toBe(true);
  });

  it('returns false for short or non-hex strings', () => {
    expect(isHashKey('Industria')).toBe(false);
    expect(isHashKey('abc')).toBe(false);
    expect(isHashKey('ABCDEF0123456789ABCDEF0123456789ABCDEF01')).toBe(false); // uppercase
    expect(isHashKey('xyzdef0123456789abcdef0123456789abcdef01')).toBe(false); // non-hex
  });
});

describe('loadFieldDefinitions', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
    vi.clearAllMocks();
  });

  it('returns definitions array from Pipedrive', async () => {
    mockClient.get = vi.fn().mockResolvedValue({
      success: true,
      data: [{ id: 1, key: 'a'.repeat(40), name: 'Industria', field_type: 'enum', options: [] }],
    });

    const result = await loadFieldDefinitions(mockClient, 'deal', { fetchIfMissing: true });

    expect(mockClient.get).toHaveBeenCalledWith('/dealFields', undefined, {
      enabled: true,
      ttl: 900000,
    });
    expect(result).toHaveLength(1);
    expect(result?.[0].name).toBe('Industria');
  });

  it('returns undefined when cache is cold and fetchIfMissing is false', async () => {
    // The mock get always returns data; when fetchIfMissing=false we should NOT call it.
    mockClient.get = vi.fn().mockResolvedValue({ success: true, data: [] });

    const result = await loadFieldDefinitions(mockClient, 'deal', { fetchIfMissing: false });

    expect(mockClient.get).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('uses /dealFields for the lead entity', async () => {
    mockClient.get = vi.fn().mockResolvedValue({ success: true, data: [] });

    await loadFieldDefinitions(mockClient, 'lead', { fetchIfMissing: true });

    expect(mockClient.get).toHaveBeenCalledWith('/dealFields', undefined, expect.any(Object));
  });
});

describe('findFieldDefinition', () => {
  const defs: FieldDefinition[] = [
    { id: 1, key: 'a'.repeat(40), name: 'Industria', field_type: 'enum', options: [] },
    { id: 2, key: 'b'.repeat(40), name: 'Industry', field_type: 'varchar' },
    { id: 3, key: 'c'.repeat(40), name: 'Plan', field_type: 'enum', options: [] },
    { id: 4, key: 'd'.repeat(40), name: 'plan', field_type: 'varchar' }, // duplicate (case-insensitive)
  ];

  it('finds by exact name', () => {
    expect(findFieldDefinition(defs, 'Industria').key).toBe('a'.repeat(40));
  });

  it('finds by case-insensitive name', () => {
    expect(findFieldDefinition(defs, 'industria').key).toBe('a'.repeat(40));
  });

  it('finds by trimmed name', () => {
    expect(findFieldDefinition(defs, '  Industria  ').key).toBe('a'.repeat(40));
  });

  it('passes hash through (returns synthetic definition)', () => {
    const hash = 'e'.repeat(40);
    const result = findFieldDefinition(defs, hash);
    expect(result.key).toBe(hash);
    expect(result.field_type).toBe('unknown');
  });

  it('finds exact hash in definitions', () => {
    const result = findFieldDefinition(defs, 'a'.repeat(40));
    expect(result.id).toBe(1);
    expect(result.field_type).toBe('enum');
  });

  it('throws not_found with top-3 suggestions', () => {
    expect(() => findFieldDefinition(defs, 'Industri')).toThrow(CustomFieldResolutionError);
    try {
      findFieldDefinition(defs, 'Industri');
    } catch (e) {
      const err = e as CustomFieldResolutionError;
      expect(err.kind).toBe('not_found');
      expect(err.suggestions).toContain('Industria');
    }
  });

  it('throws duplicate_name when two definitions share a case-insensitive name', () => {
    try {
      findFieldDefinition(defs, 'Plan');
      throw new Error('expected duplicate_name to throw');
    } catch (e) {
      const err = e as CustomFieldResolutionError;
      expect(err.kind).toBe('duplicate_name');
      expect(err.candidates).toEqual(['c'.repeat(40), 'd'.repeat(40)]);
    }
  });
});

import { transformValueToWireFormat, resolveCustomFieldsForEntity } from '../custom-fields.js';
import { CustomFieldValidationError } from '../custom-fields-errors.js';
import { buildResolvedCustomFields, enrichEntityWithCustomFields } from '../custom-fields.js';

describe('transformValueToWireFormat', () => {
  const enumDef: FieldDefinition = {
    id: 1,
    key: 'a'.repeat(40),
    name: 'Industria',
    field_type: 'enum',
    options: [
      { id: 10, label: 'Tech' },
      { id: 11, label: 'Finance' },
    ],
  };
  const setDef: FieldDefinition = {
    id: 2,
    key: 'b'.repeat(40),
    name: 'Tags',
    field_type: 'set',
    options: [
      { id: 20, label: 'A' },
      { id: 21, label: 'B' },
      { id: 22, label: 'C' },
    ],
  };
  const dateDef: FieldDefinition = {
    id: 3,
    key: 'c'.repeat(40),
    name: 'Closed At',
    field_type: 'date',
  };
  const monetaryDef: FieldDefinition = {
    id: 4,
    key: 'd'.repeat(40),
    name: 'Budget',
    field_type: 'monetary',
  };
  const daterangeDef: FieldDefinition = {
    id: 5,
    key: 'e'.repeat(40),
    name: 'Window',
    field_type: 'daterange',
  };
  const textDef: FieldDefinition = {
    id: 6,
    key: 'f'.repeat(40),
    name: 'Notes',
    field_type: 'varchar',
  };
  const unknownDef: FieldDefinition = {
    id: -1,
    key: 'a'.repeat(40),
    name: 'a'.repeat(40),
    field_type: 'unknown',
  };

  it('enum: label → option id', () => {
    expect(transformValueToWireFormat(enumDef, 'Tech')).toEqual({ [enumDef.key]: 10 });
  });

  it('enum: unknown label throws invalid_option', () => {
    expect(() => transformValueToWireFormat(enumDef, 'Mining')).toThrow(/option/i);
  });

  it('set: array of labels → comma-separated option ids', () => {
    expect(transformValueToWireFormat(setDef, ['A', 'C'])).toEqual({ [setDef.key]: '20,22' });
  });

  it('set: non-array throws', () => {
    expect(() => transformValueToWireFormat(setDef, 'A')).toThrow(CustomFieldValidationError);
  });

  it('date: validates YYYY-MM-DD', () => {
    expect(transformValueToWireFormat(dateDef, '2026-06-11')).toEqual({
      [dateDef.key]: '2026-06-11',
    });
    expect(() => transformValueToWireFormat(dateDef, '06/11/2026')).toThrow(
      CustomFieldValidationError
    );
  });

  it('monetary: number is passed through', () => {
    expect(transformValueToWireFormat(monetaryDef, 1000)).toEqual({ [monetaryDef.key]: 1000 });
  });

  it('monetary: { value, currency } passed through', () => {
    expect(transformValueToWireFormat(monetaryDef, { value: 1000, currency: 'EUR' })).toEqual({
      [monetaryDef.key]: 1000,
      [`${monetaryDef.key}_currency`]: 'EUR',
    });
  });

  it('daterange: { start, end } expands to <hash> and <hash>_until', () => {
    expect(
      transformValueToWireFormat(daterangeDef, { start: '2026-01-01', end: '2026-12-31' })
    ).toEqual({
      [daterangeDef.key]: '2026-01-01',
      [`${daterangeDef.key}_until`]: '2026-12-31',
    });
  });

  it('varchar: string is passed through', () => {
    expect(transformValueToWireFormat(textDef, 'hello')).toEqual({ [textDef.key]: 'hello' });
  });

  it('unknown field_type (hash passthrough): value is passed through untouched', () => {
    expect(transformValueToWireFormat(unknownDef, 42)).toEqual({ [unknownDef.key]: 42 });
  });
});

describe('resolveCustomFieldsForEntity', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
    vi.clearAllMocks();
  });

  const defs: FieldDefinition[] = [
    {
      id: 1,
      key: 'a'.repeat(40),
      name: 'Industria',
      field_type: 'enum',
      options: [{ id: 10, label: 'Tech' }],
    },
    { id: 2, key: 'b'.repeat(40), name: 'Budget', field_type: 'monetary' },
  ];

  it('returns empty object when custom_fields is undefined', async () => {
    const result = await resolveCustomFieldsForEntity(mockClient, 'deal', undefined);
    expect(result).toEqual({});
    expect(mockClient.get).not.toHaveBeenCalled();
  });

  it('returns empty object when custom_fields is empty', async () => {
    const result = await resolveCustomFieldsForEntity(mockClient, 'deal', {});
    expect(result).toEqual({});
  });

  it('resolves multiple fields by name', async () => {
    mockClient.get = vi.fn().mockResolvedValue({ success: true, data: defs });

    const result = await resolveCustomFieldsForEntity(mockClient, 'deal', {
      Industria: 'Tech',
      Budget: 5000,
    });

    expect(result).toEqual({
      [defs[0].key]: 10,
      [defs[1].key]: 5000,
    });
  });

  it('passes hash keys through without resolving', async () => {
    mockClient.get = vi.fn().mockResolvedValue({ success: true, data: defs });
    const hash = 'c'.repeat(40);

    const result = await resolveCustomFieldsForEntity(mockClient, 'deal', {
      [hash]: 'raw-value',
    });

    expect(result).toEqual({ [hash]: 'raw-value' });
  });
});

describe('buildResolvedCustomFields', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  const defs: FieldDefinition[] = [
    {
      id: 1,
      key: 'a'.repeat(40),
      name: 'Industria',
      field_type: 'enum',
      options: [
        { id: 10, label: 'Tech' },
        { id: 11, label: 'Finance' },
      ],
    },
    { id: 2, key: 'b'.repeat(40), name: 'Budget', field_type: 'monetary' },
    {
      id: 3,
      key: 'c'.repeat(40),
      name: 'Tags',
      field_type: 'set',
      options: [
        { id: 20, label: 'A' },
        { id: 21, label: 'B' },
      ],
    },
  ];

  beforeEach(() => {
    mockClient = createMockClient();
    vi.clearAllMocks();
  });

  it('returns empty object when cache is cold (no HTTP call)', async () => {
    const result = await buildResolvedCustomFields(mockClient, 'deal', {
      ['a'.repeat(40)]: 10,
    });
    expect(result).toEqual({});
    expect(mockClient.get).not.toHaveBeenCalled();
  });

  it('maps enum hash to label when cache is warm', async () => {
    // Warm the cache by an explicit load.
    mockClient.get = vi.fn().mockResolvedValue({ success: true, data: defs });
    await loadFieldDefinitions(mockClient, 'deal', { fetchIfMissing: true });

    const result = await buildResolvedCustomFields(mockClient, 'deal', {
      ['a'.repeat(40)]: 10,
      ['b'.repeat(40)]: 5000,
      ['c'.repeat(40)]: '20,21',
    });

    expect(result).toEqual({
      Industria: 'Tech',
      Budget: 5000,
      Tags: ['A', 'B'],
    });
  });

  it('returns empty object when entity has no custom field values', async () => {
    mockClient.get = vi.fn().mockResolvedValue({ success: true, data: defs });
    await loadFieldDefinitions(mockClient, 'deal', { fetchIfMissing: true });

    const result = await buildResolvedCustomFields(mockClient, 'deal', {
      title: 'Deal X',
      id: 1,
    });
    expect(result).toEqual({});
  });

  it('resolves values nested under custom_fields (API v2 shape)', async () => {
    mockClient.get = vi.fn().mockResolvedValue({ success: true, data: defs });
    await loadFieldDefinitions(mockClient, 'deal', { fetchIfMissing: true });

    const result = await buildResolvedCustomFields(mockClient, 'deal', {
      title: 'Deal X',
      custom_fields: {
        ['a'.repeat(40)]: 11,
        ['b'.repeat(40)]: 7500,
      },
    });

    expect(result).toEqual({
      Industria: 'Finance',
      Budget: 7500,
    });
  });

  it('prefers a root-level (v1) value over a nested (v2) one when both are present', async () => {
    mockClient.get = vi.fn().mockResolvedValue({ success: true, data: defs });
    await loadFieldDefinitions(mockClient, 'deal', { fetchIfMissing: true });

    const result = await buildResolvedCustomFields(mockClient, 'deal', {
      ['a'.repeat(40)]: 10,
      custom_fields: { ['a'.repeat(40)]: 11 },
    });

    expect(result).toEqual({ Industria: 'Tech' });
  });
});

describe('enrichEntityWithCustomFields', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  const defs: FieldDefinition[] = [
    {
      id: 1,
      key: 'a'.repeat(40),
      name: 'Industria',
      field_type: 'enum',
      options: [{ id: 10, label: 'Tech' }],
    },
  ];

  beforeEach(() => {
    mockClient = createMockClient();
    vi.clearAllMocks();
  });

  it('adds custom_fields_resolved to a single-entity response', async () => {
    mockClient.get = vi.fn().mockResolvedValue({ success: true, data: defs });
    await loadFieldDefinitions(mockClient, 'deal', { fetchIfMissing: true });

    const response = {
      success: true,
      data: { id: 1, title: 'Deal X', ['a'.repeat(40)]: 10 },
    };
    const enriched = await enrichEntityWithCustomFields(mockClient, 'deal', response);
    expect((enriched.data as any).custom_fields_resolved).toEqual({ Industria: 'Tech' });
    expect((enriched.data as any).title).toBe('Deal X'); // preserved
  });

  it('adds custom_fields_resolved to each entity in a list response', async () => {
    mockClient.get = vi.fn().mockResolvedValue({ success: true, data: defs });
    await loadFieldDefinitions(mockClient, 'deal', { fetchIfMissing: true });

    const response = {
      success: true,
      data: [
        { id: 1, title: 'A', ['a'.repeat(40)]: 10 },
        { id: 2, title: 'B', ['a'.repeat(40)]: 10 },
      ],
    };
    const enriched = await enrichEntityWithCustomFields(mockClient, 'deal', response);
    expect((enriched.data as any[])[0].custom_fields_resolved).toEqual({ Industria: 'Tech' });
    expect((enriched.data as any[])[1].custom_fields_resolved).toEqual({ Industria: 'Tech' });
  });

  it('returns response unchanged when data is null/undefined', async () => {
    const response = { success: false, data: null };
    const enriched = await enrichEntityWithCustomFields(mockClient, 'deal', response);
    expect(enriched).toBe(response);
  });
});

describe('enrichEntityWithCustomFields — search shape', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  const defs: FieldDefinition[] = [
    {
      id: 1,
      key: 'a'.repeat(40),
      name: 'Industria',
      field_type: 'enum',
      options: [{ id: 10, label: 'Tech' }],
    },
  ];

  beforeEach(() => {
    mockClient = createMockClient();
    vi.clearAllMocks();
  });

  it('enriches each item in a search response (data.items[].item shape)', async () => {
    mockClient.get = vi.fn().mockResolvedValue({ success: true, data: defs });
    await loadFieldDefinitions(mockClient, 'deal', { fetchIfMissing: true });

    const response = {
      success: true,
      data: {
        items: [
          { result_score: 1.0, item: { id: 1, title: 'A', ['a'.repeat(40)]: 10 } },
          { result_score: 0.8, item: { id: 2, title: 'B', ['a'.repeat(40)]: 10 } },
        ],
      },
    };

    const enriched = await enrichEntityWithCustomFields(mockClient, 'deal', response);
    const items = (enriched.data as any).items;
    expect(items[0].item.custom_fields_resolved).toEqual({ Industria: 'Tech' });
    expect(items[1].item.custom_fields_resolved).toEqual({ Industria: 'Tech' });
    // Preserve result_score and original payload
    expect(items[0].result_score).toBe(1.0);
    expect(items[0].item.title).toBe('A');
  });

  it('returns response unchanged when items is empty', async () => {
    mockClient.get = vi.fn().mockResolvedValue({ success: true, data: defs });
    await loadFieldDefinitions(mockClient, 'deal', { fetchIfMissing: true });

    const response = { success: true, data: { items: [] } };
    const enriched = await enrichEntityWithCustomFields(mockClient, 'deal', response);
    expect((enriched.data as any).items).toEqual([]);
  });
});
