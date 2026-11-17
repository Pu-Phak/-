import React, { useState, useEffect } from 'react';
import { 
  Search, 
  LayoutGrid, 
  List, 
  Download, 
  Eye, 
  Copy, 
  Trash2, 
  ArrowUpDown, 
  Check, 
  FileQuestion,
  Users,
  Image as ImageIcon
} from 'lucide-react';
import { SharedFile, FileCategory, SortField, SortDirection, ViewMode } from '../types';
import { formatFileSize, formatRelativeTime, getCategoryIcon } from '../utils/formatters';
import { getDriveFileBlobUrl } from '../utils/googleDriveStorage';
import { ScrollRevealItem } from './ScrollRevealItem';

const DriveImageThumb: React.FC<{ file: SharedFile; accessToken: string | null }> = ({ file, accessToken }) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken) {
      setSrc(null);
      return;
    }
    getDriveFileBlobUrl(accessToken, file.id)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [file.id, accessToken]);

  if (!src) {
    return (
      <div className="flex flex-col items-center justify-center text-slate-400 dark:text-neutral-500">
        <ImageIcon className="w-7 h-7 mb-1 opacity-70" />
        <span className="text-[10px] font-mono">DRIVE</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={file.originalName}
      loading="lazy"
      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
    />
  );
};

interface FileListProps {
  files: SharedFile[];
  accessToken: string | null;
  onPreview: (file: SharedFile) => void;
  onDownload: (file: SharedFile) => void;
  onDelete: (id: string, name: string) => void;
  onBatchDelete: (filesToDelete: SharedFile[]) => void;
  onCopyLink: (file: SharedFile) => void;
  isLoading: boolean;
  isFirstVisit?: boolean;
}

