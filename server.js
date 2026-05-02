import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const NOWPAYMENTS_API = "https://api.nowpayments.io/v1";

// 🔥 CREATE PAYMENT
app.post("/create-payment", async (req, res) => {
  const { amount, userId } = req.body;

  try {
    const response = await axios.post(
      `${NOWPAYMENTS_API}/payment`,
      {
        price_amount: amount,
        price_currency: "usd",
        pay_currency: "btc",
      },
      {
        headers: {
          "x-api-key": process.env.NOWPAYMENTS_API_KEY,
        },
      }
    );

    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔥 WEBHOOK (auto credit)
app.post("/webhook", async (req, res) => {
  console.log("Webhook received:", req.body);

  // We will connect this to Supabase next
  res.sendStatus(200);
});

app.listen(3000, () => console.log("Server running"));
