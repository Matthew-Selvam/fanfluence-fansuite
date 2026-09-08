import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, runMigrations, type DbHandle } from '../db/index.js';
import { WardrobeService, InspirationService } from './studio.js';
import { systemClock } from '../core/clock.js';
import { systemActor } from './context.js';

const dir = mkdtempSync(join(tmpdir(), 'fanfluence-test-'));
const handle: DbHandle = openDatabase({
  dataDir: dir,
  mode: 'test',
  databaseUrl: join(dir, 'test.db'),
} as never);
runMigrations(handle);

const clock = systemClock;
const actor = systemActor('test-ws');

describe('WardrobeService', () => {
  const wardrobe = new WardrobeService(handle.db, clock);

  it('creates and lists wardrobes', () => {
    const created = wardrobe.createWardrobe(actor, { name: 'Summer Set', isDefault: false });
    expect(created.name).toBe('Summer Set');
    const list = wardrobe.listWardrobes(actor);
    expect(list.length).toBeGreaterThan(0);
    expect(list.some(w => w.name === 'Summer Set')).toBe(true);
  });

  it('adds and lists items', () => {
    const w = wardrobe.createWardrobe(actor, { name: 'Winter Set', isDefault: false });
    wardrobe.createItem(actor, { wardrobeId: w.id, name: 'Coat', category: 'outerwear' });
    const items = wardrobe.listItems(actor, w.id);
    expect(items.some(i => i.name === 'Coat')).toBe(true);
  });
});

describe('InspirationService', () => {
  const inspiration = new InspirationService(handle.db, clock);

  it('creates and lists boards', () => {
    const board = inspiration.createBoard(actor, { name: 'Editorial Mood' });
    expect(board.name).toBe('Editorial Mood');
    const boards = inspiration.listBoards(actor);
    expect(boards.some(b => b.name === 'Editorial Mood')).toBe(true);
  });

  it('updates and deletes boards', () => {
    const board = inspiration.createBoard(actor, { name: 'To Delete' });
    inspiration.updateBoard(actor, board.id, { name: 'Renamed' });
    expect(inspiration.listBoards(actor).some(b => b.name === 'Renamed')).toBe(true);
    inspiration.deleteBoard(actor, board.id);
    expect(inspiration.listBoards(actor).some(b => b.id === board.id)).toBe(false);
  });
});

afterAll(() => {
  handle.close();
  rmSync(dir, { recursive: true, force: true });
});