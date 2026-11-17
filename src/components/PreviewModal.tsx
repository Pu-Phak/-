import React, { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  Copy, 
  Check, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  ExternalLink,
  Code as CodeIcon,
  FileText
} from 'lucide-react';
import { SharedFile } from '../types';
import { formatFileSize, formatRelativeTime, getCategoryIcon } from '../utils/formatters';
import { fetchDriveFileText, getDriveFileBlobUrl } from '../utils/googleDriveStorage';

interface PreviewModalProps {
  file: SharedFile | null;
  accessToken: string | null;
  onClose: () => void;
  onDownload: (file: SharedFile) => void;
  onCopyLink: (file: SharedFile) => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({
  file,
  accessToken,
  onClose,
  onDownload,
  onCopyLink,
}) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [copied, setCopied] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState(false);
  const [blobPreviewUrl, setBlobPreviewUrl] = useState<string | null>(null);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isImage = file?.category === 'image';
  const isVideo = file?.category === 'video';
  const isAudio = file?.category === 'audio';
  const isPdf = Boolean(
    file && (file.originalName.toLowerCase().endsWith('.pdf') || file.mimeType.includes('pdf'))
  );
  const isTextOrCode = Boolean(
    file &&
      (file.category === 'code' ||
        file.mimeType.startsWith('text/') ||
        file.originalName.endsWith('.txt') ||
        file.originalName.endsWith('.md') ||
        file.originalName.endsWith('.json'))
  );

