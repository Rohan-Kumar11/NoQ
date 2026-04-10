// app/buyer/queue-history/[id]/page.jsx - Queue Details (Receipt)
'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Calendar, MapPin, Clock, CheckCircle, Printer, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import './QueueDetails.css';

export default function QueueDetailsPage({ params }) {
  const router = useRouter();
  const { id: queueId } = use(params);

  const [queueEntry, setQueueEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (queueId) {
      loadQueueDetails();
    }
  }, [queueId]);

  const loadQueueDetails = async () => {
    setLoading(true);
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
        .eq('id', queueId)
        .single();

      if (fetchError) throw new Error(fetchError.message);

      console.log('✅ Queue entry loaded:', queueData);
      setQueueEntry(queueData);
    } catch (err) {
      console.error('Error loading queue entry:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    window.print();
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status) => {
    const colors = {
      'waiting': '#f59e0b',
      'in_service': '#3b82f6',
      'completed': '#059669',
      'cancelled': '#ef4444',
      'no_show': '#ef4444'
    };
    return colors[status] || '#6b7280';
  };

  if (loading) {
    return (
      <div className="order-details-container">
        <div className="order-details-loading">
          <div className="order-details-spinner"></div>
          <p>Loading receipt...</p>
        </div>
      </div>
    );
  }

  if (error || !queueEntry) {
    return (
      <div className="order-details-container">
        <div className="order-details-error">
          <h2>Queue Entry Not Found</h2>
          <p>{error || 'Unable to load queue details'}</p>
          <button 
            onClick={() => router.push('/buyer/queue-history')}
            className="order-details-btn-primary"
          >
            Back to Queue History
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="order-details-container">
      {/* Header - Don't print */}
      <div className="order-details-header no-print">
        <button 
          onClick={() => router.push('/buyer/queue-history')}
          className="order-details-back-btn"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Queue History
        </button>
        <div className="order-details-actions">
          <button onClick={handlePrint} className="order-details-btn-secondary">
            <Printer className="w-5 h-5" />
            Print
          </button>
          <button onClick={handleDownload} className="order-details-btn-primary">
            <Download className="w-5 h-5" />
            Download
          </button>
        </div>
      </div>

      {/* Receipt Content */}
      <div className="order-details-invoice">
        {/* Receipt Header */}
        <div className="invoice-header">
          <div className="invoice-logo">
            <h1>NoQ</h1>
            <p>Skip the wait</p>
          </div>
          <div className="invoice-title">
            <h2>QUEUE RECEIPT</h2>
            <p className="invoice-number">{queueEntry.token_number}</p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="invoice-status-section">
          <div 
            className="invoice-status-badge"
            style={{ 
              background: `${getStatusColor(queueEntry.status)}15`,
              color: getStatusColor(queueEntry.status),
              borderColor: getStatusColor(queueEntry.status)
            }}
          >
            <CheckCircle className="w-5 h-5" />
            <span>{queueEntry.status.toUpperCase().replace('_', ' ')}</span>
          </div>
          
          {/* Queue Service Badge */}
          <div 
            className="invoice-savings-badge"
            style={{ 
              background: '#fef3c715',
              color: '#92400e',
              borderColor: '#fbbf24'
            }}
          >
            <Users className="w-5 h-5" />
            <span>Queue Service</span>
          </div>
        </div>

        {/* Queue Info Grid */}
        <div className="invoice-info-grid">
          <div className="invoice-info-section">
            <h3>Queue Information</h3>
            <div className="invoice-info-row">
              <span className="invoice-info-label">Issued At:</span>
              <span className="invoice-info-value">
                {formatDate(queueEntry.issued_at || queueEntry.created_at)}
              </span>
            </div>
            <div className="invoice-info-row">
              <span className="invoice-info-label">Token Number:</span>
              <span className="invoice-info-value" style={{ 
                fontFamily: 'monospace',
                fontWeight: '700',
                color: '#667eea',
                fontSize: '1.25rem'
              }}>
                {queueEntry.token_number}
              </span>
            </div>
            {queueEntry.wait_time_minutes && (
              <div className="invoice-info-row">
                <span className="invoice-info-label">Estimated Wait:</span>
                <span className="invoice-info-value">{queueEntry.wait_time_minutes} minutes</span>
              </div>
            )}
            {queueEntry.priority && (
              <div className="invoice-info-row">
                <span className="invoice-info-label">Priority:</span>
                <span className="invoice-info-value" style={{
                  color: queueEntry.priority === 'high' ? '#dc2626' : '#667eea',
                  fontWeight: '600'
                }}>
                  {queueEntry.priority.toUpperCase()}
                </span>
              </div>
            )}
          </div>

          <div className="invoice-info-section">
            <h3>Store Information</h3>
            <div className="invoice-store-details">
              <p className="invoice-store-name">{queueEntry.stores?.store_name}</p>
              {queueEntry.stores?.store_type && (
                <p style={{ 
                  fontSize: '0.875rem', 
                  color: '#667eea',
                  fontWeight: '600',
                  marginBottom: '0.5rem'
                }}>
                  {queueEntry.stores.store_type}
                </p>
              )}
              <p className="invoice-store-address">
                <MapPin className="w-4 h-4" />
                {queueEntry.stores?.address}
              </p>
              <p className="invoice-store-city">{queueEntry.stores?.city}</p>
              {queueEntry.stores?.phone && (
                <p className="invoice-store-phone">
                  📞 {queueEntry.stores.phone}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Queue Service Section */}
        <div className="invoice-items-section">
          <h3>Service Details</h3>
          <div style={{
            padding: '2rem',
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            borderRadius: '1rem',
            textAlign: 'center'
          }}>
            <Users style={{ 
              width: '4rem', 
              height: '4rem', 
              color: '#3b82f6',
              margin: '0 auto 1rem'
            }} />
            <h3 style={{ 
              fontSize: '1.5rem', 
              fontWeight: '700',
              marginBottom: '0.5rem',
              color: '#1a1a1a'
            }}>
              Queue Service
            </h3>
            <p style={{ 
              color: '#4b5563',
              fontSize: '1.125rem',
              marginBottom: '1.5rem'
            }}>
              No payment was required for this service
            </p>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '1rem',
              marginTop: '1.5rem'
            }}>
              <div style={{
                padding: '1rem',
                background: 'white',
                borderRadius: '0.75rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  Token Number
                </p>
                <p style={{ 
                  fontSize: '1.5rem', 
                  fontWeight: '700',
                  fontFamily: 'monospace',
                  color: '#667eea'
                }}>
                  {queueEntry.token_number}
                </p>
              </div>
              
              {queueEntry.wait_time_minutes && (
                <div style={{
                  padding: '1rem',
                  background: 'white',
                  borderRadius: '0.75rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    Estimated Wait
                  </p>
                  <p style={{ fontSize: '1.5rem', fontWeight: '700' }}>
                    {queueEntry.wait_time_minutes} min
                  </p>
                </div>
              )}
              
              <div style={{
                padding: '1rem',
                background: 'white',
                borderRadius: '0.75rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  Service Type
                </p>
                <p style={{ fontSize: '1.125rem', fontWeight: '600' }}>
                  {queueEntry.stores?.store_type || 'Queue'}
                </p>
              </div>

              {queueEntry.priority && (
                <div style={{
                  padding: '1rem',
                  background: 'white',
                  borderRadius: '0.75rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    Priority
                  </p>
                  <p style={{ 
                    fontSize: '1.125rem', 
                    fontWeight: '700',
                    color: queueEntry.priority === 'high' ? '#dc2626' : '#667eea'
                  }}>
                    {queueEntry.priority.toUpperCase()}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Timeline Section */}
        {(queueEntry.service_started_at || queueEntry.service_completed_at) && (
          <div className="invoice-timeline-section">
            <h3>Service Timeline</h3>
            <div className="invoice-timeline">
              <div className="timeline-item">
                <Clock className="w-4 h-4" />
                <div>
                  <p className="timeline-label">Queue Joined</p>
                  <p className="timeline-date">{formatDate(queueEntry.issued_at || queueEntry.created_at)}</p>
                </div>
              </div>
              {queueEntry.service_started_at && (
                <div className="timeline-item">
                  <Users className="w-4 h-4" />
                  <div>
                    <p className="timeline-label">Service Started</p>
                    <p className="timeline-date">{formatDate(queueEntry.service_started_at)}</p>
                  </div>
                </div>
              )}
              {queueEntry.service_completed_at && (
                <div className="timeline-item">
                  <CheckCircle className="w-4 h-4" />
                  <div>
                    <p className="timeline-label">Service Completed</p>
                    <p className="timeline-date">{formatDate(queueEntry.service_completed_at)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Customer Info Section */}
        {(queueEntry.customer_name || queueEntry.customer_phone) && (
          <div className="invoice-notes-section">
            <h3>Customer Information</h3>
            {queueEntry.customer_name && (
              <div className="invoice-note">
                <p className="note-label">Name:</p>
                <p className="note-text">{queueEntry.customer_name}</p>
              </div>
            )}
            {queueEntry.customer_phone && (
              <div className="invoice-note">
                <p className="note-label">Phone:</p>
                <p className="note-text">{queueEntry.customer_phone}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="invoice-footer">
          <p>Thank you for using our queue service!</p>
          <p className="invoice-footer-small">
            This is a computer-generated receipt. For any queries, please contact the store.
          </p>
        </div>
      </div>
    </div>
  );
}