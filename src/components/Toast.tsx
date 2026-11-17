import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-none shadow-none text-xs font-medium transition-all transform animate-slideUp ${
            toast.type === 'success'
              ? 'bg-emerald-50 dark:bg-[#090305] text-emerald-900 dark:text-emerald-300'
              : toast.type === 'error'
              ? 'bg-rose-50 dark:bg-[#090305] text-rose-900 dark:text-rose-300'
              : 'bg-slate-900 text-white dark:bg-[#090305] dark:text-orange-100'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-orange-400 shrink-0" />}
            <span className="truncate">{toast.message}</span>
          </div>

          <button
            onClick={() => onDismiss(toast.id)}
            className="p-1 rounded-none opacity-70 hover:opacity-100 transition-opacity shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
