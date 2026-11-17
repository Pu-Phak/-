import React from 'react';
import { HardDrive, Lock, ShieldCheck, LogOut } from 'lucide-react';
import { GoogleAuthUser } from '../types';
import { GoogleSignInButton } from './GoogleSignInButton';
import { ScrollRevealItem } from './ScrollRevealItem';

interface AuthGateCardProps {
  currentUser: GoogleAuthUser | null;
  isLoggingIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
  contextTitle?: string;
  contextDescription?: string;
  isFirstVisit?: boolean;
}

export const AuthGateCard: React.FC<AuthGateCardProps> = ({
  currentUser,
  isLoggingIn,
  onLogin,
  onLogout,
  contextTitle = 'เข้าสู่ระบบเพื่อใช้งานพื้นที่เก็บข้อมูลส่วนตัว',
  contextDescription = 'ข้อมูลไฟล์และข้อความบันทึกจะถูกแยกตามอีเมลของคุณแบบ 1 ต่อ 1 และจัดเก็บลงใน Google Drive ของบัญชีที่เข้าสู่ระบบโดยตรง',
  isFirstVisit = true,
}) => {
  return (
    <div className="relative w-full max-w-2xl mx-auto py-6">
      <div className="absolute -inset-4 bg-gradient-to-r from-red-600/25 via-orange-500/20 to-black/60 blur-3xl opacity-75 -z-10 pointer-events-none" />

      <div className="rounded-discovery-panel relative backdrop-blur-3xl backdrop-saturate-150 bg-white/90 dark:bg-[#090305]/90 p-6 sm:p-10 shadow-none space-y-6 text-center overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-red-500/60 via-orange-400/70 to-transparent pointer-events-none" />

        <ScrollRevealItem isFirstVisit={isFirstVisit} index={1}>
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-600 to-orange-500 text-white flex items-center justify-center mx-auto shadow-none">
              <HardDrive className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-medium text-slate-900 dark:text-white">
                {currentUser ? 'ยืนยันสิทธิ์เข้าถึง Google Drive อีกครั้ง' : contextTitle}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 font-light max-w-lg mx-auto leading-relaxed">
                {currentUser
                  ? `คุณเข้าสู่ระบบในชื่อ ${currentUser.email} อยู่แล้ว กรุณากดยืนยันสิทธิ์เพื่อเชื่อมต่อพื้นที่เก็บข้อมูล Google Drive ของอีเมลนี้`
                  : contextDescription}
              </p>
            </div>
          </div>
        </ScrollRevealItem>

        {currentUser && (
          <ScrollRevealItem isFirstVisit={isFirstVisit} index={2}>
            <div className="rounded-discovery-card inline-flex items-center gap-3 px-4 py-2.5 bg-slate-100/80 dark:bg-[#120608] mx-auto">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName}
                  className="w-8 h-8 rounded-discovery-pill object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-discovery-pill bg-gradient-to-br from-red-600 to-orange-500 text-white text-xs font-medium flex items-center justify-center">
                  {currentUser.email.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="text-left">
                <div className="text-xs font-medium text-slate-900 dark:text-white">
                  {currentUser.displayName}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-orange-300/80 font-mono">
                  {currentUser.email}
                </div>
              </div>
            </div>
          </ScrollRevealItem>
        )}

        <ScrollRevealItem isFirstVisit={isFirstVisit} index={currentUser ? 3 : 2}>
          <div className="flex flex-col items-center gap-3 pt-1">
            <GoogleSignInButton
              onClick={onLogin}
              disabled={isLoggingIn}
              label={isLoggingIn ? 'กำลังเข้าสู่ระบบ...' : 'Sign in with Google'}
            />

            {currentUser && (
              <button
                type="button"
                onClick={onLogout}
                className="rounded-discovery-btn px-3 py-1.5 text-xs text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>ออกจากระบบ / เปลี่ยนอีเมลอื่น</span>
              </button>
            )}
          </div>
        </ScrollRevealItem>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 text-left text-xs text-slate-600 dark:text-slate-400">
          <ScrollRevealItem isFirstVisit={isFirstVisit} index={currentUser ? 4 : 3}>
            <div className="rounded-discovery-card p-3.5 bg-slate-50/80 dark:bg-[#070204] flex items-start gap-2.5 h-full">
              <Lock className="w-4 h-4 text-red-500 dark:text-orange-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-slate-800 dark:text-orange-100">แยกข้อมูลตามอีเมล 100%</div>
                <div className="font-light mt-0.5">1 อีเมล = 1 คลังข้อมูลส่วนตัว ไม่ปะปนกับผู้ใช้อื่น</div>
              </div>
            </div>
          </ScrollRevealItem>

          <ScrollRevealItem isFirstVisit={isFirstVisit} index={currentUser ? 5 : 4}>
            <div className="rounded-discovery-card p-3.5 bg-slate-50/80 dark:bg-[#070204] flex items-start gap-2.5 h-full">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-slate-800 dark:text-orange-100">เก็บไฟล์บน Google Drive</div>
                <div className="font-light mt-0.5">สร้างโฟลเดอร์ SharedDrop Workspace บน Drive ของคุณเอง</div>
              </div>
            </div>
          </ScrollRevealItem>
        </div>
      </div>
    </div>
  );
};
