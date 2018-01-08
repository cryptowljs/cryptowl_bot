const numeral = require("numeral");
const axios = require("axios");
const scrapeIt = require("scrape-it");
const _ = require("lodash");

const parse = require("@cryptolw/money-parse");
const formatter = require("@cryptolw/money-format");
const moneyData = require("@cryptolw/money-data");

const coins = require("../data/meta");

const { format } = formatter([moneyData.crypto, moneyData.fiat]);

// TODO: updates this from body > #currency-exchange-rates selector.
const RATES = [
  "usd",
  "eur",
  "cny",
  "gbp",
  "cad",
  "rub",
  "hkd",
  "jpy",
  "aud",
  "brl",
  "inr",
  "krw",
  "mxn",
  "idr",
  "chf",
  "eth",
  "clp",
  "czk",
  "dkk",
  "huf",
  "ils",
  "myr",
  "nok",
  "nzd",
  "php",
  "pkr",
  "pln",
  "sek",
  "sgd",
  "thb",
  "try",
  "twd",
  "zar",
];

class CoinMarketCap {
  format(coin, unit) {
    const key = `price_${_.toLower(unit)}`;
    const [number, symbol] = format(parse(coin[key], _.toUpper(unit)), { code: true }).split(" ");
    return [number, [coin["symbol"], symbol]];
  }

  async getTop(opts = {}) {
    const options = _.defaults(opts, { limit: 10, convert: "USD" });

    const params = {
      limit: _.toSafeInteger(options.limit),
      convert: _.toUpper(options.convert),
    };
    const response = await axios.get("https://api.coinmarketcap.com/v1/ticker/", { params });
    return { result: response.data, options };
  }

  async getCoin(id, opts = {}) {
    const coin = coins.find(item => _.toUpper(item["symbol"]) === _.toUpper(id));
    if (!coin) {
      return { result: null };
    }

    const params = {
      convert: opts.convert ? _.toUpper(opts.convert) : undefined,
    };
    const response = await axios.get(`https://api.coinmarketcap.com/v1/ticker/${coin.id}/`, { params });
    const api = response.data[0];

    const rates = {};
    for (const rate of RATES) {
      rates[_.toUpper(rate)] = {
        selector: "#currency-exchange-rates",
        attr: `data-${rate}`,
        convert: _.toNumber,
      };
    }

    const page = await scrapeIt(`https://coinmarketcap.com/currencies/${coin.id}/#markets`, {
      rows: {
        listItem: "#markets-table > tbody > tr",
        data: {
          rank: {
            selector: "td:nth-child(1)",
            convert: _.toNumber,
          },
          source: {
            selector: "td:nth-child(2)",
          },
          pair: {
            selector: "td:nth-child(3)",
            convert: text => text.split("/"),
          },
          url: {
            selector: "td:nth-child(3) > a",
            attr: "href",
          },
          volume: {
            selector: "td:nth-child(4)",
            data: {
              USD: {
                selector: "span",
                attr: "data-usd",
                convert: text => parse(text, "USD"),
              },
              BTC: {
                selector: "span",
                attr: "data-btc",
                convert: text => parse(text, "BTC"),
              },
              native: {
                selector: "span",
                attr: "data-native",
              },
            },
          },
          price: {
            selector: "td:nth-child(5)",
            data: {
              USD: {
                selector: "span",
                attr: "data-usd",
                convert: text => parse(text, "USD"),
              },
              BTC: {
                selector: "span",
                attr: "data-btc",
                convert: text => parse(text, "BTC"),
              },
              native: {
                selector: "span",
                attr: "data-native",
              },
            },
          },
          share: {
            selector: "td:nth-child(6)",
            convert: text => numeral(text).value(),
          },
          updated: {
            selector: "td:nth-child(7)",
          },
        },
      },
      rates: {
        selector: "body",
        data: rates,
      },
    });

    if (_.isInteger(opts.limit)) {
      page["rows"] = _.take(page["rows"], opts.limit);
    }

    api["markets"] = page["rows"].map(item => {
      item["pair"] = item["pair"].sort(a => {
        return a == api["symbol"] ? -1 : 1;
      });
      const native = item["pair"].find(currency => currency != api["symbol"]);
      item.price.native = parse(item.price.native, native);
      item.volume.native = parse(item.volume.native, native);
      return item;
    });
    api["info"] = coin;

    return { result: api, rates: page["rates"] };
  }

  static aggregateMarkets(markets = []) {
    const aggregation = new Map();
    for (const market of markets) {
      const trade = market["pair"][1];
      const sum = aggregation.get(trade) || {
        symbol: trade,
        exchanges: 0,
        volumes: {
          USD: [],
          BTC: [],
          [trade]: [],
        },
        prices: {
          USD: [],
          BTC: [],
          [trade]: [],
        },
        share: 0,
      };
      sum["volumes"]["USD"].push(market["volume"]["USD"][0]);
      sum["volumes"]["BTC"].push(market["volume"]["BTC"][0]);
      sum["volumes"][trade].push(market["volume"]["native"][0]);
      sum["prices"]["USD"].push(market["price"]["USD"][0]);
      sum["prices"]["BTC"].push(market["price"]["BTC"][0]);
      sum["prices"][trade].push(market["price"]["native"][0]);
      sum["share"] = sum["share"] + market["share"];
      sum["exchanges"] = sum["exchanges"] + 1;
      aggregation.set(trade, sum);
    }

    return _(Array.from(aggregation.values())) // TODO: can be improved?
      .orderBy(["share"], ["desc"])
      .take(7)
      .map(item => {
        const currencies = ["USD", "BTC", item["symbol"]];
        item["price"] = _.transform(
          currencies,
          (acc, c) => {
            const value = item["prices"][c].reduce((prev, current, i) => prev + current * item["volumes"][c][i], 0);
            acc[c] = parse(value / _.sum(item["volumes"][c]));
          },
          {}
        );
        return item;
      })
      .value();
  }
}

module.exports = CoinMarketCap;
