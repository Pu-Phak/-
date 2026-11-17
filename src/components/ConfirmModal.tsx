import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => Promise<void> | void;
}

interface ConfirmModalProps {
  dialog: ConfirmDialogState | null;
  isProcessing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  dialog,
  isProcessing,
  onCancel,
  onConfirm,
}) => {
  if (!dialog || !dialog.isOpen) return null;

  const isDanger = dialog.variant !== 'primary';

  return (
    <div
      onClick={() => !isProcessing && onCancel()}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 dark:bg-black/85 backdrop-blur-sm animate-fadeIn"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-discovery-panel w-full max-w-md bg-white dark:bg-[#090305] p-6 shadow-none space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-icon-box flex items-center justify-center shrink-0 ${
                isDanger
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                  : 'bg-orange-500/15 text-red-600 dark:text-orange-400'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-medium text-slate-900 dark:text-white">
              {dialog.title}
            </h3>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onCancel}
            className="rounded-none p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 font-light leading-relaxed">
          {dialog.message}
        </p>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onCancel}
            className="rounded-discovery-btn px-4 py-2 text-xs font-medium bg-slate-100 dark:bg-[#120608] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1a0a0d] cursor-pointer disabled:opacity-40"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onConfirm}
            className={`rounded-discovery-btn px-4 py-2 text-xs font-medium text-white cursor-pointer disabled:opacity-50 ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-gradient-to-r from-red-600 to-orange-500 hover:opacity-95'
            }`}
          >
            {isProcessing ? 'กำลังดำเนินการ...' : dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
