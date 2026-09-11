import type { PipedriveClient } from '../pipedrive-client.js';
import { CustomFieldResolutionError, CustomFieldValidationError } from './custom-fields-errors.js';

export type CustomFieldEntity = 'deal' | 'person' | 'organization' | 'product' | 'lead';

export interface FieldOption {
  id: number;
  label: string;
}

export interface FieldDefinition {
  id: number;
  key: string; // 40-char hex hash
  name: string;
  field_type: string;
  options?: FieldOption[];
}

export function getFieldDefinitionsEndpoint(entity: CustomFieldEntity): string {
  switch (entity) {
    case 'deal':
    case 'lead':
      return '/dealFields';
    case 'person':
      return '/personFields';
    case 'organization':
      return '/organizationFields';
    case 'product':
      return '/productFields';
  }
}

const HASH_KEY_RE = /^[a-f0-9]{40}$/;

export function isHashKey(value: string): boolean {
  return HASH_KEY_RE.test(value);
}

interface PipedriveListResponse<T> {
  success: boolean;
  data: T[] | null;
}

const FIELD_DEFINITIONS_TTL_MS = 900_000; // 15 min, matches existing field tools

// Per-client tracker so the read path knows if the write path has ever
// warmed the cache for this entity. Cleared automatically when the client is GC'd.
const cachePresence = new WeakMap<PipedriveClient, Set<string>>();

/**
 * Loads field definitions for an entity.
 *
 * Two modes:
 * - fetchIfMissing=true (write path): always returns definitions, fetching once if cache cold.
 * - fetchIfMissing=false (read enrichment path): returns undefined if cache cold; never adds an HTTP call.
 *
 * Note: the underlying PipedriveClient cache doesn't expose a "peek" API, so we track
 * per-client which endpoints have been warmed in a WeakMap (auto-GC'd with the client).
 */
export async function loadFieldDefinitions(
  client: PipedriveClient,
  entity: CustomFieldEntity,
  opts: { fetchIfMissing?: boolean } = {}
): Promise<FieldDefinition[] | undefined> {
  const endpoint = getFieldDefinitionsEndpoint(entity);

  if (!opts.fetchIfMissing) {
    if (!cachePresence.get(client)?.has(endpoint)) {
      return undefined;
    }
  }

  const response = await client.get<PipedriveListResponse<FieldDefinition>>(endpoint, undefined, {
    enabled: true,
    ttl: FIELD_DEFINITIONS_TTL_MS,
  });

  let set = cachePresence.get(client);
  if (!set) {
    set = new Set();
    cachePresence.set(client, set);
  }
  set.add(endpoint);

  return response.data ?? [];
}

/**
 * Locate a field definition by name (case-insensitive, trimmed) or hash key.
 * - Hash key matching an existing definition: returns that definition.
 * - Hash key not in definitions: returns a synthetic definition with field_type='unknown'
 *   (skips type validation downstream — caller is trusted).
 * - Exact case-insensitive name match: returns the definition.
 * - Multiple name matches: throws CustomFieldResolutionError(duplicate_name) with all hashes.
 * - No match: throws CustomFieldResolutionError(not_found) with up to 3 Levenshtein suggestions.
 */
export function findFieldDefinition(
  definitions: FieldDefinition[],
  input: string
): FieldDefinition {
  const trimmed = input.trim();

  if (isHashKey(trimmed)) {
    const exact = definitions.find((d) => d.key === trimmed);
    if (exact) return exact;
    return { id: -1, key: trimmed, name: trimmed, field_type: 'unknown' };
  }

  const needle = trimmed.toLowerCase();
  const matches = definitions.filter((d) => d.name.trim().toLowerCase() === needle);

  if (matches.length === 1) return matches[0];

  if (matches.length > 1) {
    throw new CustomFieldResolutionError({
      kind: 'duplicate_name',
      fieldName: trimmed,
      candidates: matches.map((d) => d.key),
    });
  }

  const suggestions = topSuggestions(trimmed, definitions);
  throw new CustomFieldResolutionError({
    kind: 'not_found',
    fieldName: trimmed,
    suggestions,
  });
}

