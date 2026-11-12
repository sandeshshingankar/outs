'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    paypal?: {
      Buttons: (options: {
        createOrder: () => Promise<string>;
        onApprove: (data: { orderID: string }) => Promise<void>;
        onCancel: () => void;
        onError: (error: unknown) => void;
      }) => { render: (element: HTMLElement) => Promise<void> };
    };
  }
}

export default function RentPayPalCheckout({
  bookingId,
  amountPaise,
  onComplete,
}: {
  bookingId: string;
  amountPaise: number;
  onComplete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState('');
  const [rate, setRate] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/payments/config')
      .then(async response => {
        if (!response.ok) throw new Error('Could not load PayPal configuration.');
        return response.json();
      })
      .then(config => {
        if (active && config.rentPaypalReady && config.paypalClientId) {
          setClientId(config.paypalClientId);
          setRate(config.paypalInrPerUsd);
        } else if (active) {
          setError('PayPal Sandbox needs credentials and a reviewed INR-to-USD demo rate.');
        }
      })
      .catch(() => {
        if (active) setError('Could not load PayPal Sandbox configuration.');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!clientId || !ref.current) return;
    let cancelled = false;
    const selector = `paypal-sdk-${clientId}`;
    let script = document.getElementById(selector) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = selector;
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`;
      script.async = true;
      document.body.appendChild(script);
    }

    const render = () => {
      if (cancelled || !window.paypal || !ref.current) return;
      ref.current.replaceChildren();
      window.paypal.Buttons({
        createOrder: async () => {
          setError('');
          setBusy(true);
          try {
            const response = await fetch('/api/payments/rent/order', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ bookingId }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Could not start checkout.');
            if (Number.isFinite(result.inrPerUsd)) setRate(result.inrPerUsd);
            return result.orderId;
          } catch (requestError) {
            setBusy(false);
            throw requestError;
          }
        },
        onApprove: async ({ orderID }) => {
          setBusy(true);
          setError('');
          try {
            const response = await fetch('/api/payments/rent/capture', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ orderId: orderID }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Payment verification failed.');
            setBusy(false);
            onComplete();
          } catch (requestError) {
            setBusy(false);
            setError(requestError instanceof Error ? requestError.message : 'Payment verification failed.');
          }
        },
        onCancel: () => {
          setBusy(false);
          setError('Checkout was cancelled. No successful payment was recorded.');
        },
        onError: checkoutError => {
          setBusy(false);
          setError(checkoutError instanceof Error ? checkoutError.message : 'PayPal checkout failed.');
        },
      }).render(ref.current).catch(() => {
        if (!cancelled) setError('Could not load PayPal buttons.');
      });
    };
    const onScriptError = () => setError('Could not load the PayPal Sandbox SDK.');
    script.addEventListener('load', render);
    script.addEventListener('error', onScriptError);
    if (window.paypal) render();
    return () => {
      cancelled = true;
      script?.removeEventListener('load', render);
      script?.removeEventListener('error', onScriptError);
    };
  }, [clientId, bookingId, onComplete]);

  if (!clientId) {
    return <div><small role={error ? 'alert' : undefined}>{error || 'PayPal Sandbox checkout is not configured.'}</small></div>;
  }

  return (
    <div>
      {rate !== null && <small>Sandbox quote: ₹{(amountPaise / 100).toLocaleString('en-IN')} rent ≈ ${(amountPaise / rate / 100).toFixed(2)} USD at ₹{rate.toFixed(2)}/USD. Deposit excluded.</small>}
      <div ref={ref} />
      {busy && <small>Verifying PayPal Sandbox payment…</small>}
      <small>Sandbox only; this is not real-money payment. Deposits and seller payouts are not supported.</small>
      {error && <small role="alert" className="rent-alert">{error}</small>}
    </div>
  );
}
