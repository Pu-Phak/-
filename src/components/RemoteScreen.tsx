import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MonitorSmartphone,
  Share2,
  Copy,
  Check,
  MousePointer2,
  Keyboard,
  Maximize2,
  Minimize2,
  ShieldCheck,
  ShieldOff,
  Download,
  RefreshCw,
  ClipboardPaste,
  Laptop,
  Wifi,
  WifiOff,
  Play,
  Square,
  FileEdit,
  Send,
  Volume2,
  VolumeX,
  AlertTriangle,
  Lock,
  Unlock,
  Radar,
  Smartphone,
  Tablet,
  Bluetooth,
  Radio,
  X,
  QrCode,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  RemoteRole,
  RemoteConnectionStatus,
  RemoteInputEvent,
  RemoteTelemetry,
  SharedNote,
  DiscoveredPeer,
} from '../types';
import {
  RTC_CONFIG,
  getVirtualKeyCode,
  VK_SHORTCUTS,
  executeBrowserControlEvent,
} from '../utils/remoteControl';
import { ScrollRevealItem } from './ScrollRevealItem';

interface RemoteScreenProps {
  initialRoomCode?: string;
  isFirstVisit?: boolean;
  isVisible?: boolean;
  revealKey?: number;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  onNotesSync?: (notes: SharedNote[]) => void;
}

interface RemoteCursorState {
  x: number;
  y: number;
  visible: boolean;
  clicking: boolean;
  lastActionLabel?: string;
}

