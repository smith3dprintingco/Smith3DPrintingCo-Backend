// Smith3DPrintingCo Stripe Checkout backend
// Install: npm install express stripe dotenv
// Run: STRIPE_SECRET_KEY=sk_live_... node server.js
const express = require("express");
const path = require("path");
const Stripe = require("stripe");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 4242;
const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;

app.use(express.json());
app.use((req,res,next)=>{
  const origin = req.headers.origin;
  if(origin === "https://smith3dprintingco.github.io" || origin === "http://localhost:3000" || origin === "http://127.0.0.1:5500") {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if(req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.get("/", (req,res)=>res.json({ok:true,service:"Smith3DPrintingCo Stripe backend"}));
app.use(express.static(__dirname));

app.post("/api/create-checkout-session", async (req,res)=>{
  try{
    if(!stripe) return res.status(503).json({error:"Stripe is not configured."});
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if(!items.length) return res.status(400).json({error:"Cart is empty."});

    // In production, validate every option and price server-side against catalog.json.
    const catalog = require("./catalog.json");
    const line_items = items.map(item=>{
      const product = catalog.products[item.type];
      if(!product || product.basePriceCents == null) throw new Error("Invalid product.");
      const qty = Math.max(1, Math.min(999, Number(item.qty)||1));
      const custom = String(item.customText||"").trim();
      if(custom.length > product.maxCustomText) throw new Error("Custom text is too long.");
      const unit_amount = product.basePriceCents + (custom ? product.customTextFeeCents : 0);

      const configuration = item.type === "cartridge"
        ? `Caliber: ${item.caliber}; Bullet: ${item.bulletColor}; Casing: ${item.caseColor}; Custom text: ${custom || "None"}`
        : `Gauge: ${item.gauge}; Head: ${item.headColor}; Case: ${item.caseColor}; Custom text: ${custom || "None"}`;

      return {
        price_data:{
          currency:"usd",
          product_data:{name:product.name,description:configuration,metadata:{configuration}},
          unit_amount
        },
        quantity:qty
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode:"payment",
      line_items,
      billing_address_collection:"auto",
      shipping_address_collection:{allowed_countries:["US"]},
      success_url:`${process.env.PUBLIC_BASE_URL || "https://smith3dprintingco.github.io/Smith3DPrintingCo/"}success.html`,
      cancel_url:`${process.env.PUBLIC_BASE_URL || "https://smith3dprintingco.github.io/Smith3DPrintingCo/"}index.html#cartridges`,
      metadata:{store:"Smith3DPrintingCo"}
    });
    res.json({url:session.url});
  }catch(err){console.error(err);res.status(400).json({error:err.message});}
});
app.listen(port,()=>console.log(`Smith3DPrintingCo running on port ${port}`));
