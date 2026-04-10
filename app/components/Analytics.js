'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import styles from './Analytics.module.css';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function Analytics() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedPeriod, setSelectedPeriod] = useState('week'); // 'today', 'week', 'month', 'year'
  const [selectedMetric, setSelectedMetric] = useState('customers'); // 'customers', 'revenue', 'avgTime'

  // Analytics Data
  const weeklyData = [
    { day: 'Mon', customers: 48, revenue: 12450, avgTime: 8, orders: 45 },
    { day: 'Tue', customers: 56, revenue: 15680, avgTime: 9, orders: 52 },
    { day: 'Wed', customers: 52, revenue: 13920, avgTime: 7, orders: 48 },
    { day: 'Thu', customers: 67, revenue: 18340, avgTime: 10, orders: 63 },
    { day: 'Fri', customers: 72, revenue: 21450, avgTime: 11, orders: 68 },
    { day: 'Sat', customers: 89, revenue: 26780, avgTime: 12, orders: 85 },
    { day: 'Sun', customers: 81, revenue: 24120, avgTime: 11, orders: 78 },
  ];

  const hourlyData = [
    { hour: '9AM', customers: 8, revenue: 2100 },
    { hour: '10AM', customers: 12, revenue: 3200 },
    { hour: '11AM', customers: 18, revenue: 4500 },
    { hour: '12PM', customers: 25, revenue: 6800 },
    { hour: '1PM', customers: 22, revenue: 5900 },
    { hour: '2PM', customers: 28, revenue: 7400 },
    { hour: '3PM', customers: 15, revenue: 4100 },
    { hour: '4PM', customers: 12, revenue: 3300 },
    { hour: '5PM', customers: 18, revenue: 4900 },
    { hour: '6PM', customers: 24, revenue: 6500 },
    { hour: '7PM', customers: 20, revenue: 5400 },
    { hour: '8PM', customers: 16, revenue: 4300 },
  ];

  const peakHoursData = [
    { time: '12PM-1PM', count: 25, percentage: 18 },
    { time: '2PM-3PM', count: 28, percentage: 20 },
    { time: '6PM-7PM', count: 24, percentage: 17 },
    { time: '7PM-8PM', count: 20, percentage: 14 },
    { time: 'Others', count: 43, percentage: 31 },
  ];

  const serviceTimeData = [
    { range: '0-5 min', count: 32, percentage: 35 },
    { range: '5-10 min', count: 28, percentage: 31 },
    { range: '10-15 min', count: 18, percentage: 20 },
    { range: '15-20 min', count: 10, percentage: 11 },
    { range: '20+ min', count: 3, percentage: 3 },
  ];

  const topProducts = [
    { name: 'Masala Dosa', sold: 156, revenue: 18720, percentage: 22 },
    { name: 'Idli Sambar', sold: 132, revenue: 13200, percentage: 18 },
    { name: 'Filter Coffee', sold: 245, revenue: 12250, percentage: 16 },
    { name: 'Vada', sold: 89, revenue: 8900, percentage: 12 },
    { name: 'Upma', sold: 67, revenue: 6700, percentage: 9 },
  ];

  const [stats, setStats] = useState({
    totalCustomers: 465,
    totalRevenue: 112740,
    avgServiceTime: 9.5,
    peakHour: '2PM-3PM',
    customerGrowth: 12,
    revenueGrowth: 18,
    efficiencyScore: 94,
    customerSatisfaction: 4.7,
  });

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

  const handleExport = () => {
    alert('Exporting analytics report...');
  };

  const COLORS = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe'];

  return (
    <div className={styles.dashboard}>
      <Sidebar />

      <main className={styles.mainContent}>
        {/* Top Bar */}
        <header className={styles.topBar}>
          <div className={styles.topBarLeft}>
            <h1 className={styles.pageTitle}>Analytics & Reports</h1>
            <div className={styles.dateTime}>
              <div className={styles.date}>{formatDate(currentTime)}</div>
              <div className={styles.time}>{formatTime(currentTime)}</div>
            </div>
          </div>
          <div className={styles.topBarRight}>
            <button className={styles.exportBtn} onClick={handleExport}>
              📥 Export Report
            </button>
          </div>
        </header>

        {/* Period Selector */}
        <div className={styles.periodSelector}>
          {['today', 'week', 'month', 'year'].map(period => (
            <button
              key={period}
              className={`${styles.periodBtn} ${selectedPeriod === period ? styles.periodBtnActive : ''}`}
              onClick={() => setSelectedPeriod(period)}
            >
              {period.charAt(0).toUpperCase() + period.slice(1)}
            </button>
          ))}
        </div>

        {/* Key Metrics */}
        <div className={styles.metricsGrid}>
          <div className={`${styles.metricCard} ${styles.metricPrimary}`}>
            <div className={styles.metricIcon}>👥</div>
            <div className={styles.metricContent}>
              <div className={styles.metricLabel}>Total Customers</div>
              <div className={styles.metricValue}>{stats.totalCustomers}</div>
              <div className={styles.metricChange}>
                <span className={styles.metricChangeUp}>↑ {stats.customerGrowth}%</span>
                <span className={styles.metricChangeText}>vs last {selectedPeriod}</span>
              </div>
            </div>
          </div>

          <div className={`${styles.metricCard} ${styles.metricSuccess}`}>
            <div className={styles.metricIcon}>💰</div>
            <div className={styles.metricContent}>
              <div className={styles.metricLabel}>Total Revenue</div>
              <div className={styles.metricValue}>₹{stats.totalRevenue.toLocaleString()}</div>
              <div className={styles.metricChange}>
                <span className={styles.metricChangeUp}>↑ {stats.revenueGrowth}%</span>
                <span className={styles.metricChangeText}>vs last {selectedPeriod}</span>
              </div>
            </div>
          </div>

          <div className={`${styles.metricCard} ${styles.metricWarning}`}>
            <div className={styles.metricIcon}>⏱️</div>
            <div className={styles.metricContent}>
              <div className={styles.metricLabel}>Avg Service Time</div>
              <div className={styles.metricValue}>{stats.avgServiceTime} min</div>
              <div className={styles.metricChange}>
                <span className={styles.metricChangeDown}>↓ 1.2 min</span>
                <span className={styles.metricChangeText}>improvement</span>
              </div>
            </div>
          </div>

          <div className={`${styles.metricCard} ${styles.metricInfo}`}>
            <div className={styles.metricIcon}>⭐</div>
            <div className={styles.metricContent}>
              <div className={styles.metricLabel}>Satisfaction Score</div>
              <div className={styles.metricValue}>{stats.customerSatisfaction}/5.0</div>
              <div className={styles.metricChange}>
                <span className={styles.metricChangeUp}>↑ 0.3</span>
                <span className={styles.metricChangeText}>rating increase</span>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className={styles.chartsSection}>
          {/* Weekly Trend */}
          <div className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <h2 className={styles.chartTitle}>Weekly Performance Trend</h2>
              <div className={styles.metricSelector}>
                <button 
                  className={`${styles.metricBtn} ${selectedMetric === 'customers' ? styles.metricBtnActive : ''}`}
                  onClick={() => setSelectedMetric('customers')}
                >
                  Customers
                </button>
                <button 
                  className={`${styles.metricBtn} ${selectedMetric === 'revenue' ? styles.metricBtnActive : ''}`}
                  onClick={() => setSelectedMetric('revenue')}
                >
                  Revenue
                </button>
                <button 
                  className={`${styles.metricBtn} ${selectedMetric === 'avgTime' ? styles.metricBtnActive : ''}`}
                  onClick={() => setSelectedMetric('avgTime')}
                >
                  Avg Time
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={weeklyData}>
                <defs>
                  <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#667eea" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#667eea" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e6ed" />
                <XAxis dataKey="day" stroke="#6c757d" />
                <YAxis stroke="#6c757d" />
                <Tooltip 
                  contentStyle={{ 
                    background: '#ffffff', 
                    border: '1px solid #e0e6ed',
                    borderRadius: '8px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey={selectedMetric} 
                  stroke="#667eea" 
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorMetric)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Hourly Distribution */}
          <div className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <h2 className={styles.chartTitle}>Hourly Customer Distribution</h2>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e6ed" />
                <XAxis dataKey="hour" stroke="#6c757d" />
                <YAxis stroke="#6c757d" />
                <Tooltip 
                  contentStyle={{ 
                    background: '#ffffff', 
                    border: '1px solid #e0e6ed',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="customers" fill="#667eea" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Analysis Grid */}
        <div className={styles.analysisGrid}>
          {/* Peak Hours */}
          <div className={styles.analysisCard}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Peak Hours Analysis</h2>
            </div>
            <div className={styles.cardBody}>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={peakHoursData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percentage }) => `${name} (${percentage}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {peakHoursData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className={styles.peakInsight}>
                <strong>Peak Time:</strong> {stats.peakHour} with {peakHoursData[1].count} customers
              </div>
            </div>
          </div>

          {/* Service Time Distribution */}
          <div className={styles.analysisCard}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Service Time Distribution</h2>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.distributionList}>
                {serviceTimeData.map((item, index) => (
                  <div key={index} className={styles.distributionItem}>
                    <div className={styles.distributionLabel}>{item.range}</div>
                    <div className={styles.distributionBar}>
                      <div 
                        className={styles.distributionFill}
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                    <div className={styles.distributionValue}>{item.count} ({item.percentage}%)</div>
                  </div>
                ))}
              </div>
              <div className={styles.serviceInsight}>
                <strong>Average:</strong> {stats.avgServiceTime} minutes | <strong>Target:</strong> Under 10 minutes
              </div>
            </div>
          </div>

          {/* Top Products */}
          <div className={styles.analysisCard}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Top Performing Products</h2>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.productsList}>
                {topProducts.map((product, index) => (
                  <div key={index} className={styles.productItem}>
                    <div className={styles.productRank}>#{index + 1}</div>
                    <div className={styles.productInfo}>
                      <div className={styles.productName}>{product.name}</div>
                      <div className={styles.productStats}>
                        {product.sold} sold • ₹{product.revenue.toLocaleString()}
                      </div>
                    </div>
                    <div className={styles.productPercentage}>{product.percentage}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Insights Section */}
        <div className={styles.insightsSection}>
          <h2 className={styles.sectionTitle}>AI-Powered Insights</h2>
          <div className={styles.insightsGrid}>
            <div className={styles.insightCard}>
              <div className={styles.insightIcon}>📈</div>
              <div className={styles.insightContent}>
                <div className={styles.insightTitle}>Growth Opportunity</div>
                <div className={styles.insightText}>
                  Saturday shows 24% higher customer volume. Consider increasing staff during weekend peak hours.
                </div>
              </div>
            </div>

            <div className={styles.insightCard}>
              <div className={styles.insightIcon}>⏰</div>
              <div className={styles.insightContent}>
                <div className={styles.insightTitle}>Efficiency Tip</div>
                <div className={styles.insightText}>
                  2PM-3PM has the longest wait times (12 min avg). Pre-prepare popular items during this period.
                </div>
              </div>
            </div>

            <div className={styles.insightCard}>
              <div className={styles.insightIcon}>🎯</div>
              <div className={styles.insightContent}>
                <div className={styles.insightTitle}>Revenue Optimization</div>
                <div className={styles.insightText}>
                  Masala Dosa and Filter Coffee combo is popular. Consider offering a combo deal.
                </div>
              </div>
            </div>

            <div className={styles.insightCard}>
              <div className={styles.insightIcon}>⭐</div>
              <div className={styles.insightContent}>
                <div className={styles.insightTitle}>Customer Satisfaction</div>
                <div className={styles.insightText}>
                  94% of customers served within 15 minutes. Your efficiency is above industry average!
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}