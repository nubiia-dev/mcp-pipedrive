import { z } from 'zod';
import {
  IdSchema,
  OptionalIdSchema,
  CurrencySchema,
  VisibilitySchema,
  DealStatusSchema,
  PaginationSchema,
  SortDirectionSchema,
  DateStringSchema,
  BooleanLikeSchema,
} from './common.js';

/**
 * Schema for creating a new deal
 */
export const CreateDealSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required and cannot be empty')
    .max(255, 'Title cannot exceed 255 characters')
    .describe('Deal title'),
  value: z.coerce
    .number()
    .nonnegative('Value must be non-negative')
    .optional()
    .describe('Deal value'),
  currency: CurrencySchema.optional().describe('Currency code (e.g., USD, EUR)'),
  user_id: OptionalIdSchema.describe('ID of the user who will be marked as the owner of the deal'),
  person_id: OptionalIdSchema.describe('ID of the person this deal is associated with'),
  org_id: OptionalIdSchema.describe('ID of the organization this deal is associated with'),
  pipeline_id: OptionalIdSchema.describe('ID of the pipeline this deal will be placed in'),
  stage_id: OptionalIdSchema.describe('ID of the stage this deal will be placed in'),
  status: z
    .enum(['open', 'won', 'lost'], {
      error: 'Status must be one of: open, won, lost',
    })
    .optional()
    .default('open')
    .describe('Deal status'),
  expected_close_date: DateStringSchema.optional().describe(
    'Expected close date in YYYY-MM-DD format'
  ),
  probability: z
    .number()
    .min(0, 'Probability must be between 0 and 100')
    .max(100, 'Probability must be between 0 and 100')
    .optional()
    .describe('Deal success probability percentage'),
  lost_reason: z
    .string()
    .max(255, 'Lost reason cannot exceed 255 characters')
    .optional()
    .describe('Reason why the deal was lost'),
  visible_to: VisibilitySchema.optional().describe('Visibility of the deal'),
  add_time: z.string().optional().describe('Creation time in ISO 8601 format'),
  custom_fields: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Map of custom field names (or hash keys) to values. Resolved server-side.'),
});

export type CreateDealInput = z.infer<typeof CreateDealSchema>;

/**
 * Schema for updating an existing deal
 */
export const UpdateDealSchema = z.object({
  id: IdSchema.describe('ID of the deal to update'),
  title: z
    .string()
    .min(1, 'Title cannot be empty')
    .max(255, 'Title cannot exceed 255 characters')
    .optional()
    .describe('Deal title'),
  value: z.coerce
    .number()
    .nonnegative('Value must be non-negative')
    .optional()
    .describe('Deal value'),
  currency: CurrencySchema.optional().describe('Currency code'),
  user_id: OptionalIdSchema.describe('ID of the user who will be marked as the owner'),
  person_id: OptionalIdSchema.describe('ID of the person associated with this deal'),
  org_id: OptionalIdSchema.describe('ID of the organization associated with this deal'),
  pipeline_id: OptionalIdSchema.describe('ID of the pipeline'),
  stage_id: OptionalIdSchema.describe('ID of the stage'),
  status: z
    .enum(['open', 'won', 'lost'], {
      error: 'Status must be one of: open, won, lost',
    })
    .optional()
    .describe('Deal status'),
  expected_close_date: DateStringSchema.optional().describe(
    'Expected close date in YYYY-MM-DD format'
  ),
  probability: z
    .number()
    .min(0, 'Probability must be between 0 and 100')
    .max(100, 'Probability must be between 0 and 100')
    .optional()
    .describe('Deal success probability percentage'),
  lost_reason: z
    .string()
    .max(255, 'Lost reason cannot exceed 255 characters')
    .optional()
    .describe('Reason why the deal was lost'),
  visible_to: VisibilitySchema.optional().describe('Visibility of the deal'),
  custom_fields: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Map of custom field names (or hash keys) to values. Resolved server-side.'),
});

