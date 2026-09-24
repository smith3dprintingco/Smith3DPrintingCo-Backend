# Smith3DPrintingCo Stripe + EasyPost backend

This backend creates Stripe Checkout Sessions and can calculate USPS shipping rates through EasyPost.

## Render environment variables

Required for payments:
- `STRIPE_SECRET_KEY` — keep this private. Use `sk_test_...` for testing and `sk_live_...` for production.

Required for shipping:
- `EASYPOST_API_KEY` — keep this private. Use the EasyPost test key while testing shipping.
- `SHIPPING_FROM_NAME`
- `SHIPPING_FROM_STREET`
- `SHIPPING_FROM_CITY`
- `SHIPPING_FROM_STATE`
- `SHIPPING_FROM_ZIP=80127`
- `SHIPPING_FROM_COUNTRY=US`

Optional:
- `PUBLIC_BASE_URL=https://smith3dprintingco.github.io/Smith3DPrintingCo/`

## Shipping package assumptions

The initial shipping package is:
- 9 in long
- 6 in wide
- 2 in high
- 3 oz packed weight

These values are in `server.js` and can be adjusted later.

## Shipping API

`POST /api/shipping-rates`

Request body:
```json
{
  "address": {
    "name": "Customer Name",
    "street1": "123 Main St",
    "city": "Denver",
    "state": "CO",
    "zip": "80202",
    "country": "US"
  }
}
```

The endpoint creates an EasyPost shipment for rating only and returns supported USPS rates. It does not purchase postage.

## Checkout API

`POST /api/create-checkout-session`

The existing cart format is supported. To include shipping, also send `shippingAddress` and `shippingService`. The backend recalculates the selected service's current EasyPost rate and puts that amount into Stripe Checkout. The browser never controls the shipping price.
