import express from 'express';
import { createServer as createViteServer } from 'vite';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

// Ensure uploads directory exists
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');
const METADATA_FILE = path.join(UPLOADS_DIR, 'metadata.json');
const NOTES_FILE = path.join(UPLOADS_DIR, 'notes.json');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface SharedFileRecord {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  category: 'image' | 'video' | 'audio' | 'document' | 'archive' | 'code' | 'other';
  size: number;
  uploadedAt: string;
  uploaderName: string;
  downloadCount: number;
}

export interface SharedNoteRecord {
  id: string;
  title: string;
  content: string;
  author: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

function readNotes(): SharedNoteRecord[] {
  try {
    if (!fs.existsSync(NOTES_FILE)) {
      return [];
    }
    const data = fs.readFileSync(NOTES_FILE, 'utf-8');
    const records = JSON.parse(data);
    if (!Array.isArray(records)) return [];
    return sortNotes(records);
  } catch (err) {
    console.error('Error reading notes:', err);
    return [];
  }
}

function writeNotes(records: SharedNoteRecord[]): void {
  try {
    fs.writeFileSync(NOTES_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing notes:', err);
  }
}

function sortNotes(records: SharedNoteRecord[]): SharedNoteRecord[] {
  return [...records].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function getCategory(mimeType: string, filename: string): SharedFileRecord['category'] {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  
  if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
    return 'image';
  }
  if (mimeType.startsWith('video/') || ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'].includes(ext)) {
    return 'video';
  }
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) {
    return 'audio';
  }
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'csv', 'txt', 'rtf'].includes(ext) || mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('spreadsheet') || mimeType.includes('presentation')) {
    return 'document';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
    return 'archive';
  }
  if (['js', 'ts', 'tsx', 'jsx', 'json', 'html', 'css', 'py', 'java', 'c', 'cpp', 'rs', 'go', 'php', 'sql', 'sh', 'md', 'xml', 'yaml', 'yml'].includes(ext)) {
    return 'code';
  }
  return 'other';
}

function readMetadata(): SharedFileRecord[] {
  try {
    if (!fs.existsSync(METADATA_FILE)) {
      return seedDefaultFiles();
    }
    const data = fs.readFileSync(METADATA_FILE, 'utf-8');
    const records = JSON.parse(data);
    if (!Array.isArray(records)) return [];
    return records;
  } catch (err) {
    console.error('Error reading metadata:', err);
    return [];
  }
}