export type UpdateDealInput = z.infer<typeof UpdateDealSchema>;

/**
 * Schema for listing deals with filters
 */
export const ListDealsSchema = PaginationSchema.extend({
  status: DealStatusSchema.optional().default('all_not_deleted').describe('Filter by deal status'),
  stage_id: OptionalIdSchema.describe('Filter by stage ID'),
  user_id: OptionalIdSchema.describe('Filter by user (owner) ID'),
  person_id: OptionalIdSchema.describe('Filter by person ID'),
  org_id: OptionalIdSchema.describe('Filter by organization ID'),
  pipeline_id: OptionalIdSchema.describe('Filter by pipeline ID'),
  filter_id: OptionalIdSchema.describe('ID of the filter to use'),
  sort: z.string().optional().describe('Field to sort by (e.g., title, value, stage_id)'),
  sort_by: SortDirectionSchema.optional().describe('Sort direction'),
  owned_by_you: BooleanLikeSchema.optional().describe('Filter deals owned by the authorized user'),
  add_time_from: DateStringSchema.optional().describe(
    'Filter deals created on or after this date (YYYY-MM-DD). Applied client-side.'
  ),
  add_time_until: DateStringSchema.optional().describe(
    'Filter deals created on or before this date (YYYY-MM-DD). Applied client-side.'
  ),
  cursor: z
    .string()
    .optional()
    .describe(
      'Opaque pagination cursor from a previous response (additional_data.next_cursor). Backed by API v2 — supersedes start, which is deprecated and ignored.'
    ),
}).strict();

export type ListDealsInput = z.infer<typeof ListDealsSchema>;

/**
 * Schema for moving a deal to a different stage
 */
export const MoveDealStageSchema = z
  .object({
    id: IdSchema.describe('ID of the deal to move'),
    stage_id: IdSchema.describe('ID of the stage to move the deal to'),
  })
  .strict();

export type MoveDealStageInput = z.infer<typeof MoveDealStageSchema>;

/**
 * Schema for getting a single deal
 */
export const GetDealSchema = z
  .object({
    id: IdSchema.describe('ID of the deal to retrieve'),
  })
  .strict();

export type GetDealInput = z.infer<typeof GetDealSchema>;

/**
 * Schema for deleting a deal
 */
export const DeleteDealSchema = z
  .object({
    id: IdSchema.describe('ID of the deal to delete'),
  })
  .strict();

export type DeleteDealInput = z.infer<typeof DeleteDealSchema>;

/**
 * Schema for searching deals
 */
export const SearchDealsSchema = z
  .object({
    term: z
      .string()
      .min(2, 'Search term must be at least 2 characters')
      .max(255, 'Search term cannot exceed 255 characters')
      .describe('Search term'),
    fields: z
      .enum(['title', 'notes', 'custom_fields', 'all'], {
        error: 'Fields must be one of: title, notes, custom_fields, all',
      })
      .optional()
      .default('all')
      .describe('Fields to search in'),
    exact_match: BooleanLikeSchema.optional()
      .default(false)
      .describe('Whether to perform exact match search'),
    person_id: OptionalIdSchema.describe('Filter by person ID'),
    org_id: OptionalIdSchema.describe('Filter by organization ID'),
    status: DealStatusSchema.optional()
      .default('all_not_deleted')
      .describe('Filter by deal status'),
    include_fields: z
      .string()
      .optional()
      .describe('Comma-separated list of fields to include in response'),
    start: z
      .number()
      .int('Start must be an integer')
      .nonnegative('Start must be non-negative')
      .default(0)
      .describe('Pagination start'),
    limit: z
      .number()
      .int('Limit must be an integer')
      .positive('Limit must be positive')
      .max(500, 'Limit cannot exceed 500')
      .optional()
      .describe('Number of items to return'),
  })
  .strict();

export type SearchDealsInput = z.infer<typeof SearchDealsSchema>;

