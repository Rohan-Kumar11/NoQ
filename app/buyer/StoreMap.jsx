'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MapPin, Navigation, Clock, TrendingUp, X, Search, 
  ZoomIn, ZoomOut, Maximize2, Minimize2, Layers,
  Star, Phone, Mail, Globe, ChevronRight, ChevronLeft,
  Locate, Maximize
} from 'lucide-react';
import './StoreMap.css';

export default function StoreMap({ stores, queueData, userLocation, onStoreSelect }) {
  const [selectedStore, setSelectedStore] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredStores, setFilteredStores] = useState(stores);
  const [hoveredStore, setHoveredStore] = useState(null);
  const [mapStyle, setMapStyle] = useState('streets');
  const [showSidebar, setShowSidebar] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [visibleStores, setVisibleStores] = useState([]);
  const [mapReady, setMapReady] = useState(false);
  
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const userMarkerRef = useRef(null);

  // Map tile providers
  const tileProviders = {
    streets: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors'
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles © Esri'
    },
    terrain: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: '© OpenTopoMap contributors'
    },
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '© CartoDB'
    }
  };

  // Initialize Leaflet map
  useEffect(() => {
    // Check if window is defined (client-side)
    if (typeof window === 'undefined') return;

    // Load Leaflet dynamically
    const loadLeaflet = async () => {
      if (!window.L) {
        // Add Leaflet CSS
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);

        // Add Leaflet JS
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.async = true;
        
        await new Promise((resolve) => {
          script.onload = resolve;
          document.head.appendChild(script);
        });
      }

      initializeMap();
    };

    loadLeaflet();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const initializeMap = () => {
    if (!window.L || !mapRef.current || mapInstanceRef.current) return;

    const L = window.L;
    const center = userLocation ? [userLocation.lat, userLocation.lng] : [28.6692, 77.4538];

    // Create map instance
    const map = L.map(mapRef.current, {
      center: center,
      zoom: 12,
      zoomControl: false,
      attributionControl: false
    });

    // Add tile layer
    L.tileLayer(tileProviders[mapStyle].url, {
      attribution: tileProviders[mapStyle].attribution,
      maxZoom: 19
    }).addTo(map);

    mapInstanceRef.current = map;
    setMapReady(true);

    // Add user location marker if available
    if (userLocation) {
      addUserMarker(userLocation);
    }

    // Update visible stores on map move
    map.on('moveend', updateVisibleStores);
    map.on('zoomend', updateVisibleStores);
  };

  // Change map style
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;

    const map = mapInstanceRef.current;
    
    // Remove all layers except markers
    map.eachLayer((layer) => {
      if (layer instanceof window.L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    // Add new tile layer
    window.L.tileLayer(tileProviders[mapStyle].url, {
      attribution: tileProviders[mapStyle].attribution,
      maxZoom: 19
    }).addTo(map);
  }, [mapStyle]);

  // Add user location marker
  const addUserMarker = (location) => {
    if (!mapInstanceRef.current || !window.L) return;

    const L = window.L;
    const map = mapInstanceRef.current;

    // Remove existing user marker
    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
    }

    // Create custom icon for user location
    const userIcon = L.divIcon({
      className: 'custom-user-marker',
      html: `
        <div class="user-marker-container">
          <div class="user-marker-pulse"></div>
          <div class="user-marker-dot">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
            </svg>
          </div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    const marker = L.marker([location.lat, location.lng], { icon: userIcon }).addTo(map);
    userMarkerRef.current = marker;

    marker.bindPopup(`
      <div class="leaflet-popup-content-custom">
        <strong>Your Location</strong>
        <p style="margin: 5px 0 0 0; font-size: 12px; color: #5f6368;">
          ${location.lat.toFixed(4)}°, ${location.lng.toFixed(4)}°
        </p>
      </div>
    `);
  };

  // Update filtered stores based on search
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredStores(stores);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = stores.filter(store => 
        store.store_name?.toLowerCase().includes(query) ||
        store.city?.toLowerCase().includes(query) ||
        store.state?.toLowerCase().includes(query) ||
        store.address?.toLowerCase().includes(query) ||
        store.category?.toLowerCase().includes(query)
      );
      setFilteredStores(filtered);
      
      if (filtered.length > 0 && filtered[0].latitude && filtered[0].longitude && mapInstanceRef.current) {
        mapInstanceRef.current.setView(
          [parseFloat(filtered[0].latitude), parseFloat(filtered[0].longitude)],
          14
        );
      }
    }
  }, [searchQuery, stores]);

  // Update store markers when filtered stores change
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.L) return;

    updateStoreMarkers();
    updateVisibleStores();
  }, [filteredStores, queueData, mapReady, selectedStore, hoveredStore]);

  // Update user marker when location changes
  useEffect(() => {
    if (userLocation && mapReady) {
      addUserMarker(userLocation);
    }
  }, [userLocation, mapReady]);

  const updateStoreMarkers = () => {
    if (!mapInstanceRef.current || !window.L) return;

    const L = window.L;
    const map = mapInstanceRef.current;

    // Remove old markers
    Object.values(markersRef.current).forEach(marker => {
      map.removeLayer(marker);
    });
    markersRef.current = {};

    // Add new markers
    filteredStores.forEach(store => {
      if (!store.latitude || !store.longitude) return;

      const queue = queueData[store.id] || { queueSize: 0, avgWaitTime: 0 };
      const isSelected = selectedStore?.id === store.id;
      const isHovered = hoveredStore?.id === store.id;

      const waitTimeColor = getWaitTimeColor(queue.avgWaitTime);
      const storeIcon = getStoreIcon(store.category);

      // Create custom marker
      const markerIcon = L.divIcon({
        className: 'custom-store-marker',
        html: `
          <div class="store-marker-container ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${store.status === 'closed' ? 'closed' : ''}">
            <div class="store-marker-pin" style="background: ${isSelected ? '#1a73e8' : isHovered ? '#fbbc04' : '#ea4335'};">
              <div class="store-marker-icon">${storeIcon}</div>
            </div>
            <div class="store-marker-badge" style="background: ${waitTimeColor};">
              ${queue.avgWaitTime > 0 ? `${queue.avgWaitTime}m` : '✓'}
            </div>
          </div>
        `,
        iconSize: [50, 60],
        iconAnchor: [25, 60],
        popupAnchor: [0, -60]
      });

      const marker = L.marker([parseFloat(store.latitude), parseFloat(store.longitude)], {
        icon: markerIcon
      }).addTo(map);

      // Create popup content
      let distance = null;
      if (userLocation) {
        distance = calculateDistance(
          userLocation.lat,
          userLocation.lng,
          parseFloat(store.latitude),
          parseFloat(store.longitude)
        );
      }

      const popupContent = `
        <div class="leaflet-popup-content-custom">
          <div class="popup-header">
            <div>
              <strong style="font-size: 15px; color: #202124;">${store.store_name}</strong>
              <div style="font-size: 12px; color: #5f6368; margin-top: 3px;">${store.category}</div>
            </div>
            <span class="popup-status ${store.status}" style="font-size: 11px;">
              ${store.status === 'open' ? '🟢 Open' : '🔴 Closed'}
            </span>
          </div>
          <div class="popup-info">
            <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 5px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              <span>${distance ? `${distance.toFixed(1)} km away` : store.city}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 5px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span style="color: ${waitTimeColor}; font-weight: 500;">
                ${queue.avgWaitTime === 0 ? 'No wait' : `${queue.avgWaitTime} min wait`}
              </span>
            </div>
          </div>
          <button onclick="window.selectStore('${store.id}')" class="popup-button">
            View Details
          </button>
        </div>
      `;

      marker.bindPopup(popupContent, {
        className: 'custom-popup',
        closeButton: true,
        maxWidth: 250
      });

      // Create hover tooltip with store name and basic info
      const tooltipContent = `
        <div style="font-weight: 600; margin-bottom: 2px; font-size: 13px;">${store.store_name}</div>
        <div style="font-size: 11px; color: rgba(255, 255, 255, 0.85);">
          ${store.category} • ${queue.avgWaitTime === 0 ? 'No wait' : `${queue.avgWaitTime}m wait`}
        </div>
      `;

      marker.bindTooltip(tooltipContent, {
        permanent: false,
        direction: 'top',
        offset: [0, -50],
        className: 'custom-marker-tooltip'
      });

      // Add click event
      marker.on('click', () => {
        handleStoreClick(store);
      });

      // Add hover events
      marker.on('mouseover', () => {
        setHoveredStore(store);
      });

      marker.on('mouseout', () => {
        setHoveredStore(null);
      });

      markersRef.current[store.id] = marker;
    });
  };

  const updateVisibleStores = () => {
    if (!mapInstanceRef.current) return;

    const bounds = mapInstanceRef.current.getBounds();
    const visible = filteredStores.filter(store => {
      if (!store.latitude || !store.longitude) return false;
      const lat = parseFloat(store.latitude);
      const lng = parseFloat(store.longitude);
      return bounds.contains([lat, lng]);
    });
    setVisibleStores(visible);
  };

  // Add global function for popup button
  useEffect(() => {
    window.selectStore = (storeId) => {
      const store = stores.find(s => s.id === storeId);
      if (store) {
        handleStoreClick(store);
      }
    };

    return () => {
      delete window.selectStore;
    };
  }, [stores]);

  const getStoreIcon = (category) => {
    const icons = {
      'Grocery': '🛒',
      'Food': '🍽️',
      'Electronics': '📱',
      'Fashion': '👗',
      'Healthcare': '💊',
      'Pharmacy': '⚕️',
      'Books': '📚',
      'Restaurant': '🍴',
      'Cafe': '☕',
      'Retail': '🏪'
    };
    return icons[category] || '🏪';
  };

  const getWaitTimeColor = (waitTime) => {
    if (waitTime === 0) return '#10b981';
    if (waitTime <= 3) return '#22c55e';
    if (waitTime <= 7) return '#f59e0b';
    return '#ef4444';
  };

  const handleStoreClick = (store) => {
    setSelectedStore(store);
    if (store.latitude && store.longitude && mapInstanceRef.current) {
      mapInstanceRef.current.setView(
        [parseFloat(store.latitude), parseFloat(store.longitude)],
        15,
        { animate: true }
      );
    }
  };

  const handleZoomIn = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomOut();
    }
  };

  const handleRecenter = () => {
    if (userLocation && mapInstanceRef.current) {
      mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 12, { animate: true });
      setSelectedStore(null);
    }
  };

  const handleFitAll = () => {
    if (!mapInstanceRef.current || !window.L || filteredStores.length === 0) return;

    const L = window.L;
    const storesWithCoords = filteredStores.filter(s => s.latitude && s.longitude);
    if (storesWithCoords.length === 0) return;

    const bounds = L.latLngBounds(
      storesWithCoords.map(s => [parseFloat(s.latitude), parseFloat(s.longitude)])
    );

    mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const toggleFullscreen = () => {
    setFullscreen(!fullscreen);
  };

  return (
    <div className={`store-map-container ${fullscreen ? 'fullscreen' : ''}`}>
      {/* Map Controls Header */}
      <div className="store-map-header">
        <div className="store-map-search-bar">
          <div className="store-map-search-input-wrapper">
            <Search className="store-map-search-icon" />
            <input
              type="text"
              placeholder="Search stores by name, location, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="store-map-search-input"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="store-map-search-clear"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="store-map-header-actions">
          <button 
            onClick={() => setShowSidebar(!showSidebar)}
            className="store-map-control-btn"
            title={showSidebar ? "Hide Sidebar" : "Show Sidebar"}
          >
            {showSidebar ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
          <button 
            onClick={toggleFullscreen}
            className="store-map-control-btn"
            title={fullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {fullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div className="store-map-layout">
        {/* Sidebar */}
        {showSidebar && (
          <div className="store-map-sidebar">
            <div className="store-map-sidebar-header">
              <h3 className="store-map-sidebar-title">
                {filteredStores.length} {filteredStores.length === 1 ? 'Store' : 'Stores'}
              </h3>
              <span className="store-map-sidebar-subtitle">
                {visibleStores.length} visible on map
              </span>
            </div>

            <div className="store-map-sidebar-list">
              {filteredStores.length === 0 ? (
                <div className="store-map-sidebar-empty">
                  <Search className="w-12 h-12" style={{ color: '#9ca3af' }} />
                  <p>No stores found</p>
                  <span>Try adjusting your search</span>
                </div>
              ) : (
                filteredStores.map((store) => {
                  const queue = queueData[store.id] || { queueSize: 0, avgWaitTime: 0 };
                  let distance = null;
                  if (userLocation && store.latitude && store.longitude) {
                    distance = calculateDistance(
                      userLocation.lat, 
                      userLocation.lng,
                      parseFloat(store.latitude),
                      parseFloat(store.longitude)
                    );
                  }

                  return (
                    <div
                      key={store.id}
                      className={`store-map-sidebar-item ${selectedStore?.id === store.id ? 'selected' : ''} ${hoveredStore?.id === store.id ? 'hovered' : ''}`}
                      onClick={() => handleStoreClick(store)}
                      onMouseEnter={() => setHoveredStore(store)}
                      onMouseLeave={() => setHoveredStore(null)}
                    >
                      <div className="store-map-sidebar-item-icon">
                        {getStoreIcon(store.category)}
                      </div>
                      <div className="store-map-sidebar-item-info">
                        <div className="store-map-sidebar-item-header">
                          <h4 className="store-map-sidebar-item-name">{store.store_name}</h4>
                          <div className={`store-map-sidebar-item-status ${store.status}`}>
                            {store.status === 'open' ? '●' : '●'}
                          </div>
                        </div>
                        <div className="store-map-sidebar-item-meta">
                          {distance && (
                            <span className="store-map-sidebar-item-distance">
                              {distance.toFixed(1)} km
                            </span>
                          )}
                          <span className="store-map-sidebar-item-category">
                            {store.category}
                          </span>
                        </div>
                        <div className="store-map-sidebar-item-queue">
                          <div className="store-map-sidebar-item-queue-stat">
                            <Clock className="w-4 h-4" />
                            <span style={{ color: getWaitTimeColor(queue.avgWaitTime) }}>
                              {queue.avgWaitTime === 0 ? 'No wait' : `${queue.avgWaitTime}m`}
                            </span>
                          </div>
                          <div className="store-map-sidebar-item-queue-stat">
                            <TrendingUp className="w-4 h-4" />
                            <span>{queue.queueSize} in queue</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Map View */}
        <div className="store-map-wrapper">
          <div ref={mapRef} className="leaflet-map-container" />
          
          {/* Map Controls */}
          <div className="store-map-controls">
            <button 
              onClick={handleZoomIn} 
              className="store-map-control-btn"
              title="Zoom In"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <button 
              onClick={handleZoomOut} 
              className="store-map-control-btn"
              title="Zoom Out"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <button 
              onClick={handleRecenter} 
              className="store-map-control-btn"
              title="Center on My Location"
              disabled={!userLocation}
            >
              <Locate className="w-5 h-5" />
            </button>
            <button 
              onClick={handleFitAll} 
              className="store-map-control-btn"
              title="Fit All Stores"
              disabled={filteredStores.length === 0}
            >
              <Maximize className="w-5 h-5" />
            </button>
            <button 
              onClick={() => {
                const styles = ['streets', 'satellite', 'terrain', 'dark'];
                const currentIndex = styles.indexOf(mapStyle);
                const nextIndex = (currentIndex + 1) % styles.length;
                setMapStyle(styles[nextIndex]);
              }}
              className="store-map-control-btn"
              title={`Map Style: ${mapStyle}`}
            >
              <Layers className="w-5 h-5" />
            </button>
          </div>

          {/* Store Details Panel */}
          {selectedStore && (
            <div className="store-map-details-panel">
              <button 
                className="store-map-details-close"
                onClick={() => setSelectedStore(null)}
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="store-map-details-content">
                <div className="store-map-details-header">
                  <div className="store-map-details-icon">
                    {getStoreIcon(selectedStore.category)}
                  </div>
                  <div className="store-map-details-header-info">
                    <h3 className="store-map-details-name">{selectedStore.store_name}</h3>
                    <p className="store-map-details-category">{selectedStore.category}</p>
                    <div className="store-map-details-rating">
                      <Star className="w-4 h-4" fill="currentColor" />
                      <span>4.5</span>
                      <span className="store-map-details-reviews">(120 reviews)</span>
                    </div>
                  </div>
                  <div className={`store-map-details-status ${selectedStore.status}`}>
                    {selectedStore.status === 'open' ? '🟢 Open' : '🔴 Closed'}
                  </div>
                </div>
                
                {selectedStore.description && (
                  <p className="store-map-details-description">{selectedStore.description}</p>
                )}
                
                <div className="store-map-details-location">
                  <div className="store-map-details-address">
                    <MapPin className="w-4 h-4" />
                    <span>
                      {selectedStore.address}
                      {selectedStore.landmark && `, ${selectedStore.landmark}`}
                      <br />
                      {selectedStore.city}, {selectedStore.state} - {selectedStore.pincode}
                    </span>
                  </div>
                  
                  {selectedStore.latitude && selectedStore.longitude && (
                    <div className="store-map-details-coords">
                      📍 {parseFloat(selectedStore.latitude).toFixed(4)}°, {parseFloat(selectedStore.longitude).toFixed(4)}°
                    </div>
                  )}
                  
                  {userLocation && selectedStore.latitude && selectedStore.longitude && (
                    <div className="store-map-details-distance">
                      🚶 {calculateDistance(
                        userLocation.lat, 
                        userLocation.lng,
                        parseFloat(selectedStore.latitude),
                        parseFloat(selectedStore.longitude)
                      ).toFixed(1)} km away
                    </div>
                  )}
                </div>

                {/* Contact Information */}
                <div className="store-map-details-contact">
                  {selectedStore.phone && (
                    <a href={`tel:${selectedStore.phone}`} className="store-map-details-contact-item">
                      <Phone className="w-4 h-4" />
                      <span>{selectedStore.phone}</span>
                    </a>
                  )}
                  {selectedStore.email && (
                    <a href={`mailto:${selectedStore.email}`} className="store-map-details-contact-item">
                      <Mail className="w-4 h-4" />
                      <span>{selectedStore.email}</span>
                    </a>
                  )}
                  {selectedStore.website && (
                    <a href={selectedStore.website} target="_blank" rel="noopener noreferrer" className="store-map-details-contact-item">
                      <Globe className="w-4 h-4" />
                      <span>Visit Website</span>
                    </a>
                  )}
                </div>
                
                <div className="store-map-details-queue">
                  <div className="store-map-queue-stat">
                    <Clock className="w-5 h-5" />
                    <div>
                      <p className="store-map-queue-label">Wait Time</p>
                      <p className="store-map-queue-value" style={{
                        color: getWaitTimeColor(queueData[selectedStore.id]?.avgWaitTime || 0)
                      }}>
                        {queueData[selectedStore.id]?.avgWaitTime === 0 
                          ? 'No Queue' 
                          : `${queueData[selectedStore.id]?.avgWaitTime} min`}
                      </p>
                    </div>
                  </div>
                  
                  <div className="store-map-queue-stat">
                    <TrendingUp className="w-5 h-5" />
                    <div>
                      <p className="store-map-queue-label">In Queue</p>
                      <p className="store-map-queue-value">
                        {queueData[selectedStore.id]?.queueSize || 0} people
                      </p>
                    </div>
                  </div>
                </div>
                
                <button
                  disabled={selectedStore.status === 'closed'}
                  onClick={() => onStoreSelect(selectedStore.id)}
                  className={`store-map-details-cta ${selectedStore.status === 'open' ? '' : 'disabled'}`}
                >
                  {selectedStore.status === 'open' ? 'View Products & Join Queue →' : 'Currently Closed'}
                </button>
              </div>
            </div>
          )}
          
          {/* Legend - Repositioned to top right */}
          <div className="store-map-legend">
            <div className="store-map-legend-title">Wait Times</div>
            <div className="store-map-legend-items">
              <div className="store-map-legend-item">
                <div className="store-map-legend-marker" style={{ backgroundColor: '#10b981' }} />
                <span>No Wait</span>
              </div>
              <div className="store-map-legend-item">
                <div className="store-map-legend-marker" style={{ backgroundColor: '#22c55e' }} />
                <span>1-3 min</span>
              </div>
              <div className="store-map-legend-item">
                <div className="store-map-legend-marker" style={{ backgroundColor: '#f59e0b' }} />
                <span>4-7 min</span>
              </div>
              <div className="store-map-legend-item">
                <div className="store-map-legend-marker" style={{ backgroundColor: '#ef4444' }} />
                <span>8+ min</span>
              </div>
            </div>
          </div>

          {/* Map Style Indicator */}
          <div className="store-map-style-indicator">
            <Layers className="w-3 h-3" />
            <span>{mapStyle.charAt(0).toUpperCase() + mapStyle.slice(1)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}