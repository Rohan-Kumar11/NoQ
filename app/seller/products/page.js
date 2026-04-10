// app/seller/products/page.js
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
  getCategoryConfig, 
  getProductEmoji, 
  hasProductsFeature, 
  formatProductInfo, 
  getTagOptionsForCategory 
} from '@/lib/categoryConfig';
import { createProduct, updateProduct, deleteProduct as deleteProductAPI } from '@/lib/api/products';
import { uploadProductImage, deleteProductImage } from '@/lib/api/productImages';
import Sidebar from '../../components/Sidebar';
import ImageUploader from '../../components/ImageUploader';
import styles from './ProductManagement.module.css';
import toast from 'react-hot-toast';

function getErrorMessage(err) {
  if (!err) return 'An unknown error occurred';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    if (err.message) return String(err.message);
    if (err.error_description) return String(err.error_description);
    if (err.error) return String(err.error);
  }
  return 'An unknown error occurred';
}

function RealtimePill({ status }) {
  const cfg = {
    connecting: { bg: '#fef3c7', border: '#fcd34d', dot: '#f59e0b', text: '#92400e', label: 'Connecting…' },
    live:       { bg: '#d1fae5', border: '#6ee7b7', dot: '#10b981', text: '#065f46', label: '● Live'      },
    error:      { bg: '#fee2e2', border: '#fca5a5', dot: '#ef4444', text: '#991b1b', label: 'Reconnecting'},
  }[status] || { bg: '#fef3c7', border: '#fcd34d', dot: '#f59e0b', text: '#92400e', label: 'Connecting…' };

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      borderRadius: '999px', padding: '0.2rem 0.65rem',
      fontSize: '0.78rem', fontWeight: 700, color: cfg.text,
      boxShadow: '0 1px 3px rgba(0,0,0,0.07)'
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: cfg.dot,
        boxShadow: status === 'live' ? `0 0 6px ${cfg.dot}` : 'none'
      }} />
      {cfg.label}
    </span>
  );
}

