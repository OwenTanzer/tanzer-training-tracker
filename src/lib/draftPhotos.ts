// Photos are immutable. A small reference in the draft identifies one selection.
let opening: Promise<IDBDatabase> | undefined;
function database() {
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ttt-draft-photos', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('photos');
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch(error => { opening = undefined; throw error; });
  }
  return opening;
}
async function mutate(key: string, file?: File) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    const photos = tx.objectStore('photos');
    if (file) photos.put(file, key); else photos.delete(key);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
export const storeDraftPhoto = (key: string, file: File) => mutate(key, file);
export const forgetDraftPhoto = (key: string) => mutate(key).catch(() => {});
export async function loadDraftPhoto(key: string): Promise<File> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const read = db.transaction('photos').objectStore('photos').get(key);
    read.onsuccess = () => read.result instanceof File ? resolve(read.result) : reject(new Error('Missing draft photo'));
    read.onerror = () => reject(read.error);
  });
}
