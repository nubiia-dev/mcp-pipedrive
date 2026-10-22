/**
 * Read-only mode guard.
 *
 * When `PIPEDRIVE_READ_ONLY=true` the server must expose read tools only. The classification
 * is deliberately fail-safe: a tool counts as read-only **only** when its name carries a known
 * read verb (or is listed as an explicit exception). Anything else is treated as a write and is
 * stripped from the tool list.
 *
 * The previous implementation did the opposite — it looked for a closed list of write verbs and
 * let everything else through — so any tool whose name used an unlisted verb stayed callable in
 * read-only mode. That exposed the destructive `deals_merge`, `persons_merge` and
 * `organizations_merge` (each permanently deletes one of the two merged records), plus
 * `deals_convert_to_lead`, `leads_convert_to_deal`, `projects_archive`,
 * `channels_receive_message` and `meetings_link_user_provider`. Inverting the check closes the
 * whole class of misses: a new tool has to opt into being readable, it can no longer slip
 * through by accident.
 */

/**
 * Read verbs, matched as whole `_`-delimited segments anywhere in the tool name. Matching
 * segments (rather than substrings) keeps read-only listings such as `deals_list_updates` and
 * `persons_list_field_updates` available, which the old substring check wrongly blocked because
 * their names contain `_update`.
 */
const READ_VERB_PATTERN = /(^|_)(get|list|search|find|download|preview)(_|$)/;

/**
 * Read tools whose names do not carry a read verb. Every entry is a GET against the Pipedrive
 * API, except `system_reset_cache`, which only clears the MCP server's local response cache and
 * never reaches Pipedrive — it stays available so cached data can be refreshed in read-only mode.
 */
const READ_ONLY_EXCEPTIONS = new Set([
  'deals_convert_status',
  'leads_convert_status',
  'filters_helpers',
  'pipelines_conversion_statistics',
  'pipelines_deals',
  'pipelines_movement_statistics',
  'system_health_check',
  'system_reset_cache',
]);

/**
 * Whether a tool mutates data and must therefore be hidden in read-only mode.
 *
 * @param toolName - the registered tool name, e.g. `deals_merge`
 * @returns `true` for every tool that is not a known read operation
 */
export function isWriteOperation(toolName: string): boolean {
  if (READ_ONLY_EXCEPTIONS.has(toolName)) {
    return false;
  }

  // Legacy tool names used `/` as the separator; normalise so both forms classify alike.
  return !READ_VERB_PATTERN.test(toolName.replace(/\//g, '_'));
}
