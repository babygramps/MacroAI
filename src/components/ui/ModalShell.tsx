'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  containerClassName?: string;
  contentClassName?: string;
  contentProps?: React.HTMLAttributes<HTMLDivElement>;
}

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function ModalShell({
  isOpen,
  onClose,
  children,
  containerClassName,
  contentClassName,
  contentProps,
}: ModalShellProps) {
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  const modalContent = (
    <div className={`fixed inset-0 z-50 ${containerClassName || ''}`}>
      <div className="modal-backdrop" onClick={onClose} />
      <div className={contentClassName} {...contentProps}>
        {children}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