/**
 * Schema for duplicating a deal
 */
export const DuplicateDealSchema = z
  .object({
    id: IdSchema.describe('ID of the deal to duplicate'),
  })
  .strict();

export type DuplicateDealInput = z.infer<typeof DuplicateDealSchema>;

/**
 * Schema for getting deal followers
 */
export const GetDealFollowersSchema = z
  .object({
    id: IdSchema.describe('ID of the deal'),
  })
  .strict();

export type GetDealFollowersInput = z.infer<typeof GetDealFollowersSchema>;

/**
 * Schema for adding a follower to a deal
 */
export const AddDealFollowerSchema = z
  .object({
    id: IdSchema.describe('ID of the deal'),
    user_id: IdSchema.describe('ID of the user to add as a follower'),
  })
  .strict();

export type AddDealFollowerInput = z.infer<typeof AddDealFollowerSchema>;

/**
 * Schema for removing a follower from a deal
 */
export const RemoveDealFollowerSchema = z
  .object({
    id: IdSchema.describe('ID of the deal'),
    follower_id: IdSchema.describe('ID of the follower to remove'),
  })
  .strict();

export type RemoveDealFollowerInput = z.infer<typeof RemoveDealFollowerSchema>;

/**
 * Schema for getting deal summary/statistics
 */
export const GetDealSummarySchema = z
  .object({
    status: DealStatusSchema.optional()
      .default('all_not_deleted')
      .describe('Filter by deal status'),
    filter_id: OptionalIdSchema.describe('ID of the filter to use'),
    user_id: OptionalIdSchema.describe('Filter by user (owner) ID'),
    stage_id: OptionalIdSchema.describe('Filter by stage ID'),
  })
  .strict();

export type GetDealSummaryInput = z.infer<typeof GetDealSummarySchema>;

/**
 * Schema for getting deal timeline/flow
 */
export const GetDealTimelineSchema = z
  .object({
    id: IdSchema.describe('ID of the deal'),
  })
  .strict();

export type GetDealTimelineInput = z.infer<typeof GetDealTimelineSchema>;

/**
 * Schema for getting deal participants
 */
export const GetDealParticipantsSchema = PaginationSchema.extend({
  id: IdSchema.describe('ID of the deal'),
}).strict();

export type GetDealParticipantsInput = z.infer<typeof GetDealParticipantsSchema>;

/**
 * Schema for adding a participant to a deal
 */
export const AddDealParticipantSchema = z
  .object({
    id: IdSchema.describe('ID of the deal'),
    person_id: IdSchema.describe('ID of the person to add as a participant'),
  })
  .strict();

export type AddDealParticipantInput = z.infer<typeof AddDealParticipantSchema>;

/**
 * Schema for removing a participant from a deal
 */
export const RemoveDealParticipantSchema = z
  .object({
    id: IdSchema.describe('ID of the deal'),
    deal_participant_id: IdSchema.describe('ID of the deal participant to remove'),
  })
  .strict();

export type RemoveDealParticipantInput = z.infer<typeof RemoveDealParticipantSchema>;

/**
 * Schema for getting deal products
 */
export const GetDealProductsSchema = PaginationSchema.extend({
  id: IdSchema.describe('ID of the deal'),
  include_product_data: BooleanLikeSchema.optional().describe(
    'Whether to include full product data'
  ),
}).strict();

export type GetDealProductsInput = z.infer<typeof GetDealProductsSchema>;

/**
 * Schema for adding a product to a deal
 */
