import { useEffect, useMemo, useRef, useState } from "react";
import { createEntry, deleteEntry, fetchEntries, updateEntry } from "./api";
import { decryptJson, deriveKey, encryptJson } from "./crypto";
import type { DecryptedEntry, EntryRecord } from "./types";
import { generateId } from "./utils";

type FormState = {
  siteName: string;
  username: string;
  account: string;
  password: string;
  remark: string;
  category: string;
};

type DecryptedPayload = {
  username?: string;
  account?: string;
  email?: string;
  password?: string;
  remark?: string;
  note?: string;
  category?: string;
};

const DEFAULT_CATEGORY = "默认分类";
const CATEGORY_STORAGE_KEY = "pm_categories";
const PAGE_SIZE_OPTIONS = [5, 10, 20] as const;

const emptyForm: FormState = {
  siteName: "",
  username: "",
  account: "",
  password: "",
  remark: "",
  category: DEFAULT_CATEGORY
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
  return date.toLocaleString("zh-CN", { hour12: false });
}

function normalizeCategory(value: string): string {
  return value.trim();
}

function normalizeCategoryList(values: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const raw of values) {
    const value = normalizeCategory(raw);
    if (!value || value === DEFAULT_CATEGORY || seen.has(value)) {
      continue;
    }
    seen.add(value);
    cleaned.push(value);
  }

  return [DEFAULT_CATEGORY, ...cleaned];
}

function copyTextLegacy(value: string): boolean {
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
  return copied;
}

async function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (!copyTextLegacy(value)) {
    throw new Error("copy failed");
  }
}

