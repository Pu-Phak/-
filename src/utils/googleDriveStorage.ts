import { DriveQuotaInfo, SharedFile, SharedNote } from '../types';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

export class DriveAuthError extends Error {
  constructor(message = 'Google Drive access token expired or missing') {
    super(message);
    this.name = 'DriveAuthError';
  }
}

interface WorkspaceFolders {
  rootId: string;
  filesId: string;
  notesId: string;
}

// Strictly in-memory session caches per signed-in email
const folderCacheByEmail = new Map<string, WorkspaceFolders>();
const pendingFolderPromiseByEmail = new Map<string, Promise<WorkspaceFolders>>();
const blobUrlCache = new Map<string, string>();

export function resetDriveSessionCache() {
  folderCacheByEmail.clear();
  pendingFolderPromiseByEmail.clear();
  for (const url of blobUrlCache.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore cleanup failures
    }
  }
  blobUrlCache.clear();
}

function getFileCategory(mimeType: string, originalName: string): SharedFile['category'] {
  const mime = (mimeType || '').toLowerCase();
  const ext = originalName.split('.').pop()?.toLowerCase() || '';

  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
    return 'image';
  }
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
    return 'video';
  }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)) {
    return 'audio';
  }
  if (
    mime.includes('pdf') ||
    mime.includes('word') ||
    mime.includes('document') ||
    mime.includes('presentation') ||
    mime.includes('spreadsheet') ||
    ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'md', 'csv', 'rtf'].includes(ext)
  ) {
    return 'document';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext) || mime.includes('zip') || mime.includes('compressed')) {
    return 'archive';
  }
  if (
    ['js', 'ts', 'tsx', 'jsx', 'py', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'sql', 'sh', 'go', 'rs', 'java', 'c', 'cpp'].includes(ext) ||
    mime.includes('javascript') ||
    mime.includes('json')
  ) {
    return 'code';
  }
  return 'other';
}

function escapeQueryValue(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function driveFetch(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  if (!token) throw new DriveAuthError();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    throw new DriveAuthError('โทเค็น Google Drive หมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Google Drive API error (${res.status}): ${errBody || res.statusText}`);
  }
  return res;
}

async function findFolderByAppProperty(
  token: string,
  propKey: string,
  propValue: string,
  parentId?: string
): Promise<string | null> {
  const parts = [
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
    `appProperties has { key='${escapeQueryValue(propKey)}' and value='${escapeQueryValue(propValue)}' }`,
  ];
  if (parentId) {
    parts.push(`'${escapeQueryValue(parentId)}' in parents`);
  }

  const params = new URLSearchParams({
    q: parts.join(' and '),
    fields: 'files(id,name)',
    pageSize: '5',
    spaces: 'drive',
  });

  const res = await driveFetch(`${DRIVE_API_BASE}/files?${params.toString()}`, token);
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(
  token: string,
  name: string,
  appProperties: Record<string, string>,
  parentId?: string
): Promise<string> {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    appProperties,
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const res = await driveFetch(`${DRIVE_API_BASE}/files?fields=id`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  });
  const data = await res.json();
  return data.id as string;
}

export async function ensureWorkspaceFolders(token: string, email: string): Promise<WorkspaceFolders> {
  const normalizedEmail = email.trim().toLowerCase() || 'default';
  const cached = folderCacheByEmail.get(normalizedEmail);
  if (cached) return cached;

  const inflight = pendingFolderPromiseByEmail.get(normalizedEmail);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      let rootId = await findFolderByAppProperty(token, 'shareddropRoot', 'true');
      if (!rootId) {
        rootId = await createFolder(token, 'SharedDrop Workspace', {
          shareddropRoot: 'true',
          ownerEmail: normalizedEmail,
        });
      }

      let filesId = await findFolderByAppProperty(token, 'shareddropFiles', 'true', rootId);
      if (!filesId) {
        filesId = await createFolder(
          token,
          'Files',
          {
            shareddropFiles: 'true',
            ownerEmail: normalizedEmail,
          },
          rootId
        );
      }

      let notesId = await findFolderByAppProperty(token, 'shareddropNotes', 'true', rootId);
      if (!notesId) {
        notesId = await createFolder(
          token,
          'Notes',
          {
            shareddropNotes: 'true',
            ownerEmail: normalizedEmail,
          },
          rootId
        );
      }

      const folders = { rootId, filesId, notesId };
      folderCacheByEmail.set(normalizedEmail, folders);
      return folders;
    } finally {
      pendingFolderPromiseByEmail.delete(normalizedEmail);
    }
  })();

  pendingFolderPromiseByEmail.set(normalizedEmail, promise);
  return promise;
}

