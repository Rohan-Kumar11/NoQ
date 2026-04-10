'use client';

import { useState } from 'react';
import { ChevronLeft, Star, ThumbsUp, MessageSquare, Send, Clock, CheckCircle } from 'lucide-react';

export default function ReviewsFeedback() {
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [serviceRating, setServiceRating] = useState(0);
  const [speedRating, setSpeedRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const completedOrders = [
    {
      id: 'ORD-2026-002',
      storeName: 'Quick Bites Cafe',
      storeIcon: '☕',
      date: 'Jan 28, 2026',
      amount: 485.00,
      reviewed: false
    },
    {
      id: 'ORD-2026-003',
      storeName: 'Tech World Electronics',
      storeIcon: '📱',
      date: 'Jan 26, 2026',
      amount: 1250.00,
      reviewed: true,
      myReview: {
        rating: 5,
        serviceRating: 5,
        speedRating: 4,
        comment: 'Great experience! Quick service and helpful staff.',
        date: 'Jan 26, 2026'
      }
    },
    {
      id: 'ORD-2026-004',
      storeName: 'Fresh Mart Grocery',
      storeIcon: '🛒',
      date: 'Jan 25, 2026',
      amount: 680.00,
      reviewed: true,
      myReview: {
        rating: 4,
        serviceRating: 4,
        speedRating: 5,
        comment: 'Very satisfied with the quality and speed.',
        date: 'Jan 25, 2026'
      }
    }
  ];

  const emojiRatings = [
    { value: 1, emoji: '😞', label: 'Poor' },
    { value: 2, emoji: '😕', label: 'Fair' },
    { value: 3, emoji: '😐', label: 'Good' },
    { value: 4, emoji: '😊', label: 'Very Good' },
    { value: 5, emoji: '😍', label: 'Excellent' }
  ];

  const handleSubmit = () => {
    setSubmitted(true);
    setTimeout(() => {
      setSelectedOrder(null);
      setRating(0);
      setServiceRating(0);
      setSpeedRating(0);
      setComment('');
      setSubmitted(false);
    }, 2000);
  };

  const renderStars = (currentRating, setRatingFunc, hoverValue = 0) => {
    return (
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => setRatingFunc(star)}
            onMouseEnter={() => setHoverRating && setHoverRating(star)}
            onMouseLeave={() => setHoverRating && setHoverRating(0)}
            className="transition-transform hover:scale-110"
          >
            <Star
              className={`w-8 h-8 ${
                star <= (hoverValue || currentRating)
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-gray-300'
              }`}
            />
          </button>
        ))}
      </div>
    );
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
            <CheckCircle className="w-14 h-14 text-green-600" />
          </div>
          <h1 className="text-3xl font-serif mb-3">Thank You!</h1>
          <p className="text-gray-600 text-lg">Your feedback has been submitted successfully</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => selectedOrder ? setSelectedOrder(null) : null}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="text-2xl font-serif">
              {selectedOrder ? 'Rate Your Experience' : 'Reviews & Feedback'}
            </div>
            <div className="w-10"></div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!selectedOrder ? (
          <>
            {/* Info Banner */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-3xl p-6 mb-8 border border-blue-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-serif text-gray-800">Help Us Improve</h3>
                  <p className="text-sm text-gray-600">Your feedback helps us provide better service</p>
                </div>
              </div>
            </div>

            {/* Orders to Review */}
            <div className="space-y-4">
              <h2 className="text-2xl font-serif mb-4">Your Orders</h2>
              {completedOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-white rounded-3xl border border-gray-200 p-6 hover:shadow-xl hover:border-gray-300 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-50 rounded-2xl flex items-center justify-center text-3xl">
                        {order.storeIcon}
                      </div>
                      <div>
                        <h3 className="text-xl font-serif mb-1">{order.storeName}</h3>
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                          <span>{order.date}</span>
                          <span>•</span>
                          <span>₹{order.amount}</span>
                        </div>
                      </div>
                    </div>

                    {order.reviewed ? (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                          <span className="text-lg font-bold text-gray-800">
                            {order.myReview.rating}.0
                          </span>
                        </div>
                        <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                          View Review
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="px-6 py-3 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-all"
                      >
                        Write Review
                      </button>
                    )}
                  </div>

                  {order.reviewed && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-gray-600 text-sm italic">"{order.myReview.comment}"</p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-xs text-gray-500">Service: {order.myReview.serviceRating}/5</span>
                        <span className="text-xs text-gray-500">Speed: {order.myReview.speedRating}/5</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Review Form */}
            <div className="bg-white rounded-3xl border border-gray-200 p-8 mb-6">
              {/* Store Info */}
              <div className="flex items-center gap-4 pb-6 mb-6 border-b border-gray-200">
                <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-50 rounded-2xl flex items-center justify-center text-3xl">
                  {selectedOrder.storeIcon}
                </div>
                <div>
                  <h2 className="text-2xl font-serif">{selectedOrder.storeName}</h2>
                  <p className="text-gray-500">{selectedOrder.date}</p>
                </div>
              </div>

              {/* Overall Rating with Emojis */}
              <div className="mb-8">
                <label className="block text-lg font-medium text-gray-800 mb-4">
                  How was your overall experience?
                </label>
                <div className="flex gap-4 justify-center">
                  {emojiRatings.map((item) => (
                    <button
                      key={item.value}
                      onClick={() => setRating(item.value)}
                      className={`flex flex-col items-center p-4 rounded-2xl transition-all ${
                        rating === item.value
                          ? 'bg-amber-50 border-2 border-amber-400 scale-110'
                          : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                      }`}
                    >
                      <span className="text-4xl mb-2">{item.emoji}</span>
                      <span className="text-sm font-medium text-gray-700">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Star Rating */}
              <div className="mb-8">
                <label className="block text-lg font-medium text-gray-800 mb-4">
                  Rate your experience
                </label>
                <div className="flex justify-center">
                  {renderStars(rating, setRating, hoverRating)}
                </div>
                <p className="text-center text-gray-500 mt-2">
                  {rating > 0 ? `${rating} out of 5 stars` : 'Click to rate'}
                </p>
              </div>

              {/* Service Speed Rating */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Service Quality
                  </label>
                  <div className="flex justify-center p-4 bg-gray-50 rounded-xl">
                    {renderStars(serviceRating, setServiceRating)}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Queue Speed
                  </label>
                  <div className="flex justify-center p-4 bg-gray-50 rounded-xl">
                    {renderStars(speedRating, setSpeedRating)}
                  </div>
                </div>
              </div>

              {/* Comment */}
              <div className="mb-6">
                <label className="block text-lg font-medium text-gray-800 mb-3">
                  Share your thoughts (optional)
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Tell us about your experience..."
                  rows="4"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <p className="text-sm text-gray-500 mt-2">
                  {comment.length}/500 characters
                </p>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={rating === 0}
                className={`w-full py-4 rounded-xl font-medium text-lg transition-all flex items-center justify-center gap-2 ${
                  rating === 0
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-black text-white hover:bg-gray-800 hover:shadow-lg hover:scale-105'
                }`}
              >
                <Send className="w-5 h-5" />
                Submit Review
              </button>
            </div>

            {/* Quick Tips */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-100">
              <h3 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                <ThumbsUp className="w-5 h-5" />
                Tips for helpful reviews:
              </h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Be specific about what you liked or didn't like</li>
                <li>• Mention the quality of products or service</li>
                <li>• Share your experience with the queue system</li>
                <li>• Help others make informed decisions</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}