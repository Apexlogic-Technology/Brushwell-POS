import React, { useEffect } from 'react';
import { X, Download, ZoomIn } from 'lucide-react';

/**
 * InvoiceImageModal — Full-screen lightbox for viewing invoice/evidence photos.
 * Supports both Supabase Storage URLs and base64 data URIs.
 */
export default function InvoiceImageModal({ isOpen, imageUrl, imageData, onClose, title = 'Invoice Image' }) {
  const src = imageUrl || imageData || null;

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen || !src) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = `invoice-${Date.now()}.jpg`;
    a.click();
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeIn 0.2s ease'
      }}
      onClick={onClose}
    >
      {/* Header bar */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff' }}>
          <ZoomIn size={16} />
          <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{title}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleDownload}
            style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: '8px', color: '#fff', padding: '0.4rem 0.8rem',
              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.35rem'
            }}
          >
            <Download size={14} /> Download
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: '8px', color: '#fff', padding: '0.4rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Image */}
      <img
        src={src}
        alt={title}
        style={{
          maxWidth: '100%',
          maxHeight: 'calc(100vh - 100px)',
          objectFit: 'contain',
          borderRadius: '8px',
          boxShadow: '0 0 60px rgba(0,0,0,0.8)',
          userSelect: 'none'
        }}
        onClick={e => e.stopPropagation()}
        draggable={false}
      />

      <style>{`@keyframes fadeIn { from { opacity:0 } to { opacity:1 } }`}</style>
    </div>
  );
}
