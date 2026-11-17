import React from 'react';
import {
  Sun,
  Moon,
  ArrowUpFromLine,
  RefreshCw,
  HardDrive,
  LogIn,
  Eye,
  EyeOff,
} from 'lucide-react';
import { AppPage, DriveQuotaInfo, GoogleAuthUser } from '../types';
import { formatFileSize } from '../utils/formatters';

interface HeaderProps {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onQuickUploadClick: () => void;
  onRefreshClick: () => void;
  isRefreshing: boolean;
  totalFiles: number;
  totalNotes: number;
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  currentUser: GoogleAuthUser | null;
  hasDriveToken: boolean;
  driveQuota: DriveQuotaInfo | null;
  isLoggingIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
  areAnyHeroDescVisible: boolean;
  onToggleAllHeroDesc: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isDarkMode,
  onToggleDarkMode,
  onQuickUploadClick,
  onRefreshClick,
  isRefreshing,
  onNavigate,
  currentUser,
  hasDriveToken,
  driveQuota,
  isLoggingIn,
  onLogin,
  areAnyHeroDescVisible,
  onToggleAllHeroDesc,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full px-2 sm:px-4 pt-2 bg-slate-50/85 dark:bg-black/85 backdrop-blur-md transition-colors">
      <div className="rounded-discovery-panel w-full bg-white/95 dark:bg-[#090305]/95 px-3 sm:px-5 py-2.5 flex items-center justify-between gap-4">
        {/* Left: Brand Logo */}
        <button
          type="button"
          onClick={() => onNavigate('dropzone')}
          className="flex items-center gap-2.5 hover:opacity-90 transition-opacity cursor-pointer"
        >
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-red-600 to-orange-500 text-white flex items-center justify-center shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <span className="text-lg font-medium tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            SharedDrop
          </span>
        </button>

        {/* Right: Quick Actions, Sync, Toggle All Hero Text, Account, Theme Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onQuickUploadClick}
            className="rounded-discovery-btn hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-orange-50 dark:bg-red-950/60 text-red-600 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-red-900/60 cursor-pointer transition-colors"
          >
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            <span>อัปโหลด</span>
          </button>

          {hasDriveToken && (
            <button
              type="button"
              onClick={onRefreshClick}
              disabled={isRefreshing}
              className="rounded-discovery-btn hidden md:flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-[#120608] text-slate-700 dark:text-orange-200 hover:bg-slate-200 dark:hover:bg-[#1a0a0d] cursor-pointer transition-colors"
              title="ซิงค์ข้อมูลจาก Google Drive"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-orange-400' : 'text-orange-500'}`} />
              <span>ซิงค์</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleAllHeroDesc}
            aria-pressed={!areAnyHeroDescVisible}
            className="rounded-discovery-btn flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-[#120608] text-slate-700 dark:text-orange-200 hover:bg-slate-200 dark:hover:bg-[#1a0a0d] hover:text-red-600 dark:hover:text-orange-400 cursor-pointer transition-colors"
            title={areAnyHeroDescVisible ? 'ปิดข้อความทั้งหมด' : 'เปิดข้อความทั้งหมด'}
          >
            {areAnyHeroDescVisible ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-red-500 dark:text-orange-400 shrink-0" />
                <span className="hidden sm:inline">ปิดข้อความทั้งหมด</span>
                <span className="sm:hidden">ปิดทั้งหมด</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                <span className="hidden sm:inline">เปิดข้อความทั้งหมด</span>
                <span className="sm:hidden">เปิดทั้งหมด</span>
              </>
            )}
          </button>

          {currentUser && hasDriveToken ? (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-discovery-pill bg-slate-100/90 dark:bg-[#120608]">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName}
                  className="w-6 h-6 rounded-discovery-pill object-cover shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-6 h-6 rounded-discovery-pill bg-gradient-to-br from-red-600 to-orange-500 text-white text-[11px] font-medium flex items-center justify-center shrink-0">
                  {currentUser.email.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="hidden lg:block text-left leading-tight max-w-[130px]">
                <div className="text-[11px] font-medium text-slate-800 dark:text-orange-100 truncate">
                  {currentUser.email}
                </div>
                {driveQuota && (
                  <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-orange-400/80 truncate">
                    {formatFileSize(driveQuota.usageInDrive)}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              disabled={isLoggingIn}
              className="rounded-discovery-btn flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-[#120608] text-slate-800 dark:text-white hover:bg-slate-200 dark:hover:bg-[#1a0a0d] cursor-pointer disabled:opacity-50 transition-colors"
            >
              <LogIn className="w-3.5 h-3.5 text-red-600 dark:text-orange-400" />
              <span>{currentUser ? 'เชื่อม Drive' : 'เข้าสู่ระบบ'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleDarkMode}
            className="rounded-discovery-btn p-2 text-slate-500 hover:text-orange-600 hover:bg-slate-100 dark:text-orange-300/80 dark:hover:text-orange-400 dark:hover:bg-[#1a0a0d] cursor-pointer transition-colors"
            aria-label={isDarkMode ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด (ส้ม-แดง)'}
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-orange-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>
        </div>
      </div>
    </header>
  );
};