export const AddDealProductSchema = z
  .object({
    id: IdSchema.describe('ID of the deal'),
    product_id: IdSchema.describe('ID of the product to add'),
    item_price: z
      .number()
      .nonnegative('Price must be non-negative')
      .optional()
      .describe('Price at which this product will be added to the deal'),
    quantity: z
      .number()
      .int('Quantity must be an integer')
      .positive('Quantity must be positive')
      .optional()
      .default(1)
      .describe('Quantity of items'),
    discount_percentage: z
      .number()
      .min(0, 'Discount must be between 0 and 100')
      .max(100, 'Discount must be between 0 and 100')
      .optional()
      .default(0)
      .describe('Discount percentage'),
    duration: z
      .number()
      .nonnegative('Duration must be non-negative')
      .optional()
      .describe('Duration of the product (for subscription products)'),
    product_variation_id: OptionalIdSchema.describe('ID of the product variation to use'),
    comments: z
      .string()
      .max(1000, 'Comments cannot exceed 1000 characters')
      .optional()
      .describe('Additional comments about the product'),
    enabled_flag: BooleanLikeSchema.optional()
      .default(true)
      .describe('Whether the product is enabled'),
  })
  .strict();

export type AddDealProductInput = z.infer<typeof AddDealProductSchema>;

/**
 * Schema for updating a product attached to a deal
 */
export const UpdateDealProductSchema = z
  .object({
    id: IdSchema.describe('ID of the deal'),
    product_attachment_id: IdSchema.describe('ID of the deal-product attachment to update'),
    item_price: z
      .number()
      .nonnegative('Price must be non-negative')
      .optional()
      .describe('Price at which this product is attached'),
    quantity: z
      .number()
      .int('Quantity must be an integer')
      .positive('Quantity must be positive')
      .optional()
      .describe('Quantity of items'),
    discount_percentage: z
      .number()
      .min(0, 'Discount must be between 0 and 100')
      .max(100, 'Discount must be between 0 and 100')
      .optional()
      .describe('Discount percentage'),
    duration: z
      .number()
      .nonnegative('Duration must be non-negative')
      .optional()
      .describe('Duration of the product'),
    comments: z
      .string()
      .max(1000, 'Comments cannot exceed 1000 characters')
      .optional()
      .describe('Additional comments'),
    enabled_flag: BooleanLikeSchema.optional().describe('Whether the product is enabled'),
  })
  .strict();

export type UpdateDealProductInput = z.infer<typeof UpdateDealProductSchema>;

/**
 * Schema for removing a product from a deal
 */
export const RemoveDealProductSchema = z
  .object({
    id: IdSchema.describe('ID of the deal'),
    product_attachment_id: IdSchema.describe('ID of the deal-product attachment to remove'),
  })
  .strict();

export type RemoveDealProductInput = z.infer<typeof RemoveDealProductSchema>;

/**
 * Schema for getting deal files
 */
export const GetDealFilesSchema = PaginationSchema.extend({
  id: IdSchema.describe('ID of the deal'),
  sort: z.string().optional().describe('Field to sort by'),
}).strict();

export type GetDealFilesInput = z.infer<typeof GetDealFilesSchema>;

/**
 * Schema for attaching a file to a deal
 */
export const AttachDealFileSchema = z
  .object({
    id: IdSchema.describe('ID of the deal'),
    file_path: z.string().min(1, 'File path is required').describe('Path to the file to attach'),
  })
  .strict();

export type AttachDealFileInput = z.infer<typeof AttachDealFileSchema>;

/**
 * Schema for getting deals timeline with grouping intervals
 */
export const GetDealsTimelineSchema = z
  .object({
    start_date: DateStringSchema.describe('The date when the first interval starts (YYYY-MM-DD)'),
    interval: z
      .enum(['day', 'week', 'month', 'quarter'], {
        error: 'Interval must be one of: day, week, month, quarter',
      })
      .describe('The type of the interval'),
    amount: z
      .number()
      .int('Amount must be an integer')
      .positive('Amount must be positive')
      .describe('The number of intervals to fetch'),
    field_key: z
      .string()
      .min(1, 'Field key is required')
      .describe('The date field key to retrieve deals from'),
    user_id: OptionalIdSchema.describe('Filter by user ID'),
    pipeline_id: OptionalIdSchema.describe('Filter by pipeline ID'),
    filter_id: OptionalIdSchema.describe('Filter by filter ID'),
    exclude_deals: BooleanLikeSchema.optional().describe(
      'Whether to exclude deals list (only return summary)'
    ),
    totals_convert_currency: z
      .string()
      .optional()
      .describe('3-letter currency code for converted totals'),
  })
  .strict();

