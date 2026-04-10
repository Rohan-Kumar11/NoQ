// lib/api/orders.js - COMPLETE WITH ALL FUNCTIONS
import { supabase } from '../supabase/client';
import { updateProductStock } from './products';

/**
 * Generate a unique order number
 */
function generateOrderNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `ORD-${year}${month}${day}-${random}`;
}

/**
 * Generate a unique transaction ID
 */
function generateTransactionId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `TXN-${timestamp}-${random}`;
}

/**
 * ✅ FIXED: Verify and ensure customer profile AND customers entry exists
 */
async function ensureCustomerExists(userId) {
  try {
    console.log('=== ENSURING CUSTOMER EXISTS ===');
    console.log('Checking for user:', userId);

    // Step 1: Check if profile exists
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('id, user_type, full_name, phone')
      .eq('id', userId)
      .maybeSingle();

    let profile = existingProfile;

    // Create profile if it doesn't exist
    if (!existingProfile) {
      console.log('Profile not found, creating...');

      // Get email from auth
      const { data: { user } } = await supabase.auth.getUser();

      const { data: newProfile, error: createProfileError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          user_type: 'customer',
          full_name: user?.email?.split('@')[0] || 'Customer',
          phone: user?.phone || null
        })
        .select()
        .single();

      if (createProfileError) {
        console.error('Error creating profile:', createProfileError);
        throw new Error(`Failed to create profile: ${createProfileError.message}`);
      }

      console.log('Profile created:', newProfile);
      profile = newProfile;
    } else {
      console.log('Profile exists:', existingProfile);
    }

    // Step 2: Check if customers entry exists
    const { data: existingCustomer, error: customerCheckError } = await supabase
      .from('customers')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    // Create customer entry if it doesn't exist
    if (!existingCustomer) {
      console.log('Customer entry not found, creating...');

      const { data: newCustomer, error: createCustomerError } = await supabase
        .from('customers')
        .insert({
          id: userId,
          preferred_service: null,
          notification_preferences: {
            email: true,
            sms: false,
            push: true
          }
        })
        .select()
        .single();

      if (createCustomerError) {
        console.error('Error creating customer:', createCustomerError);
        throw new Error(`Failed to create customer entry: ${createCustomerError.message}`);
      }

      console.log('Customer entry created:', newCustomer);
    } else {
      console.log('Customer entry exists:', existingCustomer);
    }

    console.log('=== CUSTOMER VERIFICATION COMPLETE ===');
    return { data: profile, error: null };

  } catch (error) {
    console.error('Error in ensureCustomerExists:', error);
    return { data: null, error: error.message };
  }
}

/**
 * ✅ FIXED: Extract size from variants
 */
function extractSizeFromItem(item) {
  // Direct properties
  let selectedSize = item.selectedSize || item.size || null;
  
  // From metadata
  if (!selectedSize && item.metadata?.selectedSize) {
    selectedSize = item.metadata.selectedSize;
  }
  
  // ✅ NEW: Extract from variants
  if (!selectedSize && item.metadata?.variants) {
    const variants = item.metadata.variants;
    if (Array.isArray(variants)) {
      if (variants.length === 1) {
        selectedSize = variants[0].size;
      } else {
        // Find variant matching the price
        const matchingVariant = variants.find(v => 
          parseFloat(v.price) === parseFloat(item.price)
        );
        if (matchingVariant) selectedSize = matchingVariant.size;
      }
    }
  }
  
  return selectedSize;
}

/**
 * Create order - STEP 1: Create pending order and transaction
 */
