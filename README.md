# Smith3DPrintingCo website

This package contains the GitHub Pages storefront plus the prepared Node/Express Stripe Checkout backend.

## Website
Upload the website files to the existing `Smith3DPrintingCo` GitHub repository. Do not upload the ZIP itself.

Live website:
https://smith3dprintingco.github.io/Smith3DPrintingCo/

Customer service:
smith3dprintingco@gmail.com

## Stripe backend
GitHub Pages is static and cannot safely store a Stripe secret key or run `server.js`. The included `server.js` is intended to be deployed to a server host such as Render, Railway, or another Node.js host.

Set these environment variables on the backend host:

- `STRIPE_SECRET_KEY` = your Stripe secret key (never commit this to GitHub)
- `PUBLIC_BASE_URL` = the public URL of the backend
- `PORT` = supplied automatically by most hosts

The frontend calls `/api/create-checkout-session`. If the frontend and backend are on different domains, update `app.js` so the fetch URL points to the backend URL.

## Important shipping note
The current backend collects the customer's US shipping address. A carrier-rate service still needs to be connected before the checkout can automatically calculate a destination-based shipping charge from ZIP 80127 and the 6 x 9 inch, few-ounce package. Do not advertise that a live carrier rate is being charged until that service is connected and tested.

## Stripe testing
Use Stripe test mode first. Never paste a live Stripe secret key into `index.html`, `app.js`, GitHub, or a chat message.


## Stripe deployment
Frontend API endpoint is configured for https://smith3dprintingco-backend.onrender.com. The backend requires STRIPE_SECRET_KEY in Render environment variables. Set PUBLIC_BASE_URL to https://smith3dprintingco.github.io/Smith3DPrintingCo/ if desired. Never commit secret keys.
