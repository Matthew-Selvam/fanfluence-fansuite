-- Spec §108 — separate deterministic search indexes per entity. FTS5 external
-- content tables mirror the base rows; triggers keep them in step so a search
-- never needs a rebuild after ordinary writes.

CREATE VIRTUAL TABLE IF NOT EXISTS fts_characters USING fts5(
  id UNINDEXED, workspace_id UNINDEXED,
  name, username, niche, category, backstory, location,
  tokenize = 'porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_fans USING fts5(
  id UNINDEXED, workspace_id UNINDEXED,
  name, username, platform, notes,
  tokenize = 'porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_messages USING fts5(
  id UNINDEXED, workspace_id UNINDEXED, conversation_id UNINDEXED, fan_id UNINDEXED,
  body,
  tokenize = 'porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_assets USING fts5(
  id UNINDEXED, workspace_id UNINDEXED,
  filename, prompt, tags,
  tokenize = 'porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_scripts USING fts5(
  id UNINDEXED, workspace_id UNINDEXED,
  title, hook, body, cta, caption, notes,
  tokenize = 'porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_brand_deals USING fts5(
  id UNINDEXED, workspace_id UNINDEXED,
  brand, category, guidelines, usage_notes,
  tokenize = 'porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_campaigns USING fts5(
  id UNINDEXED, workspace_id UNINDEXED,
  name, objective, message_template,
  tokenize = 'porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_tasks USING fts5(
  id UNINDEXED, workspace_id UNINDEXED,
  title, body,
  tokenize = 'porter unicode61'
);

-- Characters
CREATE TRIGGER IF NOT EXISTS characters_fts_ai AFTER INSERT ON characters BEGIN
  INSERT INTO fts_characters(id, workspace_id, name, username, niche, category, backstory, location)
  VALUES (new.id, new.workspace_id, new.name, new.username, new.niche, new.category, new.backstory, new.location);
END;
CREATE TRIGGER IF NOT EXISTS characters_fts_ad AFTER DELETE ON characters BEGIN
  DELETE FROM fts_characters WHERE id = old.id;
END;
CREATE TRIGGER IF NOT EXISTS characters_fts_au AFTER UPDATE ON characters BEGIN
  DELETE FROM fts_characters WHERE id = old.id;
  INSERT INTO fts_characters(id, workspace_id, name, username, niche, category, backstory, location)
  VALUES (new.id, new.workspace_id, new.name, new.username, new.niche, new.category, new.backstory, new.location);
END;

-- Fans
CREATE TRIGGER IF NOT EXISTS fans_fts_ai AFTER INSERT ON fans BEGIN
  INSERT INTO fts_fans(id, workspace_id, name, username, platform, notes)
  VALUES (new.id, new.workspace_id, new.name, new.username, new.platform, new.notes);
END;
CREATE TRIGGER IF NOT EXISTS fans_fts_ad AFTER DELETE ON fans BEGIN
  DELETE FROM fts_fans WHERE id = old.id;
END;
CREATE TRIGGER IF NOT EXISTS fans_fts_au AFTER UPDATE ON fans BEGIN
  DELETE FROM fts_fans WHERE id = old.id;
  INSERT INTO fts_fans(id, workspace_id, name, username, platform, notes)
  VALUES (new.id, new.workspace_id, new.name, new.username, new.platform, new.notes);
END;

-- Messages (append-only in practice, so insert + delete is enough)
CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages BEGIN
  INSERT INTO fts_messages(id, workspace_id, conversation_id, fan_id, body)
  VALUES (new.id, new.workspace_id, new.conversation_id, new.fan_id, new.body);
END;
CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages BEGIN
  DELETE FROM fts_messages WHERE id = old.id;
END;
CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE OF body ON messages BEGIN
  DELETE FROM fts_messages WHERE id = old.id;
  INSERT INTO fts_messages(id, workspace_id, conversation_id, fan_id, body)
  VALUES (new.id, new.workspace_id, new.conversation_id, new.fan_id, new.body);
END;