export async function createOrder({
  storeId,
  customerId,
  items,
  paymentMethod = 'UPI',
  subtotal,
  tax,
  discount = 0,
  total,
  customerNotes = ''
}) {
  try {
    console.log('=== CREATE ORDER API CALLED ===');
    console.log('Input params:', { storeId, customerId, itemsCount: items?.length, total });

    // Validate required fields
    if (!storeId || !customerId || !items || items.length === 0) {
      throw new Error('Missing required order information');
    }

    // Validate numeric values
    if (isNaN(subtotal) || isNaN(tax) || isNaN(total)) {
      throw new Error('Invalid numeric values for order totals');
    }

    // ✅ CRITICAL: Ensure both profile and customer entry exist
    const { data: customerData, error: customerError } = await ensureCustomerExists(customerId);
    if (customerError) {
      throw new Error(`Customer verification failed: ${customerError}`);
    }
    console.log('✅ Customer verified:', customerData.id);

    // Check stock availability
    for (const item of items) {
      if (!item.productId) {
        throw new Error(`Item ${item.name} is missing product ID`);
      }

      const { data: product, error: productError } = await supabase
        .from('products')
        .select('stock, name, is_active')
        .eq('id', item.productId)
        .single();

      if (productError) {
        console.error('Product fetch error:', productError);
        throw new Error(`Product not found: ${item.name}`);
      }

      if (!product.is_active) {
        throw new Error(`Product ${product.name} is no longer available`);
      }

      if (product.stock < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}`);
      }
    }

    // Generate IDs
    const orderNumber = generateOrderNumber();
    const transactionId = generateTransactionId();
    const orderedAt = new Date().toISOString();

    console.log('Generated:', { orderNumber, transactionId });

    // ✅ FIXED: Format items with proper size extraction
    const formattedItems = items.map(item => {
      const selectedSize = extractSizeFromItem(item);
      
      console.log('📦 Formatting item:', {
        name: item.name,
        extractedSize: selectedSize,
        hasVariants: item.metadata?.hasVariants
      });
      
      return {
        productId: item.productId,
        name: item.name,
        price: parseFloat(item.price),
        quantity: parseInt(item.quantity),
        category: item.category || 'General',
        image: item.image || '📦',
        image_url: item.image_url || null,
        selectedSize: selectedSize,  // ✅ TOP LEVEL
        size: selectedSize,          // ✅ ALIAS
        metadata: {
          selectedSize: selectedSize,
          image_url: item.image_url || null,
          hasVariants: item.metadata?.hasVariants || false,
          variants: item.metadata?.variants || []
        }
      };
    });

    console.log('📋 Formatted items with sizes:', formattedItems.map(i => ({
      name: i.name,
      size: i.selectedSize
    })));

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        store_id: storeId,
        customer_id: customerId,
        items: formattedItems,
        subtotal: parseFloat(subtotal),
        tax: parseFloat(tax),
        discount: parseFloat(discount),
        total_amount: parseFloat(total),
        order_status: 'pending',
        payment_status: 'pending',
        payment_method: paymentMethod.toUpperCase(),
        ordered_at: orderedAt,
        customer_notes: customerNotes || ''
      })
      .select()
      .single();

    if (orderError) {
      console.error('Order insert error:', orderError);
      throw new Error(`Failed to create order: ${orderError.message}`);
    }

    console.log('✅ Order created with sizes:', order.id);

    // Create transaction
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .insert({
        transaction_id: transactionId,
        order_id: order.id,
        store_id: storeId,
        customer_id: customerId,
        amount: parseFloat(total),
        payment_method: paymentMethod.toUpperCase(),
        status: 'pending',
        initiated_at: orderedAt
      })
      .select()
      .single();

    if (transactionError) {
      console.error('Transaction insert error:', transactionError);

      // Rollback: Delete the order
      await supabase.from('orders').delete().eq('id', order.id);

      throw new Error(`Failed to create transaction: ${transactionError.message}`);
    }

    console.log('✅ Transaction created:', transaction.id);

    return {
      data: {
        order,
        transaction,
        orderNumber,
        transactionId
      },
      error: null
    };
  } catch (error) {
    console.error('❌ Error in createOrder:', error);
    return {
      data: null,
      error: error.message || 'Failed to create order'
    };
  }
}

/**
 * Complete payment and conditionally generate token
 */
export async function completePaymentAndGenerateToken({
  orderId,
  transactionId,
  gatewayTransactionId,
  storeId,
  customerId,
  items,
  totalAmount
}) {
  try {
    console.log('=== COMPLETE PAYMENT API CALLED ===');
    console.log('Input params:', { orderId, transactionId, gatewayTransactionId, customerId });

    if (!orderId || !transactionId || !gatewayTransactionId) {
      throw new Error('Missing required payment information');
    }

    // ✅ CRITICAL: Verify customer exists before creating queue entry
    const { data: customerData, error: customerError } = await ensureCustomerExists(customerId);
    if (customerError) {
      throw new Error(`Customer verification failed: ${customerError}`);
    }
    console.log('✅ Customer verified:', customerData.id);

    const completedAt = new Date().toISOString();

    // Update transaction status
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .update({
        status: 'completed',
        payment_gateway: 'Dummy QR (Demo)',
        gateway_transaction_id: gatewayTransactionId,
        completed_at: completedAt
      })
      .eq('transaction_id', transactionId)
      .select()
      .single();

    if (transactionError) {
      console.error('Transaction update error:', transactionError);
      throw new Error(`Failed to update transaction: ${transactionError.message}`);
    }

    console.log('✅ Transaction updated:', transaction.id);

    // ✅ NEW: Fetch store type to determine flow
    const { data: storeData, error: storeError } = await supabase
      .from('stores_with_features')
      .select('has_products, queue_only, avg_service_time, store_name')
      .eq('id', storeId)
      .single();

    if (storeError) {
      console.error('Store fetch error:', storeError);
      throw new Error(`Failed to fetch store info: ${storeError.message}`);
    }

    const isQueueOnly = storeData?.queue_only === true;
    const hasProducts = storeData?.has_products !== false;

    console.log('🏪 Store type:', { 
      isQueueOnly, 
      hasProducts,
      storeName: storeData.store_name 
    });

    // ✅ NEW: Conditional order status based on store type
    const newOrderStatus = isQueueOnly ? 'confirmed' : 'pending';
    const confirmedAt = isQueueOnly ? completedAt : null;

    console.log('📦 Order will be set to:', newOrderStatus);

    const today = new Date();
    const tokenPrefix = `T${today.getDate()}${today.getMonth() + 1}`;

    // Update order status
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        order_status: newOrderStatus,
        confirmed_at: confirmedAt,
        payment_transaction_id: gatewayTransactionId
      })
      .eq('id', orderId)
      .select()
      .single();

    if (orderError) {
      console.error('Order update error:', orderError);
      throw new Error(`Failed to update order: ${orderError.message}`);
    }

    console.log('✅ Order updated to status:', order.order_status);

    // ✅ NEW: Conditional queue entry creation
    let queueEntry = null;
    let tokenNumber = null;
    let queuePosition = 0;

    if (isQueueOnly) {
      console.log('🎫 Creating queue entry for queue-only store...');

      // Calculate estimated wait time
      const avgServiceTime = storeData?.avg_service_time || 5;

      const { data: queueData } = await supabase
        .from('queue')
        .select('id')
        .eq('store_id', storeId)
        .in('status', ['waiting', 'in_service']);

      queuePosition = (queueData?.length || 0) + 1;
      const estimatedWaitMinutes = queuePosition * avgServiceTime;
      const estimatedTime = new Date(Date.now() + estimatedWaitMinutes * 60000).toISOString();

      console.log('Queue position:', queuePosition, 'Wait time:', estimatedWaitMinutes);

      // Get customer details
      const customerName = customerData.full_name || 'Customer';
      const customerPhone = customerData.phone || null;

      // ✅ FIXED: Format items with sizes for queue
      const queueItems = items.map(item => {
        const selectedSize = extractSizeFromItem(item);
        return {
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          selectedSize: selectedSize,
          size: selectedSize,
          image_url: item.image_url
        };
      });

      // Create queue entry
      const { data: newQueueEntry, error: queueError } = await supabase.rpc(
        'create_queue_entry',
        {
          p_store_id: storeId,
          p_customer_id: customerId,
          p_token_prefix: tokenPrefix,
          p_items: queueItems,
          p_total_amount: totalAmount,
          p_customer_name: customerName,
          p_customer_phone: customerPhone,
          p_estimated_time: estimatedTime,
          p_wait_time_minutes: estimatedWaitMinutes
        }
      );

      if (queueError) {
        throw new Error(`Failed to create queue entry: ${queueError.message}`);
      }

      queueEntry = newQueueEntry;
      tokenNumber = newQueueEntry.token_number;

      // Link order to queue
      await supabase
        .from('orders')
        .update({ queue_id: queueEntry.id })
        .eq('id', orderId);

      console.log('✅ Queue entry created for queue-only store:', tokenNumber);
    } else {
      console.log('⏸️ Product-based store: Queue will be created after seller accepts order');
    }

    // ✅ NEW: Conditional notifications based on store type
    if (isQueueOnly) {
      // Queue-only store: Send token notification
      await createCustomerNotification({
        customerId,
        title: '🎫 Your Token Number',
        message: `Your token is ${tokenNumber}. You're in the queue at ${storeData.store_name}!`,
        type: 'token_generated',
        metadata: {
          order_id: orderId,
          order_number: order.order_number,
          token_number: tokenNumber,
          queue_id: queueEntry.id,
          order_status: 'confirmed',
          payment_status: 'paid',
          store_name: storeData.store_name
        }
      });

      console.log('✅ Token notification sent to customer');
    } else {
      // Product store: Send pending confirmation notification
      await createCustomerNotification({
        customerId,
        title: '⏳ Payment Successful - Awaiting Confirmation',
        message: `Order ${order.order_number} received! ${storeData.store_name} will confirm your order shortly.`,
        type: 'order_pending',
        metadata: {
          order_id: orderId,
          order_number: order.order_number,
          order_status: 'pending',
          payment_status: 'paid',
          total_amount: totalAmount,
          store_name: storeData.store_name
        }
      });

      console.log('✅ Pending confirmation notification sent to customer');
    }

    // Create seller notification
    await createSellerNotification({
      storeId,
      orderId,
      orderNumber: order.order_number,
      totalAmount,
      itemCount: items.length
    });

    console.log('✅ Seller notification sent');
    console.log('=== PAYMENT COMPLETION SUCCESS ===');

    return {
      data: {
        order: { ...order, queue_id: queueEntry?.id || null },
        transaction,
        queueEntry: queueEntry ? { ...queueEntry, position: queuePosition } : null,
        tokenNumber: tokenNumber || null,
        isQueueOnly,
        requiresSellerAcceptance: !isQueueOnly
      },
      error: null
    };
  } catch (error) {
    console.error('❌ Error completing payment:', error);
    return {
      data: null,
      error: error.message || 'Failed to complete payment'
    };
  }
}

