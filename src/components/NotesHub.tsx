import React, { useState, useMemo } from 'react';
import {
  MessageSquareText,
  Pin,
  PinOff,
  Copy,
  Check,
  Pencil,
  Trash2,
  Search,
  Send,
  User,
  Download,
  X,
  Save,
} from 'lucide-react';
import { SharedNote } from '../types';
import { formatRelativeTime } from '../utils/formatters';
import { ScrollRevealItem } from './ScrollRevealItem';

interface NotesHubProps {
  notes: SharedNote[];
  isLoading: boolean;
  uploaderName: string;
  setUploaderName: (name: string) => void;
  onCreateNote: (payload: {
    title: string;
    content: string;
    author: string;
    isPinned: boolean;
  }) => Promise<boolean>;
  onUpdateNote: (
    id: string,
    payload: Partial<Pick<SharedNote, 'title' | 'content' | 'isPinned'>>
  ) => Promise<boolean>;
  onDeleteNote: (id: string) => Promise<void>;
  isFirstVisit?: boolean;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const NotesHub: React.FC<NotesHubProps> = ({
  notes,
  isLoading,
  uploaderName,
  setUploaderName,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  isFirstVisit = false,
  onToast,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPinnedNew, setIsPinnedNew] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'pinned'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notes.filter((note) => {
      if (filterMode === 'pinned' && !note.isPinned) return false;
      if (!q) return true;
      return (
        note.title.toLowerCase().includes(q) ||
        note.content.toLowerCase().includes(q) ||
        note.author.toLowerCase().includes(q)
      );
    });
  }, [notes, searchQuery, filterMode]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!content.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const ok = await onCreateNote({
      title: title.trim(),
      content,
      author: uploaderName.trim() || 'ผู้ใช้นิรนาม',
      isPinned: isPinnedNew,
    });
    setIsSubmitting(false);

