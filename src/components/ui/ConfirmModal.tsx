'use client';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      ),
      iconBg: 'bg-red-500/20',
      iconColor: 'text-red-500',
      buttonClass: 'bg-red-500 hover:bg-red-600 text-white',
    },
    warning: {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      ),
      iconBg: 'bg-yellow-500/20',
      iconColor: 'text-yellow-500',
      buttonClass: 'bg-yellow-500 hover:bg-yellow-600 text-black',
    },
    default: {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      iconBg: 'bg-bg-elevated',
      iconColor: 'text-text-secondary',
      buttonClass: 'bg-macro-calories hover:bg-macro-calories/90 text-white',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-bg-surface border border-border-subtle rounded-2xl shadow-2xl w-full max-w-sm animate-slide-up overflow-hidden">
        {/* Content */}
        <div className="p-6 text-center">
          {/* Icon */}
          <div className={`w-14 h-14 mx-auto mb-4 rounded-full ${styles.iconBg} flex items-center justify-center ${styles.iconColor}`}>
            {styles.icon}
          </div>

          {/* Title */}
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            {title}
          </h3>

          {/* Message */}
          <p className="text-body text-text-secondary">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex border-t border-border-subtle">
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 text-sm font-medium text-text-secondary hover:bg-bg-elevated transition-colors"
          >
            {cancelLabel}
          </button>
          <div className="w-px bg-border-subtle" />
          <button
            onClick={onConfirm}
            className={`flex-1 py-3.5 text-sm font-medium transition-colors ${styles.buttonClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
