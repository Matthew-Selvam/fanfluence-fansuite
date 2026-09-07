/**
 * Seed data for development. Run: npm run seed
 * Creates sample characters, wardrobe, brand deals, scripts,
 * fans, conversations, campaigns, and mock providers.
 */
import { openDatabase } from './client.js';
import { runMigrations } from './migrate.js';
import { loadConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import { systemClock } from '../core/clock.js';
import { newId } from '../core/ids.js';
import {
  characters, characterVersions,
  wardrobes, wardrobeItems, homes,
  brandDeals, brandDealDeliverables, inspirationBoards,
  scripts,
  fans, fanTags, fanNotes, relationships,
  conversations, messages,
  campaigns, segments,
  providers,
  automations,
} from './schema/index.js';
import type { Db } from './client.js';

const clock = systemClock;
const WS = 'default';

export function seed(db: Db) {
  // Characters
  const charIds = [
    { id: newId('character'), name: 'Luna Vega', displayName: 'Luna Vega', username: 'lunavega', niche: 'fashion / lifestyle', category: 'influencer', location: 'Milan, Italy', language: 'en', status: 'active', contentRating: 'sfw', backstory: 'Milan-based fashion and lifestyle influencer.', personality: { traits: ['creative'], tone: 'warm', values: ['sustainability'] }, visual: { style: 'minimalist chic', colors: ['#C9A96E', '#2D2D2D'], aesthetic: 'clean editorial' }, brand: { colors: ['#C9A96E'], fonts: ['Helvetica'], tagline: 'Style with substance' }, contentPillars: ['fashion', 'sustainable living'], goals: ['Build brand partnerships'] },
    { id: newId('character'), name: 'Kai Nakamura', displayName: 'Kai', username: 'kainakamura', niche: 'tech / gaming', category: 'creator', location: 'Tokyo, Japan', language: 'en', status: 'active', contentRating: 'sfw', backstory: 'Tech and gaming content creator from Tokyo.', personality: { traits: ['analytical'], tone: 'calm', values: ['precision'] }, visual: { style: 'dark neon', colors: ['#00FFAA', '#0A0A0A'], aesthetic: 'cyberpunk' }, brand: { colors: ['#00FFAA'], fonts: ['JetBrains Mono'], tagline: 'Tech you can trust' }, contentPillars: ['hardware', 'gaming'], goals: ['Launch tutorial series'] },
  ] as any[];

  for (const c of charIds) {
    const now = clock.now();
    db.insert(characters).values({ ...c, workspaceId: WS, sortOrder: 0, locks: {}, createdAt: now, updatedAt: now }).run();
    db.insert(characterVersions).values({ id: newId('characterVersion'), workspaceId: WS, characterId: c.id, versionNumber: 1, snapshot: c, label: 'seed', authorUserId: 'seed', createdAt: now, updatedAt: now }).run();
  }

  // Wardrobe — one default wardrobe + item per character
  for (const c of charIds) {
    const wId = newId('wardrobe');
    db.insert(wardrobes).values({ id: wId, workspaceId: WS, characterId: c.id, name: 'Default', isDefault: true, createdAt: clock.now(), updatedAt: clock.now() }).run();
    db.insert(wardrobeItems).values({ id: newId('wardrobeItem'), workspaceId: WS, wardrobeId: wId, name: 'Casual Look', category: 'outfit', sortOrder: 1, createdAt: clock.now(), updatedAt: clock.now() } as any).run();
    db.insert(homes).values({ id: newId('home'), workspaceId: WS, characterId: c.id, name: 'Home', rooms: [{ name: 'Living Room' }], createdAt: clock.now(), updatedAt: clock.now() }).run();
  }

  // Brand deal for character 0
  const deal = { id: newId('brandDeal'), workspaceId: WS, characterId: charIds[0].id, brand: 'LuxeWear', category: 'fashion', stage: 'brief', compliance: { hashtagRules: ['#LuxeWear'] }, valueMinor: 500000, currency: 'EUR', approvalState: 'pending', createdAt: clock.now(), updatedAt: clock.now() } as any;
  db.insert(brandDeals).values(deal).run();
  db.insert(brandDealDeliverables).values({ id: newId('brandDeal'), workspaceId: WS, brandDealId: deal.id, kind: 'photo', title: '3 Instagram posts', quantity: 3, status: 'brief', createdAt: clock.now(), updatedAt: clock.now() } as any).run();
  db.insert(inspirationBoards).values({ id: newId('inspirationBoard'), workspaceId: WS, name: 'LuxeWear Moodboard', brandDealId: deal.id, sortOrder: 0, createdAt: clock.now(), updatedAt: clock.now() }).run();

  // Script for character 0
  db.insert(scripts).values({ id: newId('script'), workspaceId: WS, characterId: charIds[0].id, title: 'Spring Fashion Haul', channel: 'youtube', status: 'idea', hook: 'The best sustainable spring pieces', body: 'Join me as I unbox 5 sustainable fashion pieces.', cta: 'Comment below!', dialogue: [{ speaker: 'Luna', line: 'This first piece is amazing.' }], createdAt: clock.now(), updatedAt: clock.now() }).run();

  // Fans & relationships
  const fanIds = [
    { id: newId('fan'), workspaceId: WS, name: 'Sarah Chen', username: 'sarah_style', platform: 'instagram', externalId: 'ig_1001', locale: 'en-US', language: 'en', interactionCount: 47, messageCount: 12, purchaseCount: 2, totalSpendMinor: 12999 },
    { id: newId('fan'), workspaceId: WS, name: 'Marcus Rivera', username: 'marcus_dev', platform: 'twitter', externalId: 'tw_204', locale: 'en-US', language: 'en', interactionCount: 23, messageCount: 5 },
    { id: newId('fan'), workspaceId: WS, name: 'Yuki Tanaka', platform: 'direct', locale: 'ja-JP', language: 'ja', interactionCount: 8, messageCount: 3, subscriberState: 'active' },
  ] as any[];

  for (const f of fanIds) {
    const now = clock.now();
    db.insert(fans).values({ ...f, firstInteractionAt: now, lastInteractionAt: now, createdAt: now, updatedAt: now }).run();
    db.insert(relationships).values({ id: newId('relationship'), workspaceId: WS, fanId: f.id, characterId: null, trust: 0.5, loyalty: 0.3, engagement: 0.7, createdAt: now, updatedAt: now }).run();
    if (f.id === fanIds[0].id) {
      db.insert(fanTags).values({ id: newId('fanTag'), workspaceId: WS, fanId: f.id, tag: 'vip', source: 'seed', createdAt: now, updatedAt: now } as any).run();
      db.insert(fanNotes).values({ id: newId('fanNote'), workspaceId: WS, fanId: f.id, authorUserId: 'seed', body: 'High-engagement follower.', createdAt: now, updatedAt: now }).run();
    }
  }

  // Conversation & message
  const convId = newId('conversation');
  db.insert(conversations).values({ id: convId, workspaceId: WS, fanId: fanIds[0].id, characterId: charIds[0].id, channel: 'instagram', status: 'open', unreadCount: 1, lastMessageAt: clock.now(), lastMessagePreview: 'Love your content!', createdAt: clock.now(), updatedAt: clock.now() }).run();
  db.insert(messages).values({ id: newId('message'), workspaceId: WS, conversationId: convId, fanId: fanIds[0].id, direction: 'inbound', author: 'fan', body: 'Love your content!', status: 'sent', createdAt: clock.now(), updatedAt: clock.now(), sentAt: clock.now() }).run();

  // Segments
  db.insert(segments).values({ id: newId('segment'), workspaceId: WS, name: 'VIP Followers', description: 'Top 10% by engagement', builtinKey: 'vip', color: '#C9A96E', createdAt: clock.now(), updatedAt: clock.now() }).run();
  db.insert(segments).values({ id: newId('segment'), workspaceId: WS, name: 'New Fans', description: 'First interaction in last 7 days', builtinKey: 'new', color: '#00FFAA', createdAt: clock.now(), updatedAt: clock.now() }).run();

  // Campaign
  db.insert(campaigns).values({ id: newId('campaign'), workspaceId: WS, name: 'Spring Welcome', objective: 're_engagement', characterId: charIds[0].id, status: 'draft', approvalPolicy: 'always_ask', maxSendsPerHour: 50, createdAt: clock.now(), updatedAt: clock.now() }).run();

  // Mock providers
  db.insert(providers).values({ id: newId('provider'), workspaceId: WS, name: 'Mock LLM', adapter: 'mock_llm', kind: 'llm', authKind: 'none', capabilities: ['text_generation', 'chat'], enabled: true, health: 'healthy', priority: 10, createdAt: clock.now(), updatedAt: clock.now() } as any).run();
  db.insert(providers).values({ id: newId('provider'), workspaceId: WS, name: 'Mock Media', adapter: 'mock_media', kind: 'media', authKind: 'none', capabilities: ['image_generation'], enabled: true, health: 'healthy', priority: 10, createdAt: clock.now(), updatedAt: clock.now() } as any).run();

  // Automation
  db.insert(automations).values({ id: newId('automation'), workspaceId: WS, name: 'Welcome New Fans', description: 'Send welcome message to new fans', enabled: false, rule: { if: { event: 'fan.created' }, then: [{ action: 'send_message' }] }, autonomyMode: 'supervised', createdAt: clock.now(), updatedAt: clock.now() } as any).run();
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1]!.replace(/^.*[/\\]/, ''))) {
  const config = loadConfig({ ...process.env, FANFLUENCE_MODE: 'dev' });
  const log = createLogger({ service: 'seed', level: config.logLevel });
  const handle = openDatabase({ ...config, mode: 'dev' });
  try {
    runMigrations(handle);
    seed(handle.db);
    log.info('seed complete');
  } finally {
    handle.close();
  }
}