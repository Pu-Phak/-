import { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  ArrowRight,
  ArrowLeft,
  Files,
  UploadCloud,
} from 'lucide-react';
import {
  SharedFile,
  UploadItem,
  AppPage,
  SharedNote,
  GoogleAuthUser,
  DriveQuotaInfo,
} from './types';
import { Header } from './components/Header';
import { FloatingNav } from './components/FloatingNav';
import { DropZone } from './components/DropZone';
import { FileList } from './components/FileList';
import { NotesHub } from './components/NotesHub';
import { RemoteScreen } from './components/RemoteScreen';
import { PreviewModal } from './components/PreviewModal';
import { AuthGateCard } from './components/AuthGateCard';
import { ConfirmModal, ConfirmDialogState } from './components/ConfirmModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { ScrollRevealItem } from './components/ScrollRevealItem';
import { usePageAnimation } from './hooks/usePageAnimation';
import {
  initAuth,
  googleSignIn,
  logout,
  clearInMemoryToken,
  toGoogleAuthUser,
} from './utils/googleAuth';
import {
  DriveAuthError,
  resetDriveSessionCache,
  fetchDriveQuota,
  listDriveFiles,
  uploadFileToDrive,
  fetchDriveFileBlob,
  deleteDriveFile,
  listDriveNotes,
  createDriveNote,
  updateDriveNote,
  deleteDriveNote,
} from './utils/googleDriveStorage';

