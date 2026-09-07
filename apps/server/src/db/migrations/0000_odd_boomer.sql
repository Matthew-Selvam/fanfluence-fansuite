CREATE TABLE `secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`ref` text NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`auth_tag` text NOT NULL,
	`key_id` text NOT NULL,
	`hint` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `secrets_ref_uq` ON `secrets` (`workspace_id`,`ref`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text,
	`token_hash` text NOT NULL,
	`device_id` text,
	`device_name` text,
	`kind` text DEFAULT 'web' NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_uq` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_ix` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`scope` text DEFAULT 'workspace' NOT NULL,
	`scope_id` text,
	`key` text NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_uq` ON `settings` (`workspace_id`,`scope`,`scope_id`,`key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text,
	`avatar_url` text,
	`last_seen_at` integer,
	`disabled` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`permission_overrides` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_members_uq` ON `workspace_members` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `workspace_members_user_ix` ON `workspace_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`organization_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`mode` text DEFAULT 'production' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`settings` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_uq` ON `workspaces` (`slug`);--> statement-breakpoint
CREATE TABLE `brand_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`brand_deal_id` text,
	`asset_id` text NOT NULL,
	`role` text NOT NULL,
	`label` text
);
--> statement-breakpoint
CREATE INDEX `brand_assets_deal_ix` ON `brand_assets` (`brand_deal_id`);--> statement-breakpoint
CREATE TABLE `brand_deal_deliverables` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`brand_deal_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`due_date` integer,
	`status` text DEFAULT 'new' NOT NULL,
	`asset_ids` text,
	`script_id` text,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `brand_deal_deliverables_deal_ix` ON `brand_deal_deliverables` (`brand_deal_id`);--> statement-breakpoint
CREATE TABLE `brand_deals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`character_id` text,
	`brand` text NOT NULL,
	`category` text,
	`stage` text DEFAULT 'new' NOT NULL,
	`contract_status` text,
	`start_date` integer,
	`end_date` integer,
	`compliance` text,
	`guidelines` text,
	`usage_notes` text,
	`publishing_channels` text,
	`value_minor` integer,
	`currency` text DEFAULT 'USD' NOT NULL,
	`approval_state` text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `brand_deals_workspace_ix` ON `brand_deals` (`workspace_id`,`stage`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `character_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`character_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`role` text NOT NULL,
	`approved` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `character_assets_uq` ON `character_assets` (`character_id`,`asset_id`,`role`);--> statement-breakpoint
CREATE INDEX `character_assets_role_ix` ON `character_assets` (`character_id`,`role`,`approved`);--> statement-breakpoint
CREATE TABLE `character_references` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`character_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`embedding_model` text,
	`embedding` text,
	`quality` real
);
--> statement-breakpoint
CREATE INDEX `character_references_char_ix` ON `character_references` (`character_id`);--> statement-breakpoint
CREATE TABLE `character_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`character_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`snapshot` text NOT NULL,
	`label` text,
	`author_user_id` text,
	`source_run_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `character_versions_uq` ON `character_versions` (`character_id`,`version_number`);--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`display_name` text,
	`username` text,
	`gender` text,
	`age` integer,
	`birthdate` text,
	`niche` text,
	`category` text,
	`location` text,
	`timezone` text,
	`language` text DEFAULT 'en' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`content_rating` text DEFAULT 'sfw' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`backstory` text,
	`personality` text,
	`visual` text,
	`brand` text,
	`operational` text,
	`locks` text,
	`audience` text,
	`content_pillars` text,
	`goals` text,
	`main_asset_id` text,
	`character_sheet_asset_id` text,
	`last_generated_at` integer,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `characters_workspace_ix` ON `characters` (`workspace_id`,`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `characters_username_uq` ON `characters` (`workspace_id`,`username`);--> statement-breakpoint
CREATE TABLE `content_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`title` text NOT NULL,
	`character_id` text,
	`script_id` text,
	`brand_deal_id` text,
	`aspect` text DEFAULT '9:16' NOT NULL,
	`resolution` text,
	`status` text DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `content_projects_workspace_ix` ON `content_projects` (`workspace_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `content_shots` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`project_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text,
	`start_frame_asset_id` text,
	`camera` text,
	`action` text,
	`dialogue` text,
	`audio` text,
	`duration_ms` integer,
	`brief_id` text,
	`locked` integer DEFAULT false NOT NULL,
	`approval_state` text DEFAULT 'pending' NOT NULL,
	`selected_output_asset_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_shots_position_uq` ON `content_shots` (`project_id`,`position`);--> statement-breakpoint
CREATE TABLE `creative_briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`character_id` text,
	`brand_deal_id` text,
	`campaign_id` text,
	`script_id` text,
	`spec` text NOT NULL,
	`preferred_provider_id` text,
	`preferred_model` text,
	`status` text DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `creative_briefs_workspace_ix` ON `creative_briefs` (`workspace_id`,`status`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `homes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`character_id` text,
	`name` text NOT NULL,
	`description` text,
	`rooms` text,
	`asset_id` text
);
--> statement-breakpoint
CREATE INDEX `homes_character_ix` ON `homes` (`character_id`);--> statement-breakpoint
CREATE TABLE `inspiration_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`board_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`note` text,
	`tags` text,
	`palette` text,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inspiration_assets_board_ix` ON `inspiration_assets` (`board_id`);--> statement-breakpoint
CREATE TABLE `inspiration_boards` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`character_id` text,
	`campaign_id` text,
	`brand_deal_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inspiration_boards_workspace_ix` ON `inspiration_boards` (`workspace_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`kind` text NOT NULL,
	`mime_type` text NOT NULL,
	`filename` text NOT NULL,
	`storage_key` text NOT NULL,
	`checksum` text,
	`size_bytes` integer,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`character_id` text,
	`brand_deal_id` text,
	`campaign_id` text,
	`script_id` text,
	`provider_id` text,
	`model` text,
	`prompt` text,
	`generation_params` text,
	`generation_job_id` text,
	`source` text DEFAULT 'upload' NOT NULL,
	`parent_asset_id` text,
	`version_number` integer DEFAULT 1 NOT NULL,
	`tags` text,
	`approval_state` text DEFAULT 'pending' NOT NULL,
	`publishing_state` text DEFAULT 'draft' NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_assets_workspace_ix` ON `media_assets` (`workspace_id`,`kind`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `media_assets_character_ix` ON `media_assets` (`character_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `media_assets_checksum_ix` ON `media_assets` (`workspace_id`,`checksum`);--> statement-breakpoint
CREATE INDEX `media_assets_parent_ix` ON `media_assets` (`parent_asset_id`);--> statement-breakpoint
CREATE TABLE `scripts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`title` text NOT NULL,
	`character_id` text,
	`campaign_id` text,
	`brand_deal_id` text,
	`channel` text,
	`status` text DEFAULT 'idea' NOT NULL,
	`hook` text,
	`body` text,
	`cta` text,
	`dialogue` text,
	`caption` text,
	`notes` text,
	`reference_asset_ids` text,
	`output_asset_ids` text,
	`publishing_state` text DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scripts_workspace_ix` ON `scripts` (`workspace_id`,`status`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `wardrobe_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`wardrobe_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`style` text,
	`description` text,
	`asset_id` text,
	`brand_deal_id` text,
	`campaign_id` text,
	`tags` text,
	`favorite` integer DEFAULT false NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wardrobe_items_wardrobe_ix` ON `wardrobe_items` (`wardrobe_id`,`category`);--> statement-breakpoint
CREATE INDEX `wardrobe_items_deal_ix` ON `wardrobe_items` (`brand_deal_id`);--> statement-breakpoint
CREATE TABLE `wardrobes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`character_id` text,
	`name` text NOT NULL,
	`description` text,
	`is_default` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wardrobes_character_ix` ON `wardrobes` (`character_id`);--> statement-breakpoint
CREATE TABLE `campaign_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`campaign_id` text NOT NULL,
	`fan_id` text NOT NULL,
	`conversation_id` text,
	`message_id` text,
	`variant_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`body` text,
	`error` text,
	`sent_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_messages_uq` ON `campaign_messages` (`campaign_id`,`fan_id`);--> statement-breakpoint
CREATE INDEX `campaign_messages_status_ix` ON `campaign_messages` (`campaign_id`,`status`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`objective` text NOT NULL,
	`character_id` text,
	`segment_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`message_template` text,
	`variants` text,
	`asset_ids` text,
	`scheduled_at` integer,
	`started_at` integer,
	`completed_at` integer,
	`approval_policy` text DEFAULT 'always_ask' NOT NULL,
	`max_sends_per_hour` integer,
	`quiet_hours` text,
	`stats` text
);
--> statement-breakpoint
CREATE INDEX `campaigns_workspace_ix` ON `campaigns` (`workspace_id`,`status`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`fan_id` text NOT NULL,
	`character_id` text,
	`channel` text DEFAULT 'direct' NOT NULL,
	`external_id` text,
	`subject` text,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`unread_count` integer DEFAULT 0 NOT NULL,
	`important` integer DEFAULT false NOT NULL,
	`assigned_user_id` text,
	`snoozed_until` integer,
	`last_message_at` integer,
	`last_message_preview` text,
	`draft` text
);
--> statement-breakpoint
CREATE INDEX `conversations_inbox_ix` ON `conversations` (`workspace_id`,`status`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `conversations_fan_ix` ON `conversations` (`fan_id`,`character_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_external_uq` ON `conversations` (`workspace_id`,`channel`,`external_id`);--> statement-breakpoint
CREATE TABLE `fan_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`fan_id` text NOT NULL,
	`author_user_id` text,
	`body` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fan_notes_fan_ix` ON `fan_notes` (`fan_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `fan_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`fan_id` text NOT NULL,
	`tag` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fan_tags_uq` ON `fan_tags` (`fan_id`,`tag`);--> statement-breakpoint
CREATE TABLE `fans` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`name` text,
	`username` text,
	`platform` text DEFAULT 'direct' NOT NULL,
	`external_id` text,
	`avatar_url` text,
	`locale` text,
	`timezone` text,
	`language` text,
	`first_interaction_at` integer,
	`last_interaction_at` integer,
	`interaction_count` integer DEFAULT 0 NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`purchase_count` integer DEFAULT 0 NOT NULL,
	`total_spend_minor` integer DEFAULT 0 NOT NULL,
	`last_purchase_at` integer,
	`currency` text DEFAULT 'USD' NOT NULL,
	`subscriber_state` text DEFAULT 'none' NOT NULL,
	`preferences` text,
	`interests` text,
	`favorite_topics` text,
	`notes` text,
	`blocked` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fans_external_uq` ON `fans` (`workspace_id`,`platform`,`external_id`);--> statement-breakpoint
CREATE INDEX `fans_workspace_ix` ON `fans` (`workspace_id`,`last_interaction_at`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `fans_spend_ix` ON `fans` (`workspace_id`,`total_spend_minor`);--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`fan_id` text NOT NULL,
	`character_id` text,
	`kind` text NOT NULL,
	`key` text,
	`content` text NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`source` text NOT NULL,
	`source_message_id` text,
	`pinned` integer DEFAULT false NOT NULL,
	`suppressed` integer DEFAULT false NOT NULL,
	`merged_into_id` text,
	`embedding` text,
	`embedding_model` text,
	`expires_at` integer,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE INDEX `memories_fan_ix` ON `memories` (`fan_id`,`character_id`,`kind`);--> statement-breakpoint
CREATE INDEX `memories_pinned_ix` ON `memories` (`fan_id`,`pinned`,`suppressed`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`conversation_id` text NOT NULL,
	`fan_id` text NOT NULL,
	`character_id` text,
	`direction` text NOT NULL,
	`author` text NOT NULL,
	`author_user_id` text,
	`body` text NOT NULL,
	`attachment_asset_ids` text,
	`status` text DEFAULT 'sent' NOT NULL,
	`external_id` text,
	`idempotency_key` text,
	`intent` text,
	`emotion` text,
	`ai_metadata` text,
	`approval_id` text,
	`campaign_id` text,
	`error` text,
	`sent_at` integer,
	`read_at` integer
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_ix` ON `messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `messages_fan_ix` ON `messages` (`fan_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_idempotency_uq` ON `messages` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`fan_id` text NOT NULL,
	`character_id` text,
	`campaign_id` text,
	`external_id` text,
	`description` text,
	`product_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`occurred_at` integer NOT NULL,
	`idempotency_key` text
);
--> statement-breakpoint
CREATE INDEX `purchases_fan_ix` ON `purchases` (`fan_id`,`occurred_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchases_idempotency_uq` ON `purchases` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `relationship_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`fan_id` text NOT NULL,
	`character_id` text,
	`kind` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`deltas` text NOT NULL,
	`before` text,
	`after` text,
	`reason` text,
	`source_event_id` text,
	`actor` text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `relationship_events_fan_ix` ON `relationship_events` (`fan_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`fan_id` text NOT NULL,
	`character_id` text,
	`stage` text DEFAULT 'new' NOT NULL,
	`trust` real DEFAULT 0 NOT NULL,
	`loyalty` real DEFAULT 0 NOT NULL,
	`engagement` real DEFAULT 0 NOT NULL,
	`vip` integer DEFAULT false NOT NULL,
	`purchase_propensity` real DEFAULT 0 NOT NULL,
	`churn_risk` real DEFAULT 0 NOT NULL,
	`response_likelihood` real DEFAULT 0 NOT NULL,
	`interest_score` real DEFAULT 0 NOT NULL,
	`last_computed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `relationships_uq` ON `relationships` (`fan_id`,`character_id`);--> statement-breakpoint
CREATE INDEX `relationships_vip_ix` ON `relationships` (`workspace_id`,`vip`);--> statement-breakpoint
CREATE TABLE `segments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`definition` text,
	`builtin_key` text,
	`character_id` text,
	`cached_count` integer,
	`cached_at` integer,
	`color` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `segments_name_uq` ON `segments` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`fan_id` text NOT NULL,
	`character_id` text,
	`plan` text NOT NULL,
	`state` text NOT NULL,
	`amount_minor` integer,
	`currency` text DEFAULT 'USD' NOT NULL,
	`interval` text,
	`started_at` integer,
	`renews_at` integer,
	`cancelled_at` integer,
	`external_id` text
);
--> statement-breakpoint
CREATE INDEX `subscriptions_fan_ix` ON `subscriptions` (`fan_id`,`state`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`fan_id` text,
	`character_id` text,
	`campaign_id` text,
	`conversation_id` text,
	`due_at` integer,
	`priority` integer DEFAULT 0 NOT NULL,
	`assignee_user_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`trigger` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_id` text,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `tasks_inbox_ix` ON `tasks` (`workspace_id`,`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `tasks_assignee_ix` ON `tasks` (`assignee_user_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_dedupe_uq` ON `tasks` (`workspace_id`,`source`,`source_id`,`title`);--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`payload` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`character_id` text,
	`fan_id` text,
	`automation_run_id` text,
	`goal_step_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`risk_level` text DEFAULT 'medium' NOT NULL,
	`decided_by_user_id` text,
	`decided_at` integer,
	`decision_note` text,
	`revised_payload` text,
	`expires_at` integer
);
--> statement-breakpoint
CREATE INDEX `approvals_pending_ix` ON `approvals` (`workspace_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`user_id` text,
	`actor` text NOT NULL,
	`device_id` text,
	`source` text,
	`automation_run_id` text,
	`before` text,
	`after` text,
	`ip` text
);
--> statement-breakpoint
CREATE INDEX `audit_logs_workspace_ix` ON `audit_logs` (`workspace_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_ix` ON `audit_logs` (`entity_type`,`entity_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`automation_id` text,
	`goal_id` text,
	`trigger` text NOT NULL,
	`trigger_event_id` text,
	`status` text DEFAULT 'running' NOT NULL,
	`steps` text,
	`actions_taken` integer DEFAULT 0 NOT NULL,
	`cost_minor` real,
	`error` text,
	`started_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `automation_runs_automation_ix` ON `automation_runs` (`automation_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `automations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT false NOT NULL,
	`rule` text NOT NULL,
	`schedule` text,
	`timezone` text,
	`character_id` text,
	`autonomy_mode` text DEFAULT 'manual' NOT NULL,
	`guardrails` text,
	`last_run_at` integer,
	`next_run_at` integer,
	`run_count` integer DEFAULT 0 NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`circuit_open` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `automations_enabled_ix` ON `automations` (`workspace_id`,`enabled`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `automations_schedule_ix` ON `automations` (`enabled`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `cost_records` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`provider_id` text,
	`model` text,
	`job_id` text,
	`character_id` text,
	`campaign_id` text,
	`automation_run_id` text,
	`kind` text NOT NULL,
	`quantity` real,
	`unit` text,
	`estimated_minor` real,
	`actual_minor` real,
	`currency` text DEFAULT 'USD' NOT NULL,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cost_records_ix` ON `cost_records` (`workspace_id`,`occurred_at`,`provider_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`type` text NOT NULL,
	`timestamp` integer NOT NULL,
	`character_id` text,
	`fan_id` text,
	`entity_type` text,
	`entity_id` text,
	`source` text DEFAULT 'system' NOT NULL,
	`actor` text NOT NULL,
	`actor_id` text,
	`payload` text,
	`dispatched_at` integer
);
--> statement-breakpoint
CREATE INDEX `events_workspace_ix` ON `events` (`workspace_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `events_type_ix` ON `events` (`workspace_id`,`type`,`timestamp`);--> statement-breakpoint
CREATE INDEX `events_entity_ix` ON `events` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `events_undispatched_ix` ON `events` (`dispatched_at`,`timestamp`);--> statement-breakpoint
CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`job_id` text NOT NULL,
	`brief_id` text,
	`shot_id` text,
	`provider_id` text,
	`model` text,
	`kind` text NOT NULL,
	`external_id` text,
	`request` text NOT NULL,
	`raw_response` text,
	`estimated_cost_minor` real,
	`actual_cost_minor` real,
	`credits_used` real,
	`currency` text DEFAULT 'USD' NOT NULL,
	`duration_ms` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_jobs_job_uq` ON `generation_jobs` (`job_id`);--> statement-breakpoint
CREATE INDEX `generation_jobs_external_ix` ON `generation_jobs` (`provider_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `generation_outputs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`generation_job_id` text NOT NULL,
	`asset_id` text,
	`remote_url` text,
	`output_index` integer DEFAULT 0 NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE INDEX `generation_outputs_job_ix` ON `generation_outputs` (`generation_job_id`);--> statement-breakpoint
CREATE TABLE `goal_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`goal_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`tool` text,
	`input` text,
	`output` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`requires_approval` integer DEFAULT true NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `goal_steps_position_uq` ON `goal_steps` (`goal_id`,`position`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`objective` text NOT NULL,
	`character_id` text,
	`segment_id` text,
	`mode` text DEFAULT 'assisted' NOT NULL,
	`guardrails` text NOT NULL,
	`success_criteria` text,
	`failure_policy` text DEFAULT 'stop' NOT NULL,
	`schedule` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`budget_minor` integer,
	`spent_minor` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `goals_workspace_ix` ON `goals` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`adapter` text NOT NULL,
	`name` text NOT NULL,
	`connection_kind` text DEFAULT 'remote' NOT NULL,
	`endpoint` text,
	`credential_ref` text,
	`config` text,
	`health` text DEFAULT 'unknown' NOT NULL,
	`health_detail` text,
	`health_checked_at` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`webhook_secret_ref` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integrations_uq` ON `integrations` (`workspace_id`,`adapter`,`name`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`queue` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`payload` text NOT NULL,
	`result` text,
	`idempotency_key` text,
	`locked_by` text,
	`locked_until` integer,
	`run_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`timeout_ms` integer DEFAULT 300000 NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`progress_label` text,
	`error` text,
	`error_code` text,
	`dead_lettered_at` integer,
	`character_id` text,
	`campaign_id` text,
	`provider_id` text,
	`parent_job_id` text,
	`created_by_user_id` text,
	`automation_run_id` text
);
--> statement-breakpoint
CREATE INDEX `jobs_claim_ix` ON `jobs` (`queue`,`status`,`run_at`,`priority`);--> statement-breakpoint
CREATE INDEX `jobs_workspace_ix` ON `jobs` (`workspace_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_idempotency_uq` ON `jobs` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`kind` text NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`user_id` text,
	`entity_type` text,
	`entity_id` text,
	`action_url` text,
	`read_at` integer,
	`delivered_channels` text
);
--> statement-breakpoint
CREATE INDEX `notifications_user_ix` ON `notifications` (`workspace_id`,`user_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `provider_models` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`name` text NOT NULL,
	`capabilities` text NOT NULL,
	`input_types` text,
	`output_types` text,
	`param_schema` text,
	`max_resolution` text,
	`max_duration_ms` integer,
	`context_window` integer,
	`cost_per_unit_minor` real,
	`cost_unit` text,
	`available` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_models_uq` ON `provider_models` (`provider_id`,`model_id`);--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`adapter` text NOT NULL,
	`kind` text NOT NULL,
	`endpoint` text,
	`auth_kind` text DEFAULT 'none' NOT NULL,
	`credential_ref` text,
	`config` text,
	`capabilities` text,
	`default_model` text,
	`embedding_model` text,
	`context_window` integer,
	`health` text DEFAULT 'unknown' NOT NULL,
	`health_detail` text,
	`health_checked_at` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`rate_limit_per_minute` integer,
	`monthly_budget_minor` integer
);
--> statement-breakpoint
CREATE INDEX `providers_kind_ix` ON `providers` (`workspace_id`,`kind`,`enabled`,`priority`);--> statement-breakpoint
CREATE UNIQUE INDEX `providers_name_uq` ON `providers` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `publishing_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`integration_id` text,
	`platform` text NOT NULL,
	`handle` text NOT NULL,
	`display_name` text,
	`character_id` text,
	`credential_ref` text,
	`health` text DEFAULT 'unknown' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sandbox` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publishing_accounts_uq` ON `publishing_accounts` (`workspace_id`,`platform`,`handle`);--> statement-breakpoint
CREATE TABLE `publishing_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`job_id` text,
	`publishing_account_id` text,
	`character_id` text,
	`campaign_id` text,
	`script_id` text,
	`brand_deal_id` text,
	`platform` text NOT NULL,
	`caption` text,
	`asset_ids` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`dispatch_id` text,
	`permalink` text,
	`scheduled_at` integer,
	`published_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`idempotency_key` text,
	`sandbox` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `publishing_jobs_state_ix` ON `publishing_jobs` (`workspace_id`,`state`,`scheduled_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `publishing_jobs_idempotency_uq` ON `publishing_jobs` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `rate_counters` (
	`key` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`window_start` integer NOT NULL,
	`window_ms` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`limit_value` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_counters_window_ix` ON `rate_counters` (`window_start`);--> statement-breakpoint
CREATE TABLE `sync_records` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`workspace_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`entity_version` integer NOT NULL,
	`operation` text NOT NULL,
	`device_id` text NOT NULL,
	`checksum` text NOT NULL,
	`synced_at` integer,
	`conflict` integer DEFAULT false NOT NULL,
	`conflict_detail` text
);
--> statement-breakpoint
CREATE INDEX `sync_records_pending_ix` ON `sync_records` (`workspace_id`,`synced_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `sync_records_uq` ON `sync_records` (`entity_type`,`entity_id`,`entity_version`,`device_id`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`adapter` text NOT NULL,
	`received_at` integer NOT NULL,
	`signature_valid` integer DEFAULT false NOT NULL,
	`external_event_id` text,
	`headers` text,
	`body` text,
	`processed_at` integer,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_deliveries_uq` ON `webhook_deliveries` (`adapter`,`external_event_id`);--> statement-breakpoint
CREATE INDEX `webhook_deliveries_unprocessed_ix` ON `webhook_deliveries` (`processed_at`,`received_at`);