export async function fetchDriveQuota(token: string): Promise<DriveQuotaInfo> {
  const res = await driveFetch(`${DRIVE_API_BASE}/about?fields=storageQuota`, token);
  const data = await res.json();
  const q = data.storageQuota || {};
  return {
    usageInDrive: Number(q.usageInDrive || 0),
    usage: Number(q.usage || 0),
    limit: q.limit ? Number(q.limit) : null,
  };
}

interface DriveFileResource {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  appProperties?: Record<string, string>;
}

export async function listDriveFiles(token: string, email: string): Promise<SharedFile[]> {
  const { filesId } = await ensureWorkspaceFolders(token, email);
  const params = new URLSearchParams({
    q: `trashed = false and '${escapeQueryValue(filesId)}' in parents and mimeType != 'application/vnd.google-apps.folder'`,
    fields: 'files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,appProperties)',
    orderBy: 'createdTime desc',
    pageSize: '200',
    spaces: 'drive',
  });

  const res = await driveFetch(`${DRIVE_API_BASE}/files?${params.toString()}`, token);
  const data = await res.json();
  const rawFiles: DriveFileResource[] = data.files || [];

  return rawFiles.map((f) => ({
    id: f.id,
    originalName: f.name,
    storedName: f.id,
    mimeType: f.mimeType || 'application/octet-stream',
    category: getFileCategory(f.mimeType || '', f.name),
    size: Number(f.size || 0),
    uploadedAt: f.createdTime || new Date().toISOString(),
    uploaderName: f.appProperties?.uploaderName || email,
    downloadCount: Number(f.appProperties?.downloadCount || 0),
    webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
    ownerEmail: f.appProperties?.ownerEmail || email,
  }));
}

export async function uploadFileToDrive(
  token: string,
  email: string,
  file: File,
  uploaderName: string,
  onProgress: (percent: number) => void
): Promise<SharedFile> {
  if (!token) throw new DriveAuthError();
  const { filesId } = await ensureWorkspaceFolders(token, email);

  const mimeType = file.type || 'application/octet-stream';
  const metadata = {
    name: file.name,
    mimeType,
    parents: [filesId],
    appProperties: {
      shareddropType: 'file',
      ownerEmail: email.toLowerCase(),
      uploaderName: (uploaderName || email).slice(0, 100),
      downloadCount: '0',
    },
  };

  // Step 1: Start resumable upload session
  const initRes = await driveFetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=resumable&fields=id,name,mimeType,size,createdTime,webViewLink,appProperties`,
    token,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify(metadata),
    }
  );

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('ไม่สามารถสร้างเซสชันอัปโหลด Google Drive ได้');
  }

  // Step 2: Upload binary file with live XHR progress tracking
  const uploadedResource = await new Promise<DriveFileResource>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', mimeType);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress((e.loaded / e.total) * 100);
      }
    };

    xhr.onload = () => {
      if (xhr.status === 401) {
        reject(new DriveAuthError());
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          onProgress(100);
          resolve(JSON.parse(xhr.responseText) as DriveFileResource);
        } catch {
          reject(new Error('Invalid Drive upload response'));
        }
      } else {
        reject(new Error(`Google Drive upload error (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error while uploading to Google Drive'));
    xhr.send(file);
  });

  return {
    id: uploadedResource.id,
    originalName: uploadedResource.name,
    storedName: uploadedResource.id,
    mimeType: uploadedResource.mimeType || mimeType,
    category: getFileCategory(uploadedResource.mimeType || mimeType, uploadedResource.name),
    size: Number(uploadedResource.size || file.size),
    uploadedAt: uploadedResource.createdTime || new Date().toISOString(),
    uploaderName: uploadedResource.appProperties?.uploaderName || uploaderName || email,
    downloadCount: 0,
    webViewLink: uploadedResource.webViewLink || `https://drive.google.com/file/d/${uploadedResource.id}/view`,
    ownerEmail: email,
  };
}