export default function App() {
  const [masterPassword, setMasterPassword] = useState("");
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [records, setRecords] = useState<EntryRecord[]>([]);
  const [entries, setEntries] = useState<DecryptedEntry[]>([]);
  const [categories, setCategories] = useState<string[]>([DEFAULT_CATEGORY]);
  const [newCategoryName, setNewCategoryName] = useState("");
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
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const entryListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadRecords();
    const stored = localStorage.getItem(CATEGORY_STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed)) {
        const normalized = normalizeCategoryList(parsed.filter((item): item is string => typeof item === "string"));
        setCategories(normalized);
      }
    } catch {
      setCategories([DEFAULT_CATEGORY]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(categories));
  }, [categories]);

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
    const timer = window.setTimeout(() => setSuccessMessage(""), 2200);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    if (!copiedId) {
      return;
    }
    const timer = window.setTimeout(() => setCopiedId(null), 1200);
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

  useEffect(() => {
    setCurrentPage(1);
  }, [search, pageSize]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return entries;
    }

    return entries.filter((entry) =>
      [entry.siteName, entry.username, entry.account, entry.remark, entry.category]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [entries, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setCurrentPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const pagedEntries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  useEffect(() => {
    if (!entryListRef.current) {
      return;
    }

    entryListRef.current.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentPage]);

  async function loadRecords() {
    setLoading(true);
    try {
      const data = await fetchEntries();
      setRecords(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载条目失败。");
    } finally {
      setLoading(false);
    }
  }

  async function decryptAll(source: EntryRecord[], cryptoKey: CryptoKey) {
    const settled = await Promise.allSettled(
      source.map(async (item) => {
        const payload = await decryptJson<DecryptedPayload>(cryptoKey, item.encrypted_blob, item.iv);
        const category = normalizeCategory(payload.category ?? "") || DEFAULT_CATEGORY;

        return {
          id: item.id,
          siteName: item.site_name,
          username: payload.username ?? "",
          account: payload.account ?? payload.email ?? "",
          password: payload.password ?? "",
          remark: payload.remark ?? payload.note ?? "",
          category,
          createdAt: item.created_at,
          updatedAt: item.updated_at
        } satisfies DecryptedEntry;
      })
    );

    const decrypted: DecryptedEntry[] = [];
    const discoveredCategories: string[] = [];
    let failedCount = 0;

    for (const result of settled) {
      if (result.status === "fulfilled") {
        decrypted.push(result.value);
        discoveredCategories.push(result.value.category);
      } else {
        failedCount += 1;
      }
    }

    decrypted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    setEntries(decrypted);
    setCategories((current) => normalizeCategoryList([...current, ...discoveredCategories]));

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
      setError("无法解密任何条目，请检查主密码或本地 salt。");
      return;
    }

    setError("");
    setWarning(`有 ${failedCount} 条数据解密失败，已自动跳过。`);
  }

  async function handleUnlock() {
    if (!masterPassword.trim()) {
      setError("请先输入主密码。");
      return;
    }

    setUnlocking(true);
    try {
      const derived = await deriveKey(masterPassword);
      setKey(derived);
      setError("");
      setWarning("");
      setSuccessMessage("已成功解锁保险箱。");
    } catch {
      setError("解锁失败，请重试。");
    } finally {
      setUnlocking(false);
    }
  }

  function addCategory(rawName: string): string | null {
    const name = normalizeCategory(rawName);
    if (!name) {
      return null;
    }

    setCategories((current) => {
      if (current.includes(name)) {
        return current;
      }
      return normalizeCategoryList([...current, name]);
    });

    return name;
  }

  function handleCreateCategory() {
    const created = addCategory(newCategoryName);
    if (!created) {
      setError("分类名称不能为空。");
      return;
    }

    setForm((current) => ({ ...current, category: created }));
    setNewCategoryName("");
    setError("");
    setSuccessMessage(`分类「${created}」已保存。`);
  }

  async function handleSubmit() {
    if (!key) {
      setError("请先解锁后再保存条目。");
      return;
    }

    const siteName = form.siteName.trim();
    if (!siteName) {
      setError("网站名称不能为空。");
      return;
    }

    const category = normalizeCategory(form.category) || DEFAULT_CATEGORY;
    addCategory(category);

    try {
      const id = editingId ?? generateId();
      const encrypted = await encryptJson(key, {
        username: form.username.trim(),
        account: form.account.trim(),
        password: form.password,
        remark: form.remark.trim(),
        category
      });

      if (editingId) {
        await updateEntry(id, {
          site_name: siteName,
          encrypted_blob: encrypted.ciphertext,
          iv: encrypted.iv
        });
        setSuccessMessage("条目已更新。");
      } else {
        await createEntry({
          id,
          site_name: siteName,
          encrypted_blob: encrypted.ciphertext,
          iv: encrypted.iv
        });
        setSuccessMessage("条目已添加。");
      }

      setForm(emptyForm);
      setEditingId(null);
      setSearch("");
      setError("");
      setWarning("");
      await loadRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存条目失败。");
    }
  }

  function startEdit(entry: DecryptedEntry) {
    addCategory(entry.category);
    setEditingId(entry.id);
    setForm({
      siteName: entry.siteName,
      username: entry.username,
      account: entry.account,
      password: entry.password,
      remark: entry.remark,
      category: entry.category
    });
    setSuccessMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm("确认删除这条记录吗？");
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
      setSuccessMessage("条目已删除。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除条目失败。");
    }
  }

  async function handleCopy(password: string, id: string) {
    if (!password) {
      setError("该条目没有可复制的密码。");
      return;
    }

    try {
      await copyTextToClipboard(password);
      setCopiedId(id);
      setError("");
      setSuccessMessage("密码已复制。");
    } catch {
      setError("复制失败，请检查浏览器剪贴板权限。");
    }
  }

  const savedPasswords = entries.filter((entry) => entry.password.trim()).length;
  const pageStart = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, filtered.length);

  return (
    <div className="app-shell">
      <div className="bg-shape bg-shape-a" />
      <div className="bg-shape bg-shape-b" />
      <div className="bg-shape bg-shape-c" />

      <div className="layout">
        <header className="card hero">
          <div className="hero-copy">
            <span className="tag">浏览器端加密密码保险箱</span>
            <h1>个人密码管理器</h1>
            <p>默认掩码显示密码，支持一键显隐与复制。分类可自定义并本地持久保存，下次打开继续可用。</p>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <span>总条目</span>
              <strong>{entries.length}</strong>
            </div>
            <div className="stat-card">
              <span>已保存密码</span>
              <strong>{savedPasswords}</strong>
            </div>
          </div>
        </header>

        <section className="card unlock-card">
          <div>
            <h2>解锁保险箱</h2>
            <p>主密码仅在本地用于加解密，不会明文上传。</p>
          </div>
          <div className="unlock-actions">
            <input
              type="password"
              placeholder="输入主密码"
              value={masterPassword}
              onChange={(event) => setMasterPassword(event.target.value)}
            />
            <button className="primary-button" onClick={() => void handleUnlock()} disabled={unlocking}>
              {unlocking ? "解锁中..." : "解锁"}
            </button>
          </div>
        </section>

        <section className="dashboard">
          <aside className="card form-card">
            <div className="section-head">
              <div>
                <span className="section-tag">编辑区</span>
                <h2>{editingId ? "编辑条目" : "新增条目"}</h2>
              </div>
              {editingId && <span className="pill">编辑中</span>}
            </div>

            <div className="form-grid">
              <label className="field">
                <span>网站名称</span>
                <input
                  placeholder="例如：GitHub"
                  value={form.siteName}
                  onChange={(event) => setForm({ ...form, siteName: event.target.value })}
                />
              </label>

              <label className="field">
                <span>用户名</span>
                <input
                  placeholder="例如：coder_neo"
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                />
              </label>

              <label className="field">
                <span>账号</span>
                <input
                  placeholder="手机号 / 邮箱 / 工号"
                  value={form.account}
                  onChange={(event) => setForm({ ...form, account: event.target.value })}
                />
              </label>

              <label className="field">
                <span>密码</span>
                <input
                  type="password"
                  placeholder="输入登录密码"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </label>

              <label className="field">
                <span>分类</span>
                <select
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value || DEFAULT_CATEGORY })}
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>新建分类</span>
                <div className="inline-row">
                  <input
                    placeholder="输入新分类名称"
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                  />
                  <button className="secondary-button compact-button" onClick={handleCreateCategory}>
                    保存分类
                  </button>
                </div>
              </label>

              <label className="field field-wide">
                <span>备注</span>
                <textarea
                  placeholder="可填写找回信息、地区限制等"
                  value={form.remark}
                  onChange={(event) => setForm({ ...form, remark: event.target.value })}
                  rows={4}
                />
              </label>
            </div>

            <div className="form-actions">
              <button className="primary-button" onClick={() => void handleSubmit()} disabled={loading}>
                {editingId ? "保存修改" : "添加条目"}
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                清空表单
              </button>
            </div>
          </aside>

          <main className="card list-card">
            <div className="section-head list-head">
              <div>
                <span className="section-tag">密码列表</span>
                <h2>我的条目</h2>
              </div>

              <div className="badge-row">
                <span className="pill">共 {filtered.length} 条</span>
                <span className="pill">默认密码掩码</span>
              </div>
            </div>

            <div className="toolbar">
              <input
                className="search-input"
                placeholder="搜索网站 / 用户名 / 账号 / 分类 / 备注"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />

              <div className="page-size-wrap">
                <span>每页</span>
                <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <span>条</span>
              </div>
            </div>

            {!key && records.length > 0 && <p className="status-text">请先解锁，才能查看已保存条目。</p>}
            {loading && <p className="status-text">正在加载条目...</p>}
            {error && <p className="status-text status-error">{error}</p>}
            {warning && <p className="status-text status-warning">{warning}</p>}
            {successMessage && <p className="status-text status-success">{successMessage}</p>}

            <div ref={entryListRef} className="entry-list">
              {!loading && filtered.length === 0 && (
                <div className="empty-state">
                  <h3>还没有条目</h3>
                  <p>先在左侧新增一条记录，这里会自动显示。</p>
                </div>
              )}

              {pagedEntries.map((entry, index) => {
                const isVisible = Boolean(visiblePasswords[entry.id]);
                const globalIndex = (currentPage - 1) * pageSize + index + 1;

                return (
                  <article
                    key={entry.id}
                    className="entry-card"
                    style={{ animationDelay: `${Math.min(index * 60, 360)}ms` }}
                  >
                    <div className="entry-title-row">
                      <div>
                        <h3>{entry.siteName}</h3>
                        <p className="entry-meta">更新于 {formatTimestamp(entry.updatedAt)}</p>
                      </div>
                      <div className="entry-head-right">
                        <span className="category-pill">{entry.category}</span>
                        <span className="entry-index">#{globalIndex}</span>
                      </div>
                    </div>

                    <div className="entry-grid">
                      <div className="chip">
                        <span>用户名</span>
                        <strong>{entry.username || "-"}</strong>
                      </div>

                      <div className="chip">
                        <span>账号</span>
                        <strong>{entry.account || "-"}</strong>
                      </div>

                      <div className="chip chip-wide">
                        <span>密码</span>
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
                              title={isVisible ? "隐藏密码" : "显示密码"}
                              aria-label={isVisible ? "隐藏密码" : "显示密码"}
                            >
                              <EyeIcon open={isVisible} />
                            </button>

                            <button
                              className="mini-button"
                              onClick={() => void handleCopy(entry.password, entry.id)}
                              disabled={!entry.password}
                              title="复制密码"
                            >
                              <CopyIcon />
                              <span>{copiedId === entry.id ? "已复制" : "复制"}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="chip chip-wide">
                        <span>备注</span>
                        <strong>{entry.remark || "-"}</strong>
                      </div>
                    </div>

                    <div className="entry-actions">
                      <button className="secondary-button" onClick={() => startEdit(entry)}>
                        编辑
                      </button>
                      <button className="danger-button" onClick={() => void handleDelete(entry.id)}>
                        删除
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="pagination-row">
              <p className="page-summary">
                显示 {pageStart}-{pageEnd} 条，共 {filtered.length} 条
              </p>
              <div className="pagination-actions">
                <button
                  className="secondary-button compact-button"
                  onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage <= 1}
                >
                  上一页
                </button>
                <span className="page-indicator">
                  第 {currentPage} / {totalPages} 页
                </span>
                <button
                  className="secondary-button compact-button"
                  onClick={() => setCurrentPage((current) => Math.min(totalPages, current + 1))}
                  disabled={currentPage >= totalPages}
                >
                  下一页
                </button>
              </div>
            </div>
          </main>
        </section>
      </div>
    </div>
  );
}
