import type { Config } from '../types.js';

export const config: Config = {
  feature_groups: [
    {
      id: 'search_discovery',
      name: 'Search & Discovery',
      keywords: ['search', 'filter', 'results', 'autocomplete', 'browse', 'sort', 'query', 'find'],
    },
    {
      id: 'checkout_payment',
      name: 'Checkout & Payment',
      keywords: ['checkout', 'payment', 'cart', 'buy', 'purchase', 'order', 'credit card', 'billing', 'crash'],
    },
    {
      id: 'delivery_tracking',
      name: 'Delivery & Tracking',
      keywords: ['delivery', 'shipping', 'tracking', 'late', 'package', 'courier', 'dispatch', 'arrived'],
    },
    {
      id: 'returns_refunds',
      name: 'Returns & Refunds',
      keywords: ['return', 'refund', 'money back', 'replace', 'exchange', 'sent back', 'pending'],
    },
    {
      id: 'product_detail',
      name: 'Product Detail Pages',
      keywords: ['image', 'photo', 'description', 'listing', 'wrong item', 'misleading', 'specs', 'review'],
    },
    {
      id: 'prime_subscriptions',
      name: 'Prime & Subscriptions',
      keywords: ['prime', 'subscription', 'charged', 'membership', 'renew', 'cancel', 'benefit', 'double charge'],
    },
    {
      id: 'account_performance',
      name: 'Account & Performance',
      keywords: ['login', 'password', 'account', 'slow', 'crash', 'freeze', 'loading', 'performance', 'update', 'bug'],
    },
  ],
  valid_ids: [
    'search_discovery',
    'checkout_payment',
    'delivery_tracking',
    'returns_refunds',
    'product_detail',
    'prime_subscriptions',
    'account_performance',
  ],
};