export async function fetchDriveFileBlob(token: string, fileId: string): Promise<Blob> {
  const res = await driveFetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`, token);
  return await res.blob();
}

export async function getDriveFileBlobUrl(token: string, fileId: string): Promise<string> {
  const cached = blobUrlCache.get(fileId);
  if (cached) return cached;

  const blob = await fetchDriveFileBlob(token, fileId);
  const url = URL.createObjectURL(blob);
  blobUrlCache.set(fileId, url);
  return url;
}

export async function fetchDriveFileText(token: string, fileId: string): Promise<string> {
  const res = await driveFetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`, token);
  return await res.text();
}

export async function deleteDriveFile(token: string, fileId: string): Promise<void> {
  await driveFetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, token, {
    method: 'DELETE',
  });
  const cachedUrl = blobUrlCache.get(fileId);
  if (cachedUrl) {
    URL.revokeObjectURL(cachedUrl);
    blobUrlCache.delete(fileId);
  }
}

// ============================================================================
// PER-EMAIL GOOGLE DRIVE NOTES STORAGE (SharedDrop Workspace/Notes/*.json)
// ============================================================================

async function uploadJsonToDriveFolder(
  token: string,
  folderId: string,
  fileName: string,
  jsonContent: string,
  appProperties: Record<string, string>
): Promise<DriveFileResource> {
  const boundary = `shareddrop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    parents: [folderId],
    appProperties,
  };

  const multipartBody = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    jsonContent,
    `--${boundary}--`,
  ].join('\r\n');

  const res = await driveFetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,createdTime,modifiedTime,appProperties`,
    token,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );
  return (await res.json()) as DriveFileResource;
}

export async function listDriveNotes(token: string, email: string): Promise<SharedNote[]> {
  const { notesId } = await ensureWorkspaceFolders(token, email);
  const params = new URLSearchParams({
    q: `trashed = false and '${escapeQueryValue(notesId)}' in parents and mimeType != 'application/vnd.google-apps.folder'`,
    fields: 'files(id,name,createdTime,modifiedTime,appProperties)',
    orderBy: 'modifiedTime desc',
    pageSize: '200',
    spaces: 'drive',
  });

  const res = await driveFetch(`${DRIVE_API_BASE}/files?${params.toString()}`, token);
  const data = await res.json();
  const noteFiles: DriveFileResource[] = data.files || [];

  const loadedNotes = await Promise.all(
    noteFiles.map(async (nf) => {
      try {
        const text = await fetchDriveFileText(token, nf.id);
        const parsed = JSON.parse(text) as SharedNote;
        return {
          ...parsed,
          driveFileId: nf.id,
          ownerEmail: parsed.ownerEmail || email,
        } as SharedNote;
      } catch {
        return null;
      }
    })
  );

  const valid = loadedNotes.filter((n): n is SharedNote => n !== null);
  valid.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  return valid;
}

export async function createDriveNote(
  token: string,
  email: string,
  payload: { title: string; content: string; author: string; isPinned: boolean }
): Promise<SharedNote> {
  const { notesId } = await ensureWorkspaceFolders(token, email);
  const now = new Date().toISOString();
  const noteId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const note: SharedNote = {
    id: noteId,
    title: payload.title.trim(),
    content: payload.content,
    author: payload.author.trim() || email,
    isPinned: Boolean(payload.isPinned),
    createdAt: now,
    updatedAt: now,
    ownerEmail: email,
  };

  const created = await uploadJsonToDriveFolder(
    token,
    notesId,
    `note-${noteId}.json`,
    JSON.stringify(note, null, 2),
    {
      shareddropType: 'note',
      noteId,
      ownerEmail: email.toLowerCase(),
    }
  );

  return {
    ...note,
    driveFileId: created.id,
  };
}

export async function updateDriveNote(
  token: string,
  note: SharedNote,
  updates: Partial<Pick<SharedNote, 'title' | 'content' | 'isPinned'>>
): Promise<SharedNote> {
  const fileId = note.driveFileId;
  if (!fileId) {
    throw new Error('ไม่พบรหัสไฟล์บน Google Drive สำหรับข้อความนี้');
  }

  const updatedNote: SharedNote = {
    ...note,
    title: updates.title !== undefined ? updates.title.trim() : note.title,
    content: updates.content !== undefined ? updates.content : note.content,
    isPinned: updates.isPinned !== undefined ? updates.isPinned : note.isPinned,
    updatedAt: new Date().toISOString(),
  };

  await driveFetch(`${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?uploadType=media`, token, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(updatedNote, null, 2),
  });

  return updatedNote;
}

export async function deleteDriveNote(token: string, driveFileId: string): Promise<void> {
  await driveFetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(driveFileId)}`, token, {
    method: 'DELETE',
  });
}