function writeMetadata(records: SharedFileRecord[]): void {
  try {
    fs.writeFileSync(METADATA_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing metadata:', err);
  }
}

// Seed single starter file if completely empty
function seedDefaultFiles(): SharedFileRecord[] {
  const defaultRecords: SharedFileRecord[] = [];

  const welcomeName = 'Welcome.txt';
  const welcomePath = path.join(UPLOADS_DIR, welcomeName);
  const welcomeContent = `Welcome to SharedDrop!

This is a public shared dropzone.
You can drag and drop any file here to share it with everyone.
Anyone who visits can preview and download files instantly.
`;
  fs.writeFileSync(welcomePath, welcomeContent, 'utf-8');
  const stats = fs.statSync(welcomePath);

  defaultRecords.push({
    id: 'welcome-01',
    originalName: 'Welcome.txt',
    storedName: welcomeName,
    mimeType: 'text/plain',
    category: 'document',
    size: stats.size,
    uploadedAt: new Date().toISOString(),
    uploaderName: 'SharedDrop',
    downloadCount: 0,
  });

  writeMetadata(defaultRecords);
  return defaultRecords;
}

async function startServer() {
  const app = express();

  // Basic CORS & JSON parser for small metadata bodies
  app.use(express.json({ limit: '10mb' }));

  // API 1: List all shared files
  app.get('/api/files', (req, res) => {
    const files = readMetadata();
    res.json({ files });
  });

  // API 2: Upload file (Raw binary stream with headers or query params)
  app.post('/api/upload', (req, res) => {
    try {
      const originalNameHeader = req.headers['x-filename'] as string;
      const originalName = originalNameHeader 
        ? decodeURIComponent(originalNameHeader) 
        : (req.query.name as string || 'unnamed_file');

      const mimeTypeHeader = req.headers['x-filetype'] as string;
      const mimeType = mimeTypeHeader || (req.query.type as string) || 'application/octet-stream';

      const uploaderHeader = req.headers['x-uploader'] as string;
      const uploaderName = uploaderHeader
        ? decodeURIComponent(uploaderHeader)
        : (req.query.uploader as string || 'ผู้ใช้นิรนาม');

      const fileId = crypto.randomUUID();
      const safePrefix = Date.now() + '_' + crypto.randomBytes(4).toString('hex');
      const sanitizedName = originalName.replace(/[^a-zA-Z0-9ก-๙._-]/g, '_');
      const storedName = `${safePrefix}_${sanitizedName}`;
      const targetFilePath = path.join(UPLOADS_DIR, storedName);

      const writeStream = fs.createWriteStream(targetFilePath);

      req.pipe(writeStream);

      writeStream.on('finish', () => {
        try {
          const stats = fs.statSync(targetFilePath);
          const category = getCategory(mimeType, originalName);

          const newFile: SharedFileRecord = {
            id: fileId,
            originalName,
            storedName,
            mimeType,
            category,
            size: stats.size,
            uploadedAt: new Date().toISOString(),
            uploaderName: uploaderName.trim() || 'ผู้ใช้นิรนาม',
            downloadCount: 0,
          };

          const files = readMetadata();
          files.unshift(newFile);
          writeMetadata(files);

          res.status(201).json({ success: true, file: newFile });
        } catch (postErr) {
          console.error('Error finalizing upload:', postErr);
          res.status(500).json({ error: 'Failed to record file metadata' });
        }
      });

      writeStream.on('error', (err) => {
        console.error('Write stream error:', err);
        res.status(500).json({ error: 'Failed to save file to disk' });
      });
    } catch (err) {
      console.error('Upload handler error:', err);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  // API 3: Download file
  app.get('/api/download/:id', (req, res) => {
    const { id } = req.params;
    const files = readMetadata();
    const file = files.find(f => f.id === id);

    if (!file) {
      return res.status(404).send('File not found');
    }

    const filePath = path.join(UPLOADS_DIR, file.storedName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Physical file missing on server');
    }

    // Increment download count
    file.downloadCount += 1;
    writeMetadata(files);

    const encodedFilename = encodeURIComponent(file.originalName);
    res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', file.size);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });

  // API 4: Preview file inline (supports video/audio Range seeking and PDF streaming)
  app.get('/api/preview/:id', (req, res) => {
    const { id } = req.params;
    const files = readMetadata();
    const file = files.find(f => f.id === id);

    if (!file) {
      return res.status(404).send('File not found');
    }

    const filePath = path.join(UPLOADS_DIR, file.storedName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File missing on server');
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const encodedFilename = encodeURIComponent(file.originalName);
    res.setHeader('Content-Disposition', `inline; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', chunkSize);
      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');

      const fileStream = fs.createReadStream(filePath, { start, end });
      fileStream.pipe(res);
    } else {
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.setHeader('Accept-Ranges', 'bytes');

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    }
  });

  // API 5: Delete file
  app.delete('/api/files/:id', (req, res) => {
    const { id } = req.params;
    const files = readMetadata();
    const index = files.findIndex(f => f.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = files[index];
    const filePath = path.join(UPLOADS_DIR, file.storedName);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn('Could not delete physical file:', err);
    }

    files.splice(index, 1);
    writeMetadata(files);

    res.json({ success: true, message: 'File deleted' });
  });

  // API 6: Download Local OS Control Bridge for Windows (Zero-dependency PowerShell + Win32 user32.dll)
  app.get('/api/remote-agent/windows-ps1', (req, res) => {
    const ps1Script = `# SharedDrop Local OS Control Agent (Windows Zero-Dependency)
# Runs locally on 127.0.0.1:47821 to bridge WebRTC mouse & keyboard events to Windows OS
$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class NativeInput {
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT {
        public uint type;
        public InputUnion U;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion {
        [FieldOffset(0)] public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    public const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    public const uint MOUSEEVENTF_WHEEL = 0x0800;
    public const uint MOUSEEVENTF_HWHEEL = 0x1000;
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const uint KEYEVENTF_UNICODE = 0x0004;

    public static void SendUnicodeString(string text) {
        if (string.IsNullOrEmpty(text)) return;
        foreach (char c in text) {
            INPUT[] inputs = new INPUT[2];
            inputs[0].type = 1;
            inputs[0].U.ki.wVk = 0;
            inputs[0].U.ki.wScan = (ushort)c;
            inputs[0].U.ki.dwFlags = KEYEVENTF_UNICODE;

            inputs[1].type = 1;
            inputs[1].U.ki.wVk = 0;
            inputs[1].U.ki.wScan = (ushort)c;
            inputs[1].U.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
            SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
        }
    }
}
"@

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 47821)
$listener.Start()
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " SharedDrop Local OS Control Bridge is RUNNING" -ForegroundColor Green
Write-Host " Listening on ws://127.0.0.1:47821 (Localhost Only)" -ForegroundColor Gray
Write-Host " Keep this window open while sharing your screen." -ForegroundColor Yellow
Write-Host " Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

function Read-ExactBytes($stream, [int]$count) {
    $buffer = New-Object byte[] $count
    $read = 0
    while ($read -lt $count) {
        $n = $stream.Read($buffer, $read, $count - $read)
        if ($n -le 0) { return $null }
        $read += $n
    }
    return $buffer
}

function Send-WsText($stream, [string]$text) {
    $payload = [System.Text.Encoding]::UTF8.GetBytes($text)
    $header = New-Object System.Collections.Generic.List[byte]
    $header.Add(0x81)
    if ($payload.Length -lt 126) {
        $header.Add([byte]$payload.Length)
    } else {
        $header.Add(126)
        $header.Add([byte](($payload.Length -shr 8) -band 0xFF))
        $header.Add([byte]($payload.Length -band 0xFF))
    }
    $frame = New-Object byte[] ($header.Count + $payload.Length)
    $header.CopyTo($frame, 0)
    [Array]::Copy($payload, 0, $frame, $header.Count, $payload.Length)
    $stream.Write($frame, 0, $frame.Length)
}

while ($true) {
    $client = $listener.AcceptTcpClient()
    $client.NoDelay = $true
    $stream = $client.GetStream()
    try {
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 4096, $true)
        $headers = @{}
        $requestLine = $reader.ReadLine()
        while ($true) {
            $line = $reader.ReadLine()
            if ([string]::IsNullOrEmpty($line)) { break }
            $parts = $line.Split(':', 2)
            if ($parts.Length -eq 2) { $headers[$parts[0].Trim().ToLower()] = $parts[1].Trim() }
        }
        $wsKey = $headers["sec-websocket-key"]
        if ($wsKey) {
            $sha1 = [System.Security.Cryptography.SHA1]::Create()
            $acceptBytes = $sha1.ComputeHash([System.Text.Encoding]::ASCII.GetBytes($wsKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
            $accept = [Convert]::ToBase64String($acceptBytes)
            $response = "HTTP/1.1 101 Switching Protocols\`r\`nUpgrade: websocket\`r\`nConnection: Upgrade\`r\`nSec-WebSocket-Accept: $accept\`r\`n\`r\`n"
            $respBytes = [System.Text.Encoding]::ASCII.GetBytes($response)
            $stream.Write($respBytes, 0, $respBytes.Length)
            Write-Host "[Connected] Browser host linked to OS Bridge." -ForegroundColor Green
            Send-WsText $stream '{"type":"agent:ready","os":"windows"}'

            while ($client.Connected) {
                $b = Read-ExactBytes $stream 2
                if ($null -eq $b) { break }
                $opcode = $b[0] -band 0x0F
                if ($opcode -eq 8) { break }
                $masked = ($b[1] -band 0x80) -ne 0
                [uint64]$len = $b[1] -band 0x7F
                if ($len -eq 126) {
                    $ext = Read-ExactBytes $stream 2
                    if ($null -eq $ext) { break }
                    $len = ([uint64]$ext[0] -shl 8) -bor [uint64]$ext[1]
                } elseif ($len -eq 127) {
                    $ext = Read-ExactBytes $stream 8
                    if ($null -eq $ext) { break }
                    $len = 0
                    for ($i = 0; $i -lt 8; $i++) { $len = ($len -shl 8) -bor [uint64]$ext[$i] }
                }
                $maskKey = if ($masked) { Read-ExactBytes $stream 4 } else { $null }
                $payload = if ($len -gt 0) { Read-ExactBytes $stream ([int]$len) } else { [byte[]]@() }
                if ($null -eq $payload) { break }
                if ($masked -and $maskKey) {
                    for ($i = 0; $i -lt $payload.Length; $i++) { $payload[$i] = $payload[$i] -bxor $maskKey[$i % 4] }
                }
                if ($opcode -eq 9) {
                    $pong = New-Object byte[] (2 + $payload.Length)
                    $pong[0] = 0x8A; $pong[1] = [byte]$payload.Length
                    if ($payload.Length -gt 0) { [Array]::Copy($payload, 0, $pong, 2, $payload.Length) }
                    $stream.Write($pong, 0, $pong.Length)
                    continue
                }
                if ($opcode -eq 1) {
                    $jsonStr = [System.Text.Encoding]::UTF8.GetString($payload)
                    try {
                        $evt = $jsonStr | ConvertFrom-Json
                        $sw = [NativeInput]::GetSystemMetrics(0)
                        $sh = [NativeInput]::GetSystemMetrics(1)
                        switch ($evt.type) {
                            "mousemove" {
                                $px = [int][Math]::Round([Math]::Max(0, [Math]::Min(1, [double]$evt.x)) * ($sw - 1))
                                $py = [int][Math]::Round([Math]::Max(0, [Math]::Min(1, [double]$evt.y)) * ($sh - 1))
                                [NativeInput]::SetCursorPos($px, $py) | Out-Null
                            }
                            "mousedown" {
                                $px = [int][Math]::Round([Math]::Max(0, [Math]::Min(1, [double]$evt.x)) * ($sw - 1))
                                $py = [int][Math]::Round([Math]::Max(0, [Math]::Min(1, [double]$evt.y)) * ($sh - 1))
                                [NativeInput]::SetCursorPos($px, $py) | Out-Null
                                if ($evt.button -eq 2) { [NativeInput]::mouse_event([NativeInput]::MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, [UIntPtr]::Zero) }
                                elseif ($evt.button -eq 1) { [NativeInput]::mouse_event([NativeInput]::MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, [UIntPtr]::Zero) }
                                else { [NativeInput]::mouse_event([NativeInput]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero) }
                            }
                            "mouseup" {
                                $px = [int][Math]::Round([Math]::Max(0, [Math]::Min(1, [double]$evt.x)) * ($sw - 1))
                                $py = [int][Math]::Round([Math]::Max(0, [Math]::Min(1, [double]$evt.y)) * ($sh - 1))
                                [NativeInput]::SetCursorPos($px, $py) | Out-Null
                                if ($evt.button -eq 2) { [NativeInput]::mouse_event([NativeInput]::MOUSEEVENTF_RIGHTUP, 0, 0, 0, [UIntPtr]::Zero) }
                                elseif ($evt.button -eq 1) { [NativeInput]::mouse_event([NativeInput]::MOUSEEVENTF_MIDDLEUP, 0, 0, 0, [UIntPtr]::Zero) }
                                else { [NativeInput]::mouse_event([NativeInput]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero) }
                            }
                            "wheel" {
                                if ($evt.deltaY -ne 0) {
                                    $wheelDelta = [int]([Math]::Sign(-[double]$evt.deltaY) * 120)
                                    [NativeInput]::mouse_event([NativeInput]::MOUSEEVENTF_WHEEL, 0, 0, $wheelDelta, [UIntPtr]::Zero)
                                }
                                if ($evt.deltaX -ne 0) {
                                    $hWheelDelta = [int]([Math]::Sign([double]$evt.deltaX) * 120)
                                    [NativeInput]::mouse_event([NativeInput]::MOUSEEVENTF_HWHEEL, 0, 0, $hWheelDelta, [UIntPtr]::Zero)
                                }
                            }
                            "keydown" {
                                if ($evt.vk -and [int]$evt.vk -gt 0) {
                                    [NativeInput]::keybd_event([byte][int]$evt.vk, 0, 0, [UIntPtr]::Zero)
                                } elseif ($evt.text) {
                                    [NativeInput]::SendUnicodeString([string]$evt.text)
                                }
                            }
                            "keyup" {
                                if ($evt.vk -and [int]$evt.vk -gt 0) {
                                    [NativeInput]::keybd_event([byte][int]$evt.vk, 0, [NativeInput]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)
                                }
                            }
                            "text" {
                                if ($evt.text) { [NativeInput]::SendUnicodeString([string]$evt.text) }
                            }
                        }
                    } catch { }
                }
            }
        }
    } catch {
        Write-Host "[Disconnected] Browser session closed." -ForegroundColor DarkGray
    } finally {
        $client.Close()
    }
}
`;
    res.setHeader('Content-Disposition', 'attachment; filename="SharedDrop-OS-Agent.ps1"');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(ps1Script);
  });

  app.get('/api/remote-agent/windows-bat', (req, res) => {
    const hostOrigin = `${req.protocol}://${req.get('host')}`;
    const batScript = `@echo off
title SharedDrop OS Control Bridge
echo Downloading and starting SharedDrop Local OS Control Bridge...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri '${hostOrigin}/api/remote-agent/windows-ps1' -OutFile '%TEMP%\\SharedDrop-OS-Agent.ps1'; & '%TEMP%\\SharedDrop-OS-Agent.ps1'"
pause
`;
    res.setHeader('Content-Disposition', 'attachment; filename="Start-SharedDrop-Control.bat"');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(batScript);
  });

  // Callback assigned after WebSocketServer initialization to push live note updates
  let broadcastNotesUpdate: (notes: SharedNoteRecord[]) => void = () => {};

  // API 7: Persistent Saved Messages & Notes CRUD
  app.get('/api/notes', (req, res) => {
    const notes = readNotes();
    res.json({ notes });
  });

  app.post('/api/notes', (req, res) => {
    const { title, content, author, isPinned } = req.body || {};
    const trimmedContent = typeof content === 'string' ? content.trim() : '';
    if (!trimmedContent) {
      return res.status(400).json({ error: 'กรุณากรอกข้อความที่ต้องการบันทึก' });
    }

    const now = new Date().toISOString();
    const newNote: SharedNoteRecord = {
      id: crypto.randomUUID(),
      title: typeof title === 'string' ? title.trim() : '',
      content: typeof content === 'string' ? content : trimmedContent,
      author: typeof author === 'string' && author.trim() ? author.trim() : 'ผู้ใช้นิรนาม',
      isPinned: Boolean(isPinned),
      createdAt: now,
      updatedAt: now,
    };

    const notes = sortNotes([newNote, ...readNotes()]);
    writeNotes(notes);
    broadcastNotesUpdate(notes);
    res.status(201).json({ success: true, note: newNote, notes });
  });

  app.put('/api/notes/:id', (req, res) => {
    const { id } = req.params;
    const { title, content, isPinned, author } = req.body || {};
    const notes = readNotes();
    const index = notes.findIndex((n) => n.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'ไม่พบข้อความที่ต้องการแก้ไข' });
    }

    const current = notes[index];
    const nextContent = typeof content === 'string' ? content : current.content;
    if (!nextContent.trim()) {
      return res.status(400).json({ error: 'ข้อความต้องไม่ว่างเปล่า' });
    }

    const updated: SharedNoteRecord = {
      ...current,
      title: typeof title === 'string' ? title.trim() : current.title,
      content: nextContent,
      author: typeof author === 'string' && author.trim() ? author.trim() : current.author,
      isPinned: typeof isPinned === 'boolean' ? isPinned : current.isPinned,
      updatedAt: new Date().toISOString(),
    };

    notes[index] = updated;
    const sorted = sortNotes(notes);
    writeNotes(sorted);
    broadcastNotesUpdate(sorted);
    res.json({ success: true, note: updated, notes: sorted });
  });

  app.delete('/api/notes/:id', (req, res) => {
    const { id } = req.params;
    const notes = readNotes();
    const filtered = notes.filter((n) => n.id !== id);
    if (filtered.length === notes.length) {
      return res.status(404).json({ error: 'ไม่พบข้อความที่ต้องการลบ' });
    }

    writeNotes(filtered);
    broadcastNotesUpdate(filtered);
    res.json({ success: true, notes: filtered });
  });

  // Dev vs Production static asset serving
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  // Create HTTP server so we can attach WebSocket signaling on the same port 3000
  const httpServer = http.createServer(app);

  // WebSocket Signaling Server for WebRTC Remote Screen Sharing & Same-Network Peer Discovery
  interface SignalingClient {
    id: string;
    ws: WebSocket;
    roomCode: string | null;
    role: 'host' | 'viewer' | null;
    isAlive: boolean;
    deviceName: string;
    deviceType: 'desktop' | 'mobile' | 'tablet';
    osLabel: string;
    browserLabel: string;
    networkKey: string;
    connectedAt: string;
  }

  interface RemoteRoom {
    code: string;
    hostId: string;
    viewers: Set<string>;
    createdAt: number;
    controlAllowed: boolean;
  }

  const clients = new Map<string, SignalingClient>();
  const rooms = new Map<string, RemoteRoom>();

  const wss = new WebSocketServer({ server: httpServer, path: '/ws/signal' });

  broadcastNotesUpdate = (notes: SharedNoteRecord[]) => {
    const payload = JSON.stringify({ type: 'notes:sync', notes });
    for (const client of clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  };

  function extractNetworkKey(req: http.IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    let rawIp = Array.isArray(forwarded)
      ? forwarded[0]
      : typeof forwarded === 'string'
      ? forwarded.split(',')[0]
      : req.socket.remoteAddress || '';
    rawIp = rawIp.trim().replace(/^::ffff:/, '');

    if (!rawIp || rawIp === '::1' || rawIp === '127.0.0.1') {
      return 'local-network';
    }
    // Group private LAN IPv4 addresses by /24 subnet (e.g. 192.168.1.x)
    const isPrivateV4 =
      rawIp.startsWith('192.168.') ||
      rawIp.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(rawIp);
    if (isPrivateV4) {
      const parts = rawIp.split('.');
      if (parts.length === 4) {
        return `lan:${parts[0]}.${parts[1]}.${parts[2]}`;
      }
    }
    return `wan:${rawIp}`;
  }

  function parseUserAgentInfo(ua: string): {
    deviceType: 'desktop' | 'mobile' | 'tablet';
    osLabel: string;
    browserLabel: string;
  } {
    const lower = ua.toLowerCase();
    let deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop';
    if (/ipad|tablet/.test(lower)) deviceType = 'tablet';
    else if (/iphone|android.*mobile|mobile/.test(lower)) deviceType = 'mobile';

    let osLabel = 'คอมพิวเตอร์';
    if (lower.includes('windows')) osLabel = 'Windows';
    else if (lower.includes('mac os') || lower.includes('macintosh')) osLabel = 'macOS';
    else if (lower.includes('iphone') || lower.includes('ipad')) osLabel = 'iOS';
    else if (lower.includes('android')) osLabel = 'Android';
    else if (lower.includes('linux')) osLabel = 'Linux';

    let browserLabel = 'Browser';
    if (lower.includes('edg/')) browserLabel = 'Edge';
    else if (lower.includes('chrome/') && !lower.includes('edg/')) browserLabel = 'Chrome';
    else if (lower.includes('firefox/')) browserLabel = 'Firefox';
    else if (lower.includes('safari/') && !lower.includes('chrome/')) browserLabel = 'Safari';

    return { deviceType, osLabel, browserLabel };
  }

  function buildPeersFor(recipient: SignalingClient) {
    const list: Array<{
      id: string;
      deviceName: string;
      deviceType: 'desktop' | 'mobile' | 'tablet';
      osLabel: string;
      browserLabel: string;
      networkMatch: 'same-network' | 'online';
      networkLabel: string;
      hostingRoomCode: string | null;
      connectedAt: string;
    }> = [];

    for (const peer of clients.values()) {
      if (peer.id === recipient.id || peer.ws.readyState !== WebSocket.OPEN) continue;
      const isSameNetwork = peer.networkKey === recipient.networkKey;
      list.push({
        id: peer.id,
        deviceName: peer.deviceName,
        deviceType: peer.deviceType,
        osLabel: peer.osLabel,
        browserLabel: peer.browserLabel,
        networkMatch: isSameNetwork ? 'same-network' : 'online',
        networkLabel: isSameNetwork ? 'อินเทอร์เน็ต / Wi-Fi เดียวกัน' : 'ออนไลน์ผ่านอินเทอร์เน็ต',
        hostingRoomCode: peer.role === 'host' && peer.roomCode ? peer.roomCode : null,
        connectedAt: peer.connectedAt,
      });
    }

    // Same-network devices first, then hosting devices, then newest
    list.sort((a, b) => {
      if (a.networkMatch !== b.networkMatch) {
        return a.networkMatch === 'same-network' ? -1 : 1;
      }
      if (Boolean(a.hostingRoomCode) !== Boolean(b.hostingRoomCode)) {
        return a.hostingRoomCode ? -1 : 1;
      }
      return b.connectedAt.localeCompare(a.connectedAt);
    });

    return list;
  }

  function sendPeersListTo(client: SignalingClient) {
    safeSend(client.ws, {
      type: 'peers:list',
      selfId: client.id,
      peers: buildPeersFor(client),
    });
  }

  function broadcastPeersList() {
    for (const client of clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        sendPeersListTo(client);
      }
    }
  }

  function generateRoomCode(): string {
    for (let i = 0; i < 20; i++) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      if (!rooms.has(code)) return code;
    }
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  function safeSend(ws: WebSocket | undefined, payload: Record<string, unknown>) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function leaveCurrentRoom(client: SignalingClient) {
    if (!client.roomCode) return;
    const room = rooms.get(client.roomCode);
    if (!room) {
      client.roomCode = null;
      client.role = null;
      return;
    }

    if (client.role === 'host') {
      // Notify all viewers that host closed the session
      for (const viewerId of room.viewers) {
        const viewer = clients.get(viewerId);
        if (viewer) {
          safeSend(viewer.ws, { type: 'room:closed', roomCode: room.code });
          viewer.roomCode = null;
          viewer.role = null;
        }
      }
      rooms.delete(room.code);
    } else if (client.role === 'viewer') {
      room.viewers.delete(client.id);
      const host = clients.get(room.hostId);
      if (host) {
        safeSend(host.ws, {
          type: 'viewer:left',
          clientId: client.id,
          viewerCount: room.viewers.size,
        });
      }
    }

    client.roomCode = null;
    client.role = null;
    broadcastPeersList();
  }

  wss.on('connection', (ws, req) => {
    const clientId = crypto.randomUUID();
    const uaInfo = parseUserAgentInfo(String(req.headers['user-agent'] || ''));
    const networkKey = extractNetworkKey(req);
    const shortId = clientId.slice(0, 4).toUpperCase();

    const client: SignalingClient = {
      id: clientId,
      ws,
      roomCode: null,
      role: null,
      isAlive: true,
      deviceName: `${uaInfo.osLabel} (${shortId})`,
      deviceType: uaInfo.deviceType,
      osLabel: uaInfo.osLabel,
      browserLabel: uaInfo.browserLabel,
      networkKey,
      connectedAt: new Date().toISOString(),
    };
    clients.set(clientId, client);

    safeSend(ws, { type: 'signal:welcome', clientId, defaultDeviceName: client.deviceName });
    broadcastPeersList();

    ws.on('pong', () => {
      client.isAlive = true;
    });

    ws.on('message', (rawData) => {
      let msg: any;
      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        return;
      }

      switch (msg.type) {
        case 'peer:announce': {
          const customName = typeof msg.deviceName === 'string' ? msg.deviceName.trim().slice(0, 40) : '';
          if (customName) {
            client.deviceName = customName;
          } else {
            client.deviceName = `${client.osLabel} (${client.id.slice(0, 4).toUpperCase()})`;
          }
          broadcastPeersList();
          break;
        }

        case 'peers:scan': {
          sendPeersListTo(client);
          break;
        }

        case 'peer:invite': {
          const target = clients.get(String(msg.targetId || ''));
          if (target && target.ws.readyState === WebSocket.OPEN) {
            safeSend(target.ws, {
              type: 'peer:invited',
              fromId: client.id,
              fromDeviceName: client.deviceName,
              fromNetworkMatch: target.networkKey === client.networkKey ? 'same-network' : 'online',
              roomCode: client.role === 'host' ? client.roomCode : null,
            });
          }
          break;
        }

        case 'room:create': {
          leaveCurrentRoom(client);
          const roomCode = generateRoomCode();
          const room: RemoteRoom = {
            code: roomCode,
            hostId: client.id,
            viewers: new Set(),
            createdAt: Date.now(),
            controlAllowed: msg.controlAllowed !== false,
          };
          rooms.set(roomCode, room);
          client.roomCode = roomCode;
          client.role = 'host';
          safeSend(ws, {
            type: 'room:created',
            roomCode,
            clientId: client.id,
          });
          broadcastPeersList();
          break;
        }

        case 'room:join': {
          const code = String(msg.roomCode || '').trim();
          const room = rooms.get(code);
          if (!room) {
            safeSend(ws, {
              type: 'room:error',
              message: 'ไม่พบห้องรหัสนี้ กรุณาตรวจสอบรหัส 6 หลักหรือรอให้เครื่องที่ 1 สร้างห้องก่อน',
            });
            return;
          }

          const host = clients.get(room.hostId);
          if (!host || host.ws.readyState !== WebSocket.OPEN) {
            rooms.delete(code);
            safeSend(ws, {
              type: 'room:error',
              message: 'ผู้แชร์หน้าจอ (เครื่องที่ 1) ออฟไลน์ไปแล้ว',
            });
            return;
          }

          leaveCurrentRoom(client);
          room.viewers.add(client.id);
          client.roomCode = code;
          client.role = 'viewer';

          safeSend(ws, {
            type: 'room:joined',
            roomCode: code,
            clientId: client.id,
            hostId: room.hostId,
            controlAllowed: room.controlAllowed,
          });

          safeSend(host.ws, {
            type: 'viewer:joined',
            clientId: client.id,
            viewerCount: room.viewers.size,
          });
          break;
        }

        case 'room:leave': {
          leaveCurrentRoom(client);
          break;
        }

        case 'control:permission': {
          if (!client.roomCode || client.role !== 'host') return;
          const room = rooms.get(client.roomCode);
          if (!room) return;
          room.controlAllowed = Boolean(msg.allowed);
          for (const viewerId of room.viewers) {
            safeSend(clients.get(viewerId)?.ws, {
              type: 'control:permission',
              allowed: room.controlAllowed,
            });
          }
          break;
        }

        case 'webrtc:offer':
        case 'webrtc:answer':
        case 'webrtc:ice-candidate': {
          if (!client.roomCode) return;
          const room = rooms.get(client.roomCode);
          if (!room) return;
          const targetId = msg.targetId as string | undefined;
          if (targetId && clients.has(targetId)) {
            safeSend(clients.get(targetId)?.ws, {
              ...msg,
              fromId: client.id,
            });
          } else if (client.role === 'viewer') {
            safeSend(clients.get(room.hostId)?.ws, {
              ...msg,
              fromId: client.id,
            });
          }
          break;
        }

        // Low-latency fallback relay if peer-to-peer DataChannel is blocked by symmetric NAT
        case 'remote:input':
        case 'workspace:sync': {
          if (!client.roomCode) return;
          const room = rooms.get(client.roomCode);
          if (!room) return;
          if (client.role === 'viewer') {
            if (msg.type === 'remote:input' && !room.controlAllowed) return;
            safeSend(clients.get(room.hostId)?.ws, {
              ...msg,
              fromId: client.id,
            });
          } else if (client.role === 'host') {
            for (const viewerId of room.viewers) {
              safeSend(clients.get(viewerId)?.ws, {
                ...msg,
                fromId: client.id,
              });
            }
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      leaveCurrentRoom(client);
      clients.delete(client.id);
      broadcastPeersList();
    });
  });

  // Periodic WebSocket keepalive heartbeat
  const heartbeatInterval = setInterval(() => {
    for (const [id, client] of clients.entries()) {
      if (!client.isAlive) {
        leaveCurrentRoom(client);
        client.ws.terminate();
        clients.delete(id);
        continue;
      }
      client.isAlive = false;
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    }
  }, 25000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Shared Dropzone & WebRTC Signaling server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
