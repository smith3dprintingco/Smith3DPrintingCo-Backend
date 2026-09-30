// Smith3DPrintingCo Stripe + EasyPost shipping backend
// Required environment variables:
// STRIPE_SECRET_KEY
// EASYPOST_API_KEY
// SHIPPING_FROM_NAME
// SHIPPING_FROM_STREET
// SHIPPING_FROM_CITY
// SHIPPING_FROM_STATE
// SHIPPING_FROM_ZIP=80127
// Optional: SHIPPING_FROM_COUNTRY=US, PUBLIC_BASE_URL
const express = require("express");
const Stripe = require("stripe");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 4242;
const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;

const ALLOWED_ORIGINS = new Set([
  "https://smith3dprintingco.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:5500"
]);

// Shipping package assumptions. These can be changed later in one place.
const SHIPPING = {
  length: 9,
  width: 6,
  height: 2,
  weightOz: 3,
  fromCountry: process.env.SHIPPING_FROM_COUNTRY || "US"
};

// EasyPost's USPS service names are "GroundAdvantage", "Priority", and
// "Express". Keep the customer-facing names friendly while matching the
// exact service identifiers returned by EasyPost.
const USPS_SERVICES = new Set([
  "GroundAdvantage",
  "Priority",
  "Express"
]);

const USPS_DISPLAY_NAMES = {
  GroundAdvantage: "USPS Ground Advantage",
  Priority: "USPS Priority Mail",
  Express: "USPS Priority Mail Express"
};

app.use(express.json());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/", (req, res) => res.json({
  ok: true,
  service: "Smith3DPrintingCo Stripe + EasyPost backend",
  shippingConfigured: Boolean(process.env.EASYPOST_API_KEY),
  stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY)
}));

