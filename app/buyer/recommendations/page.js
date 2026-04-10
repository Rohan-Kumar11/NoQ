'use client';

import { useState } from 'react';
import { ChevronLeft, TrendingUp, Clock, MapPin, Star, Zap, Calendar, Users, ShoppingBag, Coffee, Smartphone } from 'lucide-react';

export default function SmartRecommendations() {
  const [selectedCategory, setSelectedCategory] = useState('all');

  const recommendations = {
    bestTimes: [
      {
        id: 1,
        store: 'Fresh Mart Grocery',
        icon: '🛒',
        bestTime: '10:00 AM - 11:00 AM',
        reason: 'Lowest wait time based on your past visits',
        avgWait: '1-2 min',
        confidence: 95
      },
      {
        id: 2,
        store: 'Quick Bites Cafe',
        icon: '☕',
        bestTime: '3:00 PM - 4:00 PM',
        reason: 'Usually quiet during this period',
        avgWait: '2-3 min',
        confidence: 88
      },
      {
        id: 3,
        store: 'Tech World Electronics',
        icon: '📱',
        bestTime: '2:00 PM - 3:00 PM',
        reason: 'Shortest queues on weekdays',
        avgWait: '3-4 min',
        confidence: 82
      }
    ],
    shortestQueues: [
      {
        id: 1,
        store: 'Health Plus Pharmacy',
        icon: '💊',
        distance: '0.3 km',
        currentWait: 2,
        queueSize: 1,
        reason: 'Almost no queue right now!'
      },
      {
        id: 2,
        store: 'Book Haven',
        icon: '📚',
        distance: '2.0 km',
        currentWait: 3,
        queueSize: 2,
        reason: 'Very quiet today'
      },
      {
        id: 3,
        store: 'Fresh Mart Grocery',
        icon: '🛒',
        distance: '0.5 km',
        currentWait: 4,
        queueSize: 3,
        reason: 'Moving faster than usual'
      }
    ],
    popularProducts: [
      {
        id: 1,
        name: 'Organic Bananas',
        store: 'Fresh Mart Grocery',
        icon: '🍌',
        price: 45,
        reason: 'You buy this often',
        inStock: true
      },
      {
        id: 2,
        name: 'Cappuccino',
        store: 'Quick Bites Cafe',
        icon: '☕',
        price: 120,
        reason: 'Ordered 5 times this month',
        inStock: true
      },
      {
        id: 3,
        name: 'Fresh Milk',
        store: 'Fresh Mart Grocery',
        icon: '🥛',
        price: 65,
        reason: 'Part of your weekly routine',
        inStock: true
      }
    ],
    similarUsers: [
      {
        id: 1,
        store: 'Style Hub Fashion',
        icon: '👗',
        reason: 'Users with similar taste love this store',
        rating: 4.5,
        distance: '1.5 km'
      },
      {
        id: 2,
        store: 'Organic Foods Market',
        icon: '🥗',
        reason: 'Popular among health-conscious shoppers',
        rating: 4.8,
        distance: '1.2 km'
      }
    ]
  };

  const categories = [
    { id: 'all', name: 'All Insights', icon: <Zap className="w-4 h-4" /> },
    { id: 'timing', name: 'Best Times', icon: <Clock className="w-4 h-4" /> },
    { id: 'queues', name: 'Short Queues', icon: <Users className="w-4 h-4" /> },
    { id: 'products', name: 'For You', icon: <ShoppingBag className="w-4 h-4" /> }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="text-2xl font-serif">Smart Insights</div>
            <div className="w-10"></div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Banner */}
        <div className="bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 rounded-3xl p-8 mb-8 border border-purple-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 rounded-full -translate-y-32 translate-x-32"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/20 rounded-full translate-y-24 -translate-x-24"></div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center">
                <Zap className="w-7 h-7 text-purple-600" />
              </div>
              <div>
                <h1 className="text-3xl font-serif text-gray-800">Personalized for You</h1>
                <p className="text-gray-600">AI-powered insights based on your shopping patterns</p>
              </div>
            </div>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide mb-8">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-6 py-3 rounded-xl font-medium whitespace-nowrap transition-all flex items-center gap-2 ${
                selectedCategory === category.id
                  ? 'bg-black text-white shadow-lg shadow-black/20'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
              }`}
            >
              {category.icon}
              {category.name}
            </button>
          ))}
        </div>

        {/* Best Times Section */}
        {(selectedCategory === 'all' || selectedCategory === 'timing') && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-6 h-6 text-blue-600" />
              <h2 className="text-2xl font-serif">Best Times to Visit</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {recommendations.bestTimes.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-3xl border border-gray-200 p-6 hover:shadow-xl hover:border-gray-300 transition-all"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-gray-100 to-gray-50 rounded-2xl flex items-center justify-center text-2xl">
                      {item.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-serif text-lg">{item.store}</h3>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-sm text-green-600 font-medium">{item.confidence}% confident</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-4 mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-gray-700">Optimal Time</span>
                    </div>
                    <p className="text-xl font-bold text-gray-800">{item.bestTime}</p>
                  </div>

                  <p className="text-sm text-gray-600 mb-3">{item.reason}</p>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Avg. wait:</span>
                    <span className="font-bold text-green-600">{item.avgWait}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shortest Queues Section */}
        {(selectedCategory === 'all' || selectedCategory === 'queues') && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-6 h-6 text-green-600" />
              <h2 className="text-2xl font-serif">Shortest Queues Right Now</h2>
            </div>
            <div className="space-y-3">
              {recommendations.shortestQueues.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-lg hover:border-gray-300 transition-all flex items-center justify-between"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-14 h-14 bg-gradient-to-br from-gray-100 to-gray-50 rounded-xl flex items-center justify-center text-2xl">
                      {item.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-serif text-lg mb-1">{item.store}</h3>
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {item.distance}
                        </span>
                        <span>•</span>
                        <span className="text-green-600 font-medium">{item.reason}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Wait Time</p>
                      <p className="text-2xl font-bold text-green-600">{item.currentWait}m</p>
                    </div>
                    <button className="px-6 py-3 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-all">
                      Join Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Popular Products Section */}
        {(selectedCategory === 'all' || selectedCategory === 'products') && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <ShoppingBag className="w-6 h-6 text-purple-600" />
              <h2 className="text-2xl font-serif">Recommended for You</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {recommendations.popularProducts.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-3xl border border-gray-200 p-6 hover:shadow-xl hover:border-gray-300 transition-all"
                >
                  <div className="w-full h-32 bg-gradient-to-br from-gray-100 to-gray-50 rounded-2xl flex items-center justify-center text-5xl mb-4">
                    {item.icon}
                  </div>
                  
                  <h3 className="font-serif text-xl mb-1">{item.name}</h3>
                  <p className="text-sm text-gray-500 mb-3">{item.store}</p>
                  
                  <div className="bg-purple-50 rounded-xl p-3 mb-4">
                    <p className="text-sm text-purple-700 font-medium">{item.reason}</p>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <p className="text-2xl font-bold text-gray-800">₹{item.price}</p>
                    <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                      In Stock
                    </span>
                  </div>
                  
                  <button className="w-full mt-4 py-3 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-all">
                    Quick Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Discovery Section */}
        {selectedCategory === 'all' && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Star className="w-6 h-6 text-amber-600" />
              <h2 className="text-2xl font-serif">Discover New Favorites</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommendations.similarUsers.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-3xl border border-gray-200 p-6 hover:shadow-xl hover:border-gray-300 transition-all"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-50 rounded-2xl flex items-center justify-center text-3xl">
                      {item.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-serif text-xl mb-1">{item.store}</h3>
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                          {item.rating}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {item.distance}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-amber-50 rounded-xl p-4 mb-4">
                    <p className="text-sm text-amber-800 font-medium">{item.reason}</p>
                  </div>
                  
                  <button className="w-full py-3 bg-white border-2 border-gray-200 text-gray-700 rounded-xl font-medium hover:border-gray-300 transition-all">
                    Explore Store
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Insights Stats */}
        <div className="bg-gradient-to-br from-gray-50 to-white rounded-3xl border border-gray-200 p-8">
          <h3 className="text-xl font-serif mb-6 text-center">Your Smart Shopping Stats</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Clock className="w-8 h-8 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-gray-800 mb-1">47</p>
              <p className="text-sm text-gray-600">Minutes Saved</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <TrendingUp className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-3xl font-bold text-gray-800 mb-1">92%</p>
              <p className="text-sm text-gray-600">Prediction Accuracy</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Star className="w-8 h-8 text-purple-600" />
              </div>
              <p className="text-3xl font-bold text-gray-800 mb-1">3</p>
              <p className="text-sm text-gray-600">Favorite Stores</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <ShoppingBag className="w-8 h-8 text-amber-600" />
              </div>
              <p className="text-3xl font-bold text-gray-800 mb-1">6</p>
              <p className="text-sm text-gray-600">Total Orders</p>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}