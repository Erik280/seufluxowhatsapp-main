import React from 'react';
import { AlertTriangle, CheckCircle, Trash2, X, Zap } from 'lucide-react';
import './CustomConfirmModal.css';

export interface ConfirmModalConfig {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info' | 'success';
  showCancel?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface CustomConfirmModalProps {
  config: ConfirmModalConfig | null;
  onClose: () => void;
}

export default function CustomConfirmModal({ config, onClose }: CustomConfirmModalProps) {
  if (!config || !config.isOpen) return null;

  const {
    title = 'Aviso de Confirmação',
    message,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    variant = 'danger',
    showCancel = true,
    onConfirm,
    onCancel,
  } = config;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    onClose();
  };

  const getIcon = () => {
    switch (variant) {
      case 'danger':
        return <Trash2 size={22} />;
      case 'warning':
        return <AlertTriangle size={22} />;
      case 'success':
        return <CheckCircle size={22} />;
      default:
        return <Zap size={22} />;
    }
  };

  return (
    <div className="custom-confirm-backdrop" onClick={handleCancel}>
      <div className={`custom-confirm-card ${variant}`} onClick={e => e.stopPropagation()}>
        <div className="custom-confirm-header">
          <div className="custom-confirm-brand">
            <div className={`custom-confirm-badge ${variant}`}>
              {getIcon()}
            </div>
            <div className="custom-confirm-titles">
              <span className="brand-tag">seufluxowhatsapp</span>
              <h3 className="custom-confirm-title">{title}</h3>
            </div>
          </div>
          <button className="custom-confirm-close" onClick={handleCancel} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="custom-confirm-body">
          <p className="custom-confirm-message">{message}</p>
        </div>

        <div className="custom-confirm-footer">
          {showCancel && (
            <button className="btn-confirm-cancel" onClick={handleCancel}>
              {cancelText}
            </button>
          )}
          <button className={`btn-confirm-submit ${variant}`} onClick={handleConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
