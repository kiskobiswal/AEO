import { http, formatApiErrorDetail } from "@/lib/api";

/**
 * Loads the Razorpay Checkout script exactly once and resolves when it's
 * ready. In practice the script is already included in `public/index.html`
 * so this typically resolves synchronously.
 */
export function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") { reject(new Error("no window")); return; }
    if (window.Razorpay) { resolve(window.Razorpay); return; }
    const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Razorpay));
      existing.addEventListener("error", () => reject(new Error("Razorpay script failed to load")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(window.Razorpay);
    s.onerror = () => reject(new Error("Razorpay script failed to load"));
    document.body.appendChild(s);
  });
}

/**
 * Opens the Razorpay Checkout modal for an order payload returned by
 * `/api/subscriptions/register-and-checkout` or `/api/subscriptions/upgrade`.
 *
 * On a successful payment we call `/api/subscriptions/verify` to have the
 * backend confirm the HMAC signature and flip the payment_transaction to
 * paid, then invoke `onSuccess(sessionId)` so the caller can navigate to
 * `/payment/success?session_id=...`.
 *
 * Errors and dismissals go through `onFailure(reason)`.
 */
export async function openRazorpayCheckout(order, {
  onSuccess,
  onFailure,
  prefill = {},
  planName = "",
  themeColor = "#6366F1",
}) {
  await loadRazorpay();
  if (!window.Razorpay) throw new Error("Razorpay is not available");
  if (!order?.order_id || !order?.key_id || !order?.amount) {
    throw new Error("Invalid Razorpay order payload");
  }

  const options = {
    key: order.key_id,
    amount: order.amount,          // in the smallest currency unit
    currency: order.currency || "INR",
    order_id: order.order_id,
    name: "Citetail",
    description: planName ? `Citetail — ${planName} plan` : "Citetail subscription",
    prefill: {
      name: prefill.name || "",
      email: prefill.email || "",
      contact: prefill.contact || "",
    },
    notes: { plan: order.plan },
    theme: { color: themeColor },
    handler: async (resp) => {
      try {
        await http.post("/subscriptions/verify", {
          razorpay_order_id: resp.razorpay_order_id,
          razorpay_payment_id: resp.razorpay_payment_id,
          razorpay_signature: resp.razorpay_signature,
        });
        onSuccess?.(resp.razorpay_order_id);
      } catch (e) {
        onFailure?.(formatApiErrorDetail(e.response?.data?.detail) || "Payment verification failed");
      }
    },
    modal: {
      ondismiss: () => onFailure?.("cancelled"),
    },
  };

  const rzp = new window.Razorpay(options);
  rzp.on("payment.failed", (evt) => {
    const desc = evt?.error?.description || evt?.error?.reason || "Payment failed";
    onFailure?.(desc);
  });
  rzp.open();
  return rzp;
}