export default function App() {
  const [initialRoomCode] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const code = new URLSearchParams(window.location.search).get('room') || '';
      return /^\d{6}$/.test(code) ? code : '';
    }
    return '';
  });

  const [currentPage, setCurrentPage] = useState<AppPage>(() =>
    initialRoomCode ? 'remote' : 'dropzone'
  );
  const [navCount, setNavCount] = useState(0);
  const { isFirstVisit } = usePageAnimation(currentPage);

  const navigateToPage = useCallback((page: AppPage) => {
    setCurrentPage(page);
    setNavCount((c) => c + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const [showHeroDesc, setShowHeroDesc] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('shared_drop_hero_desc_visible');
        if (saved === 'false') return false;
        if (saved === 'true') return true;
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed === 'boolean') return parsed;
          if (parsed && typeof parsed === 'object') {
            return Boolean(parsed.dropzone || parsed.inspect || parsed.notes);
          }
        }
      } catch {
        // Ignore invalid JSON
      }
    }
    return true;
  });

  const toggleAllHeroDesc = useCallback(() => {
    setShowHeroDesc((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('shared_drop_hero_desc_visible', JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  const [uploaderName, setUploaderName] = useState<string>(() => {
    return localStorage.getItem('shared_drop_uploader') || '';
  });

  // Google Auth & Drive OAuth token state (token strictly in memory)
  const [currentUser, setCurrentUser] = useState<GoogleAuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [driveQuota, setDriveQuota] = useState<DriveQuotaInfo | null>(null);

  const [files, setFiles] = useState<SharedFile[]>([]);
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isNotesLoading, setIsNotesLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [previewFile, setPreviewFile] = useState<SharedFile | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Explicit user confirmation modal for destructive/mutating Drive operations
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [isConfirmProcessing, setIsConfirmProcessing] = useState<boolean>(false);
  const confirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const activeEmailRef = useRef<string>('');

  // Apply dark mode class to html element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // Persist uploader nickname
  useEffect(() => {
    localStorage.setItem('shared_drop_uploader', uploaderName);
  }, [uploaderName]);

  const addToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearUserWorkspaceState = useCallback(() => {
    resetDriveSessionCache();
    setFiles([]);
    setNotes([]);
    setDriveQuota(null);
    setPreviewFile(null);
    setUploadQueue([]);
  }, []);

  const handleDriveAuthExpiration = useCallback(() => {
    clearInMemoryToken();
    setAccessToken(null);
    setNeedsAuth(true);
    addToast('info', 'สิทธิ์เชื่อมต่อ Google Drive หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
  }, [addToast]);

  // Initialize Firebase Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        const mapped = toGoogleAuthUser(user);
        if (activeEmailRef.current && activeEmailRef.current !== mapped.email) {
          clearUserWorkspaceState();
        }
        activeEmailRef.current = mapped.email;
        setCurrentUser(mapped);
        setAccessToken(token);
        setNeedsAuth(false);
        setUploaderName((prev) => prev || mapped.displayName || mapped.email);
      },
      (user) => {
        if (user) {
          const mapped = toGoogleAuthUser(user);
          if (activeEmailRef.current && activeEmailRef.current !== mapped.email) {
            clearUserWorkspaceState();
          }
          activeEmailRef.current = mapped.email;
          setCurrentUser(mapped);
        } else {
          activeEmailRef.current = '';
          setCurrentUser(null);
          clearUserWorkspaceState();
        }
        setAccessToken(null);
        setNeedsAuth(true);
      }
    );

    return () => unsubscribe();
  }, [clearUserWorkspaceState]);

  // Fetch per-email files, notes, and quota from Google Drive
  const syncFromGoogleDrive = useCallback(
    async (token: string, email: string, isManualRefresh = false) => {
      if (!token || !email) {
        setNeedsAuth(true);
        return;
      }

      if (isManualRefresh) setIsRefreshing(true);
      if (files.length === 0) setIsLoading(true);
      if (notes.length === 0) setIsNotesLoading(true);

      try {
        const [driveFiles, driveNotes, quota] = await Promise.all([
          listDriveFiles(token, email),
          listDriveNotes(token, email),
          fetchDriveQuota(token).catch(() => null),
        ]);
        setFiles(driveFiles);
        setNotes(driveNotes);
        if (quota) setDriveQuota(quota);
      } catch (err) {
        if (err instanceof DriveAuthError) {
          handleDriveAuthExpiration();
        } else {
          console.error('Error syncing Google Drive:', err);
          if (isManualRefresh) {
            addToast('error', 'ไม่สามารถซิงค์ข้อมูลจาก Google Drive ได้');
          }
        }
      } finally {
        setIsLoading(false);
        setIsNotesLoading(false);
        if (isManualRefresh) {
          setTimeout(() => setIsRefreshing(false), 300);
        }
      }
    },
    [addToast, files.length, notes.length, handleDriveAuthExpiration]
  );

  // Sync automatically whenever user logs in or token becomes available
  useEffect(() => {
    if (accessToken && currentUser?.email && !needsAuth) {
      syncFromGoogleDrive(accessToken, currentUser.email, false);
    }
  }, [accessToken, currentUser?.email, needsAuth]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        const mapped = toGoogleAuthUser(result.user);
        if (activeEmailRef.current && activeEmailRef.current !== mapped.email) {
          clearUserWorkspaceState();
        }
        activeEmailRef.current = mapped.email;
        setCurrentUser(mapped);
        setAccessToken(result.accessToken);
        setNeedsAuth(false);
        setUploaderName(mapped.displayName || mapped.email);
        addToast('success', `เข้าสู่ระบบด้วย ${mapped.email} และเชื่อมต่อ Google Drive แล้ว`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('popup-closed-by-user')) {
        addToast('error', 'ไม่สามารถเข้าสู่ระบบด้วย Google ได้ กรุณาลองอีกครั้ง');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    activeEmailRef.current = '';
    setCurrentUser(null);
    setAccessToken(null);
    setNeedsAuth(true);
    clearUserWorkspaceState();
    addToast('info', 'ออกจากระบบแล้ว สามารถเข้าสู่ระบบด้วยอีเมลอื่นได้ทันที');
  };

  // Helper to prompt user with ConfirmModal before any mutating/deleting Drive API call
  const requestConfirmation = (
    options: Omit<ConfirmDialogState, 'isOpen' | 'onConfirm'>
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmDialog({
        ...options,
        isOpen: true,
        onConfirm: () => {
          resolve(true);
        },
      });
    });
  };

  const handleCancelConfirm = () => {
    if (isConfirmProcessing) return;
    setConfirmDialog(null);
    confirmResolverRef.current?.(false);
    confirmResolverRef.current = null;
  };

  const handleProceedConfirm = async () => {
    setConfirmDialog(null);
    confirmResolverRef.current?.(true);
    confirmResolverRef.current = null;
  };

  // Create note in signed-in user's Google Drive
  const handleCreateNote = async (payload: {
    title: string;
    content: string;
    author: string;
    isPinned: boolean;
  }): Promise<boolean> => {
    if (!accessToken || !currentUser?.email) {
      setNeedsAuth(true);
      return false;
    }

    try {
      const created = await createDriveNote(accessToken, currentUser.email, {
        ...payload,
        author: payload.author || currentUser.displayName || currentUser.email,
      });
      setNotes((prev) => {
        const next = [created, ...prev];
        next.sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        return next;
      });
      addToast('success', 'บันทึกข้อความลง Google Drive ของคุณแล้ว');
      return true;
    } catch (err) {
      if (err instanceof DriveAuthError) {
        handleDriveAuthExpiration();
      } else {
        addToast('error', 'ไม่สามารถบันทึกข้อความลง Google Drive ได้');
      }
      return false;
    }
  };

  // Update / Pin note in Google Drive (with mandatory confirmation dialog)
  const handleUpdateNote = async (
    id: string,
    payload: Partial<Pick<SharedNote, 'title' | 'content' | 'isPinned'>>
  ): Promise<boolean> => {
    if (!accessToken || !currentUser?.email) {
      setNeedsAuth(true);
      return false;
    }

    const target = notes.find((n) => n.id === id);
    if (!target) return false;

    const actionDesc =
      payload.isPinned !== undefined && payload.content === undefined && payload.title === undefined
        ? payload.isPinned
          ? 'ต้องการปักหมุดข้อความนี้และอัปเดตไฟล์ใน Google Drive หรือไม่?'
          : 'ต้องการเลิกปักหมุดข้อความนี้และอัปเดตไฟล์ใน Google Drive หรือไม่?'
        : `ต้องการบันทึกการแก้ไขข้อความ "${target.title || 'ไม่มีหัวข้อ'}" ทับไฟล์เดิมใน Google Drive หรือไม่?`;

    const confirmed = await requestConfirmation({
      title: 'ยืนยันการแก้ไขข้อมูลบน Google Drive',
      message: actionDesc,
      confirmLabel: 'บันทึกการเปลี่ยนแปลง',
      variant: 'primary',
    });
    if (!confirmed) return false;

    setIsConfirmProcessing(true);
    try {
      const updated = await updateDriveNote(accessToken, target, payload);
      setNotes((prev) => {
        const next = prev.map((n) => (n.id === id ? updated : n));
        next.sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        return next;
      });
      addToast('success', 'อัปเดตข้อความบน Google Drive แล้ว');
      return true;
    } catch (err) {
      if (err instanceof DriveAuthError) {
        handleDriveAuthExpiration();
      } else {
        addToast('error', 'ไม่สามารถแก้ไขข้อความบน Google Drive ได้');
      }
      return false;
    } finally {
      setIsConfirmProcessing(false);
    }
  };

  // Delete note from Google Drive (with mandatory confirmation dialog)
  const handleDeleteNote = async (id: string) => {
    if (!accessToken || !currentUser?.email) {
      setNeedsAuth(true);
      return;
    }

    const target = notes.find((n) => n.id === id);
    if (!target?.driveFileId) return;

    const confirmed = await requestConfirmation({
      title: 'ยืนยันการลบข้อความจาก Google Drive',
      message: `คุณแน่ใจหรือไม่ว่าต้องการลบข้อความ "${target.title || target.content.slice(0, 40)}" ออกจาก Google Drive ของคุณ?`,
      confirmLabel: 'ลบข้อความ',
      variant: 'danger',
    });
    if (!confirmed) return;

    setIsConfirmProcessing(true);
    try {
      await deleteDriveNote(accessToken, target.driveFileId);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      addToast('success', 'ลบข้อความออกจาก Google Drive เรียบร้อยแล้ว');
    } catch (err) {
      if (err instanceof DriveAuthError) {
        handleDriveAuthExpiration();
      } else {
        addToast('error', 'ไม่สามารถลบข้อความได้');
      }
    } finally {
      setIsConfirmProcessing(false);
    }
  };

  // Handle files selected via drag & drop or file picker -> upload to signed-in user's Google Drive
  const handleFilesSelected = async (selectedFiles: FileList | File[], authorName: string) => {
    if (!accessToken || !currentUser?.email) {
      setNeedsAuth(true);
      addToast('info', 'กรุณาเข้าสู่ระบบ Google ก่อนอัปโหลดไฟล์');
      return;
    }

    const fileList = Array.from(selectedFiles);
    if (fileList.length === 0) return;

    const newUploadItems: UploadItem[] = fileList.map((file) => ({
      id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
      file,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'uploading',
    }));

    setUploadQueue((prev) => [...newUploadItems, ...prev]);

    let successCount = 0;

    for (const item of newUploadItems) {
      try {
        const uploadedFile = await uploadFileToDrive(
          accessToken,
          currentUser.email,
          item.file,
          authorName || currentUser.displayName || currentUser.email,
          (progress) => {
            setUploadQueue((prev) =>
              prev.map((u) => (u.id === item.id ? { ...u, progress } : u))
            );
          }
        );

        setUploadQueue((prev) =>
          prev.map((u) => (u.id === item.id ? { ...u, progress: 100, status: 'completed' } : u))
        );

        setFiles((prev) => [uploadedFile, ...prev.filter((f) => f.id !== uploadedFile.id)]);
        successCount++;
      } catch (err: unknown) {
        if (err instanceof DriveAuthError) {
          handleDriveAuthExpiration();
        }
        const errorMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการอัปโหลดลง Google Drive';
        setUploadQueue((prev) =>
          prev.map((u) => (u.id === item.id ? { ...u, status: 'error', errorMessage: errorMsg } : u))
        );
      }
    }

    if (successCount > 0) {
      fetchDriveQuota(accessToken)
        .then((q) => setDriveQuota(q))
        .catch(() => {});

      try {
        confetti({
          particleCount: 50,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#ea580c', '#dc2626', '#f97316', '#ffffff'],
        });
      } catch {
        // Ignore if confetti fails
      }

      addToast('success', `อัปโหลดลง Google Drive สำเร็จแล้ว ${successCount} ไฟล์`);
    }
  };

  const handleDismissUploadItem = (id: string) => {
    setUploadQueue((prev) => prev.filter((u) => u.id !== id));
  };

  // Direct download from Google Drive
  const handleDownload = async (file: SharedFile) => {
    if (!accessToken) {
      setNeedsAuth(true);
      return;
    }

    addToast('info', `กำลังดาวน์โหลด "${file.originalName}" จาก Google Drive...`);
    try {
      const blob = await fetchDriveFileBlob(accessToken, file.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.originalName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      setFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, downloadCount: f.downloadCount + 1 } : f))
      );
    } catch (err) {
      if (err instanceof DriveAuthError) {
        handleDriveAuthExpiration();
      } else {
        addToast('error', `ไม่สามารถดาวน์โหลดไฟล์ "${file.originalName}" จาก Google Drive ได้`);
      }
    }
  };

  // Copy Google Drive link
  const handleCopyLink = (file: SharedFile) => {
    const shareUrl = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(shareUrl)
        .then(() => {
          addToast('success', `คัดลอกลิงก์ Google Drive ของ "${file.originalName}" แล้ว`);
        })
        .catch(() => {
          fallbackCopyText(shareUrl);
        });
    } else {
      fallbackCopyText(shareUrl);
    }
  };

  const fallbackCopyText = (text: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      addToast('success', 'คัดลอกลิงก์ Google Drive แล้ว');
    } catch {
      addToast('error', 'ไม่สามารถคัดลอกลิงก์ได้ กรุณาลองใหม่');
    }
    document.body.removeChild(textArea);
  };

  // Delete single file from Google Drive (with mandatory confirmation dialog)
  const handleDelete = async (id: string, name: string) => {
    if (!accessToken) {
      setNeedsAuth(true);
      return;
    }

    const confirmed = await requestConfirmation({
      title: 'ยืนยันการลบไฟล์จาก Google Drive',
      message: `คุณแน่ใจหรือไม่ว่าต้องการลบไฟล์ "${name}" ออกจาก Google Drive ของคุณ? การกระทำนี้ไม่สามารถกู้คืนได้`,
      confirmLabel: 'ลบไฟล์ถาวร',
      variant: 'danger',
    });
    if (!confirmed) return;

    setIsConfirmProcessing(true);
    try {
      await deleteDriveFile(accessToken, id);
      setFiles((prev) => prev.filter((f) => f.id !== id));
      if (previewFile?.id === id) {
        setPreviewFile(null);
      }
      fetchDriveQuota(accessToken)
        .then((q) => setDriveQuota(q))
        .catch(() => {});
      addToast('success', `ลบไฟล์ "${name}" ออกจาก Google Drive แล้ว`);
    } catch (err) {
      if (err instanceof DriveAuthError) {
        handleDriveAuthExpiration();
      } else {
        console.error('Delete error:', err);
        addToast('error', `ไม่สามารถลบไฟล์ "${name}" ได้`);
      }
    } finally {
      setIsConfirmProcessing(false);
    }
  };

  // Batch delete multiple files from Google Drive (with mandatory confirmation dialog)
  const handleBatchDelete = async (filesToDelete: SharedFile[]) => {
    if (!accessToken || filesToDelete.length === 0) return;

    const previewNames = filesToDelete
      .slice(0, 3)
      .map((f) => f.originalName)
      .join(', ');
    const extraCount = filesToDelete.length > 3 ? ` และอีก ${filesToDelete.length - 3} ไฟล์` : '';

    const confirmed = await requestConfirmation({
      title: `ยืนยันการลบ ${filesToDelete.length} ไฟล์จาก Google Drive`,
      message: `คุณกำลังจะลบ ${filesToDelete.length} ไฟล์ (${previewNames}${extraCount}) ออกจาก Google Drive ของคุณอย่างถาวร ดำเนินการต่อหรือไม่?`,
      confirmLabel: `ลบทั้งหมด ${filesToDelete.length} ไฟล์`,
      variant: 'danger',
    });
    if (!confirmed) return;

    setIsConfirmProcessing(true);
    let deletedCount = 0;
    const deletedIds = new Set<string>();
    try {
      for (const f of filesToDelete) {
        await deleteDriveFile(accessToken, f.id);
        deletedIds.add(f.id);
        deletedCount++;
      }
      setFiles((prev) => prev.filter((f) => !deletedIds.has(f.id)));
      if (previewFile && deletedIds.has(previewFile.id)) {
        setPreviewFile(null);
      }
      fetchDriveQuota(accessToken)
        .then((q) => setDriveQuota(q))
        .catch(() => {});
      addToast('success', `ลบไฟล์จาก Google Drive สำเร็จ ${deletedCount} ไฟล์`);
    } catch (err) {
      if (err instanceof DriveAuthError) {
        handleDriveAuthExpiration();
      } else {
        addToast('error', 'เกิดข้อผิดพลาดระหว่างการลบไฟล์บางรายการ');
      }
    } finally {
      setIsConfirmProcessing(false);
    }
  };

  // Trigger file picker or switch to dropzone
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const handleQuickUploadClick = () => {
    if (needsAuth || !accessToken) {
      navigateToPage('dropzone');
      return;
    }

    if (currentPage !== 'dropzone') {
      navigateToPage('dropzone');
      setTimeout(() => {
        const el = document.getElementById('dropzone');
        if (el) {
          const input = el.querySelector('input[type="file"]') as HTMLInputElement;
          if (input) input.click();
        }
      }, 100);
    } else {
      const el = document.getElementById('dropzone');
      if (el) {
        const input = el.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) input.click();
      }
    }
  };

  const isAuthenticated = Boolean(currentUser && accessToken && !needsAuth);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#040102] text-slate-900 dark:text-slate-100 flex flex-col transition-colors selection:bg-orange-500 selection:text-white pb-24">
      {/* Top Bar Header */}
      <Header
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode((prev) => !prev)}
        onQuickUploadClick={handleQuickUploadClick}
        onRefreshClick={() => {
          if (accessToken && currentUser?.email) {
            syncFromGoogleDrive(accessToken, currentUser.email, true);
          }
        }}
        isRefreshing={isRefreshing}
        totalFiles={files.length}
        totalNotes={notes.length}
        currentPage={currentPage}
        onNavigate={navigateToPage}
        currentUser={currentUser}
        hasDriveToken={Boolean(accessToken && !needsAuth)}
        driveQuota={driveQuota}
        isLoggingIn={isLoggingIn}
        onLogin={handleLogin}
        onLogout={handleLogout}
        areAnyHeroDescVisible={showHeroDesc}
        onToggleAllHeroDesc={toggleAllHeroDesc}
      />

      {/* Hero Strip & Core Presentation (Full Width Side-to-Side) */}
      <section className="w-full px-2 sm:px-4 pt-4">
        <div className="rounded-none w-full bg-white dark:bg-[#090305] px-4 sm:px-6 lg:px-8 py-7 sm:py-10">
          <ScrollRevealItem key={`hero-${currentPage}-${navCount}`} isFirstVisit={isFirstVisit} index={0}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-3xl">
                {currentPage === 'dropzone' ? (
                  <>
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight text-slate-900 dark:text-white leading-tight">
                      วางไฟล์เพื่อจัดเก็บลง Google Drive ส่วนตัว
                    </h1>
                    <div
                      className={`grid transition-all duration-300 ease-out ${
                        showHeroDesc
                          ? 'grid-rows-[1fr] opacity-100 mt-2.5'
                          : 'grid-rows-[0fr] opacity-0 mt-0'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 font-light leading-relaxed">
                          ลากไฟล์มาวางเพื่ออัปโหลดเข้าสู่โฟลเดอร์ SharedDrop Workspace บน Google Drive ของอีเมลคุณ แยกข้อมูลเป็นส่วนตัว 100%
                        </p>
                      </div>
                    </div>
                  </>
                ) : currentPage === 'inspect' ? (
                  <>
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight text-slate-900 dark:text-white leading-tight">
                      ตรวจเช็คและดาวน์โหลดไฟล์จาก Google Drive
                    </h1>
                    <div
                      className={`grid transition-all duration-300 ease-out ${
                        showHeroDesc
                          ? 'grid-rows-[1fr] opacity-100 mt-2.5'
                          : 'grid-rows-[0fr] opacity-0 mt-0'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 font-light leading-relaxed">
                          สำรวจรายการไฟล์ทั้งหมดในบัญชี Google Drive ของอีเมลที่เข้าสู่ระบบ เปิดดูตัวอย่าง หรือดาวน์โหลดไฟล์ลงเครื่องของคุณ
                        </p>
                      </div>
                    </div>
                  </>
                ) : currentPage === 'notes' ? (
                  <>
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight text-slate-900 dark:text-white leading-tight">
                      บันทึกข้อความส่วนตัวบน Google Drive
                    </h1>
                    <div
                      className={`grid transition-all duration-300 ease-out ${
                        showHeroDesc
                          ? 'grid-rows-[1fr] opacity-100 mt-2.5'
                          : 'grid-rows-[0fr] opacity-0 mt-0'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 font-light leading-relaxed">
                          บันทึกข้อความ ลิงก์ หรือโค้ดสำคัญแยกเฉพาะอีเมลของคุณ จัดเก็บบน Google Drive ส่วนตัว เปิดอ่าน แก้ไข และคัดลอกข้ามเครื่องได้ทันที
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight text-slate-900 dark:text-white leading-tight">
                      แชร์หน้าจอและควบคุมระยะไกล
                    </h1>
                    <p className="mt-2.5 text-sm sm:text-base text-slate-600 dark:text-slate-400 font-light leading-relaxed">
                      เชื่อมต่อ 2 เครื่องด้วยรหัส 6 หลัก หรือค้นหาเครื่องในอินเทอร์เน็ตเดียวกัน ผ่าน WebRTC ความหน่วงต่ำ
                    </p>
                  </>
                )}
              </div>

              {/* Quick Switch Page Action (sub-pages only) */}
              {currentPage !== 'dropzone' && (
                <div className="shrink-0 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => navigateToPage('dropzone')}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-none bg-slate-100 dark:bg-[#120608] hover:bg-slate-200 dark:hover:bg-[#1a0a0d] text-xs font-medium text-slate-800 dark:text-orange-100 hover:text-red-600 dark:hover:text-orange-400 transition-all cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <UploadCloud className="w-4 h-4" />
                    <span>กลับไปหน้าวางไฟล์</span>
                  </button>
                </div>
              )}
            </div>
          </ScrollRevealItem>
        </div>
      </section>

      {/* Main Workspace Canvas (Full Width Side-to-Side) */}
      <main className="flex-1 w-full px-2 sm:px-4 py-6 space-y-8">
        {currentPage === 'dropzone' && (
          /* PAGE 1: DROPZONE / UPLOAD PAGE */
          !isAuthenticated ? (
            <AuthGateCard
              key={`auth-dropzone-${navCount}`}
              currentUser={currentUser}
              isLoggingIn={isLoggingIn}
              onLogin={handleLogin}
              onLogout={handleLogout}
              isFirstVisit={isFirstVisit}
            />
          ) : (
            <div key={`page-dropzone-${navCount}`} className="space-y-6">
              <div ref={dropzoneRef}>
                <DropZone
                  onFilesSelected={handleFilesSelected}
                  uploadQueue={uploadQueue}
                  onDismissUploadItem={handleDismissUploadItem}
                  uploaderName={uploaderName}
                  setUploaderName={setUploaderName}
                  isFirstVisit={isFirstVisit}
                />
              </div>

              {/* Quick Link Card to Inspect Files - only when files exist */}
              {files.length > 0 && (
                <ScrollRevealItem isFirstVisit={isFirstVisit} index={3}>
                  <div className="p-5 rounded-none bg-white dark:bg-[#090305] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-icon-box bg-orange-50 dark:bg-[#120608] text-red-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                        <Files className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-slate-900 dark:text-white">
                          มีไฟล์ใน Google Drive ({currentUser?.email}) จำนวน {files.length} รายการ
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-light">
                          เปิดดูตัวอย่างรูปภาพ เอกสาร วิดีโอ หรือดาวน์โหลดไฟล์จาก Google Drive ของคุณ
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => navigateToPage('inspect')}
                      className="px-4 py-2 bg-gradient-to-r from-red-600 to-orange-500 hover:opacity-95 text-white rounded-none text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
                    >
                      <span>ตรวจเช็คไฟล์ทั้งหมด</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </ScrollRevealItem>
              )}
            </div>
          )
        )}

        {currentPage === 'inspect' && (
          /* PAGE 2: FILE INSPECTION & DOWNLOAD PAGE */
          !isAuthenticated ? (
            <AuthGateCard
              key={`auth-inspect-${navCount}`}
              currentUser={currentUser}
              isLoggingIn={isLoggingIn}
              onLogin={handleLogin}
              onLogout={handleLogout}
              contextTitle="เข้าสู่ระบบเพื่อดูไฟล์ใน Google Drive ของคุณ"
              isFirstVisit={isFirstVisit}
            />
          ) : (
            <div key={`page-inspect-${navCount}`} className="space-y-6">
              <FileList
                files={files}
                accessToken={accessToken}
                onPreview={(file) => setPreviewFile(file)}
                onDownload={handleDownload}
                onDelete={handleDelete}
                onBatchDelete={handleBatchDelete}
                onCopyLink={handleCopyLink}
                isLoading={isLoading}
                isFirstVisit={isFirstVisit}
              />
            </div>
          )
        )}

        {currentPage === 'notes' && (
          /* PAGE 4: PER-EMAIL GOOGLE DRIVE NOTES HUB */
          !isAuthenticated ? (
            <AuthGateCard
              key={`auth-notes-${navCount}`}
              currentUser={currentUser}
              isLoggingIn={isLoggingIn}
              onLogin={handleLogin}
              onLogout={handleLogout}
              contextTitle="เข้าสู่ระบบเพื่อเปิดดูบันทึกข้อความของคุณ"
              isFirstVisit={isFirstVisit}
            />
          ) : (
            <div key={`page-notes-${navCount}`} className="space-y-6">
              <NotesHub
                notes={notes}
                isLoading={isNotesLoading}
                uploaderName={uploaderName}
                setUploaderName={setUploaderName}
                onCreateNote={handleCreateNote}
                onUpdateNote={handleUpdateNote}
                onDeleteNote={handleDeleteNote}
                isFirstVisit={isFirstVisit}
                onToast={addToast}
              />
            </div>
          )
        )}

        {/* PAGE 3: REMOTE SCREEN SHARE & CONTROL (Mounted persistently so WebRTC stays active across tab switches) */}
        <RemoteScreen
          initialRoomCode={initialRoomCode}
          isFirstVisit={isFirstVisit}
          isVisible={currentPage === 'remote'}
          revealKey={navCount}
          onToast={addToast}
        />
      </main>

      {/* Footer */}
      <footer className="mt-12 bg-white dark:bg-[#040102] py-6 text-xs text-slate-500 dark:text-slate-500 font-light">
        <div className="w-full px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-800 dark:text-orange-200">SharedDrop</span>
            <span>·</span>
            <span>คลังไฟล์และบันทึกข้อความส่วนตัวบน Google Drive แยกตามอีเมล</span>
          </div>
        </div>
      </footer>

      {/* Interactive In-Browser Preview Modal */}
      <PreviewModal
        file={previewFile}
        accessToken={accessToken}
        onClose={() => setPreviewFile(null)}
        onDownload={handleDownload}
        onCopyLink={handleCopyLink}
      />

      {/* Explicit User Confirmation Modal for Destructive/Mutating Google Drive Operations */}
      <ConfirmModal
        dialog={confirmDialog}
        isProcessing={isConfirmProcessing}
        onCancel={handleCancelConfirm}
        onConfirm={handleProceedConfirm}
      />

      {/* Toast Feedback Messages */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Floating Bottom Navigation Bar */}
      <FloatingNav
        currentPage={currentPage}
        onNavigate={navigateToPage}
        totalFiles={files.length}
        totalNotes={notes.length}
      />
    </div>
  );
}
