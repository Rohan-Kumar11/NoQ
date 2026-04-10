// app/context/PaymentContext.jsx
'use client';

import { createContext, useContext, useState } from 'react';

const PaymentContext = createContext();

export function PaymentProvider({ children }) {
  const [paymentState, setPaymentState] = useState({
    isProcessing: false,
    isSuccess: false,
    transactionId: null,
    error: null
  });

  const initiatePayment = () => {
    setPaymentState({
      isProcessing: true,
      isSuccess: false,
      transactionId: null,
      error: null
    });
  };

  const completePayment = (txnId) => {
    setPaymentState({
      isProcessing: false,
      isSuccess: true,
      transactionId: txnId,
      error: null
    });
  };

  const failPayment = (error) => {
    setPaymentState({
      isProcessing: false,
      isSuccess: false,
      transactionId: null,
      error
    });
  };

  const resetPayment = () => {
    setPaymentState({
      isProcessing: false,
      isSuccess: false,
      transactionId: null,
      error: null
    });
  };

  return (
    <PaymentContext.Provider value={{
      paymentState,
      initiatePayment,
      completePayment,
      failPayment,
      resetPayment
    }}>
      {children}
    </PaymentContext.Provider>
  );
}

export const usePayment = () => {
  const context = useContext(PaymentContext);
  if (!context) {
    throw new Error('usePayment must be used within PaymentProvider');
  }
  return context;
};