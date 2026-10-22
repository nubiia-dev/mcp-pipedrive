## [2.7.1](https://github.com/nubiia-dev/mcp-pipedrive/compare/v2.7.0...v2.7.1) (2026-10-22)


### Bug Fixes

* block every write tool in read-only mode ([78dc72b](https://github.com/nubiia-dev/mcp-pipedrive/commit/78dc72b2a78664a72fa7c009594c71bddcd2f6df)), closes [#51](https://github.com/nubiia-dev/mcp-pipedrive/issues/51)

## [2.6.1](https://github.com/nubiia-dev/mcp-pipedrive/compare/v2.6.0...v2.6.1) (2026-06-28)


### Bug Fixes

* refresh npm package metadata and README (Nubiia branding, keywords, tool table) ([1ab552f](https://github.com/nubiia-dev/mcp-pipedrive/commit/1ab552f214c84fddc66f0850b0ca9429ae7499a1))

# [2.6.0](https://github.com/nubiia-dev/mcp-pipedrive/compare/v2.5.0...v2.6.0) (2026-06-28)


### Features

* complete Pipedrive API coverage (installments, lead/note/project fields) ([#48](https://github.com/nubiia-dev/mcp-pipedrive/issues/48)) ([73e6d08](https://github.com/nubiia-dev/mcp-pipedrive/commit/73e6d0820c2278944c3ee831aca41660bf0e95d7))

# [2.5.0](https://github.com/nubiia-dev/mcp-pipedrive/compare/v2.4.0...v2.5.0) (2026-06-28)


### Features

* stages CRUD, lead labels CRUD, lead↔deal conversions ([#34](https://github.com/nubiia-dev/mcp-pipedrive/issues/34)) ([8a7860f](https://github.com/nubiia-dev/mcp-pipedrive/commit/8a7860fd0a7e17ab0f9250fb83ca437920352756))

# [2.4.0](https://github.com/nubiia-dev/mcp-pipedrive/compare/v2.3.0...v2.4.0) (2026-06-28)


### Features

* add_time date filters for deals and leads (hardened) ([#46](https://github.com/nubiia-dev/mcp-pipedrive/issues/46)) ([3b77c4f](https://github.com/nubiia-dev/mcp-pipedrive/commit/3b77c4f0781b10a9a033c7716df41e122101e990))

# [2.3.0](https://github.com/iamsamuelfraga/mcp-pipedrive/compare/v2.2.0...v2.3.0) (2026-06-11)


### Features

* full custom fields support ([#32](https://github.com/iamsamuelfraga/mcp-pipedrive/issues/32)) ([9145736](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/91457368773978202b51fa3e31a87f4b1e23a0af))

#### Added
- Custom field value assignment on create/update for deals, persons, organizations, products, and leads via a new `custom_fields` object that accepts display names or hash keys.
- Symmetric read enrichment: `*_get`, `*_list` and `*_search` responses include `custom_fields_resolved` mapping field display names to human-readable values.
- CRUD parity for deal, person and product custom field definitions:
  - `fields_create_deal_field`, `fields_update_deal_field`, `fields_delete_deal_field`, `fields_bulk_delete_deal_fields`
  - `fields_create_person_field`, `fields_update_person_field`, `fields_delete_person_field`, `fields_bulk_delete_person_fields`
  - `fields_create_product_field`, `fields_update_product_field`, `fields_delete_product_field`, `fields_bulk_delete_product_fields`
- Organization tools now expose six additional address fields previously not accessible: `label`, `address_subpremise`, `address_sublocality`, `address_admin_area_level_1`, `address_admin_area_level_2`, `address_formatted_address`.

#### Changed
- Create/update zod schemas for deals, persons, organizations, products, and leads no longer reject unknown top-level keys (`.strict()` removed). Custom values should be passed inside `custom_fields`.

# [2.2.0](https://github.com/iamsamuelfraga/mcp-pipedrive/compare/v2.1.0...v2.2.0) (2026-06-09)


### Features

* add job_title support to persons_create and persons_update ([2ace13d](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/2ace13d681a5824abe3bc0773a412461cab16e2e)), closes [#29](https://github.com/iamsamuelfraga/mcp-pipedrive/issues/29)

# [2.1.0](https://github.com/iamsamuelfraga/mcp-pipedrive/compare/v2.0.0...v2.1.0) (2026-05-28)


### Bug Fixes

* accept string-encoded numeric inputs from MCP clients ([72f7ecc](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/72f7ecc86304918b5bcb54d6f6da0df5014cc0bf))
* resolve toolset filter for compound names ([72fa9de](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/72fa9de49d035ea70517ad826ac1c5c15c2f838e))


### Features

* add organizations_list_followers and OrganizationFields CRUD ([732fde0](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/732fde0bdb8157594738afa4dd8dfe3e41098b30))

# [2.0.0](https://github.com/iamsamuelfraga/mcp-pipedrive/compare/v1.1.6...v2.0.0) (2025-12-11)


* feat!: standardize tool naming convention to use underscores ([2233ed6](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/2233ed6fadd93a364c5dbb56145477133d395e15))


### BREAKING CHANGES

* All tool names now use underscores instead of forward slashes to comply with MCP naming standards and align with mcp-holded pattern.

Migration guide:
- deals/create → deals_create
- persons/get → persons_get
- organizations/list → organizations_list
- activities/mark_as_done → activities_mark_as_done
- projects/activities/list → projects_activities_list
- etc.

This affects all 250+ tools across all categories:
- Deals, Persons, Organizations, Activities
- Files, Search, Pipelines, Notes, Fields, System
- Products, Leads, Users, Roles, Webhooks, Filters
- Projects, Goals, Tasks, Activity-types, Call-logs
- Mailbox, Teams, Org-relationships, Permission-sets
- Channels, Meetings, Project-templates

Rationale:
- MCP tool naming pattern requires ^[a-zA-Z0-9_-]{1,64}$
- Forward slashes in tool names caused validation errors
- Aligns with proven mcp-holded implementation
- Improves consistency across all tool categories

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>

## [1.1.6](https://github.com/iamsamuelfraga/mcp-pipedrive/compare/v1.1.5...v1.1.6) (2025-12-11)


### Bug Fixes

* add allow-deprecated-schema flag for MCP registry publish ([33e248f](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/33e248ffd0a8bf71925252e161d9d89bdd392fcf))

## [1.1.5](https://github.com/iamsamuelfraga/mcp-pipedrive/compare/v1.1.4...v1.1.5) (2025-12-11)


### Bug Fixes

* remove deprecated $schema field from server.json ([f8e3453](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/f8e34538df06ecb41fc8faafb86c37898f2cdc67))

## [1.1.4](https://github.com/iamsamuelfraga/mcp-pipedrive/compare/v1.1.3...v1.1.4) (2025-12-11)


### Bug Fixes

* update to draft schema (current version) ([8969ce8](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/8969ce89f81d70c4918cab08aacc8e455f2c183b))

## [1.1.3](https://github.com/iamsamuelfraga/mcp-pipedrive/compare/v1.1.2...v1.1.3) (2025-12-11)


### Bug Fixes

* migrate server.json to 2025-09-29 schema format ([6323330](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/632333099364b787b20cc5838dc7136a198cd8d4))

## [1.1.2](https://github.com/iamsamuelfraga/mcp-pipedrive/compare/v1.1.1...v1.1.2) (2025-12-11)


### Bug Fixes

* correct server.json format for MCP registry ([5c30c05](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/5c30c057f74f80bc1f7c4e607cadb4d98d0ad48d))

## [1.1.1](https://github.com/iamsamuelfraga/mcp-pipedrive/compare/v1.1.0...v1.1.1) (2025-12-11)


### Bug Fixes

* correct mcp-publisher download URL ([f82cf07](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/f82cf075ff684df95f8c232fb8511163bb26a178))

# [1.1.0](https://github.com/iamsamuelfraga/mcp-pipedrive/compare/v1.0.3...v1.1.0) (2025-12-11)


### Features

* add MCP registry publishing workflow ([b42c97b](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/b42c97b388a6485d85728b3c8d7c52b065ae2da5))

## [1.0.3](https://github.com/iamsamuelfraga/mcp-pipedrive/compare/v1.0.2...v1.0.3) (2025-12-11)


### Bug Fixes

* configure npm package for public access ([95263ae](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/95263aee46db8e6c2fc655fa557cde93e8ac827d))

## [1.0.2](https://github.com/iamsamuelfraga/mcp-pipedrive/compare/v1.0.1...v1.0.2) (2025-12-11)


### Bug Fixes

* skip retry tests temporarily for CI compatibility ([f3e9af5](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/f3e9af5cdfea80a320545ea00e73274138ffd0fd))

## [1.0.1](https://github.com/iamsamuelfraga/mcp-pipedrive/compare/v1.0.0...v1.0.1) (2025-12-11)


### Bug Fixes

* initialize lastError variable properly ([13b14df](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/13b14df915816646c39d00c1ee2f415e33e5f0a4))
* resolve linting issues and format code ([29a3f87](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/29a3f87a890f63bc9821516ed0921b5502388978))

# 1.0.0 (2025-12-11)


### Bug Fixes

* include package-lock.json for reproducible builds ([8e58373](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/8e583731ee58da4276905bd5977438eb7ba58602))


### Features

* initial implementation of Pipedrive MCP server ([c0e249b](https://github.com/iamsamuelfraga/mcp-pipedrive/commit/c0e249b9fed6d688691b0c30a4546e776a61d4d0))
