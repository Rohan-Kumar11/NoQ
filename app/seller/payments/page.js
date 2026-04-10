// app/components/Payments.js - WITH SIDEBAR RESPONSIVE & ELEGANT THEME
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import styles from './Payments.module.css';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '@/lib/supabase/client';
import {
  fetchTransactions,
  fetchPayouts,
  getPaymentSettings,
  calculateFinancialSummary,
  getPaymentMethodStats,
  getDailyRevenue,
  requestPayout
} from '@/lib/api/payments';

export default function Payments() {
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedPeriod, setSelectedPeriod] = useState('today');
  const [selectedTab, setSelectedTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Data states
  const [financialData, setFinancialData] = useState({
    todayRevenue: 0,
    weekRevenue: 0,
    monthRevenue: 0,
    totalTransactions: 0,
    avgTransactionValue: 0,
  });

  const [transactions, setTransactions] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [dailyRevenueData, setDailyRevenueData] = useState([]);
  const [paymentSettings, setPaymentSettings] = useState(null);

  // Detect sidebar collapse state
  useEffect(() => {
    const checkSidebarState = () => {
      const sidebar = document.querySelector('[class*="sidebar"]');
      if (sidebar) {
        const isCollapsed = sidebar.classList.toString().includes('collapsed');
        setSidebarCollapsed(isCollapsed);
      }
    };

    checkSidebarState();
    
    const interval = setInterval(checkSidebarState, 100);
    
    return () => clearInterval(interval);
  }, []);

  // Check authentication
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      router.push('/signin');
      return;
    }

    await loadAllData();
  };

  // Load all payment data
  const loadAllData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [
        todaySummary,
        weekSummary,
        monthSummary,
        txnsResult,
        payoutsResult,
        settingsResult,
        methodsResult,
        revenueResult
      ] = await Promise.all([
        calculateFinancialSummary('today'),
        calculateFinancialSummary('week'),
        calculateFinancialSummary('month'),
        fetchTransactions({ period: selectedPeriod }),
        fetchPayouts(),
        getPaymentSettings(),
        getPaymentMethodStats('month'),
        getDailyRevenue()
      ]);

      setFinancialData({
        todayRevenue: todaySummary.data.totalRevenue,
        weekRevenue: weekSummary.data.totalRevenue,
        monthRevenue: monthSummary.data.totalRevenue,
        totalTransactions: monthSummary.data.totalTransactions,
        avgTransactionValue: monthSummary.data.avgTransactionValue,
      });

      setTransactions(txnsResult.data);
      setPayouts(payoutsResult.data);
      setPaymentSettings(settingsResult.data);

      const methodColors = {
        'UPI': '#4A90E2',
        'CARD': '#8B5CF6',
        'CASH': '#EC4899',
        'WALLET': '#10B981',
        'OTHER': '#94A3B8'
      };

      const methodsWithColors = methodsResult.data.map(m => ({
        method: m.method,
        percentage: m.percentage,
        amount: m.amount,
        color: methodColors[m.method] || '#94A3B8'
      }));

      setPaymentMethods(methodsWithColors);
      setDailyRevenueData(revenueResult.data);

    } catch (err) {
      console.error('Error loading payment data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Reload when period changes
  useEffect(() => {
    if (!loading) {
      loadTransactions();
    }
  }, [selectedPeriod]);

  const loadTransactions = async () => {
    const result = await fetchTransactions({ period: selectedPeriod });
    setTransactions(result.data);
  };

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('payment-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transactions'
        },
        () => {
          console.log('New transaction detected, reloading...');
          loadAllData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Update current time
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleExport = (type) => {
    alert(`Exporting ${type} report...`);
  };

  const handleViewDetails = (transaction) => {
    alert(`Transaction Details:\nID: ${transaction.transaction_id}\nOrder: ${transaction.orderId}\nAmount: ₹${transaction.amount}\nUTR: ${transaction.utr_number || 'N/A'}`);
  };

  const handleRequestPayout = async () => {
    const amount = prompt('Enter payout amount:');
    if (!amount || isNaN(amount)) return;

    const result = await requestPayout(parseFloat(amount));
    
    if (result.error) {
      alert(`Error: ${result.error}`);
    } else {
      alert('Payout requested successfully!');
      loadAllData();
    }
  };

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <Sidebar />
        <main className={styles.mainContent}>
          <div className={styles.loadingContainer}>
            <div className={styles.loader}>Loading payment data...</div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.dashboard}>
        <Sidebar />
        <main className={styles.mainContent}>
          <div className={styles.errorContainer}>
            <h2>Error Loading Data</h2>
            <p>{error}</p>
            <button onClick={loadAllData} className={styles.retryBtn}>
              Retry
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <Sidebar />

      <main className={`${styles.mainContent} ${sidebarCollapsed ? styles.expanded : ''}`}>
        {/* Top Bar */}
        <header className={styles.topBar}>
          <div className={styles.topBarLeft}>
            <h1 className={styles.pageTitle}>Payments</h1>
            <div className={styles.dateTime}>
              <div className={styles.date}>{formatDate(currentTime)}</div>
              <div className={styles.time}>{formatTime(currentTime)}</div>
            </div>
          </div>
          <div className={styles.topBarRight}>
            <button className={styles.exportBtn} onClick={() => handleExport('All')}>
              📥 Export Report
            </button>
            <button 
              className={styles.iconButton} 
              onClick={loadAllData}
              title="Refresh"
            >
              🔄
            </button>
          </div>
        </header>

        {/* Tab Navigation */}
        <div className={styles.tabNavigation}>
          <button 
            className={`${styles.tabBtn} ${selectedTab === 'overview' ? styles.tabBtnActive : ''}`}
            onClick={() => setSelectedTab('overview')}
          >
            Overview
          </button>
          <button 
            className={`${styles.tabBtn} ${selectedTab === 'transactions' ? styles.tabBtnActive : ''}`}
            onClick={() => setSelectedTab('transactions')}
          >
            Transactions
          </button>
          <button 
            className={`${styles.tabBtn} ${selectedTab === 'payouts' ? styles.tabBtnActive : ''}`}
            onClick={() => setSelectedTab('payouts')}
          >
            Payouts
          </button>
          <button 
            className={`${styles.tabBtn} ${selectedTab === 'methods' ? styles.tabBtnActive : ''}`}
            onClick={() => setSelectedTab('methods')}
          >
            Payment Methods
          </button>
        </div>

        {/* Overview Tab */}
        {selectedTab === 'overview' && (
          <>
            {/* Period Filter */}
            <div className={styles.periodFilter}>
              <button 
                className={`${styles.periodBtn} ${selectedPeriod === 'today' ? styles.periodBtnActive : ''}`}
                onClick={() => setSelectedPeriod('today')}
              >
                Today
              </button>
              <button 
                className={`${styles.periodBtn} ${selectedPeriod === 'week' ? styles.periodBtnActive : ''}`}
                onClick={() => setSelectedPeriod('week')}
              >
                This Week
              </button>
              <button 
                className={`${styles.periodBtn} ${selectedPeriod === 'month' ? styles.periodBtnActive : ''}`}
                onClick={() => setSelectedPeriod('month')}
              >
                This Month
              </button>
            </div>

            {/* Financial Stats */}
            <div className={styles.statsGrid}>
              <div className={`${styles.statCard} ${styles.statCardSuccess}`}>
                <div className={styles.statIcon}>💰</div>
                <div className={styles.statContent}>
                  <div className={styles.statLabel}>
                    {selectedPeriod === 'today' ? "Today's Revenue" : 
                     selectedPeriod === 'week' ? "Week's Revenue" : "Month's Revenue"}
                  </div>
                  <div className={styles.statValue}>
                    ₹{(selectedPeriod === 'today' ? financialData.todayRevenue : 
                        selectedPeriod === 'week' ? financialData.weekRevenue : 
                        financialData.monthRevenue).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className={`${styles.statCard} ${styles.statCardPrimary}`}>
                <div className={styles.statIcon}>📊</div>
                <div className={styles.statContent}>
                  <div className={styles.statLabel}>Total Transactions</div>
                  <div className={styles.statValue}>{financialData.totalTransactions}</div>
                </div>
              </div>

              <div className={`${styles.statCard} ${styles.statCardInfo}`}>
                <div className={styles.statIcon}>💳</div>
                <div className={styles.statContent}>
                  <div className={styles.statLabel}>Avg Transaction</div>
                  <div className={styles.statValue}>₹{financialData.avgTransactionValue.toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* Charts Section */}
            <div className={styles.chartsGrid}>
              {/* Revenue Chart */}
              <div className={styles.chartCard}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Weekly Revenue Trend</h2>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={dailyRevenueData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e6ed" />
                    <XAxis dataKey="day" stroke="#666666" />
                    <YAxis stroke="#666666" />
                    <Tooltip 
                      contentStyle={{ 
                        background: '#ffffff', 
                        border: '1px solid #e0e6ed',
                        borderRadius: '12px',
                        padding: '12px'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="#4A90E2" 
                      strokeWidth={3}
                      dot={{ fill: '#4A90E2', r: 5 }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Payment Methods Pie Chart */}
              <div className={styles.methodsCard}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Payment Methods</h2>
                </div>
                <div className={styles.methodsContent}>
                  {paymentMethods.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={paymentMethods}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="percentage"
                          >
                            {paymentMethods.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className={styles.methodsLegend}>
                        {paymentMethods.map((method, index) => (
                          <div key={index} className={styles.legendItem}>
                            <div 
                              className={styles.legendColor} 
                              style={{ backgroundColor: method.color }}
                            ></div>
                            <div className={styles.legendInfo}>
                              <div className={styles.legendLabel}>{method.method}</div>
                              <div className={styles.legendValue}>
                                {method.percentage}% • ₹{method.amount.toLocaleString()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>No payment data yet</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Transactions Tab */}
        {selectedTab === 'transactions' && (
          <div className={styles.transactionsSection}>
            <div className={styles.transactionsHeader}>
              <h2 className={styles.sectionTitle}>Recent Transactions</h2>
              <div className={styles.transactionsActions}>
                <button className={styles.exportBtn} onClick={() => handleExport('Transactions')}>
                  📥 Export
                </button>
              </div>
            </div>

            {/* Period Filter for Transactions */}
            <div className={styles.periodFilter}>
              <button 
                className={`${styles.periodBtn} ${selectedPeriod === 'today' ? styles.periodBtnActive : ''}`}
                onClick={() => setSelectedPeriod('today')}
              >
                Today
              </button>
              <button 
                className={`${styles.periodBtn} ${selectedPeriod === 'week' ? styles.periodBtnActive : ''}`}
                onClick={() => setSelectedPeriod('week')}
              >
                This Week
              </button>
              <button 
                className={`${styles.periodBtn} ${selectedPeriod === 'month' ? styles.periodBtnActive : ''}`}
                onClick={() => setSelectedPeriod('month')}
              >
                This Month
              </button>
            </div>

            <div className={styles.transactionsTable}>
              <div className={styles.tableHeader}>
                <div className={styles.tableCol}>Transaction ID</div>
                <div className={styles.tableCol}>Customer</div>
                <div className={styles.tableCol}>Amount</div>
                <div className={styles.tableCol}>Method</div>
                <div className={styles.tableCol}>Status</div>
                <div className={styles.tableCol}>Time</div>
                <div className={styles.tableCol}>Actions</div>
              </div>
              {transactions.length > 0 ? (
                transactions.map((txn) => (
                  <div key={txn.id} className={styles.tableRow}>
                    <div className={styles.tableCol}>
                      <div className={styles.txnId}>{txn.transaction_id}</div>
                      <div className={styles.orderId}>{txn.orderId}</div>
                    </div>
                    <div className={styles.tableCol}>
                      <div className={styles.customerName}>{txn.customer}</div>
                    </div>
                    <div className={styles.tableCol}>
                      <div className={styles.amount}>₹{parseFloat(txn.amount).toFixed(2)}</div>
                    </div>
                    <div className={styles.tableCol}>
                      <span className={styles.methodBadge}>{txn.payment_method}</span>
                    </div>
                    <div className={styles.tableCol}>
                      <span className={`${styles.statusBadge} ${styles['status' + txn.status.charAt(0).toUpperCase() + txn.status.slice(1)]}`}>
                        {txn.status === 'completed' && '✓ '}
                        {txn.status === 'pending' && '⏳ '}
                        {txn.status === 'failed' && '✗ '}
                        {txn.status.charAt(0).toUpperCase() + txn.status.slice(1)}
                      </span>
                    </div>
                    <div className={styles.tableCol}>
                      <div className={styles.txnTime}>{formatTimestamp(txn.initiated_at)}</div>
                    </div>
                    <div className={styles.tableCol}>
                      <button 
                        className={styles.viewBtn}
                        onClick={() => handleViewDetails(txn)}
                      >
                        View
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.emptyState}>
                  <p>No transactions yet</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payouts Tab */}
        {selectedTab === 'payouts' && (
          <div className={styles.payoutsSection}>
            <div className={styles.payoutsHeader}>
              <h2 className={styles.sectionTitle}>Payout History</h2>
              <div className={styles.payoutsActions}>
                <button className={styles.primaryBtn} onClick={handleRequestPayout}>
                  Request Payout
                </button>
                <button className={styles.exportBtn} onClick={() => handleExport('Payouts')}>
                  📥 Export
                </button>
              </div>
            </div>

            {/* Bank Account Info */}
            {paymentSettings && (
              <div className={styles.bankInfoCard}>
                <div className={styles.bankInfoHeader}>
                  <h3 className={styles.bankInfoTitle}>💳 Linked Bank Account</h3>
                </div>
                <div className={styles.bankInfoContent}>
                  <div className={styles.bankDetail}>
                    <span className={styles.bankLabel}>Account Number:</span>
                    <span className={styles.bankValue}>
                      {paymentSettings.bank_account_number 
                        ? `****${paymentSettings.bank_account_number.slice(-4)}`
                        : 'Not configured'}
                    </span>
                  </div>
                  <div className={styles.bankDetail}>
                    <span className={styles.bankLabel}>Bank Name:</span>
                    <span className={styles.bankValue}>{paymentSettings.bank_name || 'Not configured'}</span>
                  </div>
                  <div className={styles.bankDetail}>
                    <span className={styles.bankLabel}>IFSC Code:</span>
                    <span className={styles.bankValue}>{paymentSettings.bank_ifsc_code || 'Not configured'}</span>
                  </div>
                  <div className={styles.bankDetail}>
                    <span className={styles.bankLabel}>Account Holder:</span>
                    <span className={styles.bankValue}>{paymentSettings.bank_account_holder || 'Not configured'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Payouts Table */}
            <div className={styles.payoutsTable}>
              <div className={styles.tableHeader}>
                <div className={styles.tableCol}>Payout ID</div>
                <div className={styles.tableCol}>Amount</div>
                <div className={styles.tableCol}>Date</div>
                <div className={styles.tableCol}>UTR Number</div>
                <div className={styles.tableCol}>Status</div>
              </div>
              {payouts.length > 0 ? (
                payouts.map((payout) => (
                  <div key={payout.id} className={styles.tableRow}>
                    <div className={styles.tableCol}>
                      <div className={styles.payoutId}>{payout.payout_id}</div>
                    </div>
                    <div className={styles.tableCol}>
                      <div className={styles.payoutAmount}>₹{parseFloat(payout.amount).toLocaleString()}</div>
                    </div>
                    <div className={styles.tableCol}>
                      <div className={styles.payoutDate}>
                        {new Date(payout.requested_at).toLocaleDateString('en-IN')}
                      </div>
                    </div>
                    <div className={styles.tableCol}>
                      <div className={styles.utrNumber}>{payout.utr_number || 'Pending'}</div>
                    </div>
                    <div className={styles.tableCol}>
                      <span className={`${styles.statusBadge} ${styles['status' + payout.status.charAt(0).toUpperCase() + payout.status.slice(1)]}`}>
                        {payout.status === 'completed' && '✓ '}
                        {payout.status === 'pending' && '⏳ '}
                        {payout.status === 'processing' && '⏳ '}
                        {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.emptyState}>
                  <p>No payouts yet</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payment Methods Tab */}
        {selectedTab === 'methods' && (
          <div className={styles.methodsSection}>
            <h2 className={styles.sectionTitle}>Accepted Payment Methods</h2>
            
            <div className={styles.methodsGrid}>
              {paymentMethods.length > 0 ? (
                paymentMethods.map((method, index) => (
                  <div key={index} className={styles.methodCard}>
                    <div className={styles.methodCardHeader}>
                      <div className={styles.methodIcon}>
                        {method.method === 'UPI' && '📱'}
                        {method.method === 'CARD' && '💳'}
                        {method.method === 'CASH' && '💵'}
                        {method.method === 'WALLET' && '👛'}
                      </div>
                      <h3 className={styles.methodName}>{method.method}</h3>
                      <span className={styles.methodStatusActive}>Active</span>
                    </div>
                    <div className={styles.methodStats}>
                      <div className={styles.methodStat}>
                        <span className={styles.methodStatLabel}>This Month:</span>
                        <span className={styles.methodStatValue}>₹{method.amount.toLocaleString()}</span>
                      </div>
                      <div className={styles.methodStat}>
                        <span className={styles.methodStatLabel}>Percentage:</span>
                        <span className={styles.methodStatValue}>{method.percentage}%</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p style={{ textAlign: 'center', padding: '2rem', gridColumn: '1 / -1', color: '#666' }}>
                  No payment methods data yet
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}