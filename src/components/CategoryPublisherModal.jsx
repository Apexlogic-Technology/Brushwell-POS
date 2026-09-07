import React, { useState, useMemo } from 'react';
import { 
  X, Tag, Building, Plus, Edit2, Trash2, Check, AlertCircle, 
  Search, RefreshCw, Layers, BookOpen 
} from 'lucide-react';
import { 
  renameCategoryInProducts, 
  renamePublisherInProducts, 
  getCustomCategories, 
  saveCustomCategories, 
  getCustomPublishers, 
  saveCustomPublishers 
} from '../services/supabaseService';

export default function CategoryPublisherModal({ 
  isOpen, 
  onClose, 
  products = [], 
  categories = [], 
  onCategoriesUpdated, 
  onRefreshProducts 
}) {
  const [activeTab, setActiveTab] = useState('categories'); // 'categories' | 'publishers'
  const [searchQuery, setSearchQuery] = useState('');
  
  // Category state
  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState(null);
  const [editingCatName, setEditingCatName] = useState('');

  // Publisher state
  const [newPubName, setNewPubName] = useState('');
  const [editingPubName, setEditingPubName] = useState(null);
  const [editingPubNewName, setEditingPubNewName] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Map category product counts
  const categoryCounts = useMemo(() => {
    const counts = {};
    (products || []).forEach(p => {
      if (p && p.category_name) {
        const key = p.category_name.trim().toLowerCase();
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return counts;
  }, [products]);

  // Aggregate all unique publishers and their counts
  const publishersList = useMemo(() => {
    const counts = {};
    (products || []).forEach(p => {
      if (p && p.publisher && p.publisher.trim()) {
        const pub = p.publisher.trim();
        counts[pub] = (counts[pub] || 0) + 1;
      }
    });

    const savedPubs = getCustomPublishers();
    (savedPubs || []).forEach(p => {
      if (p && !counts[p]) counts[p] = 0;
    });

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [products]);

  if (!isOpen) return null;

  const showFeedback = (type, message) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
  };

  // ─── Category Handlers ───────────────────────────────────────────────────────
  const handleAddCategory = () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;

    const exists = categories.some(c => (c.name || '').toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      showFeedback('error', `Category "${trimmed}" already exists.`);
      return;
    }

    const newCategory = { id: `cat-custom-${Date.now()}`, name: trimmed };
    const updated = [...categories, newCategory];
    saveCustomCategories(updated);
    if (onCategoriesUpdated) onCategoriesUpdated(updated);

    setNewCatName('');
    showFeedback('success', `Added category "${trimmed}"`);
  };

  const handleStartEditCat = (cat) => {
    setEditingCatId(cat.id);
    setEditingCatName(cat.name);
  };

  const handleSaveEditCat = async (oldCat) => {
    const trimmed = editingCatName.trim();
    if (!trimmed || trimmed === oldCat.name) {
      setEditingCatId(null);
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Rename in Supabase for all existing products
      const count = await renameCategoryInProducts(oldCat.name, trimmed);

      // 2. Update categories array in local storage
      const updated = categories.map(c => c.id === oldCat.id ? { ...c, name: trimmed } : c);
      saveCustomCategories(updated);
      if (onCategoriesUpdated) onCategoriesUpdated(updated);

      // 3. Refresh product list from DB
      if (onRefreshProducts) await onRefreshProducts();

      showFeedback('success', `Renamed category to "${trimmed}" (updated ${count} books).`);
      setEditingCatId(null);
    } catch (err) {
      showFeedback('error', err.message || 'Failed to rename category.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteCat = (cat) => {
    const count = categoryCounts[(cat.name || '').trim().toLowerCase()] || 0;
    if (count > 0) {
      if (!window.confirm(`Warning: ${count} books are currently assigned to "${cat.name}". Are you sure you want to remove this category from the selector? (Existing books will keep their category name until re-assigned)`)) {
        return;
      }
    }

    const updated = categories.filter(c => c.id !== cat.id);
    saveCustomCategories(updated);
    if (onCategoriesUpdated) onCategoriesUpdated(updated);
    showFeedback('success', `Removed category "${cat.name}".`);
  };

  // ─── Publisher Handlers ─────────────────────────────────────────────────────
  const handleAddPublisher = () => {
    const trimmed = newPubName.trim();
    if (!trimmed) return;

    const exists = publishersList.some(p => p.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      showFeedback('error', `Publisher "${trimmed}" already exists.`);
      return;
    }

    const currentSaved = getCustomPublishers();
    const updated = [...new Set([...currentSaved, trimmed])];
    saveCustomPublishers(updated);

    setNewPubName('');
    showFeedback('success', `Added publisher "${trimmed}" to catalog.`);
  };

  const handleStartEditPub = (pub) => {
    setEditingPubName(pub.name);
    setEditingPubNewName(pub.name);
  };

  const handleSaveEditPub = async (oldName) => {
    const trimmed = editingPubNewName.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingPubName(null);
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Rename in Supabase for all matching products
      const count = await renamePublisherInProducts(oldName, trimmed);

      // 2. Update custom publishers in localStorage
      const currentSaved = getCustomPublishers();
      const updated = currentSaved.map(p => p.toLowerCase() === oldName.toLowerCase() ? trimmed : p);
      if (!updated.some(p => p.toLowerCase() === trimmed.toLowerCase())) {
        updated.push(trimmed);
      }
      saveCustomPublishers(updated);

      // 3. Refresh product list from DB
      if (onRefreshProducts) await onRefreshProducts();

      showFeedback('success', `Renamed publisher to "${trimmed}" (updated ${count} books).`);
      setEditingPubName(null);
    } catch (err) {
      showFeedback('error', err.message || 'Failed to rename publisher.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Filter lists based on search
  const filteredCategories = categories.filter(c => 
    (c.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPublishers = publishersList.filter(p => 
    (p.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={e => e.stopPropagation()} 
        style={{ maxWidth: '580px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
            }}>
              <Layers size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Manage Categories & Publishers</h3>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Add, rename, or organize catalog classifications
              </div>
            </div>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Feedback Alert */}
        {feedback.message && (
          <div style={{
            padding: '0.55rem 0.85rem',
            margin: '0.5rem 1rem 0',
            borderRadius: 'var(--radius-md)',
            background: feedback.type === 'error' ? 'var(--accent-rose-light)' : 'var(--accent-emerald-light)',
            color: feedback.type === 'error' ? 'var(--accent-rose)' : 'var(--accent-emerald)',
            fontSize: '0.78rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}>
            {feedback.type === 'error' ? <AlertCircle size={15} /> : <Check size={15} />}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Tab Switcher */}
        <div style={{ padding: '0.75rem 1rem 0' }}>
          <div style={{
            display: 'flex',
            background: 'var(--bg-surface-elevated)',
            padding: '3px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)'
          }}>
            <button
              type="button"
              onClick={() => { setActiveTab('categories'); setSearchQuery(''); }}
              style={{
                flex: 1,
                padding: '0.45rem 0.5rem',
                fontSize: '0.82rem',
                fontWeight: 700,
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'categories' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'categories' ? '#ffffff' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                transition: 'all 0.15s'
              }}
            >
              <Tag size={14} /> Categories ({categories.length})
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('publishers'); setSearchQuery(''); }}
              style={{
                flex: 1,
                padding: '0.45rem 0.5rem',
                fontSize: '0.82rem',
                fontWeight: 700,
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'publishers' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'publishers' ? '#ffffff' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                transition: 'all 0.15s'
              }}
            >
              <Building size={14} /> Publishers ({publishersList.length})
            </button>
          </div>
        </div>

        {/* Search & Add Bar */}
        <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Quick Search */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
            <input
              type="text"
              className="form-control"
              placeholder={activeTab === 'categories' ? 'Filter categories...' : 'Filter publishers...'}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '1.9rem', fontSize: '0.8rem' }}
            />
          </div>

          {/* Add New Input */}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <input
              type="text"
              className="form-control"
              placeholder={activeTab === 'categories' ? 'Enter new category name...' : 'Enter new publisher name...'}
              value={activeTab === 'categories' ? newCatName : newPubName}
              onChange={e => activeTab === 'categories' ? setNewCatName(e.target.value) : setNewPubName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  activeTab === 'categories' ? handleAddCategory() : handleAddPublisher();
                }
              }}
              style={{ fontSize: '0.82rem', flex: 1 }}
            />
            <button
              type="button"
              className="btn-primary"
              onClick={activeTab === 'categories' ? handleAddCategory : handleAddPublisher}
              style={{ fontSize: '0.78rem', padding: '0.4rem 0.8rem', whiteSpace: 'nowrap' }}
            >
              <Plus size={15} /> Add
            </button>
          </div>
        </div>

        {/* List Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {activeTab === 'categories' ? (
            filteredCategories.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                No categories found matching "{searchQuery}"
              </div>
            ) : (
              filteredCategories.map(cat => {
                const count = categoryCounts[(cat.name || '').trim().toLowerCase()] || 0;
                const isEditing = editingCatId === cat.id;

                return (
                  <div
                    key={cat.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.55rem 0.75rem',
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      gap: '0.5rem'
                    }}
                  >
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '0.35rem', flex: 1, alignItems: 'center' }}>
                        <input
                          type="text"
                          className="form-control"
                          value={editingCatName}
                          onChange={e => setEditingCatName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSaveEditCat(cat)}
                          autoFocus
                          style={{ fontSize: '0.82rem', flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={isProcessing}
                          onClick={() => handleSaveEditCat(cat)}
                          style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                        >
                          {isProcessing ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setEditingCatId(null)}
                          style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
                          <Tag size={15} color="var(--primary)" style={{ flexShrink: 0 }} />
                          <span style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--text-main)', wordBreak: 'break-word' }}>
                            {cat.name}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.45rem',
                            borderRadius: 'var(--radius-full)',
                            background: count > 0 ? 'var(--primary-light)' : 'var(--border-subtle)',
                            color: count > 0 ? 'var(--primary)' : 'var(--text-muted)'
                          }}>
                            {count} book{count !== 1 ? 's' : ''}
                          </span>

                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => handleStartEditCat(cat)}
                            title="Rename Category"
                            style={{ width: '28px', height: '28px' }}
                          >
                            <Edit2 size={13} />
                          </button>

                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => handleDeleteCat(cat)}
                            title="Delete Category"
                            style={{ width: '28px', height: '28px', color: 'var(--accent-rose)' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )
          ) : (
            filteredPublishers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                No publishers found matching "{searchQuery}"
              </div>
            ) : (
              filteredPublishers.map(pub => {
                const isEditing = editingPubName === pub.name;

                return (
                  <div
                    key={pub.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.55rem 0.75rem',
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      gap: '0.5rem'
                    }}
                  >
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '0.35rem', flex: 1, alignItems: 'center' }}>
                        <input
                          type="text"
                          className="form-control"
                          value={editingPubNewName}
                          onChange={e => setEditingPubNewName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSaveEditPub(pub.name)}
                          autoFocus
                          style={{ fontSize: '0.82rem', flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={isProcessing}
                          onClick={() => handleSaveEditPub(pub.name)}
                          style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                        >
                          {isProcessing ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setEditingPubName(null)}
                          style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
                          <Building size={15} color="var(--accent-purple)" style={{ flexShrink: 0 }} />
                          <span style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--text-main)', wordBreak: 'break-word' }}>
                            {pub.name}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.45rem',
                            borderRadius: 'var(--radius-full)',
                            background: pub.count > 0 ? 'var(--accent-purple-light, rgba(147, 51, 234, 0.12))' : 'var(--border-subtle)',
                            color: pub.count > 0 ? 'var(--accent-purple)' : 'var(--text-muted)'
                          }}>
                            {pub.count} book{pub.count !== 1 ? 's' : ''}
                          </span>

                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => handleStartEditPub(pub)}
                            title="Rename Publisher in all products"
                            style={{ width: '28px', height: '28px' }}
                          >
                            <Edit2 size={13} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ justifyContent: 'flex-end', borderTop: '1px solid var(--border-light)', padding: '0.75rem 1rem' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
