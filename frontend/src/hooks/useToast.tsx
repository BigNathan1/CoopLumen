import { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  duration?: number;
  dismissible?: boolean;
}

export interface Toast extends ToastOptions {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextType {
  toasts: Toast[];
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  warning: (message: string, options?: ToastOptions) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/**
 * ToastProvider component that manages toast notifications globally.
 * Must wrap the app or root layout to make useToast() available.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idCounterRef = useRef(0);
  const timersRef = useRef<Record<string, NodeJS.Timeout>>({});

  const createToast = useCallback(
    (message: string, variant: ToastVariant, options: ToastOptions = {}) => {
      const id = `toast-${++idCounterRef.current}`;
      const duration = options.duration ?? 4000; // Default 4s
      const dismissible = options.dismissible ?? true;

      const newToast: Toast = {
        id,
        message,
        variant,
        duration,
        dismissible,
      };

      setToasts((prev) => [...prev, newToast]);

      // Auto-dismiss after duration (unless duration is 0 or Infinity)
      if (duration > 0 && isFinite(duration)) {
        const timer = setTimeout(() => {
          dismiss(id);
        }, duration);

        timersRef.current[id] = timer;
      }
    },
    [],
  );

  const dismiss = useCallback((id: string) => {
    // Clear any pending timer
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }

    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    // Clear all timers
    Object.values(timersRef.current).forEach(clearTimeout);
    timersRef.current = {};

    setToasts([]);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, []);

  const value: ToastContextType = {
    toasts,
    success: (message, options) => createToast(message, 'success', options),
    error: (message, options) => createToast(message, 'error', options),
    info: (message, options) => createToast(message, 'info', options),
    warning: (message, options) => createToast(message, 'warning', options),
    dismiss,
    dismissAll,
  };

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

/**
 * Hook to access toast notification methods from anywhere in the app.
 * Must be used within a component tree wrapped by ToastProvider.
 */
export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
