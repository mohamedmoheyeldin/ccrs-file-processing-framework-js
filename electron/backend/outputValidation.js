const fs = require("node:fs");
const { codes } = require("./paymentAuthorityCatalog");
const { loadStationOptions } = require("./stationCatalog");
const { getSeocOptions, getSituationalSeocOptions } = require("./referralGenerator");
const { NETWORK_VALUES } = require("./contentEditor");

function validateOutputFiles(files, options = {}, overrides = {}) {
  const stations = new Set(options.selectedStationIds?.length && !options.randomizeStationId
    ? options.selectedStationIds : overrides.StationID ? [overrides.StationID] : loadStationOptions().map((item) => item.stationKey));
  const payments = new Set(options.useAllPaymentCodes ? codes : options.selectedPaymentCodes?.length
    ? options.selectedPaymentCodes : overrides.PaymentAuthorityCode ? [overrides.PaymentAuthorityCode] : codes);
  const networks = new Set(options.selectedNetworks?.length ? options.selectedNetworks : NETWORK_VALUES);
  const pairKey = (key, id) => `${key}\u0000${id}`;
  const regular = new Set((options.selectedSeocPairs?.length ? options.selectedSeocPairs : getSeocOptions()).map((item) => pairKey(item.seocKey, item.seocId)));
  const situational = new Set((options.selectedSituationalSeocPairs?.length ? options.selectedSituationalSeocPairs : getSituationalSeocOptions()).map((item) => pairKey(item.seocKey, item.seocId)));
  function visit(node) {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      const allowed = { StationID: stations, PaymentAuthorityCode: payments, Network: networks }[key];
      if (allowed && !allowed.has(String(value))) throw new Error(`Output validation: ${key} is outside the selected reference values.`);
      visit(value);
    }
    if (node.SeocKey && node.SeocID && !regular.has(pairKey(node.SeocKey, node.SeocID))) throw new Error("Output validation: SEOC Number and ID must match an approved pair.");
    if (node.SituationalSeocKey && node.SituationalSeocID && !situational.has(pairKey(node.SituationalSeocKey, node.SituationalSeocID))) throw new Error("Output validation: Situational SEOC Number and ID must match an approved pair.");
  }
  for (const file of files) visit(JSON.parse(fs.readFileSync(file, "utf8")));
}
module.exports = { validateOutputFiles };
