import React from 'react';
import { UploadCloud, Files, MessageSquareText, MonitorSmartphone } from 'lucide-react';
import { AppPage } from '../types';

interface FloatingNavProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  totalFiles: number;
  totalNotes: number;
}

export const FloatingNav: React.FC<FloatingNavProps> = ({
  currentPage,
  onNavigate,
  totalFiles,
  totalNotes,
}) => {
  const navItems = [
    {
      id: 'dropzone' as AppPage,
      label: 'วางไฟล์',
      icon: UploadCloud,
    },
    {
      id: 'inspect' as AppPage,
      label: 'ตรวจเช็ค',
      icon: Files,
      badge: totalFiles,
    },
    {
      id: 'notes' as AppPage,
      label: 'บันทึก',
      icon: MessageSquareText,
      badge: totalNotes,
    },
    {
      id: 'remote' as AppPage,
      label: 'รีโมท',
      icon: MonitorSmartphone,
    },
  ];

  return (
    <nav aria-label="เมนูหลักลอยด้านล่าง" className="fixed bottom-6 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-40 max-w-sm w-full bg-white/90 dark:bg-[#090305]/90 backdrop-blur-3xl border border-slate-200/80 dark:border-red-500/40 p-2.5 rounded-3xl shadow-[0_15px_35px_-10px_rgba(0,0,0,0.18)] dark:shadow-[0_15px_35px_-10px_rgba(220,38,38,0.25)] flex items-center justify-around gap-1.5">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentPage === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onNavigate(item.id);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`rounded-2xl flex-1 flex flex-col items-center justify-center py-2 px-1 text-xs font-medium transition-all cursor-pointer relative ${
              isActive
                ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-md shadow-orange-500/20'
                : 'text-slate-600 dark:text-orange-200/80 hover:bg-slate-100 dark:hover:bg-[#16080b]'
            }`}
          >
            <div className="relative">
              <Icon className="w-4 h-4" />
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-red-600 text-white text-[9px] font-mono tabular-nums px-1.5 py-0.2 rounded-full">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="mt-1 text-[11px] truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
