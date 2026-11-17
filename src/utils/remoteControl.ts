import { RemoteInputEvent } from '../types';

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 4,
};

// Map browser KeyboardEvent.code / key to Win32 Virtual-Key codes for OS Bridge
const CODE_TO_VK: Record<string, number> = {
  Backspace: 0x08,
  Tab: 0x09,
  Enter: 0x0d,
  NumpadEnter: 0x0d,
  ShiftLeft: 0x10,
  ShiftRight: 0x10,
  ControlLeft: 0x11,
  ControlRight: 0x11,
  AltLeft: 0x12,
  AltRight: 0x12,
  Pause: 0x13,
  CapsLock: 0x14,
  Escape: 0x1b,
  Space: 0x20,
  PageUp: 0x21,
  PageDown: 0x22,
  End: 0x23,
  Home: 0x24,
  ArrowLeft: 0x25,
  ArrowUp: 0x26,
  ArrowRight: 0x27,
  ArrowDown: 0x28,
  PrintScreen: 0x2c,
  Insert: 0x2d,
  Delete: 0x2e,
  MetaLeft: 0x5b,
  MetaRight: 0x5c,
  F1: 0x70,
  F2: 0x71,
  F3: 0x72,
  F4: 0x73,
  F5: 0x74,
  F6: 0x75,
  F7: 0x76,
  F8: 0x77,
  F9: 0x78,
  F10: 0x79,
  F11: 0x7a,
  F12: 0x7b,
  NumLock: 0x90,
  ScrollLock: 0x91,
  Semicolon: 0xba,
  Equal: 0xbb,
  Comma: 0xbc,
  Minus: 0xbd,
  Period: 0xbe,
  Slash: 0xbf,
  Backquote: 0xc0,
  BracketLeft: 0xdb,
  Backslash: 0xdc,
  BracketRight: 0xdd,
  Quote: 0xde,
};

export function getVirtualKeyCode(code: string, key: string): number {
  if (CODE_TO_VK[code]) return CODE_TO_VK[code];

  if (code.startsWith('Key') && code.length === 4) {
    return code.charCodeAt(3); // 'A'..'Z' -> 65..90
  }
  if (code.startsWith('Digit') && code.length === 6) {
    return code.charCodeAt(5); // '0'..'9' -> 48..57
  }
  if (code.startsWith('Numpad') && code.length === 7) {
    const d = code.charCodeAt(6) - 48;
    if (d >= 0 && d <= 9) return 0x60 + d;
  }
  if (key.length === 1) {
    const upper = key.toUpperCase().charCodeAt(0);
    if ((upper >= 65 && upper <= 90) || (upper >= 48 && upper <= 57)) {
      return upper;
    }
  }
  return 0;
}

export const VK_SHORTCUTS = {
  CTRL: 0x11,
  SHIFT: 0x10,
  ALT: 0x12,
  WIN: 0x5b,
  TAB: 0x09,
  C: 0x43,
  V: 0x56,
  X: 0x58,
  Z: 0x5a,
  A: 0x41,
  ESC: 0x1b,
  ENTER: 0x0d,
};

/**
 * Executes remote pointer/keyboard events inside Computer 1's browser DOM
 * when Computer 2 is interacting with the SharedDrop web viewport.
 */
export function executeBrowserControlEvent(event: RemoteInputEvent): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (event.type === 'mousedown' || event.type === 'dblclick') {
    const px = Math.round(event.x * vw);
    const py = Math.round(event.y * vh);
    const target = document.elementFromPoint(px, py) as HTMLElement | null;
    if (!target) return;

    // Ignore clicks on the kill-switch safety button if accidental? No, let standard DOM click work cleanly
    const mouseInit: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      clientX: px,
      clientY: py,
      button: event.button,
      view: window,
    };

    target.dispatchEvent(new PointerEvent('pointerdown', mouseInit));
    target.dispatchEvent(new MouseEvent('mousedown', mouseInit));

    if (target instanceof HTMLElement && typeof target.focus === 'function') {
      target.focus({ preventScroll: true });
    }

    if (event.type === 'dblclick') {
      target.dispatchEvent(new MouseEvent('dblclick', mouseInit));
    }
  } else if (event.type === 'mouseup') {
    const px = Math.round(event.x * vw);
    const py = Math.round(event.y * vh);
    const target = document.elementFromPoint(px, py) as HTMLElement | null;
    if (!target) return;

    const mouseInit: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      clientX: px,
      clientY: py,
      button: event.button,
      view: window,
    };

    target.dispatchEvent(new PointerEvent('pointerup', mouseInit));
    target.dispatchEvent(new MouseEvent('mouseup', mouseInit));
    if (event.button === 0) {
      target.click();
    } else if (event.button === 2) {
      target.dispatchEvent(new MouseEvent('contextmenu', mouseInit));
    }
  } else if (event.type === 'wheel') {
    const px = Math.round(event.x * vw);
    const py = Math.round(event.y * vh);
    const target = document.elementFromPoint(px, py) as HTMLElement | null;

    // Scroll nearest scrollable ancestor or window
    let el: HTMLElement | null = target;
    let scrolled = false;
    while (el && el !== document.body && el !== document.documentElement) {
      const style = window.getComputedStyle(el);
      const canScrollY =
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight;
      if (canScrollY) {
        el.scrollBy({ top: event.deltaY, left: event.deltaX, behavior: 'auto' });
        scrolled = true;
        break;
      }
      el = el.parentElement;
    }
    if (!scrolled) {
      window.scrollBy({ top: event.deltaY, left: event.deltaX, behavior: 'auto' });
    }
  } else if (event.type === 'keydown') {
    const active = document.activeElement as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLElement
      | null;

    if (!active) return;

    // Handle typing into focused input / textarea using React-compatible value setter
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement
    ) {
      const start = active.selectionStart ?? active.value.length;
      const end = active.selectionEnd ?? active.value.length;

      if (event.key === 'Backspace') {
        const nextVal =
          start === end && start > 0
            ? active.value.slice(0, start - 1) + active.value.slice(end)
            : active.value.slice(0, start) + active.value.slice(end);
        const nextPos = start === end && start > 0 ? start - 1 : start;
        setReactInputValue(active, nextVal, nextPos);
        return;
      }

      if (event.key === 'Delete') {
        const nextVal =
          start === end && end < active.value.length
            ? active.value.slice(0, start) + active.value.slice(end + 1)
            : active.value.slice(0, start) + active.value.slice(end);
        setReactInputValue(active, nextVal, start);
        return;
      }

      if (event.key === 'Enter' && active instanceof HTMLTextAreaElement) {
        const nextVal =
          active.value.slice(0, start) + '\n' + active.value.slice(end);
        setReactInputValue(active, nextVal, start + 1);
        return;
      }

      if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const nextVal =
          active.value.slice(0, start) + event.key + active.value.slice(end);
        setReactInputValue(active, nextVal, start + 1);
        return;
      }
    }

    active.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        bubbles: true,
        cancelable: true,
      })
    );
  }
}

function setReactInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  cursorPos: number
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  try {
    el.setSelectionRange(cursorPos, cursorPos);
  } catch {
    // ignore for input types that don't support selectionRange
  }
}