export const FileList: React.FC<FileListProps> = ({
  files,
  accessToken,
  onPreview,
  onDownload,
  onDelete,
  onBatchDelete,
  onCopyLink,
  isLoading,
  isFirstVisit = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FileCategory>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

  // Category counts
  const categoryCounts = {
    all: files.length,
    image: files.filter(f => f.category === 'image').length,
    document: files.filter(f => f.category === 'document').length,
    video: files.filter(f => f.category === 'video').length,
    audio: files.filter(f => f.category === 'audio').length,
    code: files.filter(f => f.category === 'code').length,
    archive: files.filter(f => f.category === 'archive').length,
    other: files.filter(f => f.category === 'other').length,
  };

  // Filter files
  const filteredFiles = files.filter(file => {
    const matchesCategory = selectedCategory === 'all' || file.category === selectedCategory;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      file.originalName.toLowerCase().includes(q) || 
      (file.uploaderName && file.uploaderName.toLowerCase().includes(q)) ||
      file.mimeType.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  // Sort files
  const sortedFiles = [...filteredFiles].sort((a, b) => {
    let comp = 0;
    if (sortField === 'date') {
      comp = new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
    } else if (sortField === 'size') {
      comp = b.size - a.size;
    } else if (sortField === 'downloads') {
      comp = b.downloadCount - a.downloadCount;
    } else if (sortField === 'name') {
      comp = a.originalName.localeCompare(b.originalName, 'th');
    }
    return sortDirection === 'asc' ? -comp : comp;
  });

  const handleCopyLinkClick = (file: SharedFile) => {
    onCopyLink(file);
    setCopiedId(file.id);
    setTimeout(() => {
      setCopiedId((current) => (current === file.id ? null : current));
    }, 2000);
  };

  const handleSelectAll = () => {
    if (selectedFileIds.size === sortedFiles.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(sortedFiles.map(f => f.id)));
    }
  };

  const toggleSelectFile = (id: string) => {
    const updated = new Set(selectedFileIds);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    setSelectedFileIds(updated);
  };

  const handleBatchDownload = () => {
    sortedFiles
      .filter(f => selectedFileIds.has(f.id))
      .forEach(f => onDownload(f));
  };

  return (
    <section id="file-hub" className="w-full space-y-6">
      {/* Controls Bar: Search, Category Filters, View Switcher & Sorting */}
      <ScrollRevealItem isFirstVisit={isFirstVisit} index={1}>
        <div className="bg-white dark:bg-[#090305] rounded-none p-4 sm:p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-orange-400/70">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อไฟล์ หรือชื่อผู้แชร์..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-slate-100 dark:bg-[#070204] rounded-none text-slate-900 dark:text-orange-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-400 hover:text-slate-600 dark:hover:text-orange-200 cursor-pointer"
                >
                  ล้าง
                </button>
              )}
            </div>

            {/* Sort & View Mode Controls */}
            <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
              {/* Sort Selector */}
              <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 dark:text-orange-400/70" />
                <select
                  value={`${sortField}-${sortDirection}`}
                  onChange={(e) => {
                    const [field, dir] = e.target.value.split('-') as [SortField, SortDirection];
                    setSortField(field);
                    setSortDirection(dir);
                  }}
                  className="bg-slate-100 dark:bg-[#120608] rounded-none px-2.5 py-1.5 text-xs text-slate-800 dark:text-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="date-desc">ล่าสุดก่อน</option>
                  <option value="date-asc">เก่าสุดก่อน</option>
                  <option value="size-desc">ขนาดใหญ่สุด</option>
                  <option value="size-asc">ขนาดเล็กสุด</option>
                  <option value="downloads-desc">ดาวน์โหลดมากสุด</option>
                  <option value="name-asc">ชื่อ A-Z / ก-ฮ</option>
                </select>
              </div>

              {/* View Mode Toggle: Grid / Table */}
              <div className="flex items-center p-1 bg-slate-100 dark:bg-[#120608] rounded-none">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-none transition-all cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-orange-500/20 text-red-600 dark:text-orange-400 shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-orange-200'
                  }`}
                  title="มุมมองแบบการ์ด"
                  aria-label="Grid view"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-none transition-all cursor-pointer ${
                    viewMode === 'table'
                      ? 'bg-white dark:bg-orange-500/20 text-red-600 dark:text-orange-400 shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-orange-200'
                  }`}
                  title="มุมมองแบบตาราง"
                  aria-label="Table view"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Category Filter Tabs (Interactive segmented buttons) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'all' as FileCategory, label: 'ทั้งหมด', count: categoryCounts.all },
              { id: 'image' as FileCategory, label: 'รูปภาพ', count: categoryCounts.image },
              { id: 'document' as FileCategory, label: 'เอกสาร', count: categoryCounts.document },
              { id: 'video' as FileCategory, label: 'วิดีโอ', count: categoryCounts.video },
              { id: 'audio' as FileCategory, label: 'เสียง', count: categoryCounts.audio },
              { id: 'code' as FileCategory, label: 'โค้ด/ข้อมูล', count: categoryCounts.code },
              { id: 'archive' as FileCategory, label: 'ไฟล์บีบอัด', count: categoryCounts.archive },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-none transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-[#120608] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#1a0a0d] dark:hover:text-orange-200'
                }`}
              >
                <span>{cat.label}</span>
                <span className="ml-1.5 opacity-75 font-mono tabular-nums">({cat.count})</span>
              </button>
            ))}
          </div>

          {/* Batch actions bar if multiple selected */}
          {selectedFileIds.size > 0 && (
            <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-red-950/35 rounded-none text-xs">
              <span className="text-red-900 dark:text-orange-200 font-medium">
                เลือกอยู่ {selectedFileIds.size} ไฟล์
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBatchDownload}
                  className="px-3 py-1.5 bg-gradient-to-r from-red-600 to-orange-500 hover:opacity-95 text-white rounded-none font-medium flex items-center gap-1.5 transition-opacity cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>ดาวน์โหลดที่เลือก</span>
                </button>
                <button
                  onClick={() => {
                    const selected = sortedFiles.filter((f) => selectedFileIds.has(f.id));
                    onBatchDelete(selected);
                    setSelectedFileIds(new Set());
                  }}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-none font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>ลบที่เลือก</span>
                </button>
                <button
                  onClick={() => setSelectedFileIds(new Set())}
                  className="px-2.5 py-1.5 bg-white dark:bg-[#120608] text-slate-700 dark:text-neutral-300 rounded-none hover:bg-slate-100 dark:hover:bg-[#1a0a0d] transition-colors cursor-pointer"
                >
                  ยกเลิกการเลือก
                </button>
              </div>
            </div>
          )}
        </div>
      </ScrollRevealItem>

      {/* Main Files Display Area */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <ScrollRevealItem key={i} isFirstVisit={isFirstVisit} index={i + 1}>
              <div className="bg-white dark:bg-[#090305] rounded-none p-4 animate-pulse space-y-3">
                <div className="h-32 bg-slate-100 dark:bg-[#120608] rounded-none" />
                <div className="h-4 bg-slate-100 dark:bg-[#120608] rounded-none w-3/4" />
                <div className="h-3 bg-slate-100 dark:bg-[#120608] rounded-none w-1/2" />
              </div>
            </ScrollRevealItem>
          ))}
        </div>
      ) : sortedFiles.length === 0 ? (
        /* Empty State */
        <ScrollRevealItem isFirstVisit={isFirstVisit} index={2}>
          <div className="bg-white dark:bg-[#090305] rounded-none p-12 text-center max-w-lg mx-auto">
            <div className="w-16 h-16 rounded-none bg-orange-50 dark:bg-[#120608] text-red-600 dark:text-orange-400 flex items-center justify-center mx-auto mb-4">
              <FileQuestion className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">
              {searchQuery || selectedCategory !== 'all' ? 'ไม่พบไฟล์ที่ตรงกับเงื่อนไข' : 'ยังไม่มีไฟล์ใน Google Drive ของอีเมลนี้'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {searchQuery || selectedCategory !== 'all'
                ? 'ลองเปลี่ยนคำค้นหา หรือเลือกหมวดหมู่อื่น'
                : 'เริ่มต้นด้วยการลากไฟล์มาวางในหน้าวางไฟล์ เพื่อบันทึกเก็บไว้ในโฟลเดอร์ SharedDrop Workspace บน Google Drive ของคุณ'}
            </p>
            {(searchQuery || selectedCategory !== 'all') && (
              <button
                onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
                className="mt-4 px-4 py-2 text-xs font-medium text-red-600 dark:text-orange-400 hover:underline cursor-pointer"
              >
                ล้างตัวกรองทั้งหมด
              </button>
            )}
          </div>
        </ScrollRevealItem>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedFiles.map((file, index) => {
            const IconComponent = getCategoryIcon(file.category, file.originalName);
            const isImage = file.category === 'image';
            const isSelected = selectedFileIds.has(file.id);

            return (
              <ScrollRevealItem
                key={file.id}
                isFirstVisit={isFirstVisit}
                index={index + 2}
                className="h-full"
              >
                <div
                  className={`group relative rounded-none overflow-hidden transition-all flex flex-col justify-between h-full ${
                    isSelected 
                      ? 'bg-orange-50/75 dark:bg-[#18070b]' 
                      : 'bg-white dark:bg-[#090305]'
                  }`}
                >
                  {/* Card Preview Header */}
                  <div 
                    onClick={() => onPreview(file)}
                    className="relative h-40 bg-slate-100 dark:bg-[#120608] flex items-center justify-center cursor-pointer overflow-hidden"
                  >
                    {isImage ? (
                      <DriveImageThumb file={file} accessToken={accessToken} />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-400 group-hover:text-red-600 dark:group-hover:text-orange-400 transition-colors">
                        <div className="p-3 rounded-icon-box bg-white/80 dark:bg-[#070204] mb-2">
                          <IconComponent className="w-8 h-8" />
                        </div>
                        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          {file.originalName.split('.').pop() || 'FILE'}
                        </span>
                      </div>
                    )}

                    {/* Multi-select Checkbox */}
                    <div 
                      onClick={(e) => { e.stopPropagation(); toggleSelectFile(file.id); }}
                      className="absolute top-2.5 left-2.5 p-1 rounded-none bg-white/80 dark:bg-[#090305]/90 backdrop-blur-xs cursor-pointer hover:scale-110 transition-transform"
                      title={isSelected ? "ยกเลิกเลือก" : "เลือกไฟล์นี้"}
                    >
                      <div className={`w-4 h-4 rounded-none flex items-center justify-center transition-colors ${
                        isSelected 
                          ? 'bg-orange-500 text-white' 
                          : 'bg-slate-200 dark:bg-[#1a0a0d]'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>

                    {/* Quick hover preview badge */}
                    <div className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                      <span className="px-3 py-1.5 bg-white/95 dark:bg-[#090305] text-slate-900 dark:text-white rounded-none text-xs font-medium flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-orange-500" />
                        <span>เปิดดูตัวอย่าง</span>
                      </span>
                    </div>
                  </div>

                  {/* Card Content & Zero-Pill Metadata */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <h4 
                        onClick={() => onPreview(file)}
                        className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate cursor-pointer hover:text-red-600 dark:hover:text-orange-400 transition-colors" 
                        title={file.originalName}
                      >
                        {file.originalName}
                      </h4>

                      {/* Zero-Pill Metadata: Clean typography with dot separators */}
                      <div className="flex items-center flex-wrap gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                        <span className="font-mono tabular-nums">{formatFileSize(file.size)}</span>
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                        <span>{formatRelativeTime(file.uploadedAt)}</span>
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="font-mono tabular-nums">โหลด {file.downloadCount} ครั้ง</span>
                      </div>

                      {/* Uploader info */}
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                        <Users className="w-3 h-3" />
                        <span className="truncate">โดย: {file.uploaderName || 'ผู้ใช้นิรนาม'}</span>
                      </div>
                    </div>

                    {/* Actions Footer */}
                    <div className="pt-3 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onPreview(file)}
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#120608] dark:hover:text-orange-400 rounded-none transition-colors flex items-center gap-1 cursor-pointer"
                          title="ดูตัวอย่างไฟล์ในเว็บ"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">ดูตัวอย่าง</span>
                        </button>

                        <button
                          onClick={() => handleCopyLinkClick(file)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-orange-400 hover:bg-slate-100 dark:hover:bg-[#120608] rounded-none transition-colors cursor-pointer"
                          title="คัดลอกลิงก์ดาวน์โหลด"
                        >
                          {copiedId === file.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          onClick={() => onDelete(file.id, file.originalName)}
                          className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-none transition-colors cursor-pointer"
                          title="ลบไฟล์นี้จาก Google Drive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        onClick={() => onDownload(file)}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-red-600 to-orange-500 hover:opacity-95 rounded-none flex items-center gap-1.5 transition-opacity cursor-pointer"
                        title="ดาวน์โหลดไฟล์ลงเครื่อง"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>ดาวน์โหลด</span>
                      </button>
                    </div>
                  </div>
                </div>
              </ScrollRevealItem>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <ScrollRevealItem isFirstVisit={isFirstVisit} index={2}>
          <div className="bg-white dark:bg-[#090305] rounded-none overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-[#120608] text-slate-500 dark:text-slate-400 font-semibold">
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={selectedFileIds.size > 0 && selectedFileIds.size === sortedFiles.length}
                        onChange={handleSelectAll}
                        className="rounded-none accent-orange-500 text-orange-500 focus:ring-orange-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-4">ชื่อไฟล์</th>
                    <th className="py-3 px-4">ขนาด</th>
                    <th className="py-3 px-4">ผู้แชร์</th>
                    <th className="py-3 px-4">อัปโหลดเมื่อ</th>
                    <th className="py-3 px-4 text-center">ดาวน์โหลด</th>
                    <th className="py-3 px-4 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFiles.map((file, index) => {
                    const IconComponent = getCategoryIcon(file.category, file.originalName);
                    const isSelected = selectedFileIds.has(file.id);
                    const staggerDelay = Math.min(((index % 15) + 2) * 110, 1400);

                    return (
                      <tr
                        key={file.id}
                        style={isFirstVisit ? {
                          animation: `staggerReveal 0.75s cubic-bezier(0.22, 1, 0.36, 1) ${staggerDelay}ms both`,
                        } : undefined}
                        className={`hover:bg-slate-50/70 dark:hover:bg-[#120608]/70 transition-colors ${
                          isSelected ? 'bg-orange-50/50 dark:bg-red-950/25' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectFile(file.id)}
                            className="rounded-none accent-orange-500 text-orange-500 focus:ring-orange-500 cursor-pointer"
                          />
                        </td>

                        <td className="py-3 px-4">
                          <div 
                            onClick={() => onPreview(file)}
                            className="flex items-center gap-2.5 cursor-pointer group"
                          >
                            <div className="p-1.5 rounded-icon-box-sm bg-slate-100 dark:bg-[#120608] text-slate-500 dark:text-slate-400 group-hover:text-red-600 dark:group-hover:text-orange-400 shrink-0">
                              <IconComponent className="w-4 h-4" />
                            </div>
                            <span 
                              className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-red-600 dark:group-hover:text-orange-400 transition-colors truncate max-w-xs sm:max-w-md"
                              title={file.originalName}
                            >
                              {file.originalName}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {formatFileSize(file.size)}
                        </td>

                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {file.uploaderName || 'ผู้ใช้นิรนาม'}
                        </td>

                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {formatRelativeTime(file.uploadedAt)}
                        </td>

                        <td className="py-3 px-4 text-center font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {file.downloadCount}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => onPreview(file)}
                              className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-orange-400 hover:bg-slate-100 dark:hover:bg-[#120608] rounded-none transition-colors cursor-pointer"
                              title="ดูตัวอย่าง"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleCopyLinkClick(file)}
                              className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-orange-400 hover:bg-slate-100 dark:hover:bg-[#120608] rounded-none transition-colors cursor-pointer"
                              title="คัดลอกลิงก์"
                            >
                              {copiedId === file.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </button>

                            <button
                              onClick={() => onDownload(file)}
                              className="px-2.5 py-1 text-xs font-medium text-white bg-gradient-to-r from-red-600 to-orange-500 hover:opacity-95 rounded-none flex items-center gap-1 transition-opacity cursor-pointer"
                              title="ดาวน์โหลด"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>โหลด</span>
                            </button>

                            <button
                              onClick={() => onDelete(file.id, file.originalName)}
                              className="p-1.5 text-slate-400 hover:text-rose-500 rounded-none hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                              title="ลบไฟล์นี้จาก Google Drive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </ScrollRevealItem>
      )}
    </section>
  );
};
