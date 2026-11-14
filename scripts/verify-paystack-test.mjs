// Isolated Paystack sandbox check. No app database, wallet or live key is used.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
try {
  process.loadEnvFile(resolve(".env.paystack-test.local"));
} catch {
  throw new Error("Save the ignored .env.paystack-test.local file first.");
}
const key = process.env.PAYSTACK_TEST_SECRET_KEY?.trim();
if (!key?.startsWith("sk_test_"))
  throw new Error("A Paystack TEST secret key is required. Live keys are refused.");
const reference = `qa_ai_${randomUUID()}`;
const amount = 20000,
  currency = "ZAR";
async function api(path, body) {
  const response = await fetch(`https://api.paystack.co${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const json = await response.json();
  if (!response.ok || !json.status || !json.data)
    throw new Error(
      `Paystack sandbox request failed (HTTP ${response.status}). Check the test account configuration.`,
    );
  return json.data;
}
let close;
const done = new Promise((resolve) => {
  close = resolve;
});
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname != "/paystack-test-return") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  try {
    if (url.searchParams.get("reference") !== reference)
      throw new Error("Unexpected test reference.");
    const tx = await api(`/transaction/verify/${encodeURIComponent(reference)}`);
    if (
      tx.domain !== "test" ||
      tx.status !== "success" ||
      tx.reference !== reference ||
      tx.currency !== currency ||
      Number(tx.amount) !== amount
    )
      throw new Error("Test payment is not confirmed or its amount/currency/domain differs.");
    console.log(
      JSON.stringify({
        result: "Paystack TEST payment verified",
        reference,
        amountMinor: amount,
        currency,
        domain: tx.domain,
        appBalanceCredited: false,
      }),
    );
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(
      "<h1>Paystack test passed</h1><p>Test payment verified. No live money or application balance was changed.</p>",
    );
    close();
  } catch (error) {
    console.error(error.message);
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Test payment could not be verified. See the local test result.");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const port = server.address().port;
  const result = await api("/transaction/initialize", {
    email: "paystack-qa@example.com",
    amount,
    currency,
    reference,
    callback_url: `http://127.0.0.1:${port}/paystack-test-return`,
    metadata: { purpose: "isolated_ai_balance_test" },
  });
  const checkout = new URL(result.authorization_url);
  if (checkout.protocol !== "https:" || checkout.hostname !== "checkout.paystack.com")
    throw new Error("Unexpected test checkout destination.");
  console.log(
    JSON.stringify({
      mode: "TEST ONLY",
      checkoutUrl: checkout.href,
      amountMinor: amount,
      currency,
      reference,
      note: "Use Paystack test payment details only. The app wallet is not connected to this isolated provider test.",
    }),
  );
  const timer = setTimeout(
    () => {
      console.log("Test checkout timed out; no app balance changed.");
      close();
    },
    10 * 60 * 1000,
  );
  await done;
  clearTimeout(timer);
} finally {
  server.close();
}
