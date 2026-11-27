# Next.js App Router recipe

Payment code runs only in Route Handlers or Server Actions, on the Node.js runtime. Never import `nepal-payments` in a client component.

`lib/payments.ts`:

```ts
import 'server-only';
import { createPayments } from 'nepal-payments';

export const payments = createPayments({
  mode: process.env.VERCEL_ENV === 'production' ? 'live' : 'sandbox',
  khalti: { secretKey: process.env.KHALTI_SECRET_KEY! },
  esewa: { productCode: process.env.ESEWA_PRODUCT_CODE!, secretKey: process.env.ESEWA_SECRET_KEY! }
});
```

Mock mode works only under `next dev`. `next build`, `next start` and Vercel preview deployments set `NODE_ENV=production`, so `mode: 'mock'` is refused there (INVALID_CONFIG). Use `'sandbox'` on previews.

`app/api/pay/khalti/route.ts` (start):

```ts
import { NextResponse } from 'next/server';
import { payments } from '@/lib/payments';
import { getOrder, saveRef } from '@/lib/orders';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const { orderId } = await request.json();
  const order = await getOrder(orderId);
  const origin = new URL(request.url).origin;
  const start = await payments.khalti.initiate({
    amount: order.amount, orderId: order.id, orderName: order.name,
    returnUrl: `${origin}/api/pay/khalti/return`, websiteUrl: origin
  });
  await saveRef(order.id, start.ref);
  return NextResponse.json({ url: start.url });
}
```

`app/api/pay/khalti/return/route.ts` (verify):

```ts
import { NextResponse } from 'next/server';
import { isPaymentError } from 'nepal-payments';
import { payments } from '@/lib/payments';
import { findOrderByRef, markPaid } from '@/lib/orders';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const cb = await payments.khalti.parseCallback(request.url);
  const order = await findOrderByRef(cb.ref);
  if (!order) return new NextResponse('Unknown payment', { status: 404 });
  try {
    const result = await payments.khalti.verify({ ref: order.ref, expectedAmount: order.amount, expectedOrderId: order.id });
    if (result.paid) await markPaid(order.id, result.transactionId);
    return NextResponse.redirect(new URL(result.paid ? '/thanks' : `/checkout?status=${result.status}`, request.url));
  } catch (e) {
    if (isPaymentError(e)) return new NextResponse(e.message, { status: 400 });
    throw e;
  }
}
```

For eSewa, ConnectIPS and Hamro Pay, return `start.action` and `start.fields` as JSON and let the page build a hidden form and call `form.submit()`. For a Hamro Pay webhook, read `await request.text()` and pass it with `request.headers.get('signature')`.