function requireShippingConfig() {
  const required = [
    "EASYPOST_API_KEY",
    "SHIPPING_FROM_NAME",
    "SHIPPING_FROM_STREET",
    "SHIPPING_FROM_CITY",
    "SHIPPING_FROM_STATE",
    "SHIPPING_FROM_ZIP"
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Shipping is not fully configured. Missing Render environment variables: ${missing.join(", ")}`);
  }
}

function normalizeAddress(address) {
  if (!address || typeof address !== "object") throw new Error("A shipping address is required.");
  const required = ["name", "street1", "city", "state", "zip"];
  for (const key of required) {
    if (!String(address[key] || "").trim()) throw new Error(`Shipping address is missing ${key}.`);
  }
  const country = String(address.country || "US").trim().toUpperCase();
  if (country !== "US") throw new Error("This store currently ships to U.S. addresses only.");
  return {
    name: String(address.name).trim().slice(0, 100),
    street1: String(address.street1).trim().slice(0, 200),
    street2: String(address.street2 || "").trim().slice(0, 200) || undefined,
    city: String(address.city).trim().slice(0, 100),
    state: String(address.state).trim().slice(0, 50),
    zip: String(address.zip).trim().slice(0, 20),
    country: "US",
    phone: String(address.phone || "").trim().slice(0, 30) || undefined,
    email: String(address.email || "").trim().slice(0, 200) || undefined
  };
}

async function easypostShipmentRates(toAddress) {
  requireShippingConfig();

  const fromAddress = {
    name: process.env.SHIPPING_FROM_NAME,
    street1: process.env.SHIPPING_FROM_STREET,
    city: process.env.SHIPPING_FROM_CITY,
    state: process.env.SHIPPING_FROM_STATE,
    zip: process.env.SHIPPING_FROM_ZIP,
    country: SHIPPING.fromCountry
  };

  const response = await fetch("https://api.easypost.com/v2/shipments", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${Buffer.from(`${process.env.EASYPOST_API_KEY}:`).toString("base64")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      shipment: {
        to_address: toAddress,
        from_address: fromAddress,
        parcel: {
          length: SHIPPING.length,
          width: SHIPPING.width,
          height: SHIPPING.height,
          weight: SHIPPING.weightOz
        }
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || data?.message || "EasyPost could not calculate shipping rates.";
    throw new Error(message);
  }
  return data;
}

function publicRates(shipment) {
  return (shipment.rates || [])
    .filter(rate => rate.carrier === "USPS" && USPS_SERVICES.has(rate.service))
    .map(rate => ({
      id: rate.id,
      carrier: rate.carrier,
      service: rate.service,
      displayName: USPS_DISPLAY_NAMES[rate.service] || `USPS ${rate.service}`,
      rate: Number(rate.rate),
      currency: rate.currency,
      deliveryDays: rate.est_delivery_days ?? rate.delivery_days ?? null,
      deliveryDate: rate.delivery_date || null,
      guaranteed: Boolean(rate.delivery_date_guaranteed)
    }))
    .filter(rate => Number.isFinite(rate.rate) && rate.rate >= 0)
    .sort((a, b) => a.rate - b.rate);
}

// Calculate current USPS shipping rates for a destination.
// This does not purchase a label or charge the customer.
app.post("/api/shipping-rates", async (req, res) => {
  try {
    const address = normalizeAddress(req.body.address);
    const shipment = await easypostShipmentRates(address);
    const rates = publicRates(shipment);
    if (!rates.length) {
      return res.status(404).json({ error: "No supported USPS shipping options were returned for this address." });
    }
    res.json({
      package: SHIPPING,
      rates
    });
  } catch (err) {
    console.error("Shipping rate error:", err);
    res.status(400).json({ error: err.message || "Unable to calculate shipping." });
  }
});

app.post("/api/create-checkout-session", async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: "Stripe is not configured." });
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: "Cart is empty." });

    const catalog = require("./catalog.json");
    const line_items = items.map(item => {
      const product = catalog.products[item.type];
      if (!product || product.basePriceCents == null) throw new Error("Invalid product.");
      const qty = Math.max(1, Math.min(999, Number(item.qty) || 1));
      const custom = String(item.customText || "").trim();
      if (custom.length > product.maxCustomText) throw new Error("Custom text is too long.");
      const unit_amount = product.basePriceCents + (custom ? product.customTextFeeCents : 0);

      const configuration = item.type === "cartridge"
        ? `Caliber: ${item.caliber}; Bullet: ${item.bulletColor}; Casing: ${item.caseColor}; Custom text: ${custom || "None"}`
        : `Gauge: ${item.gauge}; Head: ${item.headColor}; Case: ${item.caseColor}; Custom text: ${custom || "None"}`;

      return {
        price_data: {
          currency: "usd",
          product_data: { name: product.name, description: configuration, metadata: { configuration } },
          unit_amount
        },
        quantity: qty
      };
    });

    // Shipping is optional until EasyPost is configured. Once a service is supplied,
    // the backend recalculates the rate from the customer's address rather than trusting
    // a price sent by the browser.
    let shipping_options = [];
    let shippingMeta = {};
    if (req.body.shippingAddress && req.body.shippingService) {
      const address = normalizeAddress(req.body.shippingAddress);
      const shipment = await easypostShipmentRates(address);
      const rates = publicRates(shipment);
      const selected = rates.find(r => r.service === String(req.body.shippingService));
      if (!selected) throw new Error("The selected shipping service is unavailable. Please refresh shipping rates and try again.");

      shipping_options = [{
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: Math.round(selected.rate * 100), currency: "usd" },
          display_name: selected.displayName || `${selected.carrier} ${selected.service}`,
          delivery_estimate: selected.deliveryDays ? {
            minimum: { unit: "business_day", value: Math.max(1, selected.deliveryDays) },
            maximum: { unit: "business_day", value: Math.max(1, selected.deliveryDays + 2) }
          } : undefined
        }
      }];
      shippingMeta = {
        shipping_service: `${selected.carrier} ${selected.service}`,
        shipping_rate: selected.rate.toFixed(2)
      };
    }

    const baseUrl = process.env.PUBLIC_BASE_URL || "https://smith3dprintingco.github.io/Smith3DPrintingCo/";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      billing_address_collection: "auto",
      shipping_address_collection: { allowed_countries: ["US"] },
      shipping_options,
      success_url: `${baseUrl.replace(/\/$/, "")}/success.html`,
      cancel_url: `${baseUrl.replace(/\/$/, "")}/index.html#cartridges`,
      metadata: { store: "Smith3DPrintingCo", ...shippingMeta }
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(400).json({ error: err.message || "Unable to create checkout session." });
  }
});

app.listen(port, () => console.log(`Smith3DPrintingCo running on port ${port}`));
