
const DB_NAME = 'BPC_Sampler_DB';
const STORE_NAME = 'samples';

export interface StoredSample {
  id: string;
  name: string;
  data: ArrayBuffer;
  start: number;
  end: number;
  createdAt?: number; // Timestamp for sorting (optional for backward compatibility)
}

export async function initDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSample(id: string, name: string, data: ArrayBuffer, start: number, end: number, createdAt?: number) {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // If createdAt is provided, use it. Otherwise, check if sample exists to preserve its timestamp
    if (createdAt !== undefined) {
      store.put({ id, name, data, start, end, createdAt });
    } else {
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const existing = getRequest.result as StoredSample | undefined;
        const timestamp = existing?.createdAt ?? Date.now();
        store.put({ id, name, data, start, end, createdAt: timestamp });
      };
      getRequest.onerror = () => reject(getRequest.error);
    }
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getAllSamples(): Promise<StoredSample[]> {
  const db = await initDB();
  
  // Get all samples - create a map to track which need timestamps
  const samples = await new Promise<StoredSample[]>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as StoredSample[]);
    request.onerror = () => reject(request.error);
  });
  
  // Find samples without createdAt - these need timestamps assigned
  const samplesWithoutTimestamp = samples.filter(s => !s.createdAt);
  
  if (samplesWithoutTimestamp.length > 0) {
    // Since user reports seeing "oldest to newest" on first load,
    // IndexedDB is returning them in insertion order (oldest first).
    // We want to reverse this: the LAST sample in the array (newest) should get the highest timestamp.
    // So we reverse the array before assigning timestamps.
    const reversed = [...samplesWithoutTimestamp].reverse();
    
    const baseTime = Date.now();
    const length = reversed.length;
    
    // First, assign timestamps to the in-memory objects
    reversed.forEach((sample, index) => {
      // Index 0 in reversed array (newest) gets baseTime
      // Index length-1 in reversed array (oldest) gets baseTime - (length - 1)
      const createdAt = baseTime - index;
      
      // Update the sample object in the main samples array
      const sampleInMain = samples.find(s => s.id === sample.id);
      if (sampleInMain) {
        sampleInMain.createdAt = createdAt;
      }
    });
    
    // Then update in database (async, but we don't need to wait for this to sort)
    const updatePromises = reversed.map((sample, index) => {
      const createdAt = baseTime - index;
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const sampleToSave = { ...sample, createdAt };
        const putRequest = store.put(sampleToSave);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
        transaction.onerror = () => reject(transaction.error);
      });
    });
    // Don't await - we've already updated the in-memory objects, so we can sort immediately
    Promise.all(updatePromises).catch(err => console.error('Failed to update timestamps in DB:', err));
  }
  
  // Sort by createdAt descending (newest first)
  samples.sort((a, b) => {
    const aTime = a.createdAt ?? 0;
    const bTime = b.createdAt ?? 0;
    return bTime - aTime; // Descending order (newest first)
  });
  
  return samples;
}

export async function deleteSampleFromDB(id: string) {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function clearAllSamples() {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
