# NestJS recipe

Make the clients once in a provider and inject them.

`payments.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { createPayments } from 'nepal-payments';
import { PaymentsController } from './payments.controller';

export const PAYMENTS = Symbol('PAYMENTS');

export function makePayments() {
  return createPayments({
    mode: process.env.NODE_ENV === 'production' ? 'live' : 'sandbox',
    khalti: { secretKey: process.env.KHALTI_SECRET_KEY! }
  });
}
export type Payments = ReturnType<typeof makePayments>;

@Module({
  providers: [{ provide: PAYMENTS, useFactory: makePayments }],
  controllers: [PaymentsController]
})
export class PaymentsModule {}
```

`payments.controller.ts`:

```ts
import { BadRequestException, Controller, Get, Inject, Param, Post, Redirect, Req } from '@nestjs/common';
import type { Request } from 'express';
import { isPaymentError } from 'nepal-payments';
import { PAYMENTS, type Payments } from './payments.module';
import { OrdersService } from '../orders/orders.service';

@Controller('pay/khalti')
export class PaymentsController {
  constructor(@Inject(PAYMENTS) private readonly payments: Payments, private readonly orders: OrdersService) {}

  @Post(':orderId')
  async start(@Param('orderId') orderId: string) {
    const order = await this.orders.get(orderId);
    const start = await this.payments.khalti.initiate({
      amount: order.amount, orderId: order.id, orderName: order.name,
      returnUrl: 'https://shop.example/pay/khalti/return', websiteUrl: 'https://shop.example'
    });
    if (start.kind !== 'redirect') throw new Error('Expected Khalti redirect');
    await this.orders.saveRef(order.id, start.ref);
    return { url: start.url };
  }

  @Get('return')
  @Redirect()
  async back(@Req() req: Request) {
    const cb = await this.payments.khalti.parseCallback(req.originalUrl);
    const order = await this.orders.findByRef(cb.ref);
    try {
      const result = await this.payments.khalti.verify({ ref: order.ref, expectedAmount: order.amount, expectedOrderId: order.id });
      if (result.paid) await this.orders.markPaid(order.id, result.transactionId);
      return { url: result.paid ? '/thanks' : `/checkout?status=${result.status}` };
    } catch (e) {
      if (isPaymentError(e)) throw new BadRequestException(e.message);
      throw e;
    }
  }
}
```

In tests, override the provider with `useFactory: () => createPayments({ mode: 'mock', khalti: { secretKey: 'unused' } })`, or pass `fetch: fakeFetch(fakeKhalti().handler)` from `nepal-payments/testing`.