/**
 * Helper function to create seller notifications
 */
async function createSellerNotification({ storeId, orderId, orderNumber, totalAmount, itemCount }) {
  try {
    const { data: store } = await supabase
      .from('stores')
      .select('business_id, owner_id')
      .eq('id', storeId)
      .single();

    if (!store || !store.owner_id) return;

    await supabase
      .from('notifications')
      .insert({
        user_id: store.owner_id,
        title: 'New Order Received! 🎉',
        message: `Order ${orderNumber} - ${itemCount} items worth ₹${totalAmount.toFixed(2)}`,
        type: 'order',
        action_url: `/seller/orders`,
        metadata: {
          order_id: orderId,
          order_number: orderNumber,
          amount: totalAmount
        }
      });
  } catch (error) {
    console.error('Error creating seller notification:', error);
  }
}

/**
 * Helper function to create customer notifications
 */
async function createCustomerNotification({ customerId, title, message, type, metadata }) {
  try {
    await supabase
      .from('notifications')
      .insert({
        user_id: customerId,
        title,
        message,
        type,
        metadata
      });
  } catch (error) {
    console.error('Error creating customer notification:', error);
  }
}

/**
 * ✅ Accept order with preparation_end_time for auto-transition
 */
export async function acceptOrder(orderId, preparationTime = 15) {
  try {
    console.log('=== ACCEPT ORDER ===');
    console.log('Order ID:', orderId, 'Prep time:', preparationTime);

    const now = new Date().toISOString();
    
    // ✅ Calculate preparation end time
    const preparationEndTime = new Date(Date.now() + preparationTime * 60000).toISOString();
    const estimatedReadyTime = preparationEndTime;

    console.log('🕐 Preparation will end at:', preparationEndTime);

    // Fetch full order details
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*, queue_id, customer_id, order_number, total_amount, payment_status, store_id, items')
      .eq('id', orderId)
      .single();

    if (fetchError) {
      console.error('Order fetch error:', fetchError);
      throw fetchError;
    }

    console.log('📦 Order fetched:', order.order_number);

    const needsQueueEntry = !order.queue_id;

    // ✅ Update order with preparation_end_time
    const { data: updatedOrder, error: orderError } = await supabase
      .from('orders')
      .update({
        order_status: 'preparing',
        confirmed_at: now,
        preparation_end_time: preparationEndTime,
        updated_at: now
      })
      .eq('id', orderId)
      .select()
      .single();

    if (orderError) {
      console.error('Order update error:', orderError);
      throw orderError;
    }

    console.log('✅ Order status updated to "preparing" with end time:', preparationEndTime);

    // Create queue entry for product-based stores
    if (needsQueueEntry) {
      console.log('🎫 Creating queue entry for accepted product-based order...');

      const { data: store } = await supabase
        .from('stores')
        .select('avg_service_time, store_name')
        .eq('id', order.store_id)
        .single();

      const avgServiceTime = store?.avg_service_time || 5;

      const { data: queueData } = await supabase
        .from('queue')
        .select('id')
        .eq('store_id', order.store_id)
        .in('status', ['waiting', 'in_service']);

      const queuePosition = (queueData?.length || 0) + 1;
      const estimatedWaitMinutes = preparationTime || (queuePosition * avgServiceTime);
      const estimatedTime = new Date(Date.now() + estimatedWaitMinutes * 60000).toISOString();

      const { data: customer } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', order.customer_id)
        .single();

      const customerName = customer?.full_name || 'Customer';
      const customerPhone = customer?.phone || null;

      const today = new Date();
      const tokenPrefix = `T${today.getDate()}${today.getMonth() + 1}`;

      // ✅ FIXED: Format items with sizes for queue
      const queueItems = (order.items || []).map(item => {
        const selectedSize = extractSizeFromItem(item);
        return {
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          selectedSize: selectedSize,
          size: selectedSize,
          image_url: item.image_url
        };
      });

      const { data: queueEntry, error: queueError } = await supabase.rpc(
        'create_queue_entry',
        {
          p_store_id: order.store_id,
          p_customer_id: order.customer_id,
          p_token_prefix: tokenPrefix,
          p_items: queueItems,
          p_total_amount: order.total_amount,
          p_customer_name: customerName,
          p_customer_phone: customerPhone,
          p_estimated_time: estimatedTime,
          p_wait_time_minutes: estimatedWaitMinutes
        }
      );

      if (queueError) {
        console.error('Queue creation error:', queueError);
        console.warn('⚠️ Order accepted but queue entry failed');
      } else {
        await supabase
          .from('orders')
          .update({ queue_id: queueEntry.id })
          .eq('id', orderId);

        await supabase
          .from('queue')
          .update({
            status: 'waiting',
            estimated_time: estimatedTime,
            wait_time_minutes: estimatedWaitMinutes,
            updated_at: now
          })
          .eq('id', queueEntry.id);

        const { data: currentServing } = await supabase
          .from('queue')
          .select('id')
          .eq('store_id', order.store_id)
          .eq('status', 'in_service')
          .maybeSingle();

        if (!currentServing) {
          await supabase
            .from('queue')
            .update({
              status: 'in_service',
              service_started_at: now,
              actual_wait_start: now,
              updated_at: now
            })
            .eq('id', queueEntry.id);
        }

        await createCustomerNotification({
          customerId: order.customer_id,
          title: '🎫 Order Accepted - Token Generated',
          message: `Your order #${order.order_number} is accepted! Your token: ${queueEntry.token_number}. Will be ready in ~${estimatedWaitMinutes} min.`,
          type: 'order_accepted',
          metadata: {
            order_id: orderId,
            order_number: order.order_number,
            status: 'preparing',
            order_status: 'preparing',
            payment_status: order.payment_status,
            preparation_time: estimatedWaitMinutes,
            preparation_end_time: preparationEndTime,
            total_amount: order.total_amount,
            estimated_ready_time: estimatedTime,
            token_number: queueEntry.token_number,
            queue_id: queueEntry.id,
            auto_ready_enabled: true
          }
        });
      }
    } else {
      await supabase
        .from('queue')
        .update({
          status: 'waiting',
          estimated_time: estimatedReadyTime,
          wait_time_minutes: preparationTime,
          updated_at: now
        })
        .eq('id', order.queue_id);

      await createCustomerNotification({
        customerId: order.customer_id,
        title: '✅ Order Accepted!',
        message: `Your order #${order.order_number} is being prepared. Will be ready in ~${preparationTime} minutes`,
        type: 'order_accepted',
        metadata: {
          order_id: orderId,
          order_number: order.order_number,
          status: 'preparing',
          order_status: 'preparing',
          payment_status: order.payment_status,
          preparation_time: preparationTime,
          preparation_end_time: preparationEndTime,
          total_amount: order.total_amount,
          estimated_ready_time: estimatedReadyTime,
          auto_ready_enabled: true
        }
      });
    }

    console.log('=== ACCEPT ORDER COMPLETE ===');
    return { data: updatedOrder, error: null };
  } catch (error) {
    console.error('❌ Error accepting order:', error);
    return { data: null, error: error.message || 'Failed to accept order' };
  }
}

