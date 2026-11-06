# POS R2 Provider Connector Contract — Design Boundary

The following is an integration contract, **not a claim of live provider connectivity**. No terminal/SARA provider has yet supplied authenticated production API specifications in this task.

### Adapter prerequisites
- Vendor/acquirer written onboarding permission, merchant and terminal IDs, sandbox keys and test device.
- Signed message specification, trusted origin/network policy, certificate rotation, signature verification, request timestamps, unique provider transaction IDs, unique nonces, rate limits and IP allowlisting as appropriate to provider.
- A provider-neutral attempt record and immutable provider-event audit; no PCI sensitive authentication data storage.
- Verify exact amount, MYR currency, expected order version, business merchant, device/branch binding, and actual PAID/APPROVED result (not a mere QR scan or API 200).
- Handle PENDING, FAILED, REVERSED, REFUNDED, UNKNOWN and network timeouts; a timeout is not success. Retry and query payment status through the provider, with a unique request ID and idempotency.
- Card terminal transactions use PCI-compliant validated hardware/SDK. Never enter PAN/PIN/CVV or card track data into TPOS.
- Only a separately approved SARA/MyKasih adapter may request/confirm MyKad benefits, and the eligible-item subset must be checked against officially provided rules.
- Credit/debit/EWallet/card settlements require bank clearing accounts and reconciliation; refunds/reversals require separate audited postings, never deleting original financial history.

### Connection states (for next provider-specific implementation)
`DISCONNECTED → REGISTERED → AUTHENTICATED → TERMINAL_READY → PAYMENT_PENDING → PROVIDER_APPROVED → SETTLED`

Rejected, ambiguous or disconnected states MUST NOT call the POS sale posting routine.

### Testing before production
- Real device pairing, signed and unsigned webhook tests, duplicate webhooks, replay/reordering, wrong amount, wrong merchant, expired token, timeouts, incomplete settlement, disconnected device, partial SARA eligible items, reversal/refund, simultaneous cashiers, branch boundaries, and journal reconciliation.
