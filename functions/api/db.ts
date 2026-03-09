export async function ensureEntriesSchema(db: D1Database): Promise<void> {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      site_name TEXT NOT NULL,
      encrypted_blob TEXT NOT NULL,
      iv TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  ).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_entries_site_name ON entries(site_name)`).run();
}
