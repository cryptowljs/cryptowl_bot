const { countries, lookup } = require("country-data");

exports.getCountry = function getCountry(currency) {
  switch (currency) {
    // First countries where the first lookup result is not that representative.
    case "USD":
      return countries["USA"];
    case "EUR":
      return countries["EU"];
    default: {
      const found = lookup.countries({ currencies: currency });
      return found.length ? found[0] : null;
    }
  }
};