/**
 * ✅ Reject/Cancel order with refund_pending status
 */
export async function rejectOrder(orderId, reason = 'Out of stock') {
  try {
    console.log('=== REJECT ORDER ===');
    console.log('Order ID:', orderId, 'Reason:', reason);

    const now = new Date().toISOString();

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*, queue_id, customer_id, order_number, total_amount')
      .eq('id', orderId)
      .single();

    if (fetchError) {
      console.error('Order fetch error:', fetchError);
      throw fetchError;
    }

    const { data: updatedOrder, error: orderError } = await supabase
      .from('orders')
      .update({
        order_status: 'cancelled',
        payment_status: 'refund_pending',
        cancelled_at: now,
        cancellation_reason: reason,
        updated_at: now
      })
      .eq('id', orderId)
      .select()
      .single();

    if (orderError) {
      console.error('Order cancellation error:', orderError);
      throw orderError;
    }

    if (order.queue_id) {
      await supabase
        .from('queue')
        .update({
          status: 'cancelled',
          updated_at: now
        })
        .eq('id', order.queue_id);
    }

    await createCustomerNotification({
      customerId: order.customer_id,
      title: '❌ Order Cancelled',
      message: `Order #${order.order_number} was cancelled. Reason: ${reason}. Your payment will be refunded soon.`,
      type: 'order_cancelled',
      metadata: {
        order_id: orderId,
        order_number: order.order_number,
        order_status: 'cancelled',
        payment_status: 'refund_pending',
        reason,
        total_amount: order.total_amount
      }
    });

    return { data: updatedOrder, error: null };
  } catch (error) {
    console.error('❌ Error rejecting order:', error);
    return { data: null, error: error.message || 'Failed to reject order' };
  }
}