  // Reset zoom and load preview content from Google Drive
  useEffect(() => {
    let cancelled = false;
    setZoomLevel(1);
    setTextContent(null);
    setBlobPreviewUrl(null);

    if (!file || !accessToken) return;

    if (isTextOrCode) {
      setIsLoadingText(true);
      fetchDriveFileText(accessToken, file.id)
        .then((data) => {
          if (!cancelled) {
            setTextContent(data);
            setIsLoadingText(false);
          }
        })
        .catch((err) => {
          console.error('Failed to load text preview from Google Drive:', err);
          if (!cancelled) {
            setTextContent('ไม่สามารถโหลดเนื้อหาไฟล์จาก Google Drive ได้');
            setIsLoadingText(false);
          }
        });
    } else if (isImage || isVideo || isAudio || isPdf) {
      setIsLoadingMedia(true);
      getDriveFileBlobUrl(accessToken, file.id)
        .then((url) => {
          if (!cancelled) {
            setBlobPreviewUrl(url);
            setIsLoadingMedia(false);
          }
        })
        .catch((err) => {
          console.error('Failed to load media preview from Google Drive:', err);
          if (!cancelled) {
            setIsLoadingMedia(false);
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [file, accessToken, isTextOrCode, isImage, isVideo, isAudio, isPdf]);

  if (!file) return null;

  const driveViewUrl = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
  const IconComponent = getCategoryIcon(file.category, file.originalName);

  const handleCopyLink = () => {
    onCopyLink(file);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyTextToClipboard = () => {
    if (textContent) {
      navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 dark:bg-black/90 backdrop-blur-sm animate-fadeIn"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full max-w-4xl max-h-[90vh] bg-white dark:bg-[#090305] rounded-none shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0 bg-slate-50/80 dark:bg-[#090305]">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            <div className="p-2 rounded-icon-box bg-orange-50 dark:bg-red-950/60 text-red-600 dark:text-orange-400 shrink-0">
              <IconComponent className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-base text-slate-900 dark:text-white truncate" title={file.originalName}>
                {file.originalName}
              </h3>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span className="font-mono tabular-nums">{formatFileSize(file.size)}</span>
                <span>·</span>
                <span>โดย {file.uploaderName || 'ผู้ใช้นิรนาม'}</span>
                <span>·</span>
                <span>{formatRelativeTime(file.uploadedAt)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isImage && (
              <div className="hidden sm:flex items-center gap-1 bg-slate-100 dark:bg-[#120608] rounded-none p-1 mr-2">
                <button
                  onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.25))}
                  className="p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-orange-400 rounded-none cursor-pointer"
                  title="ย่อขนาด"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-mono px-1.5 text-slate-500 dark:text-slate-400 tabular-nums">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={() => setZoomLevel(prev => Math.min(3, prev + 0.25))}
                  className="p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-orange-400 rounded-none cursor-pointer"
                  title="ขยายขนาด"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoomLevel(1)}
                  className="p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-orange-400 rounded-none cursor-pointer"
                  title="รีเซ็ตขนาด"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-orange-200 rounded-none hover:bg-slate-100 dark:hover:bg-[#120608] transition-colors cursor-pointer"
              title="ปิดหน้าต่าง (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Viewport */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-100/50 dark:bg-black/90 flex items-center justify-center min-h-[300px]">
          {isImage ? (
            <div className="overflow-auto max-h-[60vh] flex items-center justify-center w-full">
              {isLoadingMedia || !blobPreviewUrl ? (
                <div className="py-16 text-xs text-slate-500 dark:text-neutral-400">กำลังโหลดรูปภาพจาก Google Drive...</div>
              ) : (
                <img
                  src={blobPreviewUrl}
                  alt={file.originalName}
                  style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
                  className="max-h-[55vh] max-w-full object-contain rounded-none shadow-sm transition-transform duration-150"
                />
              )}
            </div>
          ) : isVideo ? (
            <div className="w-full max-w-3xl flex justify-center">
              {isLoadingMedia || !blobPreviewUrl ? (
                <div className="py-16 text-xs text-slate-500 dark:text-neutral-400">กำลังโหลดวิดีโอจาก Google Drive...</div>
              ) : (
                <video
                  src={blobPreviewUrl}
                  controls
                  autoPlay={false}
                  className="max-h-[55vh] w-full rounded-none bg-black shadow-lg"
                >
                  เบราว์เซอร์ของคุณไม่รองรับการเล่นวิดีโอ
                </video>
              )}
            </div>
          ) : isAudio ? (
            <div className="w-full max-w-md bg-white dark:bg-[#120608] p-6 rounded-none shadow-md text-center space-y-4">
              <div className="w-16 h-16 rounded-none bg-orange-50 dark:bg-red-950/60 text-red-600 dark:text-orange-400 flex items-center justify-center mx-auto shadow-inner">
                <IconComponent className="w-8 h-8" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-white truncate">{file.originalName}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">เล่นไฟล์เสียงจาก Google Drive</p>
              </div>
              {isLoadingMedia || !blobPreviewUrl ? (
                <div className="py-4 text-xs text-slate-500 dark:text-slate-400">กำลังโหลดเสียง...</div>
              ) : (
                <audio src={blobPreviewUrl} controls className="w-full mt-2">
                  เบราว์เซอร์ไม่รองรับเครื่องเล่นเสียงนี้
                </audio>
              )}
            </div>
          ) : isPdf ? (
            <div className="w-full h-[60vh] bg-slate-900 dark:bg-[#070204] rounded-none overflow-hidden shadow-inner flex flex-col">
              {isLoadingMedia || !blobPreviewUrl ? (
                <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                  กำลังโหลดเอกสาร PDF จาก Google Drive...
                </div>
              ) : (
                <iframe
                  src={`${blobPreviewUrl}#toolbar=1`}
                  title={file.originalName}
                  className="w-full h-full border-0"
                />
              )}
            </div>
          ) : isTextOrCode ? (
            <div className="w-full max-h-[60vh] flex flex-col bg-slate-900 dark:bg-[#070204] text-slate-100 rounded-none overflow-hidden shadow-lg">
              <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 dark:bg-[#120608] text-xs">
                <div className="flex items-center gap-2 text-slate-300 font-mono">
                  <CodeIcon className="w-4 h-4 text-orange-400" />
                  <span>{file.originalName}</span>
                </div>
                <button
                  onClick={copyTextToClipboard}
                  className="flex items-center gap-1.5 text-slate-300 hover:text-white px-2.5 py-1 rounded-none bg-slate-700 dark:bg-red-950/70 hover:bg-slate-600 dark:hover:bg-red-900/70 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'คัดลอกแล้ว' : 'คัดลอกข้อความ'}</span>
                </button>
              </div>
              <div className="p-4 overflow-auto font-mono text-xs leading-relaxed max-h-[50vh]">
                {isLoadingText ? (
                  <div className="flex items-center justify-center py-12 text-slate-400">
                    <span>กำลังโหลดเนื้อหาไฟล์จาก Google Drive...</span>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap break-all text-slate-200">
                    {textContent}
                  </pre>
                )}
              </div>
            </div>
          ) : (
            /* Generic/Archive Preview fallback */
            <div className="text-center p-8 bg-white dark:bg-[#120608] rounded-none max-w-md shadow-sm">
              <div className="w-16 h-16 rounded-none bg-slate-100 dark:bg-[#090305] text-slate-400 dark:text-orange-400 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8" />
              </div>
              <h4 className="font-semibold text-slate-900 dark:text-white text-base">
                ไฟล์ประเภท {file.originalName.split('.').pop()?.toUpperCase()}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 mb-6 leading-relaxed">
                ไฟล์ประเภทนี้ไม่สามารถแสดงตัวอย่างแบบโต้ตอบในเบราว์เซอร์ได้โดยตรง คุณสามารถดาวน์โหลดจาก Google Drive ลงเครื่องของคุณ
              </p>
              <button
                onClick={() => onDownload(file)}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-red-600 to-orange-500 hover:opacity-95 text-white rounded-none text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-opacity cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>ดาวน์โหลดไฟล์นี้ ({formatFileSize(file.size)})</span>
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-[#090305] shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-[#120608] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1a0a0d] dark:hover:text-orange-400 rounded-none transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'คัดลอกลิงก์แล้ว' : 'คัดลอกลิงก์ Google Drive'}</span>
            </button>

            <a
              href={driveViewUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-[#120608] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1a0a0d] dark:hover:text-orange-400 rounded-none transition-colors cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              <span>เปิดใน Google Drive</span>
            </a>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              ปิด
            </button>

            <button
              onClick={() => onDownload(file)}
              className="px-4 py-2 text-xs font-medium text-white bg-gradient-to-r from-red-600 to-orange-500 hover:opacity-95 rounded-none flex items-center gap-2 shadow-sm shadow-red-500/25 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>ดาวน์โหลดไฟล์</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
