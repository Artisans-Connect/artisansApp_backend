import axios from "axios";
import { env } from "../../config/env";
import { appError } from "../../utils/appError";
import { logger } from "../../utils/logger";

function credentials() {
  if (!env.MOOLRE_API_USER || !env.MOOLRE_API_PUBKEY || !env.MOOLRE_ACCOUNT_NUMBER) {
    throw appError(500, "Moolre payment credentials are not configured", "PAYMENT_CONFIG_ERROR");
  }
  return { "X-API-USER": env.MOOLRE_API_USER, "X-API-PUBKEY": env.MOOLRE_API_PUBKEY, "Content-Type": "application/json" };
}

export async function initializePayment(payer: string, amount: number, externalref: string, reference = "") {
  try {
    const response = await axios.post(`${env.MOOLRE_API_BASE_URL}/open/transact/payment`, {
      type: 1, channel: env.MOOLRE_PAYMENT_CHANNEL, currency: "GHS", payer, amount: amount.toFixed(2), externalref, reference, accountnumber: env.MOOLRE_ACCOUNT_NUMBER,
    }, { headers: credentials(), timeout: 15_000 });
    if (Number(response.data?.status) !== 1) throw appError(502, response.data?.message || "Moolre payment initialization failed", "MOOLRE_INIT_ERROR");
    return response.data;
  } catch (err: any) {
    logger("Moolre Initialize Error:", err.response?.data || err.message);
    if (err.statusCode) throw err;
    throw appError(502, err.response?.data?.message || err.message || "Moolre payment initialization failed", "MOOLRE_INIT_ERROR");
  }
}

export async function paymentStatus(externalref: string) {
  try {
    const response = await axios.post(`${env.MOOLRE_API_BASE_URL}/open/transact/payment/status`, { externalref }, { headers: credentials(), timeout: 15_000 });
    return response.data;
  } catch (err: any) {
    logger("Moolre Status Error:", err.response?.data || err.message);
    throw err;
  }
}

export async function initiateTransfer(channel: string, receiver: string, amount: number, externalref: string, reference: string) {
  if (!env.MOOLRE_API_USER || !env.MOOLRE_API_KEY || !env.MOOLRE_ACCOUNT_NUMBER) throw appError(500, "Moolre transfer credentials are not configured", "PAYOUT_CONFIG_ERROR");
  const response = await axios.post(`${env.MOOLRE_API_BASE_URL}/open/transact/transfer`, { type: 1, channel, currency: "GHS", amount: amount.toFixed(2), receiver, externalref, reference, accountnumber: env.MOOLRE_ACCOUNT_NUMBER }, { headers: { "X-API-USER": env.MOOLRE_API_USER, "X-API-KEY": env.MOOLRE_API_KEY, "Content-Type": "application/json" }, timeout: 15000 });
  if (Number(response.data?.data?.txstatus ?? response.data?.status) !== 1) throw appError(502, response.data?.message?.[0] || response.data?.message || "Moolre transfer failed", "MOOLRE_TRANSFER_ERROR");
  return response.data;
}
