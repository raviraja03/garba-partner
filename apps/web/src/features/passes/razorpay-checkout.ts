import type { CreatedOrderDto, VerifyPaymentInput } from '@garba-partner/shared';

/** Razorpay's hosted Checkout script (card, UPI and bank details never touch our servers). */
const CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayFailureResponse {
  error?: { description?: string; reason?: string };
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  handler: (response: RazorpaySuccessResponse) => void;
  modal: { ondismiss: () => void; confirm_close: boolean };
  theme: { color: string };
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', handler: (response: RazorpayFailureResponse) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;

/** Loads Checkout once, on first use (not on every page). */
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('Could not load the payment window. Check your connection and try again.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export type CheckoutResult =
  | { kind: 'paid'; payment: VerifyPaymentInput }
  | { kind: 'failed'; message: string }
  | { kind: 'dismissed' };

/**
 * Opens Razorpay Checkout for a server-created order. The result is only a hint: the server
 * verifies the signature and the payment itself, and webhooks confirm payments even if this
 * tab closes. No personal details are prefilled.
 */
export async function openCheckout(checkout: CreatedOrderDto['checkout']): Promise<CheckoutResult> {
  await loadCheckout();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error('The payment window is not available.');

  return new Promise<CheckoutResult>((resolve) => {
    let failure: string | null = null;
    const instance = new Razorpay({
      key: checkout.keyId,
      order_id: checkout.razorpayOrderId,
      amount: checkout.amountPaise,
      currency: checkout.currency,
      name: checkout.name,
      description: checkout.description,
      handler: (response) => {
        resolve({
          kind: 'paid',
          payment: {
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          },
        });
      },
      modal: {
        confirm_close: true,
        ondismiss: () => {
          resolve(failure ? { kind: 'failed', message: failure } : { kind: 'dismissed' });
        },
      },
      theme: { color: '#2D1B69' },
    });
    // Checkout stays open after a failed attempt so the member can retry there; remember the
    // reason in case they close it.
    instance.on('payment.failed', (response) => {
      failure = response.error?.description ?? 'The payment did not go through.';
    });
    instance.open();
  });
}
