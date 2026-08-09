const DB_NAME = "chat_uploads_v1";
const DB_VERSION = 1;
const STORE_NAME = "uploads";
const CURRENT_UPLOAD_KEY = "current";

export interface StoredUploadMetadata {
  name: string;
  type: string;
  size: number;
  lastModified: number;
  columns: string[];
}

interface StoredUploadRecord extends StoredUploadMetadata {
  key: typeof CURRENT_UPLOAD_KEY;
  blob: Blob;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this browser."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the browser upload store."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Browser upload storage was aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Browser upload storage failed."));
  });
}

export async function saveStoredUpload(file: File, columns: string[]): Promise<StoredUploadMetadata> {
  const db = await openDatabase();
  try {
    const metadata: StoredUploadMetadata = {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
      columns: [...columns],
    };
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({
      key: CURRENT_UPLOAD_KEY,
      blob: file,
      ...metadata,
    } satisfies StoredUploadRecord);
    await transactionDone(transaction);
    return metadata;
  } finally {
    db.close();
  }
}

export async function getStoredUpload(): Promise<{ file: File; metadata: StoredUploadMetadata } | null> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const done = transactionDone(transaction);
    const request = transaction.objectStore(STORE_NAME).get(CURRENT_UPLOAD_KEY);
    const record = await new Promise<StoredUploadRecord | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredUploadRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error("Could not read the saved dataset."));
    });
    await done;
    if (!record?.blob) return null;

    const metadata: StoredUploadMetadata = {
      name: record.name,
      type: record.type,
      size: record.size,
      lastModified: record.lastModified,
      columns: Array.isArray(record.columns) ? [...record.columns] : [],
    };
    return {
      file: new File([record.blob], record.name, {
        type: record.type || record.blob.type,
        lastModified: record.lastModified || Date.now(),
      }),
      metadata,
    };
  } finally {
    db.close();
  }
}

export async function clearStoredUpload(): Promise<void> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(CURRENT_UPLOAD_KEY);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}