export default function ProductManagement() {
  const router = useRouter();
  const [storeType, setStoreType] = useState(null);
  const [storeId, setStoreId] = useState(null);
  const [storeName, setStoreName] = useState('');
  const [config, setConfig] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [selectedImage, setSelectedImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [formData, setFormData] = useState({
    name: '', category: '', price: '', stock: '',
    lowStockThreshold: 10, status: 'available',
    image: '📦', image_url: '', metadata: {}
  });

  const [errors, setErrors] = useState({});

  useEffect(() => { fetchStoreDetails(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const sidebar = document.querySelector('[class*="sidebar"]');
      if (!sidebar) return;
      const check = (el) => setSidebarCollapsed(el.classList.toString().includes('collapsed'));
      check(sidebar);
      const obs = new MutationObserver(() => check(sidebar));
      obs.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
      return () => obs.disconnect();
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (storeType) setConfig(getCategoryConfig(storeType));
  }, [storeType]);

  useEffect(() => {
    if (!storeId) return;
    setRealtimeStatus('connecting');
    const channel = supabase
      .channel(`seller-products-${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `store_id=eq.${storeId}` },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;
          setProducts(prev => {
            switch (eventType) {
              case 'INSERT':
                if (prev.find(p => p.id === newRow.id)) return prev;
                if (!newRow.is_active) return prev;
                return [newRow, ...prev];
              case 'UPDATE':
                if (!newRow.is_active) return prev.filter(p => p.id !== newRow.id);
                return prev.map(p => p.id === newRow.id ? { ...p, ...newRow } : p);
              case 'DELETE':
                return prev.filter(p => p.id !== oldRow.id);
              default: return prev;
            }
          });
          if (eventType === 'UPDATE' && oldRow && newRow.stock !== oldRow.stock) {
            const diff = newRow.stock - (oldRow.stock || 0);
            if (diff < 0) toast(`📦 ${newRow.name}: stock −${Math.abs(diff)} → now ${newRow.stock}`, { duration: 3000, style: { background: '#fef3c7', color: '#92400e' } });
            if (newRow.stock === 0) toast.error(`⚠️ "${newRow.name}" is now out of stock!`, { duration: 4000 });
          }
        })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('live');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeStatus('error');
      });
    return () => { supabase.removeChannel(channel); setRealtimeStatus('connecting'); };
  }, [storeId]);

  const fetchStoreDetails = async () => {
    try {
      setError(null);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error(getErrorMessage(userError) || 'Not authenticated.');

      const { data: stores, error: storeError } = await supabase
        .from('stores').select('id, store_type, store_name, business_id, is_active')
        .eq('business_id', user.id).order('created_at', { ascending: false });

      if (storeError) throw new Error(`Failed to fetch stores: ${getErrorMessage(storeError)}`);
      if (!stores || stores.length === 0) throw new Error('No store found. Please complete store registration first.');

      const selectedStore = stores.find(s => s.is_active) || stores[0];
      setStoreId(selectedStore.id);
      setStoreName(selectedStore.store_name);

      let normalizedType = (selectedStore.store_type || 'retail').toLowerCase().trim();
      if (normalizedType === 'cafe') normalizedType = 'café';

      if (!hasProductsFeature(normalizedType)) {
        setAccessDenied(true);
        setStoreType(normalizedType);
        setLoading(false);
        return;
      }

      setStoreType(normalizedType);
      await fetchProducts(selectedStore.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async (id) => {
    try {
      const { data, error } = await supabase
        .from('products').select('*').eq('store_id', id).eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw new Error(getErrorMessage(error));
      setProducts(data || []);
    } catch (err) {
      setProducts([]);
    }
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          product.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'all' || product.category === filterCategory;
    const matchesStatus = filterStatus === 'all' || product.status === filterStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    setFormData(prev => {
      const updated = { ...prev, [name]: newValue };
      if (config?.fields?.specific) {
        config.fields.specific.forEach(field => {
          if (field.type === 'select_dynamic' && field.dependsOn === name) updated[field.name] = '';
        });
      }
      return updated;
    });
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleImageSelect = (file) => { setSelectedImage(file); setErrors(prev => ({ ...prev, image: '' })); };
  const handleImageRemove = () => setSelectedImage(null);

  const handleAddProduct = async (enrichedFormData) => {
    if (!enrichedFormData || enrichedFormData instanceof Event || typeof enrichedFormData !== 'object') {
      console.error('handleAddProduct received invalid data:', enrichedFormData);
      return;
    }
    try {
      setUploadingImage(true);
      toast.loading('Creating product...', { id: 'create-product' });

      const productData = {
        store_id: storeId,
        name: enrichedFormData.name,
        category: enrichedFormData.category,
        price: parseFloat(enrichedFormData.price) || 0,
        stock: parseInt(enrichedFormData.stock) || 0,
        low_stock_threshold: parseInt(enrichedFormData.lowStockThreshold) || 10,
        status: parseInt(enrichedFormData.stock) > 0 ? 'available' : 'unavailable',
        image: getProductEmoji(enrichedFormData.category, storeType),
        metadata: { ...(enrichedFormData.metadata || {}) }
      };

      if (config?.fields?.specific) {
        config.fields.specific.forEach(field => {
          if (enrichedFormData[field.name] !== undefined && enrichedFormData[field.name] !== '') {
            productData.metadata[field.name] = enrichedFormData[field.name];
          }
        });
      }

      const { data: newProduct, error: productError } = await createProduct(productData);
      if (productError) throw new Error(getErrorMessage(productError));

      if (newProduct) setProducts(prev => [newProduct, ...prev.filter(p => p.id !== newProduct.id)]);

      if (selectedImage && newProduct) {
        toast.loading('Uploading image...', { id: 'create-product' });
        const { data: imageData, error: imageError } = await uploadProductImage(selectedImage, storeId, newProduct.id);
        if (!imageError && imageData) {
          const { data: updatedProduct } = await updateProduct(newProduct.id, { image_url: imageData.url });
          if (updatedProduct) setProducts(prev => prev.map(p => p.id === newProduct.id ? updatedProduct : p));
        } else {
          toast.error('Product created but image upload failed', { id: 'create-product' });
        }
      }

      toast.success('Product added successfully!', { id: 'create-product' });
      setShowAddModal(false);
      resetForm();
    } catch (err) {
      toast.error('Failed to add product: ' + getErrorMessage(err), { id: 'create-product' });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleEditProduct = async (enrichedFormData) => {
    if (!enrichedFormData || enrichedFormData instanceof Event || typeof enrichedFormData !== 'object') {
      console.error('handleEditProduct received invalid data:', enrichedFormData);
      return;
    }
    try {
      setUploadingImage(true);
      toast.loading('Updating product...', { id: 'update-product' });

      const updates = {
        name: enrichedFormData.name,
        category: enrichedFormData.category,
        price: parseFloat(enrichedFormData.price) || 0,
        stock: parseInt(enrichedFormData.stock) || 0,
        low_stock_threshold: parseInt(enrichedFormData.lowStockThreshold) || 10,
        status: parseInt(enrichedFormData.stock) > 0 ? 'available' : 'unavailable',
        metadata: { ...(enrichedFormData.metadata || {}) }
      };

      if (config?.fields?.specific) {
        config.fields.specific.forEach(field => {
          if (enrichedFormData[field.name] !== undefined && enrichedFormData[field.name] !== '') {
            updates.metadata[field.name] = enrichedFormData[field.name];
          }
        });
      }

      const shouldDeleteOldImage = selectedImage && editingProduct?.image_url;
      const { data: updatedProduct, error: updateError } = await updateProduct(
        editingProduct.id, updates, selectedImage, shouldDeleteOldImage
      );
      if (updateError) throw new Error(getErrorMessage(updateError));

      setProducts(prev => prev.map(p => p.id === editingProduct.id ? updatedProduct : p));
      toast.success('Product updated successfully!', { id: 'update-product' });
      setShowEditModal(false);
      setEditingProduct(null);
      resetForm();
    } catch (err) {
      toast.error('Failed to update product: ' + getErrorMessage(err), { id: 'update-product' });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      toast.loading('Deleting product...', { id: 'delete-product' });
      const { error } = await deleteProductAPI(id, true);
      if (error) throw new Error(getErrorMessage(error));
      setProducts(prev => prev.filter(p => p.id !== id));
      setActiveDropdown(null);
      toast.success('Item deleted successfully!', { id: 'delete-product' });
    } catch (err) {
      toast.error('Failed to delete item: ' + getErrorMessage(err), { id: 'delete-product' });
    }
  };

  const toggleProductStatus = async (id) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const newStatus = product.status === 'available' ? 'unavailable' : 'available';
    setProducts(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));
    try {
      const { error } = await supabase.from('products').update({ status: newStatus }).eq('id', id);
      if (error) {
        setProducts(prev => prev.map(p => p.id === id ? { ...p, status: product.status } : p));
        throw new Error(getErrorMessage(error));
      }
    } catch (err) {
      toast.error('Failed to update status: ' + getErrorMessage(err));
    }
  };

  const openEditModal = (product) => {
    setEditingProduct(product);
    const newFormData = {
      name: product.name, category: product.category, price: product.price,
      stock: product.stock, lowStockThreshold: product.low_stock_threshold || 10,
      status: product.status, image: product.image, image_url: product.image_url || '',
      metadata: product.metadata || {}
    };
    if (product.metadata) {
      Object.keys(product.metadata).forEach(key => { newFormData[key] = product.metadata[key]; });
    }
    setFormData(newFormData);
    setSelectedImage(null);
    setShowEditModal(true);
    setActiveDropdown(null);
  };

  const resetForm = () => {
    const defaultForm = {
      name: '', category: '', price: '', stock: '',
      lowStockThreshold: 10, status: 'available', image: '📦', image_url: '', metadata: {}
    };
    if (config?.fields?.specific) {
      config.fields.specific.forEach(field => {
        if (field.type === 'checkbox') defaultForm[field.name] = false;
        else if (field.type === 'multiselect') defaultForm[field.name] = [];
        else defaultForm[field.name] = '';
      });
    }
    setFormData(defaultForm);
    setSelectedImage(null);
    setErrors({});
  };

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <Sidebar />
        <main className={`${styles.mainContent} ${sidebarCollapsed ? styles.expanded : ''}`}>
          <div className={styles.loading}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⏳</div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1a1a1a', marginBottom: '0.5rem' }}>Loading your store...</h2>
              <p style={{ color: '#64748B' }}>Please wait</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.dashboard}>
        <Sidebar />
        <main className={`${styles.mainContent} ${sidebarCollapsed ? styles.expanded : ''}`}>
          <div className={styles.error}>
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>⚠️</div>
              <h2 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '1rem', color: '#DC2626' }}>Error Loading Store</h2>
              <p style={{ marginBottom: '2rem', color: '#64748B' }}>{error}</p>
              <button onClick={() => { setLoading(true); setError(null); fetchStoreDetails(); }} className={styles.btnPrimary}>Try Again</button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (accessDenied && config) {
    return (
      <div className={styles.dashboard}>
        <Sidebar />
        <main className={`${styles.mainContent} ${sidebarCollapsed ? styles.expanded : ''}`}>
          <div className={styles.error}>
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '5rem', marginBottom: '1.5rem' }}>🎫</div>
              <h2 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '1rem', color: '#1a1a1a' }}>Product Management Not Available</h2>
              <p style={{ marginBottom: '2rem', color: '#64748B', maxWidth: '500px', margin: '0 auto 2rem', lineHeight: '1.6' }}>
                Your store is configured as a <strong>Queue-Only Service</strong> ({config.name}).
              </p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => router.push('/seller/queue')} className={styles.btnPrimary} style={{ background: config.gradient }}>{config.icon} Manage Queue →</button>
                <button onClick={() => router.push('/seller/dashboard')} className={styles.btnSecondary}>← Back to Dashboard</button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!config || !storeType) {
    return (
      <div className={styles.dashboard}>
        <Sidebar />
        <main className={`${styles.mainContent} ${sidebarCollapsed ? styles.expanded : ''}`}>
          <div className={styles.error}><p>Unable to load store configuration.</p></div>
        </main>
      </div>
    );
  }

  return (
    <ProductLayout
      config={config} storeType={storeType} storeName={storeName}
      sidebarCollapsed={sidebarCollapsed} realtimeStatus={realtimeStatus}
      products={products} filteredProducts={filteredProducts}
      searchQuery={searchQuery} setSearchQuery={setSearchQuery}
      filterCategory={filterCategory} setFilterCategory={setFilterCategory}
      filterStatus={filterStatus} setFilterStatus={setFilterStatus}
      showAddModal={showAddModal} setShowAddModal={setShowAddModal}
      showEditModal={showEditModal} setShowEditModal={setShowEditModal}
      formData={formData} errors={errors}
      handleInputChange={handleInputChange}
      handleAddProduct={handleAddProduct} handleEditProduct={handleEditProduct}
      handleDeleteProduct={handleDeleteProduct} toggleProductStatus={toggleProductStatus}
      openEditModal={openEditModal} resetForm={resetForm}
      activeDropdown={activeDropdown} setActiveDropdown={setActiveDropdown}
      selectedImage={selectedImage} handleImageSelect={handleImageSelect}
      handleImageRemove={handleImageRemove} uploadingImage={uploadingImage}
    />
  );
}

// ── Main Product Layout ───────────────────────────────────────────────────────
function ProductLayout({
  config, storeType, storeName, sidebarCollapsed, realtimeStatus,
  products, filteredProducts, searchQuery, setSearchQuery,
  filterCategory, setFilterCategory, filterStatus, setFilterStatus,
  showAddModal, setShowAddModal, showEditModal, setShowEditModal,
  formData, errors, handleInputChange, handleAddProduct, handleEditProduct,
  handleDeleteProduct, toggleProductStatus, openEditModal,
  resetForm, activeDropdown, setActiveDropdown,
  selectedImage, handleImageSelect, handleImageRemove, uploadingImage
}) {
  const totalItems     = products.length;
  const availableItems = products.filter(p => p.status === 'available').length;
  const outOfStock     = products.filter(p => p.stock === 0).length;
  const totalRevenue   = products.reduce((sum, p) => sum + (p.price * (p.total_sales || 0)), 0);

  return (
    <div className={styles.dashboard}>
      <Sidebar />
      <main className={`${styles.mainContent} ${sidebarCollapsed ? styles.expanded : ''}`}>
        <div className={styles.container}>

          {/* ── Header ── */}
          <div className={styles.header} style={{ background: `linear-gradient(135deg, ${config.color}18 0%, ${config.color}08 100%)`, borderBottom: `4px solid ${config.color}` }}>
            <div className={styles.headerContent}>
              <div className={styles.headerTop}>
                <div className={styles.headerTitle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '2.75rem', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))', flexShrink: 0 }}>{config.icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <h1 className={styles.title} style={{ margin: 0, color: config.color }}>{storeName}</h1>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                        <p style={{ margin: 0, fontSize: '1rem', color: '#64748B', fontWeight: '600' }}>{config.name} Product Management</p>
                        <RealtimePill status={realtimeStatus} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className={styles.headerActions}>
                  <button onClick={() => setShowAddModal(true)} className={styles.btnPrimary} style={{ background: config.gradient }}>
                    <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>+</span> Add Product
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className={styles.statsGrid}>
                {[
                  { icon: config.icon, val: totalItems,     label: 'Total Products', color: config.color },
                  { icon: '✓',         val: availableItems, label: 'Available',       color: '#10B981'    },
                  { icon: '✗',         val: outOfStock,     label: 'Out of Stock',    color: '#EF4444'    },
                  { icon: '₹',         val: `₹${totalRevenue.toLocaleString()}`, label: 'Total Revenue', color: '#8B5CF6' },
                ].map((s, i) => (
                  <div key={i} className={styles.statCard} style={{ borderTop: `4px solid ${s.color}` }}>
                    <div className={styles.statIcon} style={{ background: `${s.color}18`, color: s.color }}>{s.icon}</div>
                    <div className={styles.statValue}>{s.val}</div>
                    <div className={styles.statLabel}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Search + Filters */}
              <div className={styles.searchFilters}>
                <div className={styles.searchBox}>
                  <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  <input type="text" placeholder="Search products..." value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)} className={styles.searchInput} />
                </div>
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
                  className={styles.filterSelect} style={{ borderColor: config.color }}>
                  <option value="all">All Categories</option>
                  {config.categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                  className={styles.filterSelect} style={{ borderColor: config.color }}>
                  <option value="all">All Status</option>
                  <option value="available">Available</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Products Grid ── */}
          <div className={styles.content}>
            {filteredProducts.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon} style={{ fontSize: '5rem' }}>{config.icon}</div>
                <h3 className={styles.emptyTitle}>No products yet</h3>
                <p className={styles.emptyText}>Start building your inventory by adding your first product</p>
                <button onClick={() => setShowAddModal(true)} className={styles.btnPrimary}
                  style={{ background: config.gradient, borderRadius: '50px', padding: '0.9rem 2rem', marginTop: '0.5rem' }}>
                  Add First Product
                </button>
              </div>
            ) : (
              <div className={styles.productsGrid}>
                {filteredProducts.map(product => (
                  <ProductCard
                    key={product.id} product={product} config={config} storeType={storeType}
                    activeDropdown={activeDropdown} setActiveDropdown={setActiveDropdown}
                    openEditModal={openEditModal} handleDeleteProduct={handleDeleteProduct}
                    toggleProductStatus={toggleProductStatus}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Modals ── */}
          {showAddModal && (
            <ProductModal
              config={config} formData={formData} errors={errors} onInputChange={handleInputChange}
              onSubmit={handleAddProduct}
              onClose={() => { setShowAddModal(false); resetForm(); }}
              title="Add Product" submitText="Add Product" storeType={storeType}
              selectedImage={selectedImage} onImageSelect={handleImageSelect}
              onImageRemove={handleImageRemove} uploadingImage={uploadingImage}
            />
          )}
          {showEditModal && (
            <ProductModal
              config={config} formData={formData} errors={errors} onInputChange={handleInputChange}
              onSubmit={handleEditProduct}
              onClose={() => { setShowEditModal(false); resetForm(); }}
              title="Edit Product" submitText="Save Changes" storeType={storeType}
              selectedImage={selectedImage} onImageSelect={handleImageSelect}
              onImageRemove={handleImageRemove} uploadingImage={uploadingImage}
              currentImageUrl={formData.image_url}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// ── Product Card — matches screenshot style ───────────────────────────────────
function ProductCard({ product, config, storeType, activeDropdown, setActiveDropdown, openEditModal, handleDeleteProduct, toggleProductStatus }) {
  const additionalInfo = formatProductInfo(product, storeType);
  const isLowStock     = product.stock > 0 && product.stock <= (product.low_stock_threshold || 10);
  const isOutOfStock   = product.stock === 0;
  const isUnavailable  = product.status === 'unavailable';
  const showOverlay    = isOutOfStock || isUnavailable;

  return (
    <div className={styles.productCard} style={{ borderTop: `3px solid ${config.color}` }}>

      {/* Colored header band with image */}
      <div className={styles.productHeader} style={{ background: config.gradient }}>

        {/* OUT OF STOCK / UNAVAILABLE overlay — matching screenshot */}
        {showOverlay && (
          <div className={styles.stockOverlay}>
            {isOutOfStock
              ? <span className={styles.stockOverlayLabel}>Out of Stock</span>
              : <span className={styles.stockOverlayLabelGray}>Unavailable</span>
            }
          </div>
        )}

        <div className={styles.productEmoji}>
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              onError={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.target.style.display = 'none';
                const fb = e.target.nextElementSibling;
                if (fb) fb.style.display = 'block';
              }}
            />
          ) : null}
          <span style={{ display: product.image_url ? 'none' : 'block' }}>
            {product.image || getProductEmoji(product.category, storeType)}
          </span>
        </div>

        {/* Three-dot menu */}
        <div className={styles.productMenu}>
          <button onClick={() => setActiveDropdown(activeDropdown === product.id ? null : product.id)} className={styles.menuBtn}>⋮</button>
          {activeDropdown === product.id && (
            <div className={styles.dropdown}>
              <button onClick={() => openEditModal(product)} className={styles.dropdownItem}>✏️ Edit Product</button>
              <button onClick={() => handleDeleteProduct(product.id)} className={`${styles.dropdownItem} ${styles.dropdownDanger}`}>🗑️ Delete</button>
            </div>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className={styles.productBody}>
        <h3 className={styles.productName}>{product.name}</h3>
        <span className={styles.productCategory} style={{ background: `${config.color}20`, color: config.color }}>
          {product.category}
        </span>

        {additionalInfo && (
          <div className={styles.productInfo} style={{ borderLeft: `3px solid ${config.color}` }}>
            {additionalInfo}
          </div>
        )}

        {/* Price + stock */}
        <div className={styles.productStats}>
          <div className={styles.productPrice} style={{ color: config.color }}>
            ₹{product.price}
          </div>
          <div className={styles.productStockBox}>
            <div className={`${styles.productStock} ${isOutOfStock ? styles.stockOut : styles.stockGood}`}
              style={isLowStock ? { color: '#92400e' } : {}}>
              {product.stock ?? '∞'}
            </div>
            <div className={styles.productSales}
              style={isLowStock ? { color: '#92400e', fontWeight: 700 } : {}}>
              {isOutOfStock ? 'sold out' : isLowStock ? '⚠ low stock' : 'in stock'}
            </div>
          </div>
        </div>

        {/* Action button — "✓ Add to Cart" (brown) or "✗ Unavailable" (gray), matching screenshot */}
        <button
          onClick={() => toggleProductStatus(product.id)}
          className={product.status === 'available' ? styles.btnAvailable : styles.btnUnavailable}
          style={product.status === 'available' ? { background: config.gradient } : {}}
        >
          {product.status === 'available' ? '✓ Add to Cart' : '✗ Unavailable'}
        </button>
      </div>
    </div>
  );
}

// ── Product Modal ─────────────────────────────────────────────────────────────
function ProductModal({
  config, formData, errors, onInputChange, onSubmit, onClose,
  title, submitText, storeType, selectedImage, onImageSelect,
  onImageRemove, uploadingImage, currentImageUrl = null
}) {
  const [variants, setVariants]         = useState([]);
  const [useVariants, setUseVariants]   = useState(false);
  const [localErrors, setLocalErrors]   = useState({});
  const [itemType, setItemType]         = useState('');

  const supportsVariants = storeType === 'café' || storeType === 'restaurant';

  useEffect(() => {
    if (formData.metadata?.hasVariants && formData.metadata?.variants) {
      setVariants(formData.metadata.variants.map((v, idx) => ({ ...v, id: v.id || `variant-${idx}` })));
      setUseVariants(true);
    }
    if (formData.metadata?.itemType) setItemType(formData.metadata.itemType);
  }, [formData]);

  const addVariant    = () => setVariants([...variants, { id: Date.now().toString(), size: '', price: '', stock: 0 }]);
  const updateVariant = (i, field, val) => { const u = [...variants]; u[i][field] = val; setVariants(u); };
  const removeVariant = (i) => setVariants(variants.filter((_, idx) => idx !== i));

  const handleItemTypeChange = (e) => {
    const t = e.target.value;
    setItemType(t);
    if (useVariants && variants.length === 0) {
      setVariants(t === 'Drink'
        ? [{ id:'1', size:'Small', price:'', stock:0 }, { id:'2', size:'Medium', price:'', stock:0 }, { id:'3', size:'Large', price:'', stock:0 }]
        : [{ id:'1', size:'Half', price:'', stock:0 }, { id:'2', size:'Full', price:'', stock:0 }]
      );
    }
  };

  const toggleVariantMode = (enabled) => {
    setUseVariants(enabled);
    if (enabled && variants.length === 0) {
      const isDrink = itemType === 'Drink' || ['drink','beverage','coffee','tea'].some(k => (formData.category || '').toLowerCase().includes(k));
      setVariants(isDrink
        ? [{ id:'1', size:'Small', price:'', stock:0 }, { id:'2', size:'Medium', price:'', stock:0 }, { id:'3', size:'Large', price:'', stock:0 }]
        : [{ id:'1', size:'Half', price:'', stock:0 }, { id:'2', size:'Full', price:'', stock:0 }]
      );
    } else if (!enabled) {
      setVariants([]);
    }
  };

  const handleSubmit = () => {
    setLocalErrors({});
    const newErrors = {};

    if (!formData.name?.trim())           newErrors.name     = 'Name is required';
    if (supportsVariants && !itemType)    newErrors.itemType = 'Item type is required';
    if (!formData.category)               newErrors.category = 'Category is required';

    if (useVariants && supportsVariants) {
      const valid = variants.filter(v => v.size?.trim() && parseFloat(v.price) > 0);
      if (valid.length === 0) {
        newErrors.variants = 'Please add at least one size with a valid price';
        setLocalErrors(newErrors);
        toast.error('Please add at least one size variant');
        return;
      }
      if (Object.keys(newErrors).length > 0) { setLocalErrors(newErrors); return; }

      onSubmit({
        ...formData,
        price: parseFloat(valid[0].price),
        stock: valid.reduce((s, v) => s + (parseInt(v.stock) || 0), 0),
        metadata: {
          ...(formData.metadata || {}),
          itemType,
          hasVariants: true,
          variants: valid.map(v => ({ size: v.size, price: parseFloat(v.price), stock: parseInt(v.stock) || 0 }))
        }
      });
    } else {
      if (!formData.price || parseFloat(formData.price) <= 0) newErrors.price = 'Valid price is required';
      if (storeType !== 'restaurant' && storeType !== 'café') {
        if (formData.stock === '' || parseInt(formData.stock) < 0) newErrors.stock = 'Valid stock is required';
      }
      if (Object.keys(newErrors).length > 0) { setLocalErrors(newErrors); return; }

      onSubmit({
        ...formData,
        metadata: { ...(formData.metadata || {}), itemType, hasVariants: false }
      });
    }
  };

  const allErrors = { ...errors, ...localErrors };

  const renderAdditionalField = (field) => {
    const fieldValue = formData[field.name] || (field.type === 'checkbox' ? false : field.type === 'multiselect' ? [] : '');

    if (field.name === 'tags' && field.type === 'multiselect') {
      const tagOptions = formData.category ? getTagOptionsForCategory(formData.category) : [];
      return (
        <div key={field.name} className={styles.formGroup}>
          <label className={styles.formLabel}>{field.label}</label>
          {!formData.category ? <div className={styles.formHint}>Please select a category first</div> : (
            <div className={styles.multiselectContainer}>
              {tagOptions.map(opt => {
                const isSel = Array.isArray(fieldValue) && fieldValue.includes(opt);
                return (
                  <button key={opt} type="button"
                    onClick={() => onInputChange({ target: { name: field.name, value: isSel ? fieldValue.filter(v => v !== opt) : [...(Array.isArray(fieldValue) ? fieldValue : []), opt], type: 'multiselect' } })}
                    className={`${styles.multiselectOption} ${isSel ? styles.multiselectActive : ''}`}>{opt}
                  </button>
                );
              })}
            </div>
          )}
          {allErrors[field.name] && <span className={styles.error}>{allErrors[field.name]}</span>}
        </div>
      );
    }

    switch (field.type) {
      case 'text': case 'number': case 'date': return (
        <div key={field.name} className={styles.formGroup}>
          <label className={styles.formLabel}>{field.label} {field.required && <span className={styles.required}>*</span>}</label>
          <input type={field.type} name={field.name} value={fieldValue} onChange={onInputChange}
            className={`${styles.formInput} ${allErrors[field.name] ? styles.inputError : ''}`} placeholder={field.placeholder || ''} />
          {allErrors[field.name] && <span className={styles.error}>{allErrors[field.name]}</span>}
        </div>
      );
      case 'select': return (
        <div key={field.name} className={styles.formGroup}>
          <label className={styles.formLabel}>{field.label} {field.required && <span className={styles.required}>*</span>}</label>
          <select name={field.name} value={fieldValue} onChange={onInputChange}
            className={`${styles.formInput} ${allErrors[field.name] ? styles.inputError : ''}`}>
            <option value="">{field.placeholder || `Select ${field.label}`}</option>
            {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          {allErrors[field.name] && <span className={styles.error}>{allErrors[field.name]}</span>}
        </div>
      );
      case 'select_dynamic': {
        const dependValue = formData[field.dependsOn] || '';
        const dynOptions = field.optionsMap?.[dependValue] || [];
        return (
          <div key={field.name} className={styles.formGroup}>
            <label className={styles.formLabel}>{field.label}</label>
            <select name={field.name} value={fieldValue} onChange={onInputChange} className={styles.formInput} disabled={!dependValue}>
              <option value="">{dependValue ? (field.placeholder || `Select ${field.label}`) : `Select ${field.dependsOn} first`}</option>
              {dynOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
        );
      }
      case 'textarea': return (
        <div key={field.name} className={styles.formGroup}>
          <label className={styles.formLabel}>{field.label}</label>
          <textarea name={field.name} value={fieldValue} onChange={onInputChange}
            className={styles.formInput} placeholder={field.placeholder || ''} rows={field.rows || 3}
            style={{ resize: 'vertical', minHeight: '80px' }} />
        </div>
      );
      case 'checkbox': return (
        <div key={field.name} className={styles.formGroup}>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" name={field.name} checked={fieldValue} onChange={onInputChange} className={styles.checkbox} />
            <span>{field.label}</span>
          </label>
        </div>
      );
      default: return null;
    }
  };

  const visibleAdditionalFields = (() => {
    if (!config?.fields?.specific || !formData.category) return [];
    return config.fields.specific.filter(f => {
      if (!f.showForCategories || f.showForCategories === 'all') return true;
      return Array.isArray(f.showForCategories) && f.showForCategories.includes(formData.category);
    });
  })();

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader} style={{ background: config.gradient }}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button onClick={onClose} className={styles.modalClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          {/* Product Name */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Product Name <span className={styles.required}>*</span></label>
            <input type="text" name="name" value={formData.name || ''} onChange={onInputChange}
              className={`${styles.formInput} ${allErrors.name ? styles.inputError : ''}`} placeholder="Enter product name" />
            {allErrors.name && <span className={styles.error}>{allErrors.name}</span>}
          </div>

          {/* Item Type (café / restaurant only) */}
          {supportsVariants && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Item Type <span className={styles.required}>*</span></label>
              <select value={itemType} onChange={handleItemTypeChange}
                className={`${styles.formInput} ${allErrors.itemType ? styles.inputError : ''}`}>
                <option value="">Select item type</option>
                <option value="Food">Food</option>
                <option value="Drink">Drink</option>
              </select>
              {allErrors.itemType && <span className={styles.error}>{allErrors.itemType}</span>}
            </div>
          )}

          {/* Category */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Category <span className={styles.required}>*</span></label>
            <select name="category" value={formData.category || ''} onChange={onInputChange}
              className={`${styles.formInput} ${allErrors.category ? styles.inputError : ''}`}>
              <option value="">Select category</option>
              {config.categories?.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            {allErrors.category && <span className={styles.error}>{allErrors.category}</span>}
          </div>

          {/* Image Uploader */}
          <ImageUploader
            onImageSelect={onImageSelect}
            currentImage={currentImageUrl || (selectedImage ? URL.createObjectURL(selectedImage) : null)}
            onImageRemove={onImageRemove}
          />

          {/* Additional Fields */}
          {formData.category && visibleAdditionalFields.length > 0 && (
            <>
              <div className={styles.sectionDivider}><span className={styles.sectionTitle}>Additional Details</span></div>
              {visibleAdditionalFields.map(f => renderAdditionalField(f))}
            </>
          )}

          {/* Size & Pricing */}
          {supportsVariants ? (
            <>
              <div className={styles.sectionDivider}><span className={styles.sectionTitle}>Size & Pricing</span></div>
              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={useVariants} onChange={(e) => toggleVariantMode(e.target.checked)} className={styles.checkbox} />
                  <span style={{ fontWeight: '600', color: '#1a1a1a' }}>This item has multiple sizes</span>
                </label>
              </div>
              {useVariants ? (
                <div className={styles.variantManager}>
                  <div className={styles.variantHeader}>
                    <h3 style={{ fontSize: '1rem', fontWeight: '700', margin: 0 }}>Size Variants</h3>
                    <button type="button" onClick={addVariant} className={styles.btnAddVariant}>+ Add Size</button>
                  </div>
                  {allErrors.variants && (
                    <div style={{ padding:'0.75rem', background:'#FEE2E2', border:'1px solid #EF4444', borderRadius:'0.5rem', marginBottom:'1rem', color:'#991B1B', fontSize:'0.875rem' }}>
                      {allErrors.variants}
                    </div>
                  )}
                  {variants.length === 0 ? (
                    <div className={styles.variantEmpty}><p>No sizes added yet. Click "Add Size" to create your first variant.</p></div>
                  ) : (
                    <div className={styles.variantList}>
                      {variants.map((v, i) => (
                        <div key={v.id || i} className={styles.variantItem}>
                          <div className={styles.variantFields}>
                            {[['text','size','Size','e.g., Small'], ['number','price','Price (₹)','0'], ['number','stock','Stock','0']].map(([type, field, label, ph]) => (
                              <div key={field} className={styles.variantField}>
                                <label>{label} {(field==='size'||field==='price') && <span style={{color:'#EF4444'}}>*</span>}</label>
                                <input type={type} value={v[field]} onChange={(e) => updateVariant(i, field, e.target.value)}
                                  placeholder={ph} min={type==='number' ? 0 : undefined} step={field==='price' ? '0.01' : undefined} className={styles.formInput} />
                              </div>
                            ))}
                          </div>
                          <button type="button" onClick={() => removeVariant(i)} className={styles.btnRemoveVariant}>🗑️</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.formRow}>
                  {[['price','Price (₹)','0.01'],['stock','Stock',null]].map(([name, label, step]) => (
                    <div key={name} className={styles.formGroup}>
                      <label className={styles.formLabel}>{label} {name==='price' && <span className={styles.required}>*</span>}</label>
                      <input type="number" name={name} value={formData[name] || ''} onChange={onInputChange}
                        className={`${styles.formInput} ${allErrors[name] ? styles.inputError : ''}`} placeholder="0" min="0" step={step || undefined} />
                      {allErrors[name] && <span className={styles.error}>{allErrors[name]}</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className={styles.sectionDivider}><span className={styles.sectionTitle}>Pricing</span></div>
              <div className={styles.formRow}>
                {[['price','Price (₹)','0.01'],['stock','Stock',null]].map(([name, label, step]) => (
                  <div key={name} className={styles.formGroup}>
                    <label className={styles.formLabel}>{label} {name==='price' && <span className={styles.required}>*</span>}</label>
                    <input type="number" name={name} value={formData[name] || ''} onChange={onInputChange}
                      className={`${styles.formInput} ${allErrors[name] ? styles.inputError : ''}`} placeholder="0" min="0" step={step || undefined} />
                    {allErrors[name] && <span className={styles.error}>{allErrors[name]}</span>}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.btnCancel}>Cancel</button>
            <button type="button" onClick={handleSubmit} className={styles.btnSubmit}
              style={{ background: config.gradient }} disabled={uploadingImage}>
              {uploadingImage ? 'Uploading...' : submitText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}