// lib/categoryConfig.js - MERGED: Retail from Change 2, Others from Change 1

export const BUSINESS_CATEGORIES = {
  // 1. RETAIL STORE - FROM CHANGE 2 (Streamlined Categories with Dynamic Tag Filtering)
  retail: {
    id: 'retail',
    name: 'Retail Store',
    icon: '🛒',
    color: '#3B82F6',
    gradient: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
    hasProducts: true,
    fields: {
      basic: ['name', 'price', 'stock'],
      specific: [
        // ALWAYS SHOW - Sub-Category (dynamic based on category)
        {
          name: 'subCategory',
          label: 'Sub-Category',
          type: 'select_dynamic',
          dependsOn: 'category',
          required: false,
          showForCategories: 'all',
          optionsMap: {
            // FOOD & BEVERAGES (Reduced)
            'Dairy & Bakery': ['Milk & Cream', 'Butter & Cheese', 'Yogurt & Curd', 'Paneer', 'Bread', 'Cakes & Pastries', 'Eggs'],
            'Beverages': ['Soft Drinks', 'Juices', 'Tea & Coffee', 'Energy Drinks', 'Water', 'Health Drinks'],
            
            // ELECTRONICS
            'Electronics': ['Mobile & Accessories', 'Laptops', 'Audio', 'Cameras', 'Gaming', 'Smart Devices', 'Power Banks', 'Cables & Chargers'],
            
            // FASHION
            'Clothing': ['Men', 'Women', 'Kids', 'Ethnic Wear', 'Western Wear', 'Inner Wear', 'Winter Wear'],
            'Footwear': ['Men Shoes', 'Women Shoes', 'Kids Shoes', 'Sports Shoes', 'Slippers & Sandals'],
            'Accessories': ['Bags', 'Wallets', 'Belts', 'Watches', 'Jewelry', 'Sunglasses'],
            
            // BOOKS & STATIONERY
            'Books & Stationery': ['Fiction', 'Non-Fiction', 'Educational', 'Notebooks', 'Pens', 'Art Supplies'],
            
            // TOYS & GAMES
            'Toys & Games': ['Action Figures', 'Board Games', 'Educational', 'Outdoor', 'Soft Toys'],
            
            // SPORTS & FITNESS
            'Sports & Fitness': ['Cricket', 'Football', 'Fitness Equipment', 'Cycling', 'Swimming', 'Yoga'],
            
            'Other': []
          },
          placeholder: 'Select sub-category'
        },
        
        // BRAND - Show for most categories
        { 
          name: 'brand', 
          label: 'Brand', 
          type: 'text', 
          placeholder: 'e.g., Parle, Samsung, Nike',
          required: false,
          showForCategories: ['Dairy & Bakery', 'Beverages', 'Electronics', 'Clothing', 
                              'Footwear', 'Accessories', 'Books & Stationery', 
                              'Toys & Games', 'Sports & Fitness']
        },
        
        // WEIGHT - Only for food and beverages
        { 
          name: 'weight', 
          label: 'Weight/Volume/Size', 
          type: 'text', 
          placeholder: 'e.g., 500g, 1L, 200ml',
          required: false,
          showForCategories: ['Dairy & Bakery', 'Beverages']
        },
        
        // SIZE - Only for clothing, footwear
        {
          name: 'size',
          label: 'Size',
          type: 'select',
          required: false,
          showForCategories: ['Clothing', 'Footwear'],
          options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Free Size'],
          placeholder: 'Select size'
        },
        
        // UNIT - For food and groceries
        {
          name: 'unit',
          label: 'Unit of Measurement',
          type: 'select',
          required: false,
          showForCategories: ['Dairy & Bakery', 'Beverages'],
          options: ['piece', 'kg', 'g', 'L', 'mL', 'dozen', 'pack', 'box', 'set', 'bundle'],
          placeholder: 'Select unit'
        },
        
        // COLOR - For clothing, footwear, accessories
        {
          name: 'color',
          label: 'Color',
          type: 'text',
          required: false,
          showForCategories: ['Clothing', 'Footwear', 'Accessories'],
          placeholder: 'e.g., Red, Blue, Black'
        },
        
        // MATERIAL - For clothing, footwear
        {
          name: 'material',
          label: 'Material',
          type: 'select',
          required: false,
          showForCategories: ['Clothing', 'Footwear'],
          options: ['Cotton', 'Polyester', 'Silk', 'Wool', 'Leather', 'Synthetic'],
          placeholder: 'Select material'
        },
        
        // EXPIRY DATE - For food items
        {
          name: 'expiryDate',
          label: 'Expiry/Best Before Date',
          type: 'date',
          required: false,
          showForCategories: ['Dairy & Bakery', 'Beverages'],
          placeholder: 'Select date'
        },
        
        // MANUFACTURING DATE - For food items
        {
          name: 'mfgDate',
          label: 'Manufacturing Date',
          type: 'date',
          required: false,
          showForCategories: ['Dairy & Bakery', 'Beverages'],
          placeholder: 'Select date'
        },
        
        // STORAGE INSTRUCTIONS - For food
        {
          name: 'storage',
          label: 'Storage Instructions',
          type: 'select',
          required: false,
          showForCategories: ['Dairy & Bakery', 'Beverages'],
          options: ['Store in cool dry place', 'Refrigerate after opening', 'Keep frozen', 'Keep refrigerated', 'Room temperature'],
          placeholder: 'Select storage type'
        },
        
        // MRP - For all categories
        { 
          name: 'mrp', 
          label: 'MRP (Maximum Retail Price)', 
          type: 'number', 
          placeholder: 'Original price',
          required: false,
          showForCategories: 'all'
        },
        
        // WARRANTY - For electronics
        {
          name: 'warranty',
          label: 'Warranty Period',
          type: 'select',
          required: false,
          showForCategories: ['Electronics'],
          options: ['No Warranty', '6 Months', '1 Year', '2 Years', '3 Years', '5 Years'],
          placeholder: 'Select warranty'
        },
        
        // TAGS - Category-specific (handled dynamically in getTagOptionsForCategory)
        {
          name: 'tags',
          label: 'Product Tags',
          type: 'multiselect',
          required: false,
          showForCategories: 'all'
        },
        
        // DESCRIPTION - For all categories
        {
          name: 'description',
          label: 'Product Description',
          type: 'textarea',
          required: false,
          showForCategories: 'all',
          placeholder: 'Enter detailed product description',
          rows: 3
        }
      ]
    },
    categories: [
      // FOOD & GROCERIES (Reduced)
      'Dairy & Bakery', 
      'Beverages',
      
      // ELECTRONICS
      'Electronics',
      
      // FASHION
      'Clothing',
      'Footwear',
      'Accessories',
      
      // OTHERS
      'Books & Stationery',
      'Toys & Games',
      'Sports & Fitness',
      'Other'
    ],
    metrics: ['sales', 'revenue', 'stock', 'lowStock']
  },

  // 2. RESTAURANT - FROM CHANGE 1 (FIXED)
  restaurant: {
    id: 'restaurant',
    name: 'Restaurant',
    icon: '🍽️',
    color: '#EF4444',
    gradient: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
    hasProducts: true,
    fields: {
      basic: ['name', 'price'],
      specific: [
        // ✅ FIXED: Item Type selection (Food/Drink) - FIRST
        { 
          name: 'itemType', 
          label: 'Item Type', 
          type: 'select', 
          options: ['Food', 'Drink'],
          required: true,
          placeholder: 'Select Food or Drink'
        },
        // ✅ FIXED: Size depends on itemType selection
        { 
          name: 'size', 
          label: 'Size', 
          type: 'select_dynamic',
          dependsOn: 'itemType',
          optionsMap: {
            'Food': ['Half', 'Full'],
            'Drink': ['Small', 'Medium', 'Large']
          },
          placeholder: 'Select size'
        },
        { 
          name: 'mrp', 
          label: 'MRP', 
          type: 'number', 
          placeholder: 'Menu Price' 
        },
        { 
          name: 'stock', 
          label: 'Daily Stock (Optional)', 
          type: 'number', 
          placeholder: 'Leave 0 for unlimited' 
        }
      ]
    },
    categories: ['Appetizer', 'Main Course', 'Dessert', 'Beverage', 'Snacks', 'Salads', 'Soups', 'Bread'],
    metrics: ['orders', 'revenue', 'popular', 'outOfStock']
  },

  // 3. CAFÉ - FROM CHANGE 1 (Same as Restaurant, FIXED)
  café: {
    id: 'café',
    name: 'Café',
    icon: '☕',
    color: '#8B4513',
    gradient: 'linear-gradient(135deg, #8B4513 0%, #654321 100%)',
    hasProducts: true,
    fields: {
      basic: ['name', 'price'],
      specific: [
        // ✅ FIXED: Item Type selection (Food/Drink) - FIRST
        { 
          name: 'itemType', 
          label: 'Item Type', 
          type: 'select', 
          options: ['Food', 'Drink'],
          required: true,
          placeholder: 'Select Food or Drink'
        },
        // ✅ FIXED: Size depends on itemType selection
        { 
          name: 'size', 
          label: 'Size', 
          type: 'select_dynamic',
          dependsOn: 'itemType',
          optionsMap: {
            'Food': ['Half', 'Full'],
            'Drink': ['Small', 'Medium', 'Large']
          },
          placeholder: 'Select size'
        },
        { 
          name: 'mrp', 
          label: 'MRP', 
          type: 'number', 
          placeholder: 'Menu Price' 
        },
        { 
          name: 'stock', 
          label: 'Daily Stock (Optional)', 
          type: 'number', 
          placeholder: 'Leave 0 for unlimited' 
        }
      ]
    },
    categories: ['Coffee', 'Tea', 'Smoothies', 'Pastries', 'Sandwiches', 'Snacks', 'Desserts'],
    metrics: ['orders', 'revenue', 'popular', 'outOfStock']
  },

  // 4. BAKERY - FROM CHANGE 1 (Same as Retail)
  bakery: {
    id: 'bakery',
    name: 'Bakery',
    icon: '🥐',
    color: '#F59E0B',
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    hasProducts: true,
    fields: {
      basic: ['name', 'price', 'stock'],
      specific: [
        { name: 'brand', label: 'Baker/Brand', type: 'text', placeholder: 'e.g., In-house, Special' },
        { name: 'weight', label: 'Weight', type: 'text', placeholder: 'e.g., 500g, 1kg' },
        { name: 'mrp', label: 'MRP', type: 'number', placeholder: 'Maximum Retail Price' }
      ]
    },
    categories: ['Bread', 'Pastries', 'Cakes', 'Cookies', 'Muffins', 'Donuts', 'Savory Items', 'Desserts'],
    metrics: ['sales', 'revenue', 'stock', 'freshness']
  },

  // 5. CLINIC - FROM CHANGE 1 (NO PRODUCTS - Queue Only)
  clinic: {
    id: 'clinic',
    name: 'Clinic',
    icon: '🏥',
    color: '#10B981',
    gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    hasProducts: false,
    fields: {
      basic: [],
      specific: []
    },
    categories: [],
    metrics: ['appointments', 'waitTime', 'patientsServed']
  },

  // 6. LAB - FROM CHANGE 1 (Has Tests)
  lab: {
    id: 'lab',
    name: 'Lab',
    icon: '🧪',
    color: '#8B5CF6',
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
    hasProducts: true,
    fields: {
      basic: ['name', 'price'],
      specific: [
        { name: 'testName', label: 'Test Name', type: 'text', placeholder: 'e.g., Complete Blood Count' },
        { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Test details and requirements' },
        { name: 'reportTime', label: 'Report Time', type: 'text', placeholder: 'e.g., Same Day, 24 hours' }
      ]
    },
    categories: ['Blood Tests', 'Urine Tests', 'X-Ray', 'Ultrasound', 'ECG', 'Pathology', 'Radiology', 'Other'],
    metrics: ['testsCompleted', 'revenue', 'pendingReports']
  },

  // 7. SALON - FROM CHANGE 1 (NO PRODUCTS - Queue Only)
  salon: {
    id: 'salon',
    name: 'Salon',
    icon: '💇',
    color: '#EC4899',
    gradient: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
    hasProducts: false,
    fields: {
      basic: [],
      specific: []
    },
    categories: [],
    metrics: ['appointments', 'waitTime', 'customersServed']
  }
};

// Helper function to get category config
export const getCategoryConfig = (storeType) => {
  const normalizedType = storeType?.toLowerCase() || 'retail';
  return BUSINESS_CATEGORIES[normalizedType] || BUSINESS_CATEGORIES.retail;
};

// Helper function to check if shop has products
export const hasProductsFeature = (storeType) => {
  const config = getCategoryConfig(storeType);
  return config.hasProducts === true;
};

// Helper function to get all category IDs
export const getAllCategoryIds = () => {
  return Object.keys(BUSINESS_CATEGORIES);
};

// Check if store type supports variants
export const supportsVariants = (storeType) => {
  const normalizedType = storeType?.toLowerCase();
  return normalizedType === 'café' || normalizedType === 'restaurant';
};

// Get fields for specific category
export const getFieldsForCategory = (storeType, category) => {
  const config = getCategoryConfig(storeType);
  if (!config?.fields?.specific) return [];
  
  return config.fields.specific.filter(field => {
    if (!field.showForCategories) return true;
    if (field.showForCategories === 'all') return true;
    if (Array.isArray(field.showForCategories)) {
      return field.showForCategories.includes(category);
    }
    return true;
  });
};

// ✅ Get category-specific tag options (FROM CHANGE 2)
export const getTagOptionsForCategory = (category) => {
  const tagsByCategory = {
    'Dairy & Bakery': ['Fresh', 'Organic', 'Vegan', 'Gluten-Free', 'Sugar-Free', 'Low Fat', 'Best Seller', 'New Arrival', 'On Sale'],
    'Beverages': ['Sugar-Free', 'Organic', 'Energy Boost', 'Healthy', 'Best Seller', 'New Arrival', 'On Sale', 'Limited Edition'],
    'Electronics': ['New Arrival', 'Best Seller', 'Premium', 'Budget-Friendly', 'On Sale', 'Limited Edition', 'Smart', 'Wireless'],
    'Clothing': ['New Arrival', 'Best Seller', 'Premium', 'Budget-Friendly', 'On Sale', 'Limited Edition', 'Eco-Friendly', 'Handmade', 'Trending'],
    'Footwear': ['New Arrival', 'Best Seller', 'Premium', 'Budget-Friendly', 'On Sale', 'Limited Edition', 'Comfortable', 'Waterproof'],
    'Accessories': ['New Arrival', 'Best Seller', 'Premium', 'Budget-Friendly', 'On Sale', 'Limited Edition', 'Handmade', 'Eco-Friendly'],
    'Books & Stationery': ['New Arrival', 'Best Seller', 'Premium', 'Budget-Friendly', 'On Sale', 'Educational', 'Popular'],
    'Toys & Games': ['New Arrival', 'Best Seller', 'Premium', 'Budget-Friendly', 'On Sale', 'Educational', 'Age 3+', 'Age 6+', 'Age 12+'],
    'Sports & Fitness': ['New Arrival', 'Best Seller', 'Premium', 'Budget-Friendly', 'On Sale', 'Professional', 'Beginner-Friendly'],
    'Other': ['New Arrival', 'Best Seller', 'On Sale', 'Premium', 'Budget-Friendly']
  };
  
  return tagsByCategory[category] || tagsByCategory['Other'];
};

// Product emoji mapper by category
export const getProductEmoji = (category, storeType) => {
  const emojiMap = {
    retail: {
      'Dairy & Bakery': '🥛', 
      'Beverages': '🥤',
      'Electronics': '📱',
      'Clothing': '👕',
      'Footwear': '👟',
      'Accessories': '👜',
      'Books & Stationery': '📚',
      'Toys & Games': '🧸',
      'Sports & Fitness': '⚽',
      'Other': '📦'
    },
    restaurant: {
      'Appetizer': '🍢', 'Main Course': '🍛', 'Dessert': '🍮', 'Beverage': '🥤',
      'Snacks': '🍿', 'Salads': '🥗', 'Soups': '🍲', 'Bread': '🫓'
    },
    café: {
      'Coffee': '☕', 'Tea': '🍵', 'Smoothies': '🥤', 'Pastries': '🥐',
      'Sandwiches': '🥪', 'Snacks': '🍪', 'Desserts': '🍰'
    },
    bakery: {
      'Bread': '🍞', 'Pastries': '🥐', 'Cakes': '🎂', 'Cookies': '🍪',
      'Muffins': '🧁', 'Donuts': '🍩', 'Savory Items': '🥧', 'Desserts': '🍰'
    },
    lab: {
      'Blood Tests': '💉', 'Urine Tests': '🧪', 'X-Ray': '🩻', 'Ultrasound': '📡',
      'ECG': '💓', 'Pathology': '🔬', 'Radiology': '☢️', 'Other': '⚕️'
    }
  };

  const typeMap = emojiMap[storeType] || {};
  return typeMap[category] || '📦';
};

// Auto-determine stock status for restaurant/cafe items
export const getStockStatus = (product, storeType) => {
  if (storeType === 'restaurant' || storeType === 'café') {
    // If stock is null, undefined, or 0 - check if it's unlimited
    if (product.stock === null || product.stock === undefined || product.stock === 0) {
      // If metadata has stock as 0, it's unlimited
      if (product.metadata?.stock === 0) {
        return 'available';
      }
      // Otherwise, out of stock
      return 'out_of_stock';
    }
    // If stock > 0, available
    return 'available';
  }

  // For retail/bakery/lab - check stock normally
  if (product.stock === 0) {
    return 'out_of_stock';
  }
  if (product.stock <= (product.low_stock_threshold || 10)) {
    return 'low_stock';
  }
  return 'in_stock';
};

// ✅ Format product display info based on store type (UPDATED FROM CHANGE 2)
export const formatProductInfo = (product, storeType) => {
  const metadata = product.metadata || {};
  const config = getCategoryConfig(storeType);
  
  let additionalInfo = [];
  
  if (storeType === 'restaurant' || storeType === 'café') {
    // Show: Type (Food/Drink) | Size (Half/Full or S/M/L)
    if (metadata.itemType) {
      additionalInfo.push(`${metadata.itemType}`);
    }
    if (metadata.size) {
      additionalInfo.push(`${metadata.size}`);
    }
  } else if (storeType === 'retail') {
    // Show: Brand | Weight/Size | SubCategory | Tags | Expiry
    if (metadata.brand) {
      additionalInfo.push(`${metadata.brand}`);
    }
    if (metadata.weight) {
      additionalInfo.push(`${metadata.weight}`);
    } else if (metadata.size) {
      additionalInfo.push(`Size: ${metadata.size}`);
    }
    if (metadata.unit) {
      additionalInfo.push(`${metadata.unit}`);
    }
    if (metadata.color) {
      additionalInfo.push(metadata.color);
    }
    if (metadata.subCategory) {
      additionalInfo.push(metadata.subCategory);
    }
    if (metadata.tags && metadata.tags.length > 0) {
      additionalInfo.push(metadata.tags.slice(0, 2).join(', '));
    }
    if (metadata.expiryDate) {
      const expiry = new Date(metadata.expiryDate);
      const today = new Date();
      const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
      if (daysLeft > 0 && daysLeft <= 30) {
        additionalInfo.push(`⏰ Expires in ${daysLeft} days`);
      }
    }
  } else if (storeType === 'bakery') {
    // Show: Brand | Weight
    if (metadata.brand) {
      additionalInfo.push(`${metadata.brand}`);
    }
    if (metadata.weight) {
      additionalInfo.push(`${metadata.weight}`);
    }
  } else if (storeType === 'lab') {
    // Show: Report Time
    if (metadata.reportTime) {
      additionalInfo.push(`Report: ${metadata.reportTime}`);
    }
  }
  
  return additionalInfo.join(' • ');
};