/**
 * Mark order as ready for pickup
 */
export async function markOrderReady(orderId) {
  try {
    console.log('=== MARK ORDER READY ===');
    console.log('Order ID:', orderId);

    const now = new Date().toISOString();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .update({
        order_status: 'ready',
        updated_at: now
      })
      .eq('id', orderId)
      .select('*, queue_id, customer_id, order_number, queue(token_number), total_amount, payment_status')
      .single();

    if (orderError) {
      console.error('Order update error:', orderError);
      throw orderError;
    }

    if (order.queue_id) {
      await supabase
        .from('queue')
        .update({
          status: 'ready',
          notified_at: now,
          updated_at: now
        })
        .eq('id', order.queue_id);
    }

    const tokenNumber = order.queue?.token_number || 'your token';

    await createCustomerNotification({
      customerId: order.customer_id,
      title: '🎉 Order Ready!',
      message: `Order #${order.order_number} ready! Show token ${tokenNumber} to collect.`,
      type: 'order_ready',
      metadata: {
        order_id: orderId,
        order_number: order.order_number,
        token_number: tokenNumber,
        order_status: 'ready',
        payment_status: order.payment_status,
        total_amount: order.total_amount
      }
    });

    return { data: order, error: null };
  } catch (error) {
    console.error('❌ Error marking order ready:', error);
    return { data: null, error: error.message || 'Failed to mark order ready' };
  }
}
// FIXED: completeOrderWithToken function with proper stock update