function topSuggestions(input: string, defs: FieldDefinition[]): string[] {
  const lower = input.toLowerCase();
  return defs
    .map((d) => ({ name: d.name, dist: levenshtein(lower, d.name.toLowerCase()) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3)
    .map((x) => x.name);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

/**
 * Converts an LLM-friendly value into the wire format Pipedrive expects, returning
 * the partial body object to merge into the request payload. Always keyed by hash.
 */
export function transformValueToWireFormat(
  def: FieldDefinition,
  value: unknown
): Record<string, unknown> {
  const key = def.key;

  switch (def.field_type) {
    case 'enum':
      return { [key]: optionLabelToId(def, value) };

    case 'set': {
      if (!Array.isArray(value)) {
        throw new CustomFieldValidationError({
          fieldName: def.name,
          expectedType: 'set (array of labels)',
          value,
        });
      }
      const ids = value.map((label) => optionLabelToId(def, label));
      return { [key]: ids.join(',') };
    }

    case 'date':
      if (typeof value !== 'string' || !DATE_RE.test(value)) {
        throw new CustomFieldValidationError({
          fieldName: def.name,
          expectedType: 'date (YYYY-MM-DD)',
          value,
        });
      }
      return { [key]: value };

    case 'time':
      if (typeof value !== 'string' || !TIME_RE.test(value)) {
        throw new CustomFieldValidationError({
          fieldName: def.name,
          expectedType: 'time (HH:MM or HH:MM:SS)',
          value,
        });
      }
      return { [key]: value };

    case 'daterange':
      return expandRange(def, value, DATE_RE, 'date (YYYY-MM-DD)');

    case 'timerange':
      return expandRange(def, value, TIME_RE, 'time (HH:MM[:SS])');

    case 'monetary':
      if (typeof value === 'number') return { [key]: value };
      if (
        value &&
        typeof value === 'object' &&
        'value' in value &&
        typeof (value as { value: unknown }).value === 'number'
      ) {
        const v = value as { value: number; currency?: string };
        const out: Record<string, unknown> = { [key]: v.value };
        if (v.currency) out[`${key}_currency`] = v.currency;
        return out;
      }
      throw new CustomFieldValidationError({
        fieldName: def.name,
        expectedType: 'monetary (number or { value, currency })',
        value,
      });

    case 'double':
      if (typeof value !== 'number') {
        throw new CustomFieldValidationError({
          fieldName: def.name,
          expectedType: 'number',
          value,
        });
      }
      return { [key]: value };

    case 'address':
      if (typeof value === 'string' || (value && typeof value === 'object')) {
        return { [key]: value };
      }
      throw new CustomFieldValidationError({
        fieldName: def.name,
        expectedType: 'address (string or structured object)',
        value,
      });

    case 'user':
    case 'org':
    case 'people':
      if (typeof value !== 'number') {
        throw new CustomFieldValidationError({
          fieldName: def.name,
          expectedType: `${def.field_type} (numeric id)`,
          value,
        });
      }
      return { [key]: value };

    case 'varchar':
    case 'varchar_auto':
    case 'text':
    case 'phone':
      if (typeof value !== 'string') {
        throw new CustomFieldValidationError({
          fieldName: def.name,
          expectedType: def.field_type,
          value,
        });
      }
      return { [key]: value };

    case 'unknown':
    default:
      return { [key]: value };
  }
}

function optionLabelToId(def: FieldDefinition, label: unknown): number {
  if (typeof label !== 'string') {
    throw new CustomFieldValidationError({
      fieldName: def.name,
      expectedType: 'option label (string)',
      value: label,
    });
  }
  const needle = label.trim().toLowerCase();
  const match = def.options?.find((o) => o.label.trim().toLowerCase() === needle);
  if (!match) {
    throw new CustomFieldResolutionError({
      kind: 'invalid_option',
      fieldName: def.name,
      detail: `Valid options: ${def.options?.map((o) => `"${o.label}"`).join(', ') ?? '(none)'}.`,
    });
  }
  return match.id;
}

/**
 * Translates an LLM-friendly custom_fields object into a hash-keyed payload ready to merge
 * into a Pipedrive create/update request body. Loads field definitions on demand (cached).
 */
export async function resolveCustomFieldsForEntity(
  client: PipedriveClient,
  entity: CustomFieldEntity,
  customFields: Record<string, unknown> | undefined
): Promise<Record<string, unknown>> {
  if (!customFields || Object.keys(customFields).length === 0) return {};

  const defs = (await loadFieldDefinitions(client, entity, { fetchIfMissing: true })) ?? [];

  const out: Record<string, unknown> = {};
  for (const [inputKey, value] of Object.entries(customFields)) {
    const def = findFieldDefinition(defs, inputKey);
    Object.assign(out, transformValueToWireFormat(def, value));
  }
  return out;
}

function expandRange(
  def: FieldDefinition,
  value: unknown,
  pattern: RegExp,
  expected: string
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as { start?: unknown }).start !== 'string' ||
    typeof (value as { end?: unknown }).end !== 'string'
  ) {
    throw new CustomFieldValidationError({
      fieldName: def.name,
      expectedType: `${def.field_type} ({ start, end })`,
      value,
    });
  }
  const { start, end } = value as { start: string; end: string };
  if (!pattern.test(start) || !pattern.test(end)) {
    throw new CustomFieldValidationError({
      fieldName: def.name,
      expectedType: `${def.field_type} of ${expected}`,
      value,
    });
  }
  return { [def.key]: start, [`${def.key}_until`]: end };
}

/**
 * Given a raw Pipedrive entity payload (a flat object), return a name-keyed map of
 * the resolved custom field values. Read-path only — never adds an HTTP call.
 */
export async function buildResolvedCustomFields(
  client: PipedriveClient,
  entity: CustomFieldEntity,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const defs = await loadFieldDefinitions(client, entity, { fetchIfMissing: false });
  if (!defs?.length) return {};

  const out: Record<string, unknown> = {};

  // API v2 nests custom field values under a `custom_fields` object keyed by hash
  // (e.g. { custom_fields: { <hash>: value } }) instead of the flat, hash-keyed-at-root
  // layout API v1 uses. Support both so this stays useful for v1 and v2 tools alike.
  const nested = data.custom_fields;
  const nestedFields =
    nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : undefined;

  for (const def of defs) {
    let raw: unknown;
    if (def.key in data) {
      raw = data[def.key];
    } else if (nestedFields && def.key in nestedFields) {
      raw = nestedFields[def.key];
    } else {
      continue;
    }
    if (raw === null || raw === undefined || raw === '') continue;
    out[def.name] = humanizeValue(def, raw);
  }

  return out;
}

function humanizeValue(def: FieldDefinition, raw: unknown): unknown {
  if (def.field_type === 'enum' && typeof raw === 'number') {
    return def.options?.find((o) => o.id === raw)?.label ?? raw;
  }
  if (def.field_type === 'set' && typeof raw === 'string') {
    const ids = raw.split(',').map((s) => Number(s.trim()));
    return ids.map((id) => def.options?.find((o) => o.id === id)?.label ?? id);
  }
  return raw;
}

/**
 * Non-destructive wrapper: adds `custom_fields_resolved` next to the raw payload
 * for either a single entity (`data: { ... }`) or a list (`data: [...]`).
 */
export async function enrichEntityWithCustomFields<R extends { data?: unknown }>(
  client: PipedriveClient,
  entity: CustomFieldEntity,
  response: R
): Promise<R> {
  const data = response.data;
  if (!data) return response;

  if (Array.isArray(data)) {
    const enrichedItems = await Promise.all(
      data.map(async (item) => {
        if (!item || typeof item !== 'object') return item;
        const resolved = await buildResolvedCustomFields(
          client,
          entity,
          item as Record<string, unknown>
        );
        if (!Object.keys(resolved).length) return item;
        return { ...(item as Record<string, unknown>), custom_fields_resolved: resolved };
      })
    );
    return { ...response, data: enrichedItems };
  }

  if (typeof data === 'object') {
    // Detect search shape: { items: [{ result_score, item }] }
    const maybeItems = (data as { items?: unknown }).items;
    if (Array.isArray(maybeItems)) {
      const enrichedItems = await Promise.all(
        maybeItems.map(async (entry) => {
          if (
            !entry ||
            typeof entry !== 'object' ||
            !('item' in entry) ||
            !entry.item ||
            typeof (entry as { item: unknown }).item !== 'object'
          ) {
            return entry;
          }
          const inner = (entry as { item: Record<string, unknown> }).item;
          const resolved = await buildResolvedCustomFields(client, entity, inner);
          if (!Object.keys(resolved).length) return entry;
          return {
            ...(entry as Record<string, unknown>),
            item: { ...inner, custom_fields_resolved: resolved },
          };
        })
      );
      return { ...response, data: { ...(data as Record<string, unknown>), items: enrichedItems } };
    }

    // Single-entity shape
    const resolved = await buildResolvedCustomFields(
      client,
      entity,
      data as Record<string, unknown>
    );
    if (!Object.keys(resolved).length) return response;
    return {
      ...response,
      data: { ...(data as Record<string, unknown>), custom_fields_resolved: resolved },
    };
  }

  return response;
}
