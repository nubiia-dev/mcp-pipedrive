import { describe, it, expect } from 'vitest';
import { isWriteOperation } from '../read-only.js';

describe('isWriteOperation', () => {
  describe('read tools stay available', () => {
    it.each([
      'deals_get',
      'deals_list',
      'deals_list_all_auto',
      'persons_get_collection',
      'organizations_list_persons',
      'files_download',
      'users_find',
      'search_universal',
      'search_by_field',
      'mailbox_get_thread_messages',
      'fields_list_all_fields',
      'goals_get_results',
    ])('classifies %s as a read', (name) => {
      expect(isWriteOperation(name)).toBe(false);
    });

    it('keeps read tools whose name merely contains a write verb', () => {
      // Regression guard: the old substring check blocked these because of `_update`.
      expect(isWriteOperation('deals_list_updates')).toBe(false);
      expect(isWriteOperation('deals_list_field_updates')).toBe(false);
      expect(isWriteOperation('deals_list_participant_updates')).toBe(false);
      expect(isWriteOperation('persons_list_updates')).toBe(false);
      expect(isWriteOperation('persons_list_field_updates')).toBe(false);
      expect(isWriteOperation('organizations_list_updates')).toBe(false);
      expect(isWriteOperation('organizations_list_field_updates')).toBe(false);
    });

    it('keeps read tools listed as explicit exceptions', () => {
      expect(isWriteOperation('deals_convert_status')).toBe(false);
      expect(isWriteOperation('leads_convert_status')).toBe(false);
      expect(isWriteOperation('filters_helpers')).toBe(false);
      expect(isWriteOperation('pipelines_conversion_statistics')).toBe(false);
      expect(isWriteOperation('pipelines_movement_statistics')).toBe(false);
      expect(isWriteOperation('pipelines_deals')).toBe(false);
      expect(isWriteOperation('system_health_check')).toBe(false);
      expect(isWriteOperation('system_reset_cache')).toBe(false);
    });
  });

  describe('write tools are blocked', () => {
    it.each([
      'deals_create',
      'deals_update',
      'deals_delete',
      'deals_add_follower',
      'deals_remove_product',
      'deals_duplicate',
      'deals_mark_as_won',
      'deals_move_to_stage',
      'deals_attach_file',
      'files_upload',
      'persons_add_picture',
      'activities_bulk_delete',
    ])('classifies %s as a write', (name) => {
      expect(isWriteOperation(name)).toBe(true);
    });

    it.each([
      // Reported in issue #51: these escaped the old write-verb list.
      'deals_merge',
      'persons_merge',
      'organizations_merge',
      'meetings_link_user_provider',
      'channels_receive_message',
      'projects_archive',
      // Added in 2.5.0, after the issue was filed, and escaping the same way.
      'deals_convert_to_lead',
      'leads_convert_to_deal',
    ])('blocks %s in read-only mode', (name) => {
      expect(isWriteOperation(name)).toBe(true);
    });

    it('treats unknown verbs as writes (fail-safe default)', () => {
      expect(isWriteOperation('deals_frobnicate')).toBe(true);
      expect(isWriteOperation('some_future_tool')).toBe(true);
    });
  });

  describe('legacy slash-separated names', () => {
    it('classifies them like their underscore counterparts', () => {
      expect(isWriteOperation('deals/list')).toBe(false);
      expect(isWriteOperation('deals/get')).toBe(false);
      expect(isWriteOperation('deals/create')).toBe(true);
      expect(isWriteOperation('deals/merge')).toBe(true);
    });
  });
});