export async function completeOrderWithToken(orderId, enteredToken) {
  try {
    console.log('=== COMPLETE ORDER WITH TOKEN ===');
    console.log('Order ID:', orderId);
    console.log('Entered Token:', enteredToken);

    const now = new Date().toISOString();

    // Fetch order with queue info
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*, queue(token_number, id), customer_id, order_number, items, queue_id, total_amount, payment_status')
      .eq('id', orderId)
      .single();

    if (fetchError) {
      console.error('❌ Error fetching order:', fetchError);
      throw fetchError;
    }

    console.log('Order fetched:', {
      order_number: order.order_number,
      items_count: order.items?.length,
      queue_token: order.queue?.token_number
    });

    // Verify token
    const actualToken = order.queue?.token_number;

    if (!actualToken) {
      throw new Error('No token found for this order');
    }

    if (actualToken.trim() !== enteredToken.trim()) {
      throw new Error('Invalid token number. Please check and try again.');
    }

    console.log('✅ Token verified successfully');

    // ✅ CRITICAL FIX: Update stock for each item
    if (order.items && order.items.length > 0) {
      console.log('📦 Updating stock for', order.items.length, 'items...');
      
      const stockUpdatePromises = order.items.map(async (item) => {
        console.log('  Processing item:', {
          name: item.name,
          productId: item.productId,
          quantity: item.quantity,
          selectedSize: item.selectedSize || item.size || item.metadata?.selectedSize
        });
        
        // ✅ Extract size from all possible locations
        const selectedSize = item.selectedSize || 
                           item.size || 
                           item.metadata?.selectedSize || 
                           null;
        
        // ✅ Call updateProductStock with size parameter
        const result = await updateProductStock(item.productId, item.quantity, selectedSize);
        
        if (result.error) {
          console.error(`  ❌ Failed to update stock for ${item.name}:`, result.error);
        } else {
          console.log(`  ✅ Stock updated for ${item.name}`);
        }
        
        return result;
      });
      
      const results = await Promise.all(stockUpdatePromises);
      
      // Check for errors
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        console.error('⚠️ Some stock updates failed:', errors);
        // Continue anyway - we don't want to block order completion
      } else {
        console.log('✅ All stock updates completed successfully');
      }
    } else {
      console.log('ℹ️ No items to update stock for');
    }

    // Update order status to completed
    console.log('Updating order status to completed...');
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        order_status: 'completed',
        completed_at: now,
        updated_at: now
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error updating order status:', updateError);
      throw updateError;
    }

    console.log('✅ Order status updated to completed');

    // Update queue status
    if (order.queue_id) {
      console.log('Updating queue status...');
      await supabase
        .from('queue')
        .update({
          status: 'completed',
          service_completed_at: now,
          updated_at: now
        })
        .eq('id', order.queue_id);
      console.log('✅ Queue status updated');
    }

    // Send notification to customer
    console.log('Sending completion notification to customer...');
    await createCustomerNotification({
      customerId: order.customer_id,
      title: '✅ Order Completed!',
      message: `Thank you! Order #${order.order_number} completed. See you again!`,
      type: 'order_completed',
      metadata: {
        order_id: orderId,
        order_number: order.order_number,
        order_status: 'completed',
        payment_status: order.payment_status,
        total_amount: order.total_amount
      }
    });

    console.log('✅ Order completion process finished successfully');
    console.log('=== END COMPLETE ORDER WITH TOKEN ===');

    return { data: updatedOrder, error: null };

  } catch (error) {
    console.error('❌ Error in completeOrderWithToken:', error);
    return { data: null, error: error.message || 'Failed to complete order' };
  }
}

