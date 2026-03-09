import type { EntryRecord } from "./types";

type ErrorPayload = {
  error?: unknown;
  message?: unknown;
};

function parseJson<T>(rawText: string): T {
  return JSON.parse(rawText) as T;
}

function readErrorFromText(rawText: string, fallback: string): string {
  if (!rawText.trim()) {
    return fallback;
  }

  try {
    const payload = parseJson<ErrorPayload>(rawText);
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    return rawText.trim();
  }

  return fallback;
}

async function assertSuccess(response: Response, fallback: string): Promise<void> {
  if (response.ok) {
    return;
  }

  const rawText = await response.text();
  throw new Error(readErrorFromText(rawText, fallback));
}

export async function fetchEntries(): Promise<EntryRecord[]> {
  const response = await fetch("/api/entries", {
    headers: {
      Accept: "application/json"
    }
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(readErrorFromText(rawText, "获取条目失败。"));
  }

  if (!rawText.trim()) {
    return [];
  }

  try {
    const payload = parseJson<unknown>(rawText);
    if (!Array.isArray(payload)) {
      throw new Error("返回的数据不是数组格式。");
    }
    return payload as EntryRecord[];
  } catch {
    throw new Error("解析条目 JSON 失败。");
  }
}

export async function createEntry(body: {
  id: string;
  site_name: string;
  encrypted_blob: string;
  iv: string;
}): Promise<void> {
  const response = await fetch("/api/entries", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body)
  });

  await assertSuccess(response, "创建条目失败。");
}

export async function updateEntry(
  id: string,
  body: {
    site_name: string;
    encrypted_blob: string;
    iv: string;
  }
): Promise<void> {
  const response = await fetch(`/api/entry/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body)
  });

  await assertSuccess(response, "更新条目失败。");
}

export async function deleteEntry(id: string): Promise<void> {
  const response = await fetch(`/api/entry/${id}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json"
    }
  });

  await assertSuccess(response, "删除条目失败。");
}
