// Backwards-compat shim. The customer-facing brand is Zemgo; this file used to
// render the Hope Consulting wordmark. Existing imports keep working by
// re-exporting the Zemgo logo.
export { ZemgoLogo as HopeLogo } from "./zemgo-logo";
