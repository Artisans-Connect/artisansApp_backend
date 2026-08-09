import axios from "axios";
import { appError } from "../../utils/appError";
import { logger } from "../../utils/logger";

const PAYSTACK_API = "https://api.paystack.co";

export function getPaystackSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw appError(500, "Paystack API key not configured", "PAYMENT_CONFIG_ERROR");
  }
  return key;
}

export async function initializeTransaction(
  email: string,
  amountInPesewas: number,
  reference: string,
  callbackUrl: string,
  metadata: any
) {
  const key = getPaystackSecretKey();
  try {
    const response = await axios.post(
      `${PAYSTACK_API}/transaction/initialize`,
      {
        email,
        amount: amountInPesewas,
        reference,
        callback_url: callbackUrl,
        metadata,
      },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data?.data;
  } catch (err: any) {
    const paystackMsg = err.response?.data?.message || err.message || "Paystack initialization failed";
    logger("Paystack Initialize Error:", err.response?.data || err.message);
    throw appError(err.response?.status || 500, `Paystack error: ${paystackMsg}`, "PAYSTACK_INIT_ERROR");
  }
}

export async function verifyTransaction(reference: string) {
  const key = getPaystackSecretKey();
  try {
    const response = await axios.get(`${PAYSTACK_API}/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });
    return response.data?.data;
  } catch (err: any) {
    logger("Paystack Verify Error:", err.response?.data || err.message);
    throw err;
  }
}

export async function createTransferRecipient(
  name: string,
  accountNumber: string,
  bankCode: string
) {
  const key = getPaystackSecretKey();
  try {
    const response = await axios.post(
      `${PAYSTACK_API}/transferrecipient`,
      {
        type: "mobile_money",
        name,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: "GHS",
      },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data?.data?.recipient_code;
  } catch (err: any) {
    logger("Paystack Transfer Recipient Error:", err.response?.data || err.message);
    throw err;
  }
}

export async function initiateTransfer(
  amountInPesewas: number,
  recipientCode: string,
  reason: string,
  reference: string
) {
  const key = getPaystackSecretKey();
  try {
    const response = await axios.post(
      `${PAYSTACK_API}/transfer`,
      {
        source: "balance",
        amount: amountInPesewas,
        recipient: recipientCode,
        reason,
        currency: "GHS",
        reference,
      },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data?.data;
  } catch (err: any) {
    logger("Paystack Transfer Error:", err.response?.data || err.message);
    throw err;
  }
}

export async function initiateRefund(transactionRef: string, amountInPesewas: number, note: string) {
  const key = getPaystackSecretKey();
  try {
    const response = await axios.post(
      `${PAYSTACK_API}/refund`,
      {
        transaction: transactionRef,
        amount: amountInPesewas,
        currency: "GHS",
        merchant_note: note,
      },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data?.data;
  } catch (err: any) {
    logger("Paystack Refund Error:", err.response?.data || err.message);
    throw err;
  }
}