/**
 * Update preparation time dynamically
 */
export async function updatePreparationTime(orderId, newPrepTime) {
  try {
    console.log('=== UPDATE PREPARATION TIME ===');
    console.log('Order ID:', orderId, 'New prep time:', newPrepTime);

    const now = new Date().toISOString();
    const newPreparationEndTime = new Date(Date.now() + newPrepTime * 60000).toISOString();
    const estimatedReadyTime = newPreparationEndTime;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .update({ 
        preparation_end_time: newPreparationEndTime,
        updated_at: now 
      })
      .eq('id', orderId)
      .select('*, queue_id, customer_id, order_number, payment_status, total_amount')
      .single();

    if (orderError) throw orderError;

    if (order.queue_id) {
      await supabase
        .from('queue')
        .update({
          estimated_time: estimatedReadyTime,
          wait_time_minutes: newPrepTime,
          updated_at: now
        })
        .eq('id', order.queue_id);
    }

    await createCustomerNotification({
      customerId: order.customer_id,
      title: '⏱️ Time Updated',
      message: `Order #${order.order_number} will be ready in ~${newPrepTime} minutes`,
      type: 'time_update',
      metadata: {
        order_id: orderId,
        order_number: order.order_number,
        preparation_time: newPrepTime,
        preparation_end_time: newPreparationEndTime,
        order_status: 'preparing',
        payment_status: order.payment_status,
        total_amount: order.total_amount,
        estimated_ready_time: estimatedReadyTime,
        auto_ready_enabled: true
      }
    });

    return { data: order, error: null };
  } catch (error) {
    console.error('❌ Error updating prep time:', error);
    return { data: null, error: error.message || 'Failed to update prep time' };
  }
}

/**
 * ✅ Fetch customer orders with filters
 */
