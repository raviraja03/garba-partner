# Razorpay Webhook

> Related: [Razorpay](razorpay.md), [Payment flow](payment-flow.md), [Refunds](refunds.md)

## 1. Purpose

The webhook is how Razorpay tells us about payments and refunds **independently of the browser**. If a member closes the tab right after paying, the webhook still confirms the booking.

## 2. Endpoint

`POST /api/v1/webhooks/razorpay`, with no session or CSRF. Authenticity comes only from the signature.

| Header | Use |
|---|---|
| `X-Razorpay-Signature` | `hex(HMAC-SHA256(RAZORPAY_WEBHOOK_SECRET, raw request body))`, compared in constant time |
| `X-Razorpay-Event-Id` | Unique event ID, used for de-duplication (a SHA-256 of the body is the fallback) |

The signature is computed over the **exact bytes received**. `app.ts` keeps the raw body (`req.rawBody`) for this path only, before JSON parsing, because re-serialising parsed JSON would change the bytes.

| Response | Meaning | Razorpay retries? |
|---|---|---|
| `200 { received: true, duplicate: false }` | Handled | No |
| `200 { received: true, duplicate: true }` | Already handled earlier | No |
| `401` | Missing or invalid signature (logged as a warning) | Yes, but a forged request never succeeds |
| `503` | Payments disabled on this server | Yes |
| `5xx` | Our error (e.g. database down) | **Yes**: the event isn't marked processed, so the retry is handled |

## 3. Events handled

Subscribe to these in the Razorpay dashboard (Settings → Webhooks):

| Event | Handling |
|---|---|
| `payment.authorized` | Captured by us for the order amount (if auto-capture is off), then finalized |
| `payment.captured` | `finalize()` → booking confirmed (or cancelled + auto refund, see [payment flow §7](payment-flow.md#7-failure-handling)) |
| `order.paid` | Same as `payment.captured` (uses the included payment entity) |
| `payment.failed` | Payment recorded as `failed` with the reason; the order stays open for retries |
| `refund.created` | Refund recorded as `pending` |
| `refund.processed` | Payment `refunded`, booking refund `processed`, member notified |
| `refund.failed` | Refund `failed`, member notified, visible to admins for a retry |

Any other event is acknowledged (`200`) and ignored.

Example (abridged):

```json
{
  "entity": "event",
  "event": "payment.captured",
  "contains": ["payment"],
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_NXj1Ab2cD3eF4g",
        "order_id": "order_NXj0fY3kQy2m1a",
        "amount": 99800,
        "currency": "INR",
        "status": "captured",
        "method": "upi",
        "captured": true
      }
    }
  },
  "created_at": 1759665790
}
```

## 4. Idempotency

1. `payment_webhook_events` stores each event ID (plus the Razorpay payment/order ID, never the payload itself, which contains personal data).
2. An event already marked `processed_at` returns `duplicate: true`.
3. `processed_at` is set only **after** handling succeeds, so a crash mid-way is retried.
4. Handling is idempotent anyway: `finalize()` locks the order and the unique indexes allow one payment row per Razorpay payment and one booking per order. Out-of-order events are safe: a captured payment is never moved back to `failed`, and a processed refund is never moved back to `pending`.

## 5. Trust model

- A signed webhook payload is trusted (only Razorpay knows the webhook secret). Even so, a booking is created only for a **captured** payment whose amount and currency match **our** order.
- Payments for unknown orders (e.g. another integration on the same Razorpay account) are logged and ignored.
- The webhook secret is different from the API key secret; a body signed with the key secret is rejected.

## 6. Reconciliation

Webhooks can be delayed or lost. Every minute `startPaymentJobs` runs `expireOrders()`:

1. It picks unpaid orders past their 15-minute hold.
2. For each one, it asks Razorpay `GET /v1/orders/:id/payments` and runs `finalize()` on every payment (a captured one becomes a booking).
3. Only then is the order marked `expired`, releasing its seats. If Razorpay can't be reached, the order is left for the next run.

Payments captured even later (after expiry) still arrive by webhook and are booked or refunded ([payment flow §7](payment-flow.md#7-failure-handling)).

## 7. Operations

- **Configure:** URL `https://<api host>/api/v1/webhooks/razorpay`, secret = `RAZORPAY_WEBHOOK_SECRET`, the events in §3. Use separate webhooks for Test and Live mode.
- **Monitor:** a `401` in the API logs ("Rejected Razorpay webhook") means a misconfigured secret or a forged request. Razorpay's dashboard shows delivery attempts and disables a webhook after repeated failures; check it after incidents.
- **Replay:** re-sending an event from the dashboard is safe (idempotent).
- **Nginx:** don't buffer-modify or re-encode the body; pass `X-Razorpay-*` headers through.

## 8. Testing

In `apps/api/src/modules/payments/payments.int.test.ts` (signed with the test webhook secret by `createRazorpayMock().webhook()`):

- `payment.captured` alone books (no client call); the same event ID is a duplicate; `order.paid` for the same payment adds nothing.
- A tampered body, a wrong signature or a missing signature → `401`, nothing stored.
- `payment.failed` recorded; a late `payment.failed` for a captured payment doesn't downgrade it; unknown orders and unrelated events → `200`, ignored.
- A second captured payment for a paid order is refunded automatically.
- Late payment after the hold lapsed and the passes sold out → cancelled booking + automatic refund + notifications; late payment with seats free → confirmed.
- Reconciliation books a captured payment that never produced a webhook or a client call.
- `refund.processed` completes a pending refund.
