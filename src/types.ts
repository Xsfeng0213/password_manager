export type DecryptedEntry = {
  id: string;
  siteName: string;
  username: string;
  account: string;
  password: string;
  remark: string;
  category: string;
  createdAt: string;
  updatedAt: string;
};

export type EntryRecord = {
  id: string;
  site_name: string;
  encrypted_blob: string;
  iv: string;
  created_at: string;
  updated_at: string;
};
