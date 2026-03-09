import { ensureEntriesSchema } from "./db";

interface Env {
  DB: D1Database;
}

type CreateEntryBody = {
  id: string;
  site_name: string;
  encrypted_blob: string;
  iv: string;
};

type EntryRow = {
  id: string;
  site_name: string;
  encrypted_blob: string;
  iv: string;
  created_at: string;
  updated_at: string;
};

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    await ensureEntriesSchema(context.env.DB);

    const { results } = await context.env.DB.prepare(
      `SELECT id, site_name, encrypted_blob, iv, created_at, updated_at
       FROM entries
       ORDER BY updated_at DESC`
    ).all<EntryRow>();

    return Response.json(Array.isArray(results) ? results : []);
  } catch {
    return jsonError("Failed to fetch entries from database.", 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  if (!payload || typeof payload !== "object") {
    return jsonError("Request body must be a JSON object.", 400);
  }

  const body = payload as Partial<CreateEntryBody>;
  if (
    !isNonEmptyString(body.id) ||
    !isNonEmptyString(body.site_name) ||
    !isNonEmptyString(body.encrypted_blob) ||
    !isNonEmptyString(body.iv)
  ) {
    return jsonError("Missing required fields: id, site_name, encrypted_blob, iv.", 400);
  }

  const now = new Date().toISOString();

  try {
    await ensureEntriesSchema(context.env.DB);

    await context.env.DB.prepare(
      `INSERT INTO entries (id, site_name, encrypted_blob, iv, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(body.id, body.site_name, body.encrypted_blob, body.iv, now, now)
      .run();

    return Response.json({ ok: true }, { status: 201 });
  } catch {
    return jsonError("Failed to create entry.", 500);
  }
};
