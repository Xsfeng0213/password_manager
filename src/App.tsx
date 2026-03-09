import { useEffect, useMemo, useState } from "react";
import { createEntry, deleteEntry, fetchEntries, updateEntry } from "./api";
import { decryptJson, deriveKey, encryptJson } from "./crypto";
import type { DecryptedEntry, EntryRecord } from "./types";
import { generateId } from "./utils";

type FormState = {
  siteName: string;
  username: string;
  email: string;
  password: string;
  note: string;
};

type DecryptedPayload = {
  username: string;
  email: string;
  password: string;
  note: string;
};

const emptyForm: FormState = {
  siteName: "",
  username: "",
  email: "",
  password: "",
  note: ""
};

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
      {open ? (
        <>
          <path
            d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </>
      ) : (
        <>
          <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path
            d="M10.6 6.3A11.6 11.6 0 0 1 12 6c6.5 0 10 6 10 6a18.1 18.1 0 0 1-3.4 4.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6.1 6.7C3.6 8.4 2 12 2 12s3.5 6 10 6c1.5 0 2.9-.3 4.2-.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
      <rect
        x="9"
        y="9"
        width="11"
        height="11"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function maskPassword(value: string): string {
  if (!value) {
    return "-";
  }
  return "*".repeat(Math.max(8, value.length));
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

async function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  textArea.style.pointerEvents = "none";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textArea);

  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

export default function App() {
  const [masterPassword, setMasterPassword] = useState("");
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [records, setRecords] = useState<EntryRecord[]>([]);
  const [entries, setEntries] = useState<DecryptedEntry[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    void loadRecords();
  }, []);

  useEffect(() => {
    if (!key) {
      setEntries([]);
      setVisiblePasswords({});
      setWarning("");
      return;
    }
    void decryptAll(records, key);
  }, [records, key]);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessMessage(""), 2000);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    if (!copiedId) {
      return;
    }

    const timer = window.setTimeout(() => setCopiedId((current) => (current ? null : current)), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedId]);

  useEffect(() => {
    setVisiblePasswords((current) => {
      const ids = new Set(entries.map((entry) => entry.id));
      let changed = false;
      const next: Record<string, boolean> = {};

      for (const [id, isVisible] of Object.entries(current)) {
        if (ids.has(id)) {
          next[id] = isVisible;
        } else {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [entries]);

  async function loadRecords() {
    setLoading(true);
    try {
      const data = await fetchEntries();
      setRecords(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load entries.");
    } finally {
      setLoading(false);
    }
  }

  async function decryptAll(source: EntryRecord[], cryptoKey: CryptoKey) {
    const settled = await Promise.allSettled(
      source.map(async (item) => {
        const payload = await decryptJson<DecryptedPayload>(cryptoKey, item.encrypted_blob, item.iv);

        return {
          id: item.id,
          siteName: item.site_name,
          username: payload.username ?? "",
          email: payload.email ?? "",
          password: payload.password ?? "",
          note: payload.note ?? "",
          createdAt: item.created_at,
          updatedAt: item.updated_at
        } satisfies DecryptedEntry;
      })
    );

    const decrypted: DecryptedEntry[] = [];
    let failedCount = 0;

    for (const result of settled) {
      if (result.status === "fulfilled") {
        decrypted.push(result.value);
      } else {
        failedCount += 1;
      }
    }

    decrypted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    setEntries(decrypted);

    if (source.length === 0) {
      setError("");
      setWarning("");
      return;
    }

    if (failedCount === 0) {
      setError("");
      setWarning("");
      return;
    }

    if (decrypted.length === 0) {
      setWarning("");
      setError("Unable to decrypt entries. Check the master password and local salt.");
      return;
    }

    setError("");
    setWarning(`Skipped ${failedCount} record${failedCount === 1 ? "" : "s"} that failed to decrypt.`);
  }

  async function handleUnlock() {
    if (!masterPassword.trim()) {
      setError("Please enter a master password.");
      return;
    }

    setUnlocking(true);
    try {
      const derived = await deriveKey(masterPassword);
      setKey(derived);
      setError("");
      setWarning("");
      setSuccessMessage("Vault unlocked.");
    } catch {
      setError("Failed to unlock vault.");
    } finally {
      setUnlocking(false);
    }
  }

  async function handleSubmit() {
    if (!key) {
      setError("Unlock the vault before saving.");
      return;
    }

    const siteName = form.siteName.trim();
    if (!siteName) {
      setError("Site name is required.");
      return;
    }

    try {
      const id = editingId ?? generateId();
      const encrypted = await encryptJson(key, {
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        note: form.note.trim()
      });

      if (editingId) {
        await updateEntry(id, {
          site_name: siteName,
          encrypted_blob: encrypted.ciphertext,
          iv: encrypted.iv
        });
        setSuccessMessage("Entry updated.");
      } else {
        await createEntry({
          id,
          site_name: siteName,
          encrypted_blob: encrypted.ciphertext,
          iv: encrypted.iv
        });
        setSuccessMessage("Entry added.");
      }

      setForm(emptyForm);
      setEditingId(null);
      setSearch("");
      setError("");
      setWarning("");
      await loadRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save entry.");
    }
  }

  function startEdit(entry: DecryptedEntry) {
    setEditingId(entry.id);
    setForm({
      siteName: entry.siteName,
      username: entry.username,
      email: entry.email,
      password: entry.password,
      note: entry.note
    });
    setSuccessMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm("Delete this entry?");
    if (!confirmed) {
      return;
    }

    try {
      await deleteEntry(id);
      setVisiblePasswords((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      await loadRecords();
      setSuccessMessage("Entry deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete entry.");
    }
  }

  async function handleCopy(password: string, id: string) {
    if (!password) {
      setError("This entry has no password to copy.");
      return;
    }

    try {
      await copyTextToClipboard(password);
      setCopiedId(id);
      setError("");
      setSuccessMessage("Password copied.");
    } catch {
      setError("Clipboard permission denied or unavailable.");
    }
  }

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return entries;
    }

    return entries.filter((entry) =>
      [entry.siteName, entry.username, entry.email, entry.note].join(" ").toLowerCase().includes(keyword)
    );
  }, [entries, search]);

  const savedPasswords = entries.filter((entry) => entry.password.trim()).length;

  return (
    <div className="app-shell">
      <div className="bg-shape bg-shape-a" />
      <div className="bg-shape bg-shape-b" />
      <div className="layout">
        <header className="card hero">
          <div className="hero-copy">
            <span className="tag">Client-side encrypted vault</span>
            <h1>Password Manager</h1>
            <p>
              Data is encrypted in the browser before upload. Passwords are masked by default, and each entry can be
              toggled or copied with one click.
            </p>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <span>Total Entries</span>
              <strong>{entries.length}</strong>
            </div>
            <div className="stat-card">
              <span>Saved Passwords</span>
              <strong>{savedPasswords}</strong>
            </div>
          </div>
        </header>

        <section className="card unlock-card">
          <div>
            <h2>Unlock Vault</h2>
            <p>The master password is only used locally for encryption and decryption.</p>
          </div>
          <div className="unlock-actions">
            <input
              type="password"
              placeholder="Enter master password"
              value={masterPassword}
              onChange={(event) => setMasterPassword(event.target.value)}
            />
            <button className="primary-button" onClick={() => void handleUnlock()} disabled={unlocking}>
              {unlocking ? "Unlocking..." : "Unlock"}
            </button>
          </div>
        </section>

        <section className="dashboard">
          <aside className="card form-card">
            <div className="section-head">
              <div>
                <span className="section-tag">Editor</span>
                <h2>{editingId ? "Edit Entry" : "New Entry"}</h2>
              </div>
              {editingId && <span className="pill">Editing</span>}
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Site</span>
                <input
                  placeholder="e.g. Gmail"
                  value={form.siteName}
                  onChange={(event) => setForm({ ...form, siteName: event.target.value })}
                />
              </label>

              <label className="field">
                <span>Username</span>
                <input
                  placeholder="e.g. john_doe"
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                />
              </label>

              <label className="field">
                <span>Email</span>
                <input
                  placeholder="e.g. example@email.com"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </label>

              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  placeholder="Account password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </label>

              <label className="field field-wide">
                <span>Note</span>
                <textarea
                  placeholder="Optional notes"
                  value={form.note}
                  onChange={(event) => setForm({ ...form, note: event.target.value })}
                  rows={5}
                />
              </label>
            </div>

            <div className="form-actions">
              <button className="primary-button" onClick={() => void handleSubmit()} disabled={loading}>
                {editingId ? "Save Changes" : "Add Entry"}
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                Clear
              </button>
            </div>
          </aside>

          <main className="card list-card">
            <div className="section-head list-head">
              <div>
                <span className="section-tag">Entries</span>
                <h2>Password List</h2>
              </div>

              <div className="badge-row">
                <span className="pill">{filtered.length} items</span>
                <span className="pill">Passwords masked</span>
              </div>
            </div>

            <div className="toolbar">
              <input
                className="search-input"
                placeholder="Search site / username / email / note"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            {!key && records.length > 0 && <p className="status-text">Unlock to decrypt and view saved entries.</p>}
            {loading && <p className="status-text">Loading entries...</p>}
            {error && <p className="status-text status-error">{error}</p>}
            {warning && <p className="status-text status-warning">{warning}</p>}
            {successMessage && <p className="status-text status-success">{successMessage}</p>}

            <div className="entry-list">
              {!loading && filtered.length === 0 && (
                <div className="empty-state">
                  <h3>No entries yet</h3>
                  <p>Create your first record from the form on the left.</p>
                </div>
              )}

              {filtered.map((entry, index) => {
                const isVisible = Boolean(visiblePasswords[entry.id]);

                return (
                  <article
                    key={entry.id}
                    className="entry-card"
                    style={{ animationDelay: `${Math.min(index * 70, 420)}ms` }}
                  >
                    <div className="entry-title-row">
                      <div>
                        <h3>{entry.siteName}</h3>
                        <p className="entry-meta">Updated {formatTimestamp(entry.updatedAt)}</p>
                      </div>
                      <span className="entry-index">#{index + 1}</span>
                    </div>

                    <div className="entry-grid">
                      <div className="chip">
                        <span>Username</span>
                        <strong>{entry.username || "-"}</strong>
                      </div>

                      <div className="chip">
                        <span>Email</span>
                        <strong>{entry.email || "-"}</strong>
                      </div>

                      <div className="chip chip-wide">
                        <span>Password</span>
                        <div className="password-row">
                          <code className="password-value">
                            {isVisible ? entry.password || "-" : maskPassword(entry.password)}
                          </code>

                          <div className="inline-actions">
                            <button
                              className="icon-button"
                              onClick={() =>
                                setVisiblePasswords((current) => ({
                                  ...current,
                                  [entry.id]: !current[entry.id]
                                }))
                              }
                              title={isVisible ? "Hide password" : "Show password"}
                              aria-label={isVisible ? "Hide password" : "Show password"}
                            >
                              <EyeIcon open={isVisible} />
                            </button>

                            <button
                              className="mini-button"
                              onClick={() => void handleCopy(entry.password, entry.id)}
                              disabled={!entry.password}
                              title="Copy password"
                            >
                              <CopyIcon />
                              <span>{copiedId === entry.id ? "Copied" : "Copy"}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="chip chip-wide">
                        <span>Note</span>
                        <strong>{entry.note || "-"}</strong>
                      </div>
                    </div>

                    <div className="entry-actions">
                      <button className="secondary-button" onClick={() => startEdit(entry)}>
                        Edit
                      </button>
                      <button className="danger-button" onClick={() => void handleDelete(entry.id)}>
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </main>
        </section>
      </div>
    </div>
  );
}
