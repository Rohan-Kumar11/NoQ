'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Clock,
  CheckCircle,
  XCircle,
  Users,
  MapPin,
  Calendar,
  RefreshCw,
  FileText,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { supabase } from '../../../lib/supabase/client';
import BuyerNavbar from '@/app/components/BuyerNavbar'; // ← adjust path if needed
import '../BuyerHome.css';
import './QueueHistory.css';

export default function QueueHistoryPage() {
  const router = useRouter();

  const [queueEntries, setQueueEntries] = useState([]);
  const [filteredEntries, setFilteredEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [expandedEntries, setExpandedEntries] = useState(new Set());
  const [currentUser, setCurrentUser] = useState(null);

  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUser(user);
    };
    getCurrentUser();
  }, []);

  // Load queue entries when user is available
  useEffect(() => {
    if (currentUser) loadQueueEntries();
  }, [currentUser]);

  // Apply filters
  useEffect(() => {
    applyFilters();
  }, [queueEntries, searchQuery, activeFilter]);

  // Real-time subscriptions
  useEffect(() => {
    if (!currentUser) return;

    const queueSubscription = supabase
      .channel('queue-history-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue',
          filter: `customer_id=eq.${currentUser.id}`
        },
        (payload) => handleQueueUpdate(payload)
      )
      .subscribe();

    return () => queueSubscription.unsubscribe();
  }, [currentUser]);

  const handleQueueUpdate = (payload) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    if (eventType === 'INSERT') {
      loadQueueEntries();
    } else if (eventType === 'UPDATE') {
      setQueueEntries(prev =>
        prev.map(entry => entry.id === newRecord.id ? { ...entry, ...newRecord } : entry)
      );
    } else if (eventType === 'DELETE') {
      setQueueEntries(prev => prev.filter(entry => entry.id !== oldRecord.id));
    }
  };

  const loadQueueEntries = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);

    try {
      const { data: queueData, error: fetchError } = await supabase
        .from('queue')
        .select(`
          *,
          stores:store_id (
            id,
            store_name,
            logo_url,
            address,
            city,
            phone,
            store_type
          )
        `)
        .eq('customer_id', currentUser.id)
        .order('issued_at', { ascending: false })
        .limit(100);

      if (fetchError) throw new Error(fetchError.message);
      setQueueEntries(queueData || []);
    } catch (err) {
      console.error('Error loading queue entries:', err);
      setError(err.message || 'Failed to load queue history');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = useCallback(() => {
    let filtered = [...queueEntries];

    if (activeFilter !== 'all') {
      filtered = filtered.filter(entry => {
        if (activeFilter === 'active') return ['waiting', 'in_service'].includes(entry.status);
        if (activeFilter === 'completed') return entry.status === 'completed';
        if (activeFilter === 'cancelled') return entry.status === 'cancelled';
        return entry.status === activeFilter;
      });
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(entry =>
        entry.token_number?.toLowerCase().includes(query) ||
        entry.stores?.store_name?.toLowerCase().includes(query) ||
        entry.stores?.store_type?.toLowerCase().includes(query)
      );
    }

    setFilteredEntries(filtered);
  }, [queueEntries, searchQuery, activeFilter]);

  const toggleEntryExpanded = (entryId) => {
    setExpandedEntries(prev => {
      const newSet = new Set(prev);
      newSet.has(entryId) ? newSet.delete(entryId) : newSet.add(entryId);
      return newSet;
    });
  };

  const handleViewDetails = (entryId) => router.push(`/buyer/queue-history/${entryId}`);
  const handleViewQueue = (entryId) => router.push(`/buyer/queue/${entryId}`);

  const queueStats = {
    total: queueEntries.length,
    active: queueEntries.filter(e => ['waiting', 'in_service'].includes(e.status)).length,
    completed: queueEntries.filter(e => e.status === 'completed').length,
    cancelled: queueEntries.filter(e => e.status === 'cancelled').length
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'waiting':
      case 'in_service': return 'status-active';
      case 'completed':  return 'status-completed';
      case 'cancelled':
      case 'no_show':    return 'status-cancelled';
      default:           return 'status-active';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'waiting':    return <Clock className="w-4 h-4" />;
      case 'in_service': return <Users className="w-4 h-4" />;
      case 'completed':  return <CheckCircle className="w-4 h-4" />;
      case 'cancelled':
      case 'no_show':    return <XCircle className="w-4 h-4" />;
      default:           return <Clock className="w-4 h-4" />;
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const diffDays = Math.floor(Math.abs(new Date() - date) / (1000 * 60 * 60 * 24));
    const time = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    if (diffDays === 0) return `Today at ${time}`;
    if (diffDays === 1) return `Yesterday at ${time}`;
    if (diffDays < 7)  return `${diffDays} days ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="buyer-home-container">
        <BuyerNavbar />
        <div className="buyer-home-loading-state">
          <Loader2 className="buyer-home-loading-spinner" />
          <p>Loading queue history...</p>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="buyer-home-container">
        <BuyerNavbar />
        <div className="buyer-home-main-content">
          <div className="order-history-empty-state">
            <AlertCircle className="order-history-empty-icon" />
            <h2 className="order-history-empty-title">Something went wrong</h2>
            <p className="order-history-empty-text">{error}</p>
            <button
              onClick={loadQueueEntries}
              className="order-history-action-btn primary"
              style={{ marginTop: '1.5rem' }}
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="buyer-home-container">
      <BuyerNavbar />

      <div className="buyer-home-main-content">
        <div className="buyer-home-hero-section">
          <h1 className="buyer-home-hero-title">
            Your <span className="buyer-home-hero-title-gradient">Queue History</span>
          </h1>
          <p className="buyer-home-hero-subtitle">
            Track your queue entries and service history
          </p>
        </div>

        {queueEntries.length > 0 && (
          <div className="order-history-summary-cards">
            <div className="order-history-summary-card blue">
              <p className="order-history-summary-label">Total Entries</p>
              <p className="order-history-summary-value">{queueStats.total}</p>
            </div>
            <div className="order-history-summary-card amber">
              <p className="order-history-summary-label">Active</p>
              <p className="order-history-summary-value">{queueStats.active}</p>
            </div>
            <div className="order-history-summary-card green">
              <p className="order-history-summary-label">Completed</p>
              <p className="order-history-summary-value">{queueStats.completed}</p>
            </div>
          </div>
        )}

        {queueEntries.length > 0 && (
          <div className="order-history-search-section">
            <div className="order-history-search-wrapper">
              <Search className="order-history-search-icon" />
              <input
                type="text"
                placeholder="Search by token number, store, or service type..."
                className="order-history-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="order-history-filter-tabs">
              {[
                { key: 'all',       label: 'All Entries', icon: null,          count: queueStats.total },
                { key: 'active',    label: 'Active',      icon: Clock,         count: queueStats.active },
                { key: 'completed', label: 'Completed',   icon: CheckCircle,   count: queueStats.completed },
                { key: 'cancelled', label: 'Cancelled',   icon: XCircle,       count: queueStats.cancelled },
              ].map(({ key, label, icon: Icon, count }) => (
                <button
                  key={key}
                  className={`order-history-filter-tab ${activeFilter === key ? 'active' : ''}`}
                  onClick={() => setActiveFilter(key)}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  {label}
                  <span className={`order-history-filter-count ${activeFilter === key ? 'active' : ''}`}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {filteredEntries.length === 0 ? (
          <div className="order-history-empty-state">
            <Users className="order-history-empty-icon" />
            <h2 className="order-history-empty-title">
              {searchQuery || activeFilter !== 'all' ? 'No entries found' : 'No queue history yet'}
            </h2>
            <p className="order-history-empty-text">
              {searchQuery || activeFilter !== 'all'
                ? 'Try adjusting your search or filter'
                : 'Join queue at stores to see your history here'}
            </p>
            {!searchQuery && activeFilter === 'all' && (
              <button
                onClick={() => router.push('/buyer')}
                className="order-history-action-btn primary"
                style={{ marginTop: '1.5rem' }}
              >
                Browse Stores
              </button>
            )}
          </div>
        ) : (
          <div className="order-history-orders-list">
            {filteredEntries.map((entry) => {
              const isExpanded = expandedEntries.has(entry.id);
              const isActive = ['waiting', 'in_service'].includes(entry.status);

              return (
                <div key={entry.id} className="order-history-order-card">
                  <div className="order-history-order-content">
                    <div className="order-history-order-icon">
                      {entry.stores?.logo_url ? (
                        <img
                          src={entry.stores.logo_url}
                          alt={entry.stores.store_name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '1rem' }}
                        />
                      ) : '🏪'}
                    </div>

                    <div className="order-history-order-body">
                      <div className="order-history-order-header">
                        <div>
                          <h3 className="order-history-order-store">
                            {entry.stores?.store_name || 'Store'}
                          </h3>
                          <div className="order-history-order-meta">
                            <span className="order-history-order-id">Token: {entry.token_number}</span>
                            <span>•</span>
                            <span className="order-history-order-date-info">
                              <Calendar className="w-3.5 h-3.5" />
                              {formatDate(entry.issued_at || entry.created_at)}
                            </span>
                          </div>
                        </div>

                        <div className={`order-history-status-badge ${getStatusBadgeClass(entry.status)}`}>
                          {getStatusIcon(entry.status)}
                          <span className="order-history-status-text">{entry.status}</span>
                        </div>
                      </div>

                      <div className="order-history-order-items-section">
                        <p className="order-history-items-label">
                          <Users className="w-4 h-4" style={{ display: 'inline', marginRight: '0.5rem' }} />
                          Queue Service
                        </p>
                        <div style={{ padding: '1rem', background: '#eff6ff', borderRadius: '0.5rem', marginTop: '0.5rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
                            <div>
                              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Token Number</p>
                              <p style={{ fontFamily: 'monospace', fontWeight: '700', color: '#667eea', fontSize: '1.125rem' }}>
                                {entry.token_number}
                              </p>
                            </div>
                            {entry.wait_time_minutes && (
                              <div>
                                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Wait Time</p>
                                <p style={{ fontWeight: '600', fontSize: '1rem' }}>{entry.wait_time_minutes} min</p>
                              </div>
                            )}
                            <div>
                              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Service Type</p>
                              <p style={{ fontWeight: '600', fontSize: '1rem' }}>{entry.stores?.store_type || 'Queue Service'}</p>
                            </div>
                            {entry.priority && (
                              <div>
                                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Priority</p>
                                <p style={{ fontWeight: '600', fontSize: '1rem', color: entry.priority === 'high' ? '#dc2626' : '#667eea' }}>
                                  {entry.priority}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <>
                          <div className="order-history-order-details-grid">
                            <div>
                              <p className="order-history-detail-label">Store Location</p>
                              <p className="order-history-detail-value">{entry.stores?.city || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="order-history-detail-label">Issued At</p>
                              <p className="order-history-detail-value">
                                {new Date(entry.issued_at).toLocaleString('en-IN')}
                              </p>
                            </div>
                            {entry.service_started_at && (
                              <div>
                                <p className="order-history-detail-label">Service Started</p>
                                <p className="order-history-detail-value">
                                  {new Date(entry.service_started_at).toLocaleTimeString('en-IN')}
                                </p>
                              </div>
                            )}
                            {entry.service_completed_at && (
                              <div>
                                <p className="order-history-detail-label">Service Completed</p>
                                <p className="order-history-detail-value">
                                  {new Date(entry.service_completed_at).toLocaleTimeString('en-IN')}
                                </p>
                              </div>
                            )}
                          </div>

                          {entry.stores?.address && (
                            <div style={{
                              display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                              padding: '0.75rem', background: '#f9fafb', borderRadius: '0.5rem', marginTop: '0.5rem'
                            }}>
                              <MapPin className="w-4 h-4" style={{ color: '#667eea', flexShrink: 0, marginTop: '0.125rem' }} />
                              <div>
                                <p style={{ fontWeight: '500', fontSize: '0.875rem', color: '#1f2937' }}>
                                  {entry.stores.store_name}
                                </p>
                                <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                  {entry.stores.address}, {entry.stores.city}
                                </p>
                                {entry.stores.phone && (
                                  <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>📞 {entry.stores.phone}</p>
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      <div className="order-history-order-actions">
                        <button
                          onClick={() => toggleEntryExpanded(entry.id)}
                          className="order-history-action-btn secondary"
                        >
                          {isExpanded
                            ? <><ChevronUp className="w-4 h-4" /> Show Less</>
                            : <><ChevronDown className="w-4 h-4" /> View Details</>
                          }
                        </button>

                        <button
                          onClick={() => handleViewDetails(entry.id)}
                          className="order-history-action-btn secondary"
                        >
                          <FileText className="w-4 h-4" />
                          Receipt
                        </button>

                        {isActive && (
                          <button
                            onClick={() => handleViewQueue(entry.id)}
                            className="order-history-action-btn primary"
                            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}
                          >
                            <Clock className="w-4 h-4" />
                            View Live Queue
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}