export type GetDealsTimelineInput = z.infer<typeof GetDealsTimelineSchema>;

/**
 * Schema for listing activities associated with a deal
 */
export const ListDealActivitiesSchema = PaginationSchema.extend({
  id: IdSchema.describe('ID of the deal'),
  done: z
    .enum(['0', '1'], {
      error: 'Done must be 0 or 1',
    })
    .optional()
    .describe('Filter by activity done status (0 = not done, 1 = done)'),
  exclude: z.string().optional().describe('Comma-separated activity IDs to exclude'),
}).strict();

export type ListDealActivitiesInput = z.infer<typeof ListDealActivitiesSchema>;

/**
 * Schema for listing mail messages associated with a deal
 */
export const ListDealMailMessagesSchema = PaginationSchema.extend({
  id: IdSchema.describe('ID of the deal'),
}).strict();

export type ListDealMailMessagesInput = z.infer<typeof ListDealMailMessagesSchema>;

/**
 * Schema for merging two deals
 */
export const MergeDealsSchema = z
  .object({
    id: IdSchema.describe('ID of the deal to merge (will be deleted)'),
    merge_with_id: IdSchema.describe('ID of the deal to merge with (will be kept)'),
  })
  .strict();

export type MergeDealsInput = z.infer<typeof MergeDealsSchema>;

/**
 * Schema for listing permitted users for a deal
 */
export const ListDealPermittedUsersSchema = z
  .object({
    id: IdSchema.describe('ID of the deal'),
  })
  .strict();

export type ListDealPermittedUsersInput = z.infer<typeof ListDealPermittedUsersSchema>;

/**
 * Schema for listing persons associated with a deal
 */
export const ListDealPersonsSchema = PaginationSchema.extend({
  id: IdSchema.describe('ID of the deal'),
}).strict();

export type ListDealPersonsInput = z.infer<typeof ListDealPersonsSchema>;

/**
 * Schema for marking a deal as won
 */
export const MarkDealAsWonSchema = z
  .object({
    id: IdSchema.describe('ID of the deal to mark as won'),
  })
  .strict();

export type MarkDealAsWonInput = z.infer<typeof MarkDealAsWonSchema>;

/**
 * Schema for marking a deal as lost
 */
export const MarkDealAsLostSchema = z
  .object({
    id: IdSchema.describe('ID of the deal to mark as lost'),
    lost_reason: z
      .string()
      .max(255, 'Lost reason cannot exceed 255 characters')
      .optional()
      .describe('Reason why the deal was lost'),
  })
  .strict();

export type MarkDealAsLostInput = z.infer<typeof MarkDealAsLostSchema>;

/**
 * Schema for bulk editing deals
 */
export const BulkEditDealsSchema = z
  .object({
    ids: z
      .array(IdSchema)
      .min(1, 'At least one deal ID is required')
      .describe('Array of deal IDs to update'),
    value: z.coerce
      .number()
      .nonnegative('Value must be non-negative')
      .optional()
      .describe('Deal value'),
    currency: CurrencySchema.optional().describe('Currency code'),
    stage_id: OptionalIdSchema.describe('ID of the stage'),
    status: z
      .enum(['open', 'won', 'lost'], {
        error: 'Status must be one of: open, won, lost',
      })
      .optional()
      .describe('Deal status'),
    user_id: OptionalIdSchema.describe('ID of the user who will be the owner'),
    visible_to: VisibilitySchema.optional().describe('Visibility of the deals'),
  })
  .strict();

export type BulkEditDealsInput = z.infer<typeof BulkEditDealsSchema>;
