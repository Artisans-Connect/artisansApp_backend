import { verifyPayment } from "../src/services/paymentsService";

async function main() {
  const ref = "cm_pay_1786359377091_0qk69";
  console.log(`Calling verifyPayment("${ref}")...`);
  try {
    const result = await verifyPayment(ref);
    console.log("Result:", result);
  } catch (error) {
    console.error("Error verifying payment:", error);
  }
}

main().catch(console.error);