    if (ok) {
      setTitle('');
      setContent('');
      setIsPinnedNew(false);
    }
  };

  const handleCopy = (note: SharedNote) => {
    const textToCopy = note.title ? `${note.title}\n\n${note.content}` : note.content;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(textToCopy)
        .then(() => {
          setCopiedId(note.id);
          setTimeout(() => setCopiedId((prev) => (prev === note.id ? null : prev)), 1800);
          onToast('success', 'คัดลอกข้อความลงคลิปบอร์ดแล้ว');
        })
        .catch(() => {
          onToast('error', 'ไม่สามารถคัดลอกข้อความได้');
        });
    }
  };

  const handleDownloadTxt = (note: SharedNote) => {
    const body = note.title ? `${note.title}\n${'='.repeat(30)}\n\n${note.content}` : note.content;
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (note.title || 'note').replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
    a.download = `${safeTitle}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onToast('info', `ดาวน์โหลด "${safeTitle}.txt" แล้ว`);
  };

  const startEditing = (note: SharedNote) => {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditTitle('');
    setEditContent('');
  };

  const saveEdit = async (id: string) => {
    if (!editContent.trim() || isSavingEdit) return;
    setIsSavingEdit(true);
    const ok = await onUpdateNote(id, {
      title: editTitle.trim(),
      content: editContent,
    });
    setIsSavingEdit(false);
    if (ok) {
      cancelEditing();
    }
  };

  // Render note text with clickable HTTP/HTTPS links
  const renderRichText = (text: string) => {
    const parts = text.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((part, idx) => {
      if (/^https?:\/\/[^\s]+$/.test(part)) {
        return (
          <a
            key={idx}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-red-600 dark:text-orange-400 underline underline-offset-4 hover:opacity-80 break-all"
          >
            {part}
          </a>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  return (
    <div className="space-y-8">
      {/* Compose / Save New Message Card (Floating Frosted Glass) */}
      <ScrollRevealItem isFirstVisit={isFirstVisit} index={1}>
        <div className="relative w-full">
          <div className="absolute -inset-3 bg-gradient-to-r from-red-600/30 via-orange-500/20 to-black/70 blur-3xl opacity-75 dark:opacity-70 -z-10 pointer-events-none" />

          <form
            onSubmit={handleSubmit}
            className="rounded-none relative backdrop-blur-3xl backdrop-saturate-150 bg-white/85 dark:bg-[#090305]/85 p-6 sm:p-8 space-y-5 overflow-hidden"
          >
            <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-red-500/60 via-orange-400/70 to-transparent pointer-events-none" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-icon-box-lg bg-gradient-to-br from-red-600 to-orange-500 text-white flex items-center justify-center shrink-0">
                  <MessageSquareText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-medium text-slate-900 dark:text-white">
                    เขียนและบันทึกข้อความใหม่
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-light">
                    บันทึกข้อความ โน้ต ลิงก์ หรือโค้ดไว้ใน Google Drive ส่วนตัวของอีเมลนี้ แยกเฉพาะบัญชีคุณเท่านั้น
                  </p>
                </div>
              </div>

              <div className="relative self-start sm:self-center">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-orange-400/70">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={uploaderName}
                  onChange={(e) => setUploaderName(e.target.value)}
                  placeholder="ชื่อผู้บันทึก (ไม่ระบุก็ได้)"
                  className="rounded-none pl-9 pr-3 py-1.5 text-xs bg-slate-100 dark:bg-[#070204] text-slate-800 dark:text-orange-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 w-48 sm:w-56 font-light"
                />
              </div>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="หัวข้อบันทึก (ไม่ระบุก็ได้)"
                className="rounded-none w-full px-4 py-2.5 text-sm bg-slate-100/90 dark:bg-[#070204] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />

              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                rows={4}
                placeholder="พิมพ์หรือวางข้อความที่ต้องการบันทึกที่นี่... (กด Ctrl+Enter เพื่อบันทึกทันที)"
                className="rounded-none w-full px-4 py-3 text-sm bg-slate-100/90 dark:bg-[#070204] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 leading-relaxed resize-y"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPinnedNew((p) => !p)}
                  className={`rounded-none px-3 py-2 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
                    isPinnedNew
                      ? 'bg-orange-500/15 text-red-600 dark:text-orange-400'
                      : 'bg-slate-100 dark:bg-[#120608] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#1a0a0d]'
                  }`}
                >
                  <Pin className="w-3.5 h-3.5" />
                  <span>{isPinnedNew ? 'จะปักหมุดไว้บนสุด' : 'ปักหมุดบันทึกนี้'}</span>
                </button>
                <span className="text-xs font-mono tabular-nums text-slate-400 dark:text-slate-500">
                  {content.length} ตัวอักษร
                </span>
              </div>

              <button
                type="submit"
                disabled={!content.trim() || isSubmitting}
                className="rounded-none px-6 py-2.5 bg-gradient-to-r from-red-600 via-orange-500 to-amber-500 hover:opacity-95 disabled:opacity-40 text-white text-xs sm:text-sm font-medium flex items-center gap-2 transition-all cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'กำลังบันทึก...' : 'บันทึกข้อความ'}</span>
              </button>
            </div>
          </form>
        </div>
      </ScrollRevealItem>

      {/* Filter & Search Toolbar */}
      <ScrollRevealItem isFirstVisit={isFirstVisit} index={2}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`rounded-none px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white'
                  : 'bg-white dark:bg-[#090305] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#120608]'
              }`}
            >
              ทั้งหมด ({notes.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('pinned')}
              className={`rounded-none px-3.5 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                filterMode === 'pinned'
                  ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white'
                  : 'bg-white dark:bg-[#090305] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#120608]'
              }`}
            >
              <Pin className="w-3.5 h-3.5" />
              <span>ที่ปักหมุด ({notes.filter((n) => n.isPinned).length})</span>
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 dark:text-orange-400/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาข้อความ หัวข้อ หรือผู้บันทึก..."
              className="rounded-none w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-[#090305] text-slate-800 dark:text-orange-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>
      </ScrollRevealItem>

      {/* Saved Messages & Notes List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[1, 2].map((i) => (
            <ScrollRevealItem key={i} isFirstVisit={isFirstVisit} index={i + 2}>
              <div className="rounded-none h-40 bg-white dark:bg-[#090305] animate-pulse p-6" />
            </ScrollRevealItem>
          ))}
        </div>
      ) : filteredNotes.length === 0 ? (
        <ScrollRevealItem isFirstVisit={isFirstVisit} index={3}>
          <div className="rounded-none py-14 px-6 text-center bg-white dark:bg-[#090305] space-y-3">
            <div className="w-12 h-12 rounded-icon-box-lg bg-orange-50 dark:bg-[#120608] text-red-600 dark:text-orange-400 flex items-center justify-center mx-auto">
              <MessageSquareText className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {searchQuery || filterMode === 'pinned'
                ? 'ไม่พบข้อความที่ตรงกับการค้นหา'
                : 'ยังไม่มีข้อความที่บันทึกไว้'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-light">
              {searchQuery || filterMode === 'pinned'
                ? 'ลองเปลี่ยนคำค้นหาหรือเลือกดูข้อความทั้งหมด'
                : 'พิมพ์ข้อความด้านบนแล้วกดบันทึก ข้อความจะปรากฏให้เปิดดูและคัดลอกได้จากทุกเครื่อง'}
            </p>
          </div>
        </ScrollRevealItem>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredNotes.map((note, idx) => {
            const isEditing = editingId === note.id;
            return (
              <ScrollRevealItem key={note.id} isFirstVisit={isFirstVisit} index={idx + 3}>
                <article
                  className={`rounded-none h-full flex flex-col justify-between transition-all p-5 sm:p-6 ${
                    note.isPinned
                      ? 'bg-orange-50/50 dark:bg-[#110508]'
                      : 'bg-white dark:bg-[#090305]'
                  }`}
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="หัวข้อบันทึก (ไม่ระบุก็ได้)"
                        className="rounded-none w-full px-3 py-2 text-sm bg-slate-100 dark:bg-[#070204] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={5}
                        className="rounded-none w-full px-3 py-2 text-sm bg-slate-100 dark:bg-[#070204] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={cancelEditing}
                          className="rounded-none px-3 py-1.5 text-xs bg-slate-100 dark:bg-[#120608] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1a0a0d] flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>ยกเลิก</span>
                        </button>
                        <button
                          type="button"
                          disabled={!editContent.trim() || isSavingEdit}
                          onClick={() => saveEdit(note.id)}
                          className="rounded-none px-3.5 py-1.5 text-xs bg-gradient-to-r from-red-600 to-orange-500 hover:opacity-95 text-white font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{isSavingEdit ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {/* Header & Unboxed Metadata */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            {note.title && (
                              <h3 className="text-base font-medium text-slate-900 dark:text-white leading-snug break-words">
                                {note.title}
                              </h3>
                            )}
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-light">
                              <span>{note.author}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {formatRelativeTime(note.updatedAt)}
                              </span>
                              {note.isPinned && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-red-600 dark:text-orange-400 font-medium inline-flex items-center gap-1">
                                    <Pin className="w-3 h-3" />
                                    ปักหมุด
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Message Body */}
                        <div className="rounded-none text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words leading-relaxed bg-slate-100/80 dark:bg-[#070204] p-3.5 max-h-72 overflow-y-auto">
                          {renderRichText(note.content)}
                        </div>
                      </div>

                      {/* Action Footer */}
                      <div className="pt-4 mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => handleCopy(note)}
                          className="rounded-none px-3 py-1.5 bg-gradient-to-r from-red-600 to-orange-500 hover:opacity-95 text-white font-medium flex items-center gap-1.5 cursor-pointer transition-opacity"
                        >
                          {copiedId === note.id ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>คัดลอกแล้ว</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>คัดลอกข้อความ</span>
                            </>
                          )}
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onUpdateNote(note.id, { isPinned: !note.isPinned })}
                            className="rounded-none p-2 bg-slate-100 dark:bg-[#120608] hover:bg-slate-200 dark:hover:bg-[#1a0a0d] text-slate-500 hover:text-orange-500 dark:text-slate-400 dark:hover:text-orange-400 transition-colors cursor-pointer"
                            title={note.isPinned ? 'เลิกปักหมุด' : 'ปักหมุดไว้บนสุด'}
                          >
                            {note.isPinned ? (
                              <PinOff className="w-3.5 h-3.5" />
                            ) : (
                              <Pin className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDownloadTxt(note)}
                            className="rounded-none p-2 bg-slate-100 dark:bg-[#120608] hover:bg-slate-200 dark:hover:bg-[#1a0a0d] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
                            title="ดาวน์โหลดเป็นไฟล์ .txt"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => startEditing(note)}
                            className="rounded-none p-2 bg-slate-100 dark:bg-[#120608] hover:bg-slate-200 dark:hover:bg-[#1a0a0d] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
                            title="แก้ไขข้อความ"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onDeleteNote(note.id)}
                            className="rounded-none p-2 bg-slate-100 dark:bg-[#120608] hover:bg-slate-200 dark:hover:bg-[#1a0a0d] text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-500 transition-colors cursor-pointer"
                            title="ลบข้อความ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </article>
              </ScrollRevealItem>
            );
          })}
        </div>
      )}
    </div>
  );
};
