export type DecryptedEntry = {
  id: string;
  siteName: string;
  username: string;
  email: string;
  password: string;
  note: string;
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