export async function fetchCustomerOrders(customerId, { status = null, limit = 50 } = {}) {
  try {
    if (!customerId) {
      return { data: [], error: 'Customer ID required' };
    }

    let query = supabase
      .from('orders')
      .select(`
        *,
        stores (store_name, address, city, logo_url, phone),
        queue (token_number, status, wait_time_minutes, estimated_time)
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status && status !== 'all') {
      query = query.eq('order_status', status);
    }

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching customer orders:', error);
      return { data: [], error: error.message };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching customer orders:', error);
    return { data: [], error: error.message };
  }
}

/**
 * Fetch store orders with filters
 */
export async function fetchStoreOrders(storeId, { status = null, limit = 100 } = {}) {
  try {
    if (!storeId) {
      return { data: [], error: 'Store ID required' };
    }

    let query = supabase
      .from('orders')
      .select(`
        *,
        queue (token_number, status, wait_time_minutes, estimated_time)
      `)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status && status !== 'all') {
      query = query.eq('order_status', status);
    }

    const { data: orders, error: ordersError } = await query;

    if (ordersError) {
      console.error('Error fetching store orders:', ordersError);
      return { data: [], error: ordersError.message };
    }

    if (orders && orders.length > 0) {
      const enrichedOrders = await Promise.all(
        orders.map(async (order) => {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name, phone')
              .eq('id', order.customer_id)
              .single();

            return { ...order, profiles: profile || null };
          } catch (err) {
            return { ...order, profiles: null };
          }
        })
      );

      return { data: enrichedOrders, error: null };
    }

    return { data: orders || [], error: null };
  } catch (error) {
    console.error('Error fetching store orders:', error);
    return { data: [], error: error.message };
  }
}

/**
 * Get order by ID with full details
 */
export async function getOrderById(orderId) {
  try {
    if (!orderId) {
      return { data: null, error: 'Order ID required' };
    }

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        stores (store_name, address, city, phone, logo_url),
        queue (token_number, status, wait_time_minutes, estimated_time),
        transactions (transaction_id, status, payment_method, completed_at)
      `)
      .eq('id', orderId)
      .single();

    if (error) return { data: null, error: error.message };

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', data.customer_id)
        .single();

      return { data: { ...data, profiles: profile }, error: null };
    } catch (err) {
      return { data, error: null };
    }
  } catch (error) {
    console.error('Error fetching order:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Cancel order (customer-initiated)
 */
export async function cancelOrder(orderId, cancellationReason) {
  try {
    const cancelledAt = new Date().toISOString();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .update({
        order_status: 'cancelled',
        payment_status: 'refund_pending',
        cancelled_at: cancelledAt,
        cancellation_reason: cancellationReason,
        updated_at: cancelledAt
      })
      .eq('id', orderId)
      .select()
      .single();

    if (orderError) throw orderError;

    if (order.queue_id) {
      await supabase
        .from('queue')
        .update({ status: 'cancelled' })
        .eq('id', order.queue_id);
    }

    return { data: order, error: null };
  } catch (error) {
    console.error('Error cancelling order:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Get queue statistics for a store
 */
export async function getStoreQueueStats(storeId) {
  try {
    const { data, error } = await supabase
      .from('queue')
      .select('id, status, wait_time_minutes, token_number')
      .eq('store_id', storeId)
      .in('status', ['waiting', 'in_service', 'ready'])
      .order('token_sequence', { ascending: true });

    if (error) throw error;

    return {
      data: {
        total: data?.length || 0,
        waiting: data?.filter(q => q.status === 'waiting').length || 0,
        in_service: data?.filter(q => q.status === 'in_service').length || 0,
        ready: data?.filter(q => q.status === 'ready').length || 0,
        avgWaitTime: data && data.length > 0
          ? Math.round(data.reduce((sum, q) => sum + (q.wait_time_minutes || 0), 0) / data.length)
          : 0,
        entries: data || []
      },
      error: null
    };
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Check preparation status
 */
export async function checkPreparationStatus(orderId) {
  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, order_number, order_status, preparation_end_time, confirmed_at')
      .eq('id', orderId)
      .single();

    if (error) throw error;

    if (!order.preparation_end_time) {
      return {
        data: {
          status: 'no_preparation_time',
          message: 'No preparation time set'
        },
        error: null
      };
    }

    const now = new Date();
    const endTime = new Date(order.preparation_end_time);
    const remainingMinutes = Math.max(0, Math.round((endTime - now) / 60000));

    const status = {
      order_id: order.id,
      order_number: order.order_number,
      order_status: order.order_status,
      preparation_end_time: order.preparation_end_time,
      remaining_minutes: remainingMinutes,
      is_ready: remainingMinutes === 0,
      is_overdue: now > endTime && order.order_status === 'preparing'
    };

    return { data: status, error: null };
  } catch (error) {
    console.error('Error checking preparation status:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Manually trigger auto-transition (for testing)
 */
export async function manuallyTransitionReadyOrders() {
  try {
    const { data, error } = await supabase.rpc('manually_transition_orders_to_ready');
    
    if (error) throw error;
    
    return { 
      data: {
        transitioned_count: data?.length || 0,
        orders: data || []
      }, 
      error: null 
    };
  } catch (error) {
    console.error('Error manually transitioning orders:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Get preparation monitor view
 */
export async function getPreparationMonitor(storeId = null) {
  try {
    let query = supabase
      .from('orders_preparation_monitor')
      .select('*')
      .order('preparation_end_time', { ascending: true });

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching preparation monitor:', error);
    return { data: [], error: error.message };
  }
}

/**
 * Format price in Indian Rupee format
 */
export function formatPrice(price) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(price);
}