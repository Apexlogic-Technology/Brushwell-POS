import React, { useState, useEffect } from 'react';
import { X, Download, ZoomIn, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';

/**
 * InvoiceImageModal — Full-screen lightbox with multi-image carousel support.
 * Supports viewing single or multiple invoice photos/receipts.
 */
export default function InvoiceImageModal({
  isOpen,
  images = [],
  imageUrl,
  imageData,
  initialIndex = 0,
  onClose,
  title = 'Invoice Evidence'
}) {
  // Normalize input images into a clean array
  const imageList = React.useMemo(() => {
    if (Array.isArray(images) && images.length > 0) {
      return images.filter(Boolean);
    }
    const single = imageUrl || imageData;
    if (!single) return [];
    if (typeof single === 'string' && single.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(single.trim());
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch (e) {}
    }
    return [single];
  }, [images, imageUrl, imageData]);

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      const idx = Math.max(0, Math.min(initialIndex, (imageList.length || 1) - 1));
      setCurrentIndex(idx);
    }
  }, [isOpen, initialIndex, imageList.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && currentIndex < imageList.length - 1) {
        setCurrentIndex(i => i + 1);
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex(i => i - 1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, currentIndex, imageList.length]);

  if (!isOpen || imageList.length === 0) return null;

  const currentSrc = imageList[currentIndex] || imageList[0];

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = currentSrc;
    a.download = `invoice-${Date.now()}-photo-${currentIndex + 1}.jpg`;
    a.click();
  };

  const hasMultiple = imageList.length > 1;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.94)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeIn 0.18s ease'
      }}
      onClick={onClose}
    >
      {/* Header bar */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.75rem 1.25rem',
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(10px)',
          zIndex: 10000
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#fff' }}>
          <ZoomIn size={18} />
          <span style={{ fontSize: '0.92rem', fontWeight: 700 }}>{title}</span>
          {hasMultiple && (
            <span style={{
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '6px',
              padding: '0.15rem 0.5rem',
              fontSize: '0.75rem',
              fontWeight: 700
            }}>
              {currentIndex + 1} of {imageList.length}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleDownload}
            style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: '8px', color: '#fff', padding: '0.45rem 0.85rem',
              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              transition: 'background 0.15s'
            }}
          >
            <Download size={14} /> Download
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: '8px', color: '#fff', padding: '0.45rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Image Container */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth: '100%',
          maxHeight: hasMultiple ? 'calc(100vh - 160px)' : 'calc(100vh - 100px)',
          width: '100%',
          height: '100%'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Prev button */}
        {hasMultiple && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setCurrentIndex(i => Math.max(0, i - 1)); }}
            disabled={currentIndex === 0}
            style={{
              position: 'absolute', left: '1rem',
              background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '50%', color: '#fff', width: '42px', height: '42px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
              opacity: currentIndex === 0 ? 0.3 : 0.9,
              zIndex: 10, transition: 'all 0.15s'
            }}
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {/* Current Image */}
        <img
          key={currentIndex}
          src={currentSrc}
          alt={`Invoice ${currentIndex + 1}`}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            borderRadius: '8px',
            boxShadow: '0 0 60px rgba(0,0,0,0.85)',
            userSelect: 'none',
            animation: 'fadeIn 0.15s ease'
          }}
          draggable={false}
        />

        {/* Next button */}
        {hasMultiple && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setCurrentIndex(i => Math.min(imageList.length - 1, i + 1)); }}
            disabled={currentIndex === imageList.length - 1}
            style={{
              position: 'absolute', right: '1rem',
              background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '50%', color: '#fff', width: '42px', height: '42px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: currentIndex === imageList.length - 1 ? 'not-allowed' : 'pointer',
              opacity: currentIndex === imageList.length - 1 ? 0.3 : 0.9,
              zIndex: 10, transition: 'all 0.15s'
            }}
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip for Multi-Image */}
      {hasMultiple && (
        <div
          style={{
            position: 'absolute', bottom: '0.75rem',
            display: 'flex', gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            background: 'rgba(0,0,0,0.65)',
            borderRadius: '12px',
            backdropFilter: 'blur(8px)',
            maxWidth: '90vw',
            overflowX: 'auto',
            zIndex: 10000
          }}
          onClick={e => e.stopPropagation()}
        >
          {imageList.map((img, idx) => (
            <img
              key={idx}
              src={img}
              alt={`thumb-${idx}`}
              onClick={() => setCurrentIndex(idx)}
              style={{
                width: '42px', height: '42px',
                objectFit: 'cover',
                borderRadius: '6px',
                cursor: 'pointer',
                border: currentIndex === idx ? '2px solid var(--primary, #3b82f6)' : '2px solid transparent',
                opacity: currentIndex === idx ? 1 : 0.6,
                transition: 'all 0.15s',
                transform: currentIndex === idx ? 'scale(1.08)' : 'scale(1)'
              }}
            />
          ))}
        </div>
      )}

      <style>{`@keyframes fadeIn { from { opacity:0 } to { opacity:1 } }`}</style>
    </div>
  );
}
