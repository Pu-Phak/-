export type FileCategory = 'all' | 'image' | 'video' | 'audio' | 'document' | 'archive' | 'code' | 'other';

export interface SharedFile {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  category: 'image' | 'video' | 'audio' | 'document' | 'archive' | 'code' | 'other';
  size: number;
  uploadedAt: string;
  uploaderName: string;
  downloadCount: number;
  webViewLink?: string;
  ownerEmail?: string;
}

export interface UploadItem {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  errorMessage?: string;
  speed?: string;
}

export type SortField = 'date' | 'size' | 'name' | 'downloads';
export type SortDirection = 'asc' | 'desc';
export type ViewMode = 'grid' | 'table';
export type AppPage = 'dropzone' | 'inspect' | 'remote' | 'notes';

export interface SharedNote {
  id: string;
  driveFileId?: string;
  title: string;
  content: string;
  author: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  ownerEmail?: string;
}

export interface GoogleAuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
}

export interface DriveQuotaInfo {
  usageInDrive: number;
  usage: number;
  limit: number | null;
}

export type RemoteRole = 'host' | 'viewer' | null;

export type RemoteConnectionStatus =
  | 'idle'
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export type RemoteInputEvent =
  | { type: 'mousemove'; x: number; y: number }
  | { type: 'mousedown'; x: number; y: number; button: number }
  | { type: 'mouseup'; x: number; y: number; button: number }
  | { type: 'dblclick'; x: number; y: number; button: number }
  | { type: 'wheel'; x: number; y: number; deltaX: number; deltaY: number }
  | {
      type: 'keydown' | 'keyup';
      key: string;
      code: string;
      vk: number;
      text?: string;
      ctrlKey?: boolean;
      shiftKey?: boolean;
      altKey?: boolean;
      metaKey?: boolean;
    }
  | { type: 'text'; text: string }
  | { type: 'clipboard'; text: string }
  | { type: 'shortcut'; keys: number[] }
  | { type: 'workspace'; content: string };

export interface RemoteTelemetry {
  fps: number;
  rttMs: number;
  bitrateKbps: number;
  resolution: string;
  transportMode: 'p2p-datachannel' | 'ws-relay' | 'connecting';
}

export interface DiscoveredPeer {
  id: string;
  deviceName: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  osLabel: string;
  browserLabel: string;
  networkMatch: 'same-network' | 'online';
  networkLabel: string;
  hostingRoomCode: string | null;
  connectedAt: string;
}



