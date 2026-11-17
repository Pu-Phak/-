import React, { useRef, useState, useEffect } from 'react';
import { UploadCloud, FileUp, CheckCircle2, AlertCircle, X, User } from 'lucide-react';
import { UploadItem } from '../types';
import { formatFileSize } from '../utils/formatters';
import { ScrollRevealItem } from './ScrollRevealItem';

interface DropZoneProps {
  onFilesSelected: (files: FileList | File[], uploaderName: string) => void;
  uploadQueue: UploadItem[];
  onDismissUploadItem: (id: string) => void;
  uploaderName: string;
  setUploaderName: (name: string) => void;
  isFirstVisit?: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onFilesSelected,
  uploadQueue,
  onDismissUploadItem,
  uploaderName,
  setUploaderName,
  isFirstVisit = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isWindowDragActive, setIsWindowDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // Global window drag detection
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current++;
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setIsWindowDragActive(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setIsWindowDragActive(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsWindowDragActive(false);
      setIsDragOver(false);

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        onFilesSelected(e.dataTransfer.files, uploaderName);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [onFilesSelected, uploaderName]);

  const handleZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleZoneDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    setIsWindowDragActive(false);
    dragCounter.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files, uploaderName);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files, uploaderName);
      // Reset input value so same files can be re-selected if needed
      e.target.value = '';
    }
  };

  return (
    <section id="dropzone" className="relative w-full">
      {/* Full-window Drag Overlay */}
      {isWindowDragActive && (
        <div className="fixed inset-0 z-50 bg-red-600/90 dark:bg-[#090305]/95 backdrop-blur-sm flex flex-col items-center justify-center text-white pointer-events-none transition-all">
          <div className="animate-bounce mb-4 p-4 rounded-none bg-white/20 dark:bg-orange-500/30">
            <UploadCloud className="w-16 h-16" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">วางไฟล์ลงที่นี่เพื่อแชร์</h2>
          <p className="mt-2 text-orange-100 dark:text-orange-200 text-sm sm:text-base">ปล่อยไฟล์เพื่ออัปโหลดเข้าสู่คลังส่วนตัวทันที</p>
        </div>
      )}

      {/* Ambient glowing gradient mesh of Red, Orange, and Black behind the frosted glass card */}
      <div className="absolute -inset-4 bg-gradient-to-r from-red-600/35 via-orange-500/30 to-black/80 blur-3xl opacity-85 dark:opacity-80 -z-10 pointer-events-none" />
      <div className="absolute top-2 -left-10 w-80 h-80 bg-gradient-to-tr from-red-600/35 via-red-900/30 to-transparent rounded-full blur-3xl -z-10 pointer-events-none" />
      <div className="absolute bottom-2 -right-10 w-80 h-80 bg-gradient-to-bl from-orange-500/35 via-amber-600/25 to-black/60 rounded-full blur-3xl -z-10 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-radial from-red-600/20 via-orange-500/15 to-transparent blur-2xl -z-10 pointer-events-none" />

      {/* Floating Frosted Glass Card with Red-Orange-Black Harmonized Backdrop & Sharp Square Corners */}
      <div className="floating-glass-card rounded-none relative backdrop-blur-3xl backdrop-saturate-150 bg-white/85 dark:bg-[#090305]/85 p-6 sm:p-8 transition-all duration-300 space-y-6 overflow-hidden">
        {/* Glass reflection sheen on top edge */}
        <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-red-500/70 via-orange-400/80 to-transparent pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-gradient-to-bl from-orange-500/20 via-red-600/15 to-transparent rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-gradient-to-tr from-red-600/20 via-black/40 to-transparent rounded-full blur-2xl pointer-events-none" />

        {/* Dropzone Header / Uploader nickname option */}
        <ScrollRevealItem isFirstVisit={isFirstVisit} index={1}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6">
            <div>
              <h2 className="text-lg sm:text-xl font-medium text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <span>พื้นที่วางและอัปโหลดไฟล์</span>
                <span className="w-2 h-2 rounded-none bg-gradient-to-r from-red-500 to-orange-400 animate-pulse" />
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-300 mt-1 font-light">
                ลากไฟล์มาวางหรือกดเลือกไฟล์ เพื่อจัดเก็บเข้า Google Drive ส่วนตัวทันที
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-orange-400/70">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={uploaderName}
                  onChange={(e) => setUploaderName(e.target.value)}
                  placeholder="ชื่อผู้แชร์ (ไม่ระบุก็ได้)"
                  className="rounded-none pl-9 pr-3 py-1.5 text-xs bg-slate-100/90 dark:bg-[#070204] backdrop-blur-md text-slate-800 dark:text-orange-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/80 w-48 sm:w-56 font-light transition-all"
                />
              </div>
            </div>
          </div>
        </ScrollRevealItem>

        {/* Interactive Drop Area */}
        <ScrollRevealItem isFirstVisit={isFirstVisit} index={2}>
          <div
            onDragOver={handleZoneDragOver}
            onDragLeave={handleZoneDragLeave}
            onDrop={handleZoneDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-none relative p-8 sm:p-12 text-center cursor-pointer transition-all duration-300 backdrop-blur-xl ${
              isDragOver
                ? 'bg-gradient-to-br from-red-600/35 via-[#090305]/80 to-orange-500/35 scale-[0.99]'
                : 'bg-gradient-to-br from-slate-100/90 via-slate-50/70 to-orange-50/60 dark:from-red-950/35 dark:via-[#070204] dark:to-orange-950/30 hover:scale-[1.003]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileInputChange}
              className="hidden"
            />

            <div className="flex flex-col items-center justify-center max-w-md mx-auto pointer-events-none">
              <div className={`w-14 h-14 rounded-icon-box-lg flex items-center justify-center mb-3.5 transition-all ${
                isDragOver 
                  ? 'bg-gradient-to-br from-red-600 via-orange-500 to-amber-400 text-white scale-110' 
                  : 'bg-gradient-to-br from-red-600/20 via-red-950/75 to-orange-500/25 text-red-600 dark:text-orange-400'
              }`}>
                <UploadCloud className="w-7 h-7" />
              </div>

              <p className="text-sm sm:text-base font-normal text-slate-800 dark:text-slate-100">
                ลากและวางไฟล์ลงที่นี่ หรือ <span className="bg-gradient-to-r from-red-600 to-orange-400 bg-clip-text text-transparent underline decoration-orange-500/50 underline-offset-4 font-medium hover:opacity-90 transition-opacity">เลือกไฟล์จากเครื่อง</span>
              </p>

              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-light">
                รองรับไฟล์ทุกประเภท: รูปภาพ, เอกสาร, PDF, วิดีโอ, เสียง, ZIP, โค้ด
              </p>
            </div>
          </div>
        </ScrollRevealItem>

        {/* Active Upload Queue Display */}
        {uploadQueue.length > 0 && (
          <ScrollRevealItem isFirstVisit={isFirstVisit} index={3}>
            <div className="pt-6 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                <span>กำลังดำเนินการอัปโหลด ({uploadQueue.filter(u => u.status === 'uploading').length} ไฟล์)</span>
                <span>{uploadQueue.filter(u => u.status === 'completed').length} / {uploadQueue.length} เสร็จสมบูรณ์</span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {uploadQueue.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-4 p-3 rounded-none bg-slate-100/80 dark:bg-[#120608] text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {item.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                      {item.status === 'uploading' && <FileUp className="w-4 h-4 text-red-500 dark:text-orange-400 animate-pulse shrink-0" />}
                      {item.status === 'error' && <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />}
                      {item.status === 'pending' && <FileUp className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                            {item.name}
                          </span>
                          <span className="text-slate-400 dark:text-slate-500 shrink-0 font-mono tabular-nums">
                            {formatFileSize(item.size)}
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-slate-200 dark:bg-[#070204] rounded-none h-1.5 mt-1.5 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 rounded-none ${
                              item.status === 'completed'
                                ? 'bg-emerald-500'
                                : item.status === 'error'
                                ? 'bg-rose-500'
                                : 'bg-gradient-to-r from-red-600 to-orange-400'
                            }`}
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>

                        {item.errorMessage && (
                          <p className="text-[11px] text-rose-500 mt-1">{item.errorMessage}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {item.status === 'completed' ? '100%' : `${Math.round(item.progress)}%`}
                      </span>
                      <button
                        onClick={() => onDismissUploadItem(item.id)}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-none"
                        title="ปิดการแจ้งเตือนนี้"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollRevealItem>
        )}
      </div>
    </section>
  );
};