-- Media assets
CREATE TRIGGER IF NOT EXISTS media_assets_fts_ai AFTER INSERT ON media_assets BEGIN
  INSERT INTO fts_assets(id, workspace_id, filename, prompt, tags)
  VALUES (new.id, new.workspace_id, new.filename, new.prompt, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS media_assets_fts_ad AFTER DELETE ON media_assets BEGIN
  DELETE FROM fts_assets WHERE id = old.id;
END;
CREATE TRIGGER IF NOT EXISTS media_assets_fts_au AFTER UPDATE ON media_assets BEGIN
  DELETE FROM fts_assets WHERE id = old.id;
  INSERT INTO fts_assets(id, workspace_id, filename, prompt, tags)
  VALUES (new.id, new.workspace_id, new.filename, new.prompt, new.tags);
END;

-- Scripts
CREATE TRIGGER IF NOT EXISTS scripts_fts_ai AFTER INSERT ON scripts BEGIN
  INSERT INTO fts_scripts(id, workspace_id, title, hook, body, cta, caption, notes)
  VALUES (new.id, new.workspace_id, new.title, new.hook, new.body, new.cta, new.caption, new.notes);
END;
CREATE TRIGGER IF NOT EXISTS scripts_fts_ad AFTER DELETE ON scripts BEGIN
  DELETE FROM fts_scripts WHERE id = old.id;
END;
CREATE TRIGGER IF NOT EXISTS scripts_fts_au AFTER UPDATE ON scripts BEGIN
  DELETE FROM fts_scripts WHERE id = old.id;
  INSERT INTO fts_scripts(id, workspace_id, title, hook, body, cta, caption, notes)
  VALUES (new.id, new.workspace_id, new.title, new.hook, new.body, new.cta, new.caption, new.notes);
END;

-- Brand deals
CREATE TRIGGER IF NOT EXISTS brand_deals_fts_ai AFTER INSERT ON brand_deals BEGIN
  INSERT INTO fts_brand_deals(id, workspace_id, brand, category, guidelines, usage_notes)
  VALUES (new.id, new.workspace_id, new.brand, new.category, new.guidelines, new.usage_notes);
END;
CREATE TRIGGER IF NOT EXISTS brand_deals_fts_ad AFTER DELETE ON brand_deals BEGIN
  DELETE FROM fts_brand_deals WHERE id = old.id;
END;
CREATE TRIGGER IF NOT EXISTS brand_deals_fts_au AFTER UPDATE ON brand_deals BEGIN
  DELETE FROM fts_brand_deals WHERE id = old.id;
  INSERT INTO fts_brand_deals(id, workspace_id, brand, category, guidelines, usage_notes)
  VALUES (new.id, new.workspace_id, new.brand, new.category, new.guidelines, new.usage_notes);
END;

-- Campaigns
CREATE TRIGGER IF NOT EXISTS campaigns_fts_ai AFTER INSERT ON campaigns BEGIN
  INSERT INTO fts_campaigns(id, workspace_id, name, objective, message_template)
  VALUES (new.id, new.workspace_id, new.name, new.objective, new.message_template);
END;
CREATE TRIGGER IF NOT EXISTS campaigns_fts_ad AFTER DELETE ON campaigns BEGIN
  DELETE FROM fts_campaigns WHERE id = old.id;
END;
CREATE TRIGGER IF NOT EXISTS campaigns_fts_au AFTER UPDATE ON campaigns BEGIN
  DELETE FROM fts_campaigns WHERE id = old.id;
  INSERT INTO fts_campaigns(id, workspace_id, name, objective, message_template)
  VALUES (new.id, new.workspace_id, new.name, new.objective, new.message_template);
END;

-- Tasks
CREATE TRIGGER IF NOT EXISTS tasks_fts_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO fts_tasks(id, workspace_id, title, body)
  VALUES (new.id, new.workspace_id, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS tasks_fts_ad AFTER DELETE ON tasks BEGIN
  DELETE FROM fts_tasks WHERE id = old.id;
END;
CREATE TRIGGER IF NOT EXISTS tasks_fts_au AFTER UPDATE ON tasks BEGIN
  DELETE FROM fts_tasks WHERE id = old.id;
  INSERT INTO fts_tasks(id, workspace_id, title, body)
  VALUES (new.id, new.workspace_id, new.title, new.body);
END;
