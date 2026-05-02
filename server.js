import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const NOWPAYMENTS_API = "https://api.nowpayments.io/v1";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function verifyNowPaymentsSignature(body, signature) {
  const sortedBody = JSON.stringify(body, Object.keys(body).sort());

  const hmac = crypto.createHmac(
    "sha512",
    process.env.NOWPAYMENTS_IPN_SECRET
  );

  hmac.update(sortedBody);

  const expectedSignature = hmac.digest("hex");

  return expectedSignature === signature;
}

app.post("/create-payment", async (req, res) => {
  const { amount, userId } = req.body;

  if (!amount || Number(amount) <= 0 || !userId) {
    return res.status(400).json({ error: "Amount and userId are required." });
  }

  try {
    const response = await axios.post(
      `${NOWPAYMENTS_API}/payment`,
      {
        price_amount: Number(amount),
        price_currency: "usd",
        pay_currency: "btc",
        ipn_callback_url: "https://backend-8om1.onrender.com/webhook",
        order_id: userId,
        order_description: `Bunker deposit for ${userId}`,
      },
      {
        headers: {
          "x-api-key": process.env.NOWPAYMENTS_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    await supabase.from("deposits").insert({
      user_id: userId,
      amount_usd: Number(amount),
      crypto: "BTC",
      status: "pending",
      nowpayments_payment_id: String(response.data.payment_id),
    });

    res.json(response.data);
  } catch (err) {
    res.status(500).json({
      error: err.response?.data?.message || err.message,
    });
  }
});

app.post("/webhook", async (req, res) => {
  const signature = req.headers["x-nowpayments-sig"];

  if (!verifyNowPaymentsSignature(req.body, signature)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const paymentId = String(req.body.payment_id);
  const paymentStatus = req.body.payment_status;

  if (!paymentId) {
    return res.sendStatus(200);
  }

  const { data: deposit } = await supabase
    .from("deposits")
    .select("*")
    .eq("nowpayments_payment_id", paymentId)
    .single();

  if (!deposit) {
    return res.sendStatus(200);
  }

  if (deposit.status === "completed") {
    return res.sendStatus(200);
  }

  await supabase
    .from("deposits")
    .update({ status: paymentStatus })
    .eq("id", deposit.id);

  if (paymentStatus === "finished" || paymentStatus === "confirmed") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", deposit.user_id)
      .single();

    await supabase
      .from("profiles")
      .update({
        balance: Number(profile?.balance || 0) + Number(deposit.amount_usd),
      })
      .eq("id", deposit.user_id);

    await supabase
      .from("deposits")
      .update({ status: "completed" })
      .eq("id", deposit.id);
  }

  res.sendStatus(200);
});

app.get("/", (_req, res) => {
  res.send("Bunker payments backend running");
});

app.get("/payment-status/:paymentId", async (req, res) => {
  const { paymentId } = req.params;

  const { data: deposit, error } = await supabase
    .from("deposits")
    .select("*")
    .eq("nowpayments_payment_id", paymentId)
    .single();

  if (error || !deposit) {
    return res.status(404).json({ error: "Payment not found" });
  }

  res.json({
    status: deposit.status,
    amount_usd: deposit.amount_usd,
    payment_id: deposit.nowpayments_payment_id,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
