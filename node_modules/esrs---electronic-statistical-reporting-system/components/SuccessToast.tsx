import React, { useEffect } from 'react';

interface Props {
  open: boolean;
  message: string;
  duration?: number;
  onClose?: () => void;
}

const SuccessToast: React.FC<Props> = ({ open, message, duration = 3000, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => onClose && onClose(), duration);
    return () => clearTimeout(t);
  }, [open, duration, onClose]);

  if (!open) return null;

  return (
    <div className="fixed top-6 right-6 z-50">
      <div className="px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2">
        <div className="font-semibold">Success</div>
        <div className="text-sm mt-1">{message}</div>
      </div>
    </div>
  );
};

export default SuccessToast;