export const RemoteScreen: React.FC<RemoteScreenProps> = ({
  initialRoomCode = '',
  isFirstVisit = false,
  isVisible = true,
  revealKey = 0,
  onToast,
  onNotesSync,
}) => {
  const onNotesSyncRef = useRef(onNotesSync);
  onNotesSyncRef.current = onNotesSync;
  // Signaling & Role state
  const [signalConnected, setSignalConnected] = useState(false);
  const [role, setRole] = useState<RemoteRole>(null);
  const [roomCode, setRoomCode] = useState<string>('');
  const [joinInput, setJoinInput] = useState<string>(initialRoomCode);
  const [status, setStatus] = useState<RemoteConnectionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [viewerCount, setViewerCount] = useState<number>(0);

  // Host settings
  const [allowRemoteControl, setAllowRemoteControl] = useState<boolean>(true);
  const [qualityPreset, setQualityPreset] = useState<'low-latency' | 'hd'>('low-latency');
  const [shareAudio, setShareAudio] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // Local OS Bridge state (Computer 1 optional desktop mouse/keyboard bridge)
  const [osBridgeStatus, setOsBridgeStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  // Viewer control & UI state
  const [isControlActive, setIsControlActive] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [hostAllowsControl, setHostAllowsControl] = useState<boolean>(true);
  const [clipboardDraft, setClipboardDraft] = useState<string>('');
  const [showClipboardBox, setShowClipboardBox] = useState<boolean>(false);
  const [receivedClipboard, setReceivedClipboard] = useState<string>('');

  // Shared live scratchpad synced directly over WebRTC DataChannel
  const [showWorkspacePad, setShowWorkspacePad] = useState<boolean>(false);
  const [workspaceText, setWorkspaceText] = useState<string>(
    'พื้นที่พิมพ์และแก้ไขร่วมกันแบบเรียลไทม์ (0-Delay Sync)\nทั้งเครื่องที่ 1 และเครื่องที่ 2 สามารถพิมพ์ข้อความ วางโค้ด หรือแก้ไขข้อความตรงนี้พร้อมกันได้ทันที...'
  );

  // Live remote cursor state (displayed on Host preview & global overlay)
  const [remoteCursor, setRemoteCursor] = useState<RemoteCursorState>({
    x: 0.5,
    y: 0.5,
    visible: false,
    clicking: false,
  });

  // Nearby & Same-Network Device Discovery state
  const [deviceName, setDeviceName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('shared_drop_device_name') || '';
    }
    return '';
  });
  const [discoveredPeers, setDiscoveredPeers] = useState<DiscoveredPeer[]>([]);
  const [isScanningPeers, setIsScanningPeers] = useState<boolean>(false);
  const [bluetoothDevices, setBluetoothDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [incomingInvite, setIncomingInvite] = useState<{
    fromId: string;
    fromDeviceName: string;
    fromNetworkMatch: 'same-network' | 'online';
    roomCode: string | null;
  } | null>(null);

  // Real WebRTC telemetry
  const [telemetry, setTelemetry] = useState<RemoteTelemetry>({
    fps: 0,
    rttMs: 0,
    bitrateKbps: 0,
    resolution: '-',
    transportMode: 'connecting',
  });

  // Refs for WebSocket, WebRTC, MediaStream, Video DOM, DataChannels, and OS Bridge
  const wsRef = useRef<WebSocket | null>(null);
  const roleRef = useRef<RemoteRole>(null);
  const roomCodeRef = useRef<string>('');
  const allowRemoteControlRef = useRef<boolean>(true);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Host can track peers by clientId; Viewer tracks single connection to host
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const fastChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());
  const reliableChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());

  const hostVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const viewerStageRef = useRef<HTMLDivElement | null>(null);
  const osBridgeWsRef = useRef<WebSocket | null>(null);

  // Throttle mousemove to animation frame
  const pendingMouseRef = useRef<{ x: number; y: number } | null>(null);
  const mouseRafRef = useRef<number | null>(null);
  const prevBytesRef = useRef<{ bytes: number; ts: number }>({ bytes: 0, ts: 0 });
  const autoJoinedRef = useRef<boolean>(false);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

  useEffect(() => {
    allowRemoteControlRef.current = allowRemoteControl;
  }, [allowRemoteControl]);

  // Connect to optional Local OS Control Agent (ws://127.0.0.1:47821) on Computer 1
  const connectOsBridge = useCallback((silent = false) => {
    if (osBridgeWsRef.current && osBridgeWsRef.current.readyState === WebSocket.OPEN) {
      return;
    }
    try {
      setOsBridgeStatus('connecting');
      const bridgeWs = new WebSocket('ws://127.0.0.1:47821');
      bridgeWs.onopen = () => {
        setOsBridgeStatus('connected');
        if (!silent) {
          onToast('success', 'เชื่อมต่อ Local OS Bridge สำเร็จ! เครื่องที่ 2 สามารถควบคุมเมาส์และคีย์บอร์ดทั้งเครื่องได้แล้ว');
        }
      };
      bridgeWs.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'agent:ready') {
            setOsBridgeStatus('connected');
          }
        } catch {
          // ignore
        }
      };
      bridgeWs.onerror = () => {
        setOsBridgeStatus('disconnected');
        if (!silent) {
          onToast('info', 'ยังไม่พบ Local OS Bridge ในเครื่องนี้ (ยังควบคุมภายในเว็บได้ตามปกติ)');
        }
      };
      bridgeWs.onclose = () => {
        setOsBridgeStatus('disconnected');
        osBridgeWsRef.current = null;
      };
      osBridgeWsRef.current = bridgeWs;
    } catch {
      setOsBridgeStatus('disconnected');
    }
  }, [onToast]);

  // Helper to send signaling messages safely
  const sendSignal = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  // Cleanup all active WebRTC & media resources
  const cleanupSession = useCallback((notifyServer = true) => {
    if (notifyServer && roomCodeRef.current) {
      sendSignal({ type: 'room:leave' });
    }

    peersRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch {
        // ignore
      }
    });
    peersRef.current.clear();
    pendingIceRef.current.clear();
    fastChannelsRef.current.clear();
    reliableChannelsRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (hostVideoRef.current) {
      hostVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setRole(null);
    setRoomCode('');
    setStatus('idle');
    setViewerCount(0);
    setIsControlActive(false);
    setRemoteCursor({ x: 0.5, y: 0.5, visible: false, clicking: false });
    setTelemetry({
      fps: 0,
      rttMs: 0,
      bitrateKbps: 0,
      resolution: '-',
      transportMode: 'connecting',
    });
  }, [sendSignal]);

  // Execute incoming control event on Host (Computer 1)
  const handleHostIncomingControl = useCallback((evt: RemoteInputEvent) => {
    if (evt.type === 'workspace') {
      setWorkspaceText(evt.content);
      return;
    }

    if (evt.type === 'clipboard') {
      setReceivedClipboard(evt.text);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(evt.text).catch(() => {});
      }
      onToast('info', 'ได้รับข้อความคลิปบอร์ดจากเครื่องที่ 2 แล้ว');
      return;
    }

    if (!allowRemoteControlRef.current) return;

    // Update live remote cursor visual on Host
    if (evt.type === 'mousemove') {
      setRemoteCursor((prev) => ({
        ...prev,
        x: evt.x,
        y: evt.y,
        visible: true,
      }));
    } else if (evt.type === 'mousedown' || evt.type === 'dblclick') {
      setRemoteCursor({
        x: evt.x,
        y: evt.y,
        visible: true,
        clicking: true,
        lastActionLabel: evt.button === 2 ? 'คลิกขวา' : 'คลิกซ้าย',
      });
    } else if (evt.type === 'mouseup') {
      setRemoteCursor((prev) => ({
        ...prev,
        x: evt.x,
        y: evt.y,
        clicking: false,
      }));
    }

    // 1. Forward to Local OS Control Bridge if connected (real Windows mouse & keyboard)
    if (osBridgeWsRef.current && osBridgeWsRef.current.readyState === WebSocket.OPEN) {
      if (evt.type === 'shortcut') {
        // Press keys down in order, release in reverse
        evt.keys.forEach((vk) => {
          osBridgeWsRef.current?.send(JSON.stringify({ type: 'keydown', vk }));
        });
        [...evt.keys].reverse().forEach((vk) => {
          osBridgeWsRef.current?.send(JSON.stringify({ type: 'keyup', vk }));
        });
      } else {
        osBridgeWsRef.current.send(JSON.stringify(evt));
      }
      return;
    }

    // 2. Otherwise execute inside Browser DOM immediately
    executeBrowserControlEvent(evt);
  }, [onToast]);

  // Broadcast workspace/clipboard update to connected peers
  const sendControlPayload = useCallback(
    (evt: RemoteInputEvent, preferFast = false) => {
      const json = JSON.stringify(evt);
      const targetChannels = preferFast ? fastChannelsRef.current : reliableChannelsRef.current;

      let sentViaRtc = false;
      targetChannels.forEach((dc) => {
        if (dc.readyState === 'open') {
          try {
            dc.send(json);
            sentViaRtc = true;
          } catch {
            // fallback below
          }
        }
      });

      // Fallback through reliable DataChannel if fast isn't open
      if (!sentViaRtc && preferFast) {
        reliableChannelsRef.current.forEach((dc) => {
          if (dc.readyState === 'open') {
            try {
              dc.send(json);
              sentViaRtc = true;
            } catch {
              // ignore
            }
          }
        });
      }

      // Final fallback via WebSocket relay if DataChannel not yet open
      if (!sentViaRtc) {
        sendSignal({
          type: evt.type === 'workspace' ? 'workspace:sync' : 'remote:input',
          event: evt,
        });
      }
    },
    [sendSignal]
  );

  // Setup WebRTC PeerConnection for Host when a Viewer joins
  const createHostPeerForViewer = useCallback(
    async (viewerId: string) => {
      const stream = localStreamRef.current;
      if (!stream) return;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peersRef.current.set(viewerId, pc);

      // Dual DataChannels for zero-delay remote input
      const fastDc = pc.createDataChannel('control-fast', {
        ordered: false,
        maxRetransmits: 0,
      });
      fastChannelsRef.current.set(viewerId, fastDc);

      const reliableDc = pc.createDataChannel('control-reliable', {
        ordered: true,
      });
      reliableChannelsRef.current.set(viewerId, reliableDc);

      const bindDc = (dc: RTCDataChannel) => {
        dc.onopen = () => {
          setTelemetry((prev) => ({ ...prev, transportMode: 'p2p-datachannel' }));
        };
        dc.onmessage = (msgEvt) => {
          try {
            const parsed = JSON.parse(msgEvt.data) as RemoteInputEvent;
            handleHostIncomingControl(parsed);
          } catch {
            // ignore
          }
        };
      };
      bindDc(fastDc);
      bindDc(reliableDc);

      // Add video + audio tracks with low-latency motion hints
      stream.getTracks().forEach((track) => {
        if (track.kind === 'video' && 'contentHint' in track) {
          try {
            (track as MediaStreamTrack & { contentHint: string }).contentHint = 'motion';
          } catch {
            // ignore
          }
        }
        const sender = pc.addTrack(track, stream);
        if (track.kind === 'video') {
          try {
            const params = sender.getParameters();
            if (!params.encodings) params.encodings = [{}];
            params.encodings[0].maxBitrate = qualityPreset === 'hd' ? 8_000_000 : 4_500_000;
            params.encodings[0].maxFramerate = 60;
            (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference =
              'maintain-framerate';
            sender.setParameters(params).catch(() => {});
          } catch {
            // ignore unsupported browser params
          }
        }
      });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal({
            type: 'webrtc:ice-candidate',
            targetId: viewerId,
            candidate: e.candidate.toJSON(),
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setStatus('connected');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          peersRef.current.delete(viewerId);
          fastChannelsRef.current.delete(viewerId);
          reliableChannelsRef.current.delete(viewerId);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({
        type: 'webrtc:offer',
        targetId: viewerId,
        sdp: pc.localDescription,
      });
    },
    [handleHostIncomingControl, qualityPreset, sendSignal]
  );

  // Setup WebRTC PeerConnection for Viewer when Offer arrives from Host
  const handleViewerOffer = useCallback(
    async (hostId: string, sdp: RTCSessionDescriptionInit) => {
      // Close previous viewer peer if any
      peersRef.current.forEach((oldPc) => oldPc.close());
      peersRef.current.clear();
      fastChannelsRef.current.clear();
      reliableChannelsRef.current.clear();

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peersRef.current.set(hostId, pc);

      pc.ondatachannel = (evt) => {
        const dc = evt.channel;
        if (dc.label === 'control-fast') {
          fastChannelsRef.current.set(hostId, dc);
        } else {
          reliableChannelsRef.current.set(hostId, dc);
        }
        dc.onopen = () => {
          setTelemetry((prev) => ({ ...prev, transportMode: 'p2p-datachannel' }));
        };
        dc.onmessage = (msgEvt) => {
          try {
            const parsed = JSON.parse(msgEvt.data) as RemoteInputEvent;
            if (parsed.type === 'workspace') {
              setWorkspaceText(parsed.content);
            } else if (parsed.type === 'clipboard') {
              setReceivedClipboard(parsed.text);
              onToast('info', 'ได้รับคลิปบอร์ดจากเครื่องที่ 1');
            }
          } catch {
            // ignore
          }
        };
      };

      pc.ontrack = (evt) => {
        if (remoteVideoRef.current && evt.streams[0]) {
          remoteVideoRef.current.srcObject = evt.streams[0];
          remoteVideoRef.current.play().catch(() => {});
          setStatus('connected');
        }
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal({
            type: 'webrtc:ice-candidate',
            targetId: hostId,
            candidate: e.candidate.toJSON(),
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setStatus('connected');
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setStatus('disconnected');
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Drain buffered ICE candidates
      const buffered = pendingIceRef.current.get(hostId) || [];
      for (const cand of buffered) {
        await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
      }
      pendingIceRef.current.delete(hostId);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal({
        type: 'webrtc:answer',
        targetId: hostId,
        sdp: pc.localDescription,
      });
    },
    [onToast, sendSignal]
  );

  // Connect WebSocket signaling on mount
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/signal`;
    let isUnmounted = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (isUnmounted) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setSignalConnected(true);
        const savedName = localStorage.getItem('shared_drop_device_name') || '';
        if (savedName.trim()) {
          ws.send(JSON.stringify({ type: 'peer:announce', deviceName: savedName.trim() }));
        }
        // Auto-join if arrived with ?room=123456
        if (
          initialRoomCode &&
          /^\d{6}$/.test(initialRoomCode) &&
          !autoJoinedRef.current &&
          !roleRef.current
        ) {
          autoJoinedRef.current = true;
          setRole('viewer');
          setStatus('connecting');
          ws.send(JSON.stringify({ type: 'room:join', roomCode: initialRoomCode }));
        }
      };

      ws.onmessage = async (event) => {
        let msg: any;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        switch (msg.type) {
          case 'signal:welcome':
            if (msg.defaultDeviceName && !localStorage.getItem('shared_drop_device_name')) {
              setDeviceName(msg.defaultDeviceName);
            }
            break;

          case 'peers:list':
            if (Array.isArray(msg.peers)) {
              setDiscoveredPeers(msg.peers as DiscoveredPeer[]);
              setIsScanningPeers(false);
            }
            break;

          case 'peer:invited':
            setIncomingInvite({
              fromId: msg.fromId,
              fromDeviceName: msg.fromDeviceName || 'อุปกรณ์ใกล้เคียง',
              fromNetworkMatch: msg.fromNetworkMatch === 'same-network' ? 'same-network' : 'online',
              roomCode: msg.roomCode || null,
            });
            onToast(
              'info',
              `${msg.fromDeviceName || 'อุปกรณ์อื่น'} ส่งคำขอเชื่อมต่อหน้าจอ`
            );
            break;
          case 'room:created':
            setRoomCode(msg.roomCode);
            setStatus('waiting');
            onToast('success', `สร้างห้องแชร์หน้าจอสำเร็จ รหัส: ${msg.roomCode}`);
            break;

          case 'room:joined':
            setRole('viewer');
            setRoomCode(msg.roomCode);
            setHostAllowsControl(msg.controlAllowed !== false);
            setStatus('connecting');
            setErrorMessage('');
            onToast('info', `กำลังเชื่อมต่อหน้าจอเครื่องที่ 1 (ห้อง ${msg.roomCode})`);
            break;

          case 'room:error':
            setStatus('error');
            setRole(null);
            setErrorMessage(msg.message || 'ไม่สามารถเข้าห้องได้');
            onToast('error', msg.message || 'ไม่สามารถเข้าห้องได้');
            break;

          case 'room:closed':
            onToast('info', 'เครื่องที่ 1 หยุดการแชร์หน้าจอแล้ว');
            cleanupSession(false);
            break;

          case 'viewer:joined':
            setViewerCount(msg.viewerCount || 1);
            onToast('success', 'เครื่องที่ 2 เชื่อมต่อเข้ามาแล้ว!');
            await createHostPeerForViewer(msg.clientId);
            break;

          case 'viewer:left':
            setViewerCount(msg.viewerCount || 0);
            peersRef.current.get(msg.clientId)?.close();
            peersRef.current.delete(msg.clientId);
            fastChannelsRef.current.delete(msg.clientId);
            reliableChannelsRef.current.delete(msg.clientId);
            if ((msg.viewerCount || 0) === 0 && roleRef.current === 'host') {
              setStatus('waiting');
              setRemoteCursor((prev) => ({ ...prev, visible: false }));
            }
            break;

          case 'control:permission':
            setHostAllowsControl(Boolean(msg.allowed));
            onToast(
              'info',
              msg.allowed
                ? 'เครื่องที่ 1 เปิดสิทธิ์ให้ควบคุมเมาส์และคีย์บอร์ดแล้ว'
                : 'เครื่องที่ 1 หยุดการควบคุมชั่วคราว (ดูหน้าจออย่างเดียว)'
            );
            break;

          case 'webrtc:offer':
            if (roleRef.current === 'viewer' && msg.fromId && msg.sdp) {
              await handleViewerOffer(msg.fromId, msg.sdp);
            }
            break;

          case 'webrtc:answer':
            if (roleRef.current === 'host' && msg.fromId && msg.sdp) {
              const pc = peersRef.current.get(msg.fromId);
              if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
                const buffered = pendingIceRef.current.get(msg.fromId) || [];
                for (const cand of buffered) {
                  await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
                }
                pendingIceRef.current.delete(msg.fromId);
              }
            }
            break;

          case 'webrtc:ice-candidate':
            if (msg.fromId && msg.candidate) {
              const pc = peersRef.current.get(msg.fromId);
              if (pc && pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
              } else {
                const list = pendingIceRef.current.get(msg.fromId) || [];
                list.push(msg.candidate);
                pendingIceRef.current.set(msg.fromId, list);
              }
            }
            break;

          case 'remote:input':
            if (roleRef.current === 'host' && msg.event) {
              handleHostIncomingControl(msg.event as RemoteInputEvent);
            }
            break;

          case 'workspace:sync':
            if (msg.event && msg.event.type === 'workspace') {
              setWorkspaceText(msg.event.content);
            }
            break;

          case 'notes:sync':
            if (Array.isArray(msg.notes)) {
              onNotesSyncRef.current?.(msg.notes as SharedNote[]);
            }
            break;
        }
      };

      ws.onclose = () => {
        setSignalConnected(false);
        if (!isUnmounted) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
    };

    connect();
    // Silent check if Local OS Bridge is already running on localhost:47821
    connectOsBridge(true);

    return () => {
      isUnmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      cleanupSession(true);
      wsRef.current?.close();
      osBridgeWsRef.current?.close();
    };
  }, [
    cleanupSession,
    connectOsBridge,
    createHostPeerForViewer,
    handleHostIncomingControl,
    handleViewerOffer,
    initialRoomCode,
    onToast,
  ]);

  // Attach local stream preview when host video element mounts
  useEffect(() => {
    if (role === 'host' && hostVideoRef.current && localStreamRef.current) {
      hostVideoRef.current.srcObject = localStreamRef.current;
      hostVideoRef.current.play().catch(() => {});
    }
  }, [role, status]);

  // Real-time WebRTC getStats() polling every 1 second when connected
  useEffect(() => {
    if (status !== 'connected') return;

    const timer = setInterval(async () => {
      const firstPeer = peersRef.current.values().next().value as RTCPeerConnection | undefined;
      if (!firstPeer) return;

      try {
        const stats = await firstPeer.getStats();
        let fps = 0;
        let rttMs = 0;
        let resolution = '-';
        let totalBytes = 0;

        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            fps = Math.round(report.framesPerSecond || 0);
            if (report.frameWidth && report.frameHeight) {
              resolution = `${report.frameWidth}×${report.frameHeight}`;
            }
            totalBytes = report.bytesReceived || 0;
          } else if (report.type === 'outbound-rtp' && report.kind === 'video') {
            fps = Math.round(report.framesPerSecond || 0);
            if (report.frameWidth && report.frameHeight) {
              resolution = `${report.frameWidth}×${report.frameHeight}`;
            }
            totalBytes = report.bytesSent || 0;
          } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (typeof report.currentRoundTripTime === 'number') {
              rttMs = Math.round(report.currentRoundTripTime * 1000);
            }
          }
        });

        const now = Date.now();
        let bitrateKbps = 0;
        if (prevBytesRef.current.ts > 0 && totalBytes > prevBytesRef.current.bytes) {
          const dt = (now - prevBytesRef.current.ts) / 1000;
          bitrateKbps = Math.round(((totalBytes - prevBytesRef.current.bytes) * 8) / dt / 1000);
        }
        prevBytesRef.current = { bytes: totalBytes, ts: now };

        setTelemetry((prev) => ({
          ...prev,
          fps,
          rttMs,
          bitrateKbps,
          resolution,
        }));
      } catch {
        // ignore stats error
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [status]);

  // Fullscreen change listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Generate QR code data URL for 1-click room share link
  useEffect(() => {
    let cancelled = false;
    if (!roomCode) {
      setQrDataUrl('');
      setShowQrModal(false);
      return;
    }

    const shareUrl = `${window.location.origin}/?room=${roomCode}`;
    QRCode.toDataURL(shareUrl, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#09090b',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('Failed to generate QR code:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [roomCode]);

  // Host starts screen capture & creates 6-digit room
  const handleStartHosting = async () => {
    setErrorMessage('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      const msg = 'เบราว์เซอร์นี้ไม่รองรับการแชร์หน้าจอ (กรุณาใช้ Chrome, Edge หรือ Firefox เวอร์ชันล่าสุดผ่าน HTTPS/Localhost)';
      setErrorMessage(msg);
      onToast('error', msg);
      return;
    }

    try {
      const videoConstraints: MediaTrackConstraints =
        qualityPreset === 'hd'
          ? { frameRate: { ideal: 60, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { frameRate: { ideal: 60, max: 60 }, width: { ideal: 1366 }, height: { ideal: 768 } };

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints,
        audio: shareAudio,
      });

      localStreamRef.current = stream;
      setRole('host');
      setStatus('waiting');

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          onToast('info', 'หยุดการแชร์หน้าจอแล้ว');
          cleanupSession(true);
        };
      }

      if (hostVideoRef.current) {
        hostVideoRef.current.srcObject = stream;
        hostVideoRef.current.play().catch(() => {});
      }

      sendSignal({ type: 'room:create', controlAllowed: allowRemoteControl });
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'ยกเลิกการเลือกหน้าจอแชร์'
          : 'ไม่สามารถเปิดการแชร์หน้าจอได้';
      setErrorMessage(msg);
      if (!(err instanceof Error && err.name === 'NotAllowedError')) {
        onToast('error', msg);
      }
    }
  };

  // Viewer joins via 6-digit room code
  const handleJoinRoom = (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleaned = joinInput.replace(/\D/g, '').slice(0, 6);
    if (cleaned.length !== 6) {
      setErrorMessage('กรุณากรอกรหัสห้อง 6 หลักให้ครบถ้วน');
      return;
    }
    setErrorMessage('');
    setRole('viewer');
    setStatus('connecting');
    sendSignal({ type: 'room:join', roomCode: cleaned });
  };

  // Toggle Host permission switch
  const handleToggleHostPermission = () => {
    const next = !allowRemoteControl;
    setAllowRemoteControl(next);
    sendSignal({ type: 'control:permission', allowed: next });
    onToast(
      'info',
      next ? 'เปิดให้เครื่องที่ 2 ควบคุมเมาส์และคีย์บอร์ดแล้ว' : 'ล็อกการควบคุมชั่วคราว (ดูภาพอย่างเดียว)'
    );
  };

  // Copy 6-digit room code or 1-click URL
  const copyRoomCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
      onToast('success', `คัดลอกรหัสห้อง ${roomCode} แล้ว`);
    });
  };

  const copyShareUrl = () => {
    if (!roomCode) return;
    const shareUrl = `${window.location.origin}/?room=${roomCode}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
      onToast('success', 'คัดลอกลิงก์เชื่อมต่อคลิกเดียวแล้ว ส่งให้เครื่องที่ 2 เปิดได้เลย');
    });
  };

  const downloadQrImage = () => {
    if (!qrDataUrl || !roomCode) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `SharedDrop-Room-${roomCode}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onToast('info', 'บันทึกรูป QR Code เรียบร้อยแล้ว');
  };

  // Exact pixel-accurate coordinate calculation inside object-contain <video>
  const getNormalizedVideoCoords = (clientX: number, clientY: number) => {
    const video = remoteVideoRef.current;
    if (!video) return null;
    const rect = video.getBoundingClientRect();
    const vw = video.videoWidth || rect.width;
    const vh = video.videoHeight || rect.height;

    const videoAspect = vw / vh;
    const rectAspect = rect.width / rect.height;

    let renderW = rect.width;
    let renderH = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (rectAspect > videoAspect) {
      renderH = rect.height;
      renderW = renderH * videoAspect;
      offsetX = (rect.width - renderW) / 2;
    } else {
      renderW = rect.width;
      renderH = renderW / videoAspect;
      offsetY = (rect.height - renderH) / 2;
    }

    const x = (clientX - rect.left - offsetX) / renderW;
    const y = (clientY - rect.top - offsetY) / renderH;

    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  };

  // Controller Mouse & Wheel handlers
  const handleRemoteMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hostAllowsControl || status !== 'connected') return;
    const coords = getNormalizedVideoCoords(e.clientX, e.clientY);
    if (!coords) return;

    pendingMouseRef.current = coords;
    if (mouseRafRef.current === null) {
      mouseRafRef.current = requestAnimationFrame(() => {
        mouseRafRef.current = null;
        if (pendingMouseRef.current) {
          sendControlPayload(
            {
              type: 'mousemove',
              x: pendingMouseRef.current.x,
              y: pendingMouseRef.current.y,
            },
            true
          );
          pendingMouseRef.current = null;
        }
      });
    }
  };

  const handleRemoteMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    viewerStageRef.current?.focus();
    setIsControlActive(true);
    if (!hostAllowsControl || status !== 'connected') return;
    const coords = getNormalizedVideoCoords(e.clientX, e.clientY);
    if (!coords) return;

    sendControlPayload({
      type: 'mousedown',
      x: coords.x,
      y: coords.y,
      button: e.button,
    });
  };

  const handleRemoteMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hostAllowsControl || status !== 'connected') return;
    const coords = getNormalizedVideoCoords(e.clientX, e.clientY);
    if (!coords) return;

    sendControlPayload({
      type: 'mouseup',
      x: coords.x,
      y: coords.y,
      button: e.button,
    });
  };

  const handleRemoteDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hostAllowsControl || status !== 'connected') return;
    const coords = getNormalizedVideoCoords(e.clientX, e.clientY);
    if (!coords) return;

    sendControlPayload({
      type: 'dblclick',
      x: coords.x,
      y: coords.y,
      button: e.button,
    });
  };

  const handleRemoteWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!isControlActive || !hostAllowsControl || status !== 'connected') return;
    e.preventDefault();
    const coords = getNormalizedVideoCoords(e.clientX, e.clientY) || { x: 0.5, y: 0.5 };
    sendControlPayload({
      type: 'wheel',
      x: coords.x,
      y: coords.y,
      deltaX: e.deltaX,
      deltaY: e.deltaY,
    });
  };

  // Controller Keyboard handlers
  const handleRemoteKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isControlActive || !hostAllowsControl || status !== 'connected') return;

    // Pressing Shift+Escape releases control focus cleanly
    if (e.key === 'Escape' && e.shiftKey) {
      setIsControlActive(false);
      viewerStageRef.current?.blur();
      onToast('info', 'ปลดล็อกโหมดคีย์บอร์ดแล้ว (คลิกบนหน้าจออีกครั้งเพื่อควบคุมต่อ)');
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const vk = getVirtualKeyCode(e.code, e.key);
    sendControlPayload({
      type: 'keydown',
      key: e.key,
      code: e.code,
      vk,
      text: e.key.length === 1 ? e.key : undefined,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
    });
  };

  const handleRemoteKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isControlActive || !hostAllowsControl || status !== 'connected') return;
    e.preventDefault();
    e.stopPropagation();

    const vk = getVirtualKeyCode(e.code, e.key);
    sendControlPayload({
      type: 'keyup',
      key: e.key,
      code: e.code,
      vk,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
    });
  };

  const toggleFullscreen = () => {
    if (!viewerStageRef.current) return;
    if (!document.fullscreenElement) {
      viewerStageRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const sendShortcut = (keys: number[], label: string) => {
    if (!hostAllowsControl) return;
    sendControlPayload({ type: 'shortcut', keys });
    onToast('info', `ส่งคีย์ลัด ${label} ไปยังเครื่องที่ 1 แล้ว`);
  };

  const sendClipboardOrText = () => {
    if (!clipboardDraft.trim()) return;
    sendControlPayload({ type: 'clipboard', text: clipboardDraft });
    sendControlPayload({ type: 'text', text: clipboardDraft });
    onToast('success', 'ส่งข้อความและคลิปบอร์ดไปเครื่องที่ 1 แล้ว');
    setClipboardDraft('');
    setShowClipboardBox(false);
  };

  const handleWorkspaceChange = (nextText: string) => {
    setWorkspaceText(nextText);
    sendControlPayload({ type: 'workspace', content: nextText });
  };

  // Update & announce current device name
  const handleDeviceNameChange = (nextName: string) => {
    setDeviceName(nextName);
    try {
      localStorage.setItem('shared_drop_device_name', nextName);
    } catch {
      // ignore
    }
    sendSignal({ type: 'peer:announce', deviceName: nextName });
  };

  // Trigger fresh same-network peer scan
  const handleScanPeers = () => {
    setIsScanningPeers(true);
    sendSignal({ type: 'peers:scan' });
    setTimeout(() => setIsScanningPeers(false), 700);
  };

  // Optional physical proximity Bluetooth scan
  const handleBluetoothScan = async () => {
    const navWithBt = navigator as unknown as {
      bluetooth?: {
        requestDevice: (options: { acceptAllDevices: boolean }) => Promise<{ id: string; name?: string }>;
      };
    };

    if (!navWithBt.bluetooth) {
      onToast('info', 'เบราว์เซอร์หรือหน้าต่างนี้ไม่รองรับ Bluetooth Scan (ระบบค้นหาผ่าน Wi-Fi/อินเทอร์เน็ตเดียวกันยังทำงานอัตโนมัติ)');
      return;
    }

    try {
      const device = await navWithBt.bluetooth.requestDevice({ acceptAllDevices: true });
      const label = device.name || `อุปกรณ์ Bluetooth (${device.id.slice(0, 6)})`;
      setBluetoothDevices((prev) =>
        prev.some((d) => d.id === device.id) ? prev : [{ id: device.id, name: label }, ...prev]
      );
      onToast('success', `พบอุปกรณ์ใกล้เคียง: ${label}`);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'NotFoundError') {
        onToast('info', 'ไม่สามารถเข้าถึง Bluetooth ในเบราว์เซอร์นี้ได้');
      }
    }
  };

  // Connect directly to a nearby peer that is already hosting
  const handleQuickJoinPeer = (code: string) => {
    setJoinInput(code);
    setErrorMessage('');
    setRole('viewer');
    setStatus('connecting');
    sendSignal({ type: 'room:join', roomCode: code });
  };

  // Invite a nearby idle peer to connect
  const handleInvitePeer = (peer: DiscoveredPeer) => {
    sendSignal({ type: 'peer:invite', targetId: peer.id });
    onToast('success', `ส่งคำขอเชื่อมต่อหน้าจอไปยัง "${peer.deviceName}" แล้ว`);
  };

  const getDeviceIcon = (deviceType: DiscoveredPeer['deviceType']) => {
    if (deviceType === 'mobile') return Smartphone;
    if (deviceType === 'tablet') return Tablet;
    return Laptop;
  };

  const sameNetworkPeers = discoveredPeers.filter((p) => p.networkMatch === 'same-network');
  const otherOnlinePeers = discoveredPeers.filter((p) => p.networkMatch !== 'same-network');

  return (
    <>
      <div className={isVisible ? 'space-y-8' : 'hidden'}>
        {/* Incoming Connection Request Banner from Nearby / Same-Network Device */}
        {incomingInvite && (
          <div className="rounded-discovery-panel backdrop-blur-2xl bg-gradient-to-r from-red-600/15 via-orange-500/10 to-white/90 dark:from-red-950/60 dark:via-orange-950/30 dark:to-[#090305]/95 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-discovery-pill bg-gradient-to-br from-red-600 to-orange-500 text-white flex items-center justify-center shrink-0">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-white">
                  {incomingInvite.fromDeviceName} ส่งคำขอเชื่อมต่อหน้าจอ
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 font-light mt-0.5">
                  {incomingInvite.fromNetworkMatch === 'same-network'
                    ? 'อยู่ในเครือข่าย / อินเทอร์เน็ตเดียวกัน'
                    : 'ออนไลน์ผ่านอินเทอร์เน็ต'}
                  {incomingInvite.roomCode ? ` · กำลังแชร์ห้อง ${incomingInvite.roomCode}` : ''}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {incomingInvite.roomCode ? (
                <button
                  type="button"
                  onClick={() => {
                    const code = incomingInvite.roomCode!;
                    setIncomingInvite(null);
                    handleQuickJoinPeer(code);
                  }}
                  className="rounded-discovery-btn px-4 py-2 bg-gradient-to-r from-red-600 to-orange-500 text-white text-xs font-medium cursor-pointer hover:opacity-95"
                >
                  เข้าดูและควบคุมทันที
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIncomingInvite(null);
                    handleStartHosting();
                  }}
                  className="rounded-discovery-btn px-4 py-2 bg-gradient-to-r from-red-600 to-orange-500 text-white text-xs font-medium cursor-pointer hover:opacity-95"
                >
                  เริ่มแชร์หน้าจอให้อุปกรณ์นี้
                </button>
              )}
              <button
                type="button"
                onClick={() => setIncomingInvite(null)}
                className="rounded-discovery-btn p-2 bg-white/80 dark:bg-[#120608] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                title="ปิดการแจ้งเตือน"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Lobby / Setup View when idle or no room active */}
      {role === null ? (
        <div className="space-y-6">
          {/* NEARBY & SAME-NETWORK DEVICE DISCOVERY PANEL (Rounded Edges - ขอบมน สีส้ม-แดง) */}
          <ScrollRevealItem isFirstVisit={isFirstVisit} index={1} isActive={isVisible} resetSignal={revealKey}>
            <section className="rounded-discovery-panel relative backdrop-blur-3xl backdrop-saturate-150 bg-white/85 dark:bg-[#090305]/90 p-5 sm:p-7 shadow-[0_16px_45px_-15px_rgba(220,38,38,0.2)] space-y-5 overflow-hidden">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-discovery-pill bg-gradient-to-br from-red-600 to-orange-500 text-white flex items-center justify-center shadow-md shadow-red-500/25 shrink-0">
                    <Radar className={`w-5 h-5 ${isScanningPeers ? 'animate-spin' : ''}`} />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-medium text-slate-900 dark:text-white">
                      ค้นหาอุปกรณ์ใกล้เคียงและอินเทอร์เน็ตเดียวกัน
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-light mt-0.5">
                      ตรวจจับคอมพิวเตอร์หรือมือถือที่เปิดเว็บนี้ใน Wi-Fi / อินเทอร์เน็ตเดียวกันแบบอัตโนมัติ เพื่อเชื่อมต่อโดยไม่ต้องพิมพ์รหัส
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={deviceName}
                    onChange={(e) => handleDeviceNameChange(e.target.value)}
                    placeholder="ตั้งชื่อเครื่องนี้..."
                    className="rounded-discovery-btn px-3.5 py-2 text-xs bg-slate-100 dark:bg-[#070204] text-slate-800 dark:text-orange-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 w-44 sm:w-48"
                  />
                  <button
                    type="button"
                    onClick={handleScanPeers}
                    className="rounded-discovery-btn px-3.5 py-2 text-xs font-medium bg-slate-100 dark:bg-[#120608] text-slate-700 dark:text-orange-100 hover:bg-slate-200 dark:hover:bg-[#1a0a0d] flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanningPeers ? 'animate-spin text-orange-400' : 'text-orange-500'}`} />
                    <span>สแกนอีกครั้ง</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleBluetoothScan}
                    className="rounded-discovery-btn px-3.5 py-2 text-xs font-medium bg-orange-50/90 dark:bg-red-950/40 text-red-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-red-900/50 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Bluetooth className="w-3.5 h-3.5" />
                    <span>Bluetooth ใกล้เคียง</span>
                  </button>
                </div>
              </div>

              {/* Discovered Devices Grid */}
              {discoveredPeers.length === 0 && bluetoothDevices.length === 0 ? (
                <div className="rounded-discovery-card py-7 px-4 text-center bg-slate-100/80 dark:bg-[#070204] space-y-2">
                  <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                    กำลังสแกนหาอุปกรณ์อื่นในอินเทอร์เน็ตเดียวกัน...
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 font-light">
                    เปิดเว็บนี้บนคอมพิวเตอร์อีกเครื่อง (ใน Wi-Fi หรืออินเทอร์เน็ตเดียวกัน) แล้วรายชื่ออุปกรณ์จะปรากฏขึ้นที่นี่ทันที
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sameNetworkPeers.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <Wifi className="w-3.5 h-3.5" />
                        <span>พบในอินเทอร์เน็ต / Wi-Fi เดียวกัน ({sameNetworkPeers.length} เครื่อง)</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {sameNetworkPeers.map((peer) => {
                          const DevIcon = getDeviceIcon(peer.deviceType);
                          return (
                            <div
                              key={peer.id}
                              className="rounded-discovery-card p-4 bg-slate-100/80 dark:bg-[#070204] flex flex-col justify-between gap-3 transition-all"
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-discovery-btn bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                  <DevIcon className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                    {peer.deviceName}
                                  </div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-light">
                                    {peer.osLabel} · {peer.browserLabel} · เครือข่ายเดียวกัน
                                  </div>
                                </div>
                              </div>

                              {peer.hostingRoomCode ? (
                                <button
                                  type="button"
                                  onClick={() => handleQuickJoinPeer(peer.hostingRoomCode!)}
                                  className="rounded-discovery-btn w-full py-2 px-3 bg-gradient-to-r from-red-600 to-orange-500 hover:opacity-95 text-white text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  <MonitorSmartphone className="w-3.5 h-3.5" />
                                  <span>เข้าควบคุมทันที (ห้อง {peer.hostingRoomCode})</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleInvitePeer(peer)}
                                  className="rounded-discovery-btn w-full py-2 px-3 bg-white dark:bg-[#120608] hover:bg-slate-200 dark:hover:bg-[#1a0a0d] text-slate-800 dark:text-orange-100 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                                >
                                  <Send className="w-3.5 h-3.5 text-red-500 dark:text-orange-400" />
                                  <span>ส่งคำขอเชื่อมต่อ</span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {otherOnlinePeers.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <Wifi className="w-3.5 h-3.5" />
                        <span>อุปกรณ์อื่นที่เปิดเว็บอยู่ ({otherOnlinePeers.length} เครื่อง)</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {otherOnlinePeers.map((peer) => {
                          const DevIcon = getDeviceIcon(peer.deviceType);
                          return (
                            <div
                              key={peer.id}
                              className="rounded-discovery-card p-4 bg-slate-100/80 dark:bg-[#070204] flex flex-col justify-between gap-3"
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-discovery-btn bg-slate-200/70 dark:bg-[#120608] text-slate-600 dark:text-orange-300 flex items-center justify-center shrink-0">
                                  <DevIcon className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                    {peer.deviceName}
                                  </div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-light">
                                    {peer.osLabel} · {peer.browserLabel}
                                  </div>
                                </div>
                              </div>

                              {peer.hostingRoomCode ? (
                                <button
                                  type="button"
                                  onClick={() => handleQuickJoinPeer(peer.hostingRoomCode!)}
                                  className="rounded-discovery-btn w-full py-2 px-3 bg-gradient-to-r from-red-600 to-orange-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  <MonitorSmartphone className="w-3.5 h-3.5" />
                                  <span>เข้าควบคุม (ห้อง {peer.hostingRoomCode})</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleInvitePeer(peer)}
                                  className="rounded-discovery-btn w-full py-2 px-3 bg-white dark:bg-[#120608] hover:bg-slate-200 dark:hover:bg-[#1a0a0d] text-slate-700 dark:text-orange-100 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  <span>ส่งคำขอเชื่อมต่อ</span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {bluetoothDevices.length > 0 && (
                    <div className="pt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400">อุปกรณ์ Bluetooth ใกล้เคียง:</span>
                      {bluetoothDevices.map((bt) => (
                        <span
                          key={bt.id}
                          className="rounded-discovery-pill px-3 py-1 bg-slate-100 dark:bg-[#120608] text-xs text-slate-700 dark:text-orange-200 inline-flex items-center gap-1.5"
                        >
                          <Bluetooth className="w-3 h-3 text-orange-500" />
                          <span>{bt.name}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </ScrollRevealItem>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* CARD 1: COMPUTER 1 (HOST / SHARE SCREEN) */}
            <ScrollRevealItem isFirstVisit={isFirstVisit} index={2} className="flex" isActive={isVisible} resetSignal={revealKey}>
              <div className="rounded-discovery-panel relative w-full flex flex-col justify-between backdrop-blur-3xl backdrop-saturate-150 bg-white/85 dark:bg-[#090305]/90 p-6 sm:p-8 shadow-[0_20px_50px_-15px_rgba(220,38,38,0.22)] overflow-hidden">
              {/* Top specular glass highlight */}
              <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-red-500/60 via-orange-400/70 to-transparent pointer-events-none" />
              <div className="absolute -top-20 -right-20 w-56 h-56 bg-gradient-to-bl from-orange-500/15 via-red-600/10 to-transparent rounded-full blur-2xl pointer-events-none" />

              <div className="space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-icon-box-lg bg-gradient-to-br from-red-600 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-red-500/30 shrink-0">
                      <Share2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-lg sm:text-xl font-medium text-slate-900 dark:text-white">
                        เครื่องที่ 1 — แชร์หน้าจอนี้
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-light">
                        สร้างรหัส 6 หลักเพื่อให้คอมพิวเตอร์อีกเครื่องเข้ามาดูและควบคุมได้ทันที
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quality & Audio options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setQualityPreset('low-latency')}
                    className={`rounded-discovery-btn p-3.5 text-left transition-all cursor-pointer ${
                      qualityPreset === 'low-latency'
                        ? 'bg-orange-50/90 dark:bg-red-950/45 text-slate-900 dark:text-white'
                        : 'bg-slate-100/80 dark:bg-[#070204] text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-[#120608]'
                    }`}
                  >
                    <div className="text-xs font-medium">โหมดไร้ดีเลย์ (60 FPS)</div>
                    <div className="text-[11px] opacity-75 mt-0.5 font-light">
                      แนะนำสำหรับคุมเมาส์และพิมพ์ลื่นที่สุด
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQualityPreset('hd')}
                    className={`rounded-discovery-btn p-3.5 text-left transition-all cursor-pointer ${
                      qualityPreset === 'hd'
                        ? 'bg-orange-50/90 dark:bg-red-950/45 text-slate-900 dark:text-white'
                        : 'bg-slate-100/80 dark:bg-[#070204] text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-[#120608]'
                    }`}
                  >
                    <div className="text-xs font-medium">ความคมชัดสูง (1080p 60 FPS)</div>
                    <div className="text-[11px] opacity-75 mt-0.5 font-light">
                      เหมาะสำหรับอ่านโค้ดและตัวหนังสือเล็กๆ
                    </div>
                  </button>
                </div>

                {/* Control & Audio checkboxes */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700 dark:text-slate-300">
                  <button
                    type="button"
                    onClick={() => setAllowRemoteControl((p) => !p)}
                    className="rounded-discovery-btn flex items-center gap-2 px-3 py-2 bg-slate-100/90 dark:bg-[#070204] hover:bg-slate-200/80 dark:hover:bg-[#120608] transition-colors cursor-pointer"
                  >
                    {allowRemoteControl ? (
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <ShieldOff className="w-4 h-4 text-amber-500" />
                    )}
                    <span>{allowRemoteControl ? 'อนุญาตให้เครื่องที่ 2 ควบคุมเมาส์/คีย์บอร์ด' : 'ดูหน้าจออย่างเดียว (ปิดควบคุม)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShareAudio((p) => !p)}
                    className="rounded-discovery-btn flex items-center gap-2 px-3 py-2 bg-slate-100/90 dark:bg-[#070204] hover:bg-slate-200/80 dark:hover:bg-[#120608] transition-colors cursor-pointer"
                  >
                    {shareAudio ? (
                      <Volume2 className="w-4 h-4 text-red-500 dark:text-orange-400" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-slate-400" />
                    )}
                    <span>{shareAudio ? 'แชร์เสียงระบบด้วย' : 'ไม่แชร์เสียง'}</span>
                  </button>
                </div>

                {/* Local OS Desktop Bridge Status Box */}
                <div className="rounded-discovery-card p-4 bg-slate-100/80 dark:bg-[#070204] space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-800 dark:text-orange-100">
                      <Laptop className="w-4 h-4 text-red-500 dark:text-orange-400" />
                      <span>ตัวช่วยควบคุม Windows ทั้งเครื่อง (OS Bridge)</span>
                    </div>
                    <span
                      className={`rounded-discovery-pill text-[11px] font-medium px-2.5 py-0.5 ${
                        osBridgeStatus === 'connected'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : 'bg-slate-200/80 dark:bg-[#120608] text-slate-600 dark:text-orange-300'
                      }`}
                    >
                      {osBridgeStatus === 'connected' ? 'เชื่อมต่อแล้ว (คุมทั้งเครื่องได้)' : 'โหมดควบคุมในเว็บ'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-light leading-relaxed">
                    ใช้งานควบคุมบนเว็บได้ทันที หรือดาวน์โหลดไฟล์เริ่มต้นสำหรับ Windows ไปรันบนเครื่องที่ 1 เพื่อให้เครื่องที่ 2 ขยับเมาส์และพิมพ์คีย์บอร์ดนอกเบราว์เซอร์ได้เสมือนอยู่หน้าเครื่องจริง
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href="/api/remote-agent/windows-bat"
                      download="Start-SharedDrop-Control.bat"
                      className="rounded-discovery-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-[#120608] text-slate-800 dark:text-orange-100 hover:bg-slate-200 dark:hover:bg-[#1a0a0d] transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-orange-500" />
                      <span>ดาวน์โหลด OS Bridge (.bat)</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => connectOsBridge(false)}
                      className="rounded-discovery-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-200/70 dark:bg-[#120608] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${osBridgeStatus === 'connecting' ? 'animate-spin' : ''}`} />
                      <span>ตรวจจับ Agent</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-6 mt-6">
                <button
                  type="button"
                  onClick={handleStartHosting}
                  disabled={!signalConnected}
                  className="rounded-discovery-btn w-full py-3.5 px-6 bg-gradient-to-r from-red-600 via-orange-500 to-amber-500 hover:opacity-95 disabled:opacity-50 text-white text-sm font-medium flex items-center justify-center gap-2.5 shadow-lg shadow-red-500/25 transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>เริ่มแชร์หน้าจอและรับรหัส 6 หลัก</span>
                </button>
              </div>
            </div>
          </ScrollRevealItem>

          {/* CARD 2: COMPUTER 2 (CONTROLLER / JOIN ROOM) */}
          <ScrollRevealItem isFirstVisit={isFirstVisit} index={3} className="flex" isActive={isVisible} resetSignal={revealKey}>
            <form
              onSubmit={handleJoinRoom}
              className="rounded-discovery-panel relative w-full flex flex-col justify-between backdrop-blur-3xl backdrop-saturate-150 bg-white/85 dark:bg-[#090305]/90 p-6 sm:p-8 shadow-sm overflow-hidden"
            >
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-icon-box-lg bg-slate-900 dark:bg-[#120608] text-white dark:text-orange-400 flex items-center justify-center shrink-0">
                      <MousePointer2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-lg sm:text-xl font-medium text-slate-900 dark:text-white">
                        เครื่องที่ 2 — เข้าควบคุมระยะไกล
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-light">
                        กรอกรหัส 6 หลักจากเครื่องที่ 1 เพื่อดูหน้าจอและสั่งการเมาส์/คีย์บอร์ด
                      </p>
                    </div>
                  </div>
                </div>

                {/* 6-digit Room Code Input */}
                <div className="space-y-2.5 pt-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    รหัสเชื่อมต่อ 6 หลัก (Room Code)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={joinInput}
                    onChange={(e) => setJoinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="rounded-discovery-btn w-full py-4 px-4 text-center text-3xl sm:text-4xl font-mono tabular-nums tracking-[0.45em] bg-slate-100 dark:bg-[#070204] text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  />
                </div>

                {errorMessage && (
                  <div className="rounded-discovery-btn p-3 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="rounded-discovery-card space-y-2.5 text-xs text-slate-600 dark:text-slate-400 font-light bg-slate-100/80 dark:bg-[#070204] p-4">
                  <div className="font-medium text-slate-800 dark:text-orange-100">
                    ความสามารถในการควบคุม:
                  </div>
                  <p>· เลื่อนเมาส์ คลิกซ้าย คลิกขวา ดับเบิลคลิก และหมุนลูกกลิ้งเมาส์ตรงพิกัดจริง</p>
                  <p>· พิมพ์คีย์บอร์ด ส่งคีย์ลัด (Ctrl+C, Ctrl+V, Alt+Tab) และซิงค์ข้อความข้ามเครื่อง</p>
                  <p>· สตรีมภาพ P2P ตรงระหว่างเครื่องด้วยความหน่วงระดับมิลลิวินาที</p>
                </div>
              </div>

              <div className="pt-6 mt-6 space-y-3">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    {signalConnected ? (
                      <>
                        <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Signaling Server พร้อมใช้งาน</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                        <span>กำลังเชื่อมต่อ Signaling Server...</span>
                      </>
                    )}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={!signalConnected || joinInput.length !== 6}
                  className="rounded-discovery-btn w-full py-3.5 px-6 bg-slate-900 hover:bg-slate-800 dark:bg-[#120608] dark:hover:bg-red-950/70 disabled:opacity-40 text-white text-sm font-medium flex items-center justify-center gap-2.5 transition-all cursor-pointer"
                >
                  <MonitorSmartphone className="w-4 h-4 text-orange-400" />
                  <span>เชื่อมต่อและควบคุมเครื่องที่ 1</span>
                </button>
              </div>
            </form>
          </ScrollRevealItem>
          </div>
        </div>
      ) : (
        /* ACTIVE REMOTE SESSION VIEW (HOST OR CONTROLLER) */
        <div className="space-y-5">
          {/* Top Session Control Strip */}
          <ScrollRevealItem isFirstVisit={isFirstVisit} index={1} isActive={isVisible} resetSignal={revealKey}>
            <div className="rounded-discovery-panel backdrop-blur-2xl bg-white/90 dark:bg-[#090305]/90 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Role & Status */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-icon-box bg-gradient-to-br from-red-600 to-orange-500 text-white flex items-center justify-center shrink-0">
                  {role === 'host' ? <Share2 className="w-5 h-5" /> : <MousePointer2 className="w-5 h-5" />}
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {role === 'host' ? 'กำลังแชร์หน้าจอ (เครื่องที่ 1)' : 'กำลังควบคุมระยะไกล (เครื่องที่ 2)'}
                  </div>
                  <div className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
                    <span>
                      {status === 'waiting' && 'รอเครื่องที่ 2 เชื่อมต่อเข้ามา...'}
                      {status === 'connecting' && 'กำลังเชื่อม WebRTC P2P...'}
                      {status === 'connected' && 'เชื่อมต่อสด P2P สำเร็จ'}
                      {status === 'disconnected' && 'การเชื่อมต่อขาดหาย'}
                    </span>
                    {role === 'host' && viewerCount > 0 && (
                      <span className="text-xs font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                        · {viewerCount} เครื่องเชื่อมต่ออยู่
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 6-Digit Room Code, Copy Share Link & QR Code */}
              {roomCode && (
                <div className="flex flex-wrap items-center gap-2 pl-0 lg:pl-4">
                  <div className="rounded-discovery-btn px-3 py-1.5 bg-slate-100 dark:bg-[#070204] font-mono tabular-nums text-lg font-semibold tracking-[0.2em] text-slate-900 dark:text-orange-400">
                    {roomCode}
                  </div>
                  <button
                    type="button"
                    onClick={copyRoomCode}
                    className="rounded-discovery-btn px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-[#120608] hover:bg-slate-200 dark:hover:bg-[#1a0a0d] text-slate-700 dark:text-orange-100 flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="คัดลอกรหัส 6 หลัก"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>คัดลอกรหัส</span>
                  </button>
                  <button
                    type="button"
                    onClick={copyShareUrl}
                    className="rounded-discovery-btn px-3 py-2 text-xs font-medium bg-orange-50/90 dark:bg-red-950/40 hover:bg-orange-100 dark:hover:bg-red-900/50 text-red-700 dark:text-orange-300 flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="คัดลอกลิงก์เชิญคลิกเดียว"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
                    <span>คัดลอกลิงก์</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowQrModal(true)}
                    className="rounded-discovery-btn px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-[#120608] hover:bg-slate-200 dark:hover:bg-[#1a0a0d] text-slate-800 dark:text-orange-300 flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="แสดง QR Code สำหรับสแกนเปิดบนเครื่องที่ 2"
                  >
                    <QrCode className="w-3.5 h-3.5 text-red-500 dark:text-orange-400" />
                    <span>QR Code</span>
                  </button>
                </div>
              )}
            </div>

            {/* Real-Time Telemetry & Actions */}
            <div className="flex flex-wrap items-center gap-2.5">
              {status === 'connected' && (
                <div className="rounded-discovery-btn flex items-center gap-3 px-3 py-1.5 bg-slate-100 dark:bg-[#070204] text-xs font-mono tabular-nums text-slate-700 dark:text-orange-200">
                  <span>{telemetry.resolution}</span>
                  <span aria-hidden="true">·</span>
                  <span>{telemetry.fps} FPS</span>
                  <span aria-hidden="true">·</span>
                  <span className={telemetry.rttMs > 0 && telemetry.rttMs < 50 ? 'text-emerald-500' : ''}>
                    {telemetry.rttMs} ms
                  </span>
                </div>
              )}

              {role === 'host' && (
                <button
                  type="button"
                  onClick={handleToggleHostPermission}
                  className={`rounded-discovery-btn px-3.5 py-2 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-all ${
                    allowRemoteControl
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {allowRemoteControl ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>{allowRemoteControl ? 'เปิดการควบคุมอยู่' : 'หยุดการควบคุมชั่วคราว'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowWorkspacePad((p) => !p)}
                className={`rounded-discovery-btn px-3.5 py-2 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
                  showWorkspacePad
                    ? 'bg-orange-500/15 text-red-600 dark:text-orange-400'
                    : 'bg-slate-100 dark:bg-[#120608] text-slate-700 dark:text-orange-100 hover:bg-slate-200 dark:hover:bg-[#1a0a0d]'
                }`}
              >
                <FileEdit className="w-3.5 h-3.5" />
                <span>กระดานพิมพ์ร่วมกัน</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  cleanupSession(true);
                  onToast('info', 'ยุติการเชื่อมต่อรีโมทหน้าจอแล้ว');
                }}
                className="rounded-discovery-btn px-4 py-2 text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>{role === 'host' ? 'หยุดแชร์หน้าจอ' : 'ตัดการเชื่อมต่อ'}</span>
              </button>
            </div>
            </div>
          </ScrollRevealItem>

          {/* HOST VIEWPORT (Computer 1 Self Preview + Remote Cursor Indicator + OS Bridge Status) */}
          {role === 'host' && (
            <div className="space-y-4">
              <ScrollRevealItem isFirstVisit={isFirstVisit} index={2} isActive={isVisible} resetSignal={revealKey}>
                <div className="rounded-none relative bg-black overflow-hidden aspect-video max-h-[70vh] w-full flex items-center justify-center">
                <video
                  ref={hostVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-contain"
                />

                {/* Live Remote Cursor Overlay on Host Preview */}
                {remoteCursor.visible && (
                  <div
                    className="pointer-events-none absolute z-20 transition-transform duration-75"
                    style={{
                      left: `${remoteCursor.x * 100}%`,
                      top: `${remoteCursor.y * 100}%`,
                      transform: 'translate(-2px, -2px)',
                    }}
                  >
                    <MousePointer2
                      className={`w-6 h-6 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${
                        remoteCursor.clicking ? 'text-amber-400 scale-90' : 'text-orange-500'
                      }`}
                      fill="currentColor"
                    />
                    <div className="rounded-none mt-1 px-2 py-0.5 bg-red-600 text-white text-[10px] font-medium whitespace-nowrap shadow">
                      เครื่องที่ 2 {remoteCursor.lastActionLabel ? `· ${remoteCursor.lastActionLabel}` : ''}
                    </div>
                  </div>
                )}

                {status === 'waiting' && (
                  <div className="rounded-discovery-card absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 bg-[#090305]/90 backdrop-blur-md px-4 py-3 text-xs text-white flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <RefreshCw className="w-4 h-4 text-orange-400 animate-spin shrink-0" />
                      <span>
                        นำรหัส <strong className="font-mono text-orange-400 text-sm">{roomCode}</strong> ไปกรอกในเครื่องที่ 2 หรือสแกน QR Code
                      </span>
                    </div>
                    {qrDataUrl && (
                      <button
                        type="button"
                        onClick={() => setShowQrModal(true)}
                        className="rounded-discovery-btn px-2.5 py-1 bg-gradient-to-r from-red-600 to-orange-500 text-white text-[11px] font-medium flex items-center gap-1.5 cursor-pointer hover:opacity-95 shrink-0"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>เปิด QR Code</span>
                      </button>
                    )}
                  </div>
                )}
                </div>
              </ScrollRevealItem>

              {/* Host OS Bridge quick reminder */}
              <ScrollRevealItem isFirstVisit={isFirstVisit} index={3} isActive={isVisible} resetSignal={revealKey}>
                <div className="rounded-none p-4 bg-white dark:bg-[#090305] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
                  <Laptop className="w-4 h-4 text-red-500 dark:text-orange-400 shrink-0" />
                  <span>
                    {osBridgeStatus === 'connected'
                      ? 'Local OS Bridge เชื่อมต่ออยู่ — เครื่องที่ 2 กำลังควบคุมเมาส์และคีย์บอร์ดจริงของ Windows เครื่องนี้'
                      : 'โหมดควบคุมบนเว็บทำงานอยู่ — หากต้องการให้เครื่องที่ 2 คุมโปรแกรมอื่นนอกเบราว์เซอร์ ให้รัน Local OS Bridge (.bat)'}
                  </span>
                </div>
                {osBridgeStatus !== 'connected' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href="/api/remote-agent/windows-bat"
                      download="Start-SharedDrop-Control.bat"
                      className="rounded-none px-3 py-1.5 bg-orange-50 dark:bg-red-950/40 text-red-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-red-900/50 font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>โหลดตัวคุมทั้งเครื่อง (.bat)</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => connectOsBridge(false)}
                      className="rounded-none px-3 py-1.5 bg-slate-100 dark:bg-[#120608] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1a0a0d] cursor-pointer transition-colors"
                    >
                      เชื่อมต่อใหม่
                    </button>
                  </div>
                )}
                </div>
              </ScrollRevealItem>

              {receivedClipboard && (
                <div className="rounded-none p-3 bg-emerald-500/10 text-xs flex items-center justify-between gap-3">
                  <span className="truncate text-slate-800 dark:text-slate-200">
                    คลิปบอร์ดจากเครื่องที่ 2: <strong>{receivedClipboard}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(receivedClipboard);
                      onToast('success', 'คัดลอกลงคลิปบอร์ดแล้ว');
                    }}
                    className="rounded-none px-2.5 py-1 bg-emerald-600 text-white shrink-0 cursor-pointer"
                  >
                    คัดลอก
                  </button>
                </div>
              )}
            </div>
          )}

          {/* CONTROLLER VIEWPORT (Computer 2 Interactive Remote Desktop Stage) */}
          {role === 'viewer' && (
            <ScrollRevealItem isFirstVisit={isFirstVisit} index={2} isActive={isVisible} resetSignal={revealKey}>
              <div
                ref={viewerStageRef}
              tabIndex={0}
              onKeyDown={handleRemoteKeyDown}
              onKeyUp={handleRemoteKeyUp}
              onContextMenu={(e) => e.preventDefault()}
              className={`relative bg-black transition-all outline-none flex flex-col overflow-hidden ${
                isFullscreen ? 'w-screen h-screen' : 'rounded-none'
              }`}
            >
              {/* Controller Action Toolbar */}
              <div className="bg-[#090305]/95 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-200 z-20">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isControlActive;
                      setIsControlActive(next);
                      if (next) viewerStageRef.current?.focus();
                    }}
                    className={`rounded-none px-3 py-1.5 font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
                      isControlActive && hostAllowsControl
                        ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white'
                        : 'bg-[#120608] text-slate-300 hover:bg-[#1a0a0d]'
                    }`}
                  >
                    <Keyboard className="w-3.5 h-3.5" />
                    <span>
                      {!hostAllowsControl
                        ? 'เครื่องที่ 1 ล็อกการควบคุม'
                        : isControlActive
                        ? 'กำลังควบคุมเมาส์ & คีย์บอร์ด (Shift+Esc ออก)'
                        : 'คลิกที่จอเพื่อเริ่มควบคุม'}
                    </span>
                  </button>

                  {/* Shortcut quick buttons */}
                  <div className="hidden sm:flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => sendShortcut([VK_SHORTCUTS.CTRL, VK_SHORTCUTS.C], 'Ctrl+C')}
                      className="rounded-none px-2 py-1.5 bg-[#120608] hover:bg-[#1a0a0d] font-mono text-[11px] cursor-pointer"
                    >
                      Ctrl+C
                    </button>
                    <button
                      type="button"
                      onClick={() => sendShortcut([VK_SHORTCUTS.CTRL, VK_SHORTCUTS.V], 'Ctrl+V')}
                      className="rounded-none px-2 py-1.5 bg-[#120608] hover:bg-[#1a0a0d] font-mono text-[11px] cursor-pointer"
                    >
                      Ctrl+V
                    </button>
                    <button
                      type="button"
                      onClick={() => sendShortcut([VK_SHORTCUTS.ALT, VK_SHORTCUTS.TAB], 'Alt+Tab')}
                      className="rounded-none px-2 py-1.5 bg-[#120608] hover:bg-[#1a0a0d] font-mono text-[11px] cursor-pointer"
                    >
                      Alt+Tab
                    </button>
                    <button
                      type="button"
                      onClick={() => sendShortcut([VK_SHORTCUTS.WIN], 'Win')}
                      className="rounded-none px-2 py-1.5 bg-[#120608] hover:bg-[#1a0a0d] font-mono text-[11px] cursor-pointer"
                    >
                      Win
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowClipboardBox((p) => !p)}
                    className="rounded-none px-2.5 py-1.5 bg-[#120608] hover:bg-[#1a0a0d] flex items-center gap-1.5 cursor-pointer"
                    title="ส่งข้อความภาษาไทย/อังกฤษ หรือคลิปบอร์ดไปพิมพ์ที่เครื่อง 1"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5 text-orange-400" />
                    <span>ส่งข้อความ/คลิปบอร์ด</span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="rounded-none px-2.5 py-1.5 bg-[#120608] hover:bg-[#1a0a0d] flex items-center gap-1.5 cursor-pointer"
                    title="ขยายเต็มจอ"
                  >
                    {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    <span>{isFullscreen ? 'ย่อจอ' : 'เต็มจอ'}</span>
                  </button>
                </div>
              </div>

              {/* Quick Send Text / Clipboard drawer */}
              {showClipboardBox && (
                <div className="bg-[#110608] p-3 flex items-center gap-2 z-20">
                  <input
                    type="text"
                    value={clipboardDraft}
                    onChange={(e) => setClipboardDraft(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') sendClipboardOrText();
                    }}
                    placeholder="พิมพ์ข้อความภาษาไทย/อังกฤษ หรือวางลิงก์เพื่อส่งไปพิมพ์และคัดลอกในเครื่องที่ 1..."
                    className="rounded-none flex-1 px-3 py-1.5 bg-[#070204] text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    type="button"
                    onClick={sendClipboardOrText}
                    className="rounded-none px-3 py-1.5 bg-gradient-to-r from-red-600 to-orange-500 hover:opacity-95 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>ส่งทันที</span>
                  </button>
                </div>
              )}

              {/* Interactive Video Canvas */}
              <div
                onMouseMove={handleRemoteMouseMove}
                onMouseDown={handleRemoteMouseDown}
                onMouseUp={handleRemoteMouseUp}
                onDoubleClick={handleRemoteDoubleClick}
                onWheel={handleRemoteWheel}
                className={`relative flex-1 flex items-center justify-center overflow-hidden select-none ${
                  isFullscreen ? 'h-[calc(100vh-44px)]' : 'aspect-video max-h-[75vh]'
                } ${isControlActive && hostAllowsControl ? 'cursor-crosshair' : 'cursor-pointer'}`}
              >
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain pointer-events-none"
                />

                {status === 'connecting' && (
                  <div className="absolute inset-0 bg-[#070204]/85 flex flex-col items-center justify-center text-white gap-3">
                    <RefreshCw className="w-8 h-8 text-orange-400 animate-spin" />
                    <p className="text-sm font-medium">กำลังรับสัญญาณภาพสดจากเครื่องที่ 1...</p>
                    <p className="text-xs text-slate-400 font-light">ห้อง {roomCode}</p>
                  </div>
                )}
              </div>
            </div>
            </ScrollRevealItem>
          )}

          {/* Optional Shared Live Collaborative Workspace Pad */}
          {showWorkspacePad && (
            <div className="rounded-discovery-panel backdrop-blur-2xl bg-white/90 dark:bg-[#090305]/90 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
                  <FileEdit className="w-4 h-4 text-red-500 dark:text-orange-400" />
                  <span>กระดานแก้ไขข้อความร่วมกัน (Live Sync 0-Delay)</span>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-light">
                  พิมพ์หรือแก้ไขจากเครื่องใดก็ได้ ข้อมูลจะซิงค์ตรงระหว่าง 2 เครื่องทันที
                </span>
              </div>
              <textarea
                value={workspaceText}
                onChange={(e) => handleWorkspaceChange(e.target.value)}
                rows={6}
                className="rounded-none w-full p-4 bg-slate-100 dark:bg-[#070204] text-sm font-mono text-slate-800 dark:text-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          )}
        </div>
      )}
      </div>

      {/* Global Floating Remote Cursor on Computer 1 so Host sees Computer 2 cursor even while working on other tabs of SharedDrop */}
      {role === 'host' && remoteCursor.visible && osBridgeStatus !== 'connected' && (
        <div
          className="pointer-events-none fixed z-50 transition-all duration-75"
          style={{
            left: `${remoteCursor.x * 100}vw`,
            top: `${remoteCursor.y * 100}vh`,
          }}
        >
          <MousePointer2
            className={`w-5 h-5 ${remoteCursor.clicking ? 'text-amber-400 scale-90' : 'text-orange-500'}`}
            fill="currentColor"
          />
        </div>
      )}

      {/* Scannable QR Code Share Modal for Instant Secondary Device Connection */}
      {showQrModal && roomCode && qrDataUrl && (
        <div
          onClick={() => setShowQrModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 dark:bg-black/85 backdrop-blur-sm animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="rounded-discovery-panel relative w-full max-w-sm bg-white dark:bg-[#090305] p-6 shadow-2xl space-y-5 text-center"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-left">
                <div className="w-9 h-9 rounded-icon-box bg-gradient-to-br from-red-600 to-orange-500 text-white flex items-center justify-center shrink-0">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-medium text-slate-900 dark:text-white">
                    สแกน QR Code เพื่อเชื่อมต่อ
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-light">
                    ใช้กล้องมือถือหรือแท็บเล็ตสแกนเพื่อเปิดลิงก์ทันที
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="rounded-discovery-btn p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-discovery-card bg-white p-4 inline-flex flex-col items-center justify-center shadow-inner mx-auto">
              <img
                src={qrDataUrl}
                alt={`QR Code สำหรับเข้าห้อง ${roomCode}`}
                className="w-56 h-56 object-contain"
              />
            </div>

            <div className="space-y-2">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                รหัสเชื่อมต่อห้อง (Room Code)
              </div>
              <div className="rounded-discovery-btn inline-block px-4 py-1.5 bg-slate-100 dark:bg-[#070204] font-mono tabular-nums text-xl font-semibold tracking-[0.25em] text-slate-900 dark:text-orange-400">
                {roomCode}
              </div>
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 break-all px-2">
                {`${window.location.origin}/?room=${roomCode}`}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={copyShareUrl}
                className="rounded-discovery-btn py-2.5 px-3 bg-gradient-to-r from-red-600 to-orange-500 hover:opacity-95 text-white text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}</span>
              </button>
              <button
                type="button"
                onClick={downloadQrImage}
                className="rounded-discovery-btn py-2.5 px-3 bg-slate-100 dark:bg-[#120608] hover:bg-slate-200 dark:hover:bg-[#1a0a0d] text-slate-700 dark:text-orange-200 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>บันทึกรูป QR</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
