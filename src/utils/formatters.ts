import React from 'react';
import { 
  FileText, 
  Image as ImageIcon, 
  Video, 
  Music, 
  Archive, 
  Code, 
  File as FileGeneric,
  FileSpreadsheet
} from 'lucide-react';
import { FileCategory } from '../types';

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = (bytes / Math.pow(k, i));
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${sizes[i]}`;
}

export function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 45) return 'เมื่อสักครู่';
    if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
    if (diffHour < 24) return `${diffHour} ชั่วโมงที่แล้ว`;
    if (diffDay === 1) return 'เมื่อวานนี้';
    if (diffDay < 7) return `${diffDay} วันที่แล้ว`;

    // Standard Thai date format
    const day = date.getDate();
    const thaiMonths = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];
    const month = thaiMonths[date.getMonth()];
    const year = (date.getFullYear() + 543) % 100;
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return `${day} ${month} ${year} ${hours}:${minutes} น.`;
  } catch {
    return dateString;
  }
}

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length > 1) {
    return parts.pop()?.toUpperCase() || 'FILE';
  }
  return 'FILE';
}

export function getCategoryBadge(category: FileCategory): { label: string; color: string } {
  switch (category) {
    case 'image':
      return { label: 'รูปภาพ', color: 'text-emerald-600 dark:text-emerald-400' };
    case 'video':
      return { label: 'วิดีโอ', color: 'text-violet-600 dark:text-violet-400' };
    case 'audio':
      return { label: 'เสียง', color: 'text-amber-600 dark:text-amber-400' };
    case 'document':
      return { label: 'เอกสาร', color: 'text-blue-600 dark:text-blue-400' };
    case 'archive':
      return { label: 'ไฟล์บีบอัด', color: 'text-orange-600 dark:text-orange-400' };
    case 'code':
      return { label: 'โค้ด/ข้อมูล', color: 'text-indigo-600 dark:text-indigo-400' };
    default:
      return { label: 'ไฟล์ทั่วไป', color: 'text-slate-600 dark:text-slate-400' };
  }
}

export function getCategoryIcon(category: string, filename: string): React.ElementType {
  const ext = filename.split('.').pop()?.toLowerCase();

  if (['xls', 'xlsx', 'csv'].includes(ext || '')) {
    return FileSpreadsheet;
  }
  if (category === 'image') return ImageIcon;
  if (category === 'video') return Video;
  if (category === 'audio') return Music;
  if (category === 'document') return FileText;
  if (category === 'archive') return Archive;
  if (category === 'code') return Code;
  return FileGeneric;
}
