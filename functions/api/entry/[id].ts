import { ensureEntriesSchema } from "../db";

interface Env {
  DB: D1Database;
}

type UpdateEntryBody = {
  site_name: string;
  encrypted_blob: string;
  iv: string;
};

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const id = context.params.id;
  if (!isNonEmptyString(id)) {
    return jsonError("Missing entry id.", 400);
  }

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  if (!payload || typeof payload !== "object") {
    return jsonError("Request body must be a JSON object.", 400);
  }

  const body = payload as Partial<UpdateEntryBody>;
  if (
    !isNonEmptyString(body.site_name) ||
    !isNonEmptyString(body.encrypted_blob) ||
    !isNonEmptyString(body.iv)
  ) {
    return jsonError("Missing required fields: site_name, encrypted_blob, iv.", 400);
  }

  const now = new Date().toISOString();

  try {
    await ensureEntriesSchema(context.env.DB);

    await context.env.DB.prepare(
      `UPDATE entries
       SET site_name = ?, encrypted_blob = ?, iv = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(body.site_name, body.encrypted_blob, body.iv, now, id)
      .run();

    return Response.json({ ok: true }, { status: 200 });
  } catch {
    return jsonError("Failed to update entry.", 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const id = context.params.id;
  if (!isNonEmptyString(id)) {
    return jsonError("Missing entry id.", 400);
  }

  try {
    await ensureEntriesSchema(context.env.DB);

    await context.env.DB.prepare(`DELETE FROM entries WHERE id = ?`).bind(id).run();
    return Response.json({ ok: true }, { status: 200 });
  } catch {
    return jsonError("Failed to delete entry.", 500);
  }
};
