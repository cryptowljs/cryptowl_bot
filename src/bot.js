"use strict";

const Telegraf = require("telegraf");
const dedent = require("dedent");
const numeral = require("numeral");
const axios = require("axios");
const columnify = require("columnify");
const _ = require("lodash");

const parse = require("@cryptolw/money-parse");
const formatter = require("@cryptolw/money-format");
const moneyData = require("@cryptolw/money-data");

const coins = require("./data/meta");

module.exports = function createBot(options) {
  const { config } = options;

  const { format } = formatter([moneyData.crypto, moneyData.fiat]);

  function coinDisplay(coin, unit) {
    const key = `price_${_.toLower(unit)}`;
    const [number, symbol] = format(parse(coin[key], _.toUpper(unit)), { code: true }).split(" ");
    return [number, [coin["symbol"], symbol]];
  }

  const bot = new Telegraf(config.get("TELEGRAM:TOKEN"), {
    username: config.get("TELEGRAM:USERNAME"),
  });
  bot.telegram.setWebhook(`${config.get("URL")}/${config.get("TELEGRAM:SECRET_PATH")}`);

  // TODO: commands should accept RegEx.

  /*
    Example:
    /top
    /top_CLP
    /top5
    /top5_CLP
  */
  bot.hears(/^\/top(\d+)?_{0,1}([A-z0-9]+)?$/i, async ctx => {
    const [, limit, convert] = ctx.match;

    const options = _.defaults({ limit, convert }, { limit: 10, convert: "USD" });

    const params = {
      limit: _.toSafeInteger(options.limit),
      convert: _.toUpper(options.convert),
    };
    const response = await axios.get("https://api.coinmarketcap.com/v1/ticker/", { params });

    const data = response.data.map(coin => {
      const [number, units] = coinDisplay(coin, options.convert);
      const change = _.toNumber(coin["percent_change_1h"]);

      let arrow = "—";
      if (Math.abs(change) > 10.0 && change >= 0) {
        arrow = "↑";
      } else if (Math.abs(change) > 10.0 && change < 0) {
        arrow = "↓";
      } else if (Math.abs(change) > 5.0 && change < 0) {
        arrow = "⤵︎";
      } else if (Math.abs(change) > 5.0 && change >= 0) {
        arrow = "⤴︎";
      } else if (Math.abs(change) > 3.0 && change < 0) {
        arrow = "↘︎";
      } else if (Math.abs(change) > 3.0 && change >= 0) {
        arrow = "↗︎";
      } else if (Math.abs(change) > 1.0 && change >= 0) {
        arrow = "→";
      }

      return {
        change: arrow,
        value: number,
        units: `/${units[0]}_${units[1]}`.replace("_", String.raw`\_`),
      };
    });

    const columns = columnify(data, {
      columns: ["change", "value", "units"],
      showHeaders: false,
      config: {
        "change": { // eslint-disable-line
          align: "right",
          dataTransform: text => `\`${text}`, // FIXME: \` hack to use mono-space font
        },
        "value": { // eslint-disable-line
          align: "right",
          dataTransform: text => `${text}\``, // FIXME: \` hack to use mono-space font
        },
        "units": { // eslint-disable-line
          align: "left",
        },
      },
    });

    await ctx.replyWithMarkdown(columns);
  });

  /*
    Example:
    /BTC_CLP_USD
  */
  // bot.hears(/^\/([A-z0-9]+)_([A-z0-9]+)_([A-z0-9]+)$/, async ctx => {
  //   const [, coin, change, convert] = ctx.match.map(s => s.toUpperCase());
  //   ctx.reply([coin, change, convert]);
  // });

  /*
    Example:
    /BTC_CLP
  */
  bot.hears(/^\/([A-z0-9]+)_([A-z0-9]+)$/, async ctx => {
    const [, coinId, convert] = ctx.match.map(s => s.toUpperCase());
    const coin = coins.find(item => _.toUpper(item["symbol"]) === coinId);

    if (!coin) {
      return ctx.reply("Coin not found.");
    }

    const params = {
      convert,
    };
    const response = await axios.get(`https://api.coinmarketcap.com/v1/ticker/${coin.id}/`, { params });
    const data = response.data[0];

    function formatChange(value) {
      const number = _.toNumber(value);
      const display = Math.abs(number).toFixed(2);
      return `${number >= 0 ? "+" : "-"}${display}%`;
    }

    const columns = columnify(
      [
        { change: "1h", value: data["percent_change_1h"] },
        { change: "1d", value: data["percent_change_24h"] },
        { change: "1w", value: data["percent_change_7d"] },
      ],
      {
        columns: ["change", "value"],
        showHeaders: false,
        config: {
          "change": { // eslint-disable-line
            dataTransform: text => `⌚️️ \`${text}:`,
          },
          "value": { // eslint-disable-line
            align: "right",
            dataTransform: text => `${formatChange(text)}\``,
          },
        },
      }
    );

    const arrow = _.toNumber(data["percent_change_1h"]) >= 0 ? "↗️" : "↘️";
    const [number, units] = coinDisplay(data, _.toUpper(convert));
    const cap = numeral(data[`market_cap_${_.toLower(convert)}`])
      .format("0.00 a")
      .toUpperCase();

    await ctx.replyWithMarkdown(dedent`
      ${arrow} *${coin["name"]}*
      🌐 \`${number}\` ${`/${units[0]}_${units[1]}`.replace("_", String.raw`\_`)}
      💰 \`${cap} ${_.toUpper(convert)}\`

      ${columns}
    `);
  });

  /*
    Example:
    /BTC
  */
  bot.hears(/^\/([A-z0-9]+)$/, async ctx => {
    const [, coinId] = ctx.match.map(s => s.toUpperCase());
    const coin = coins.find(item => _.toUpper(item["symbol"]) === coinId);

    if (!coin) {
      return ctx.reply("Coin not found.");
    }

    const params = {};
    const response = await axios.get(`https://api.coinmarketcap.com/v1/ticker/${coin.id}/`, { params });
    const data = response.data[0];

    function formatChange(value) {
      const number = _.toNumber(value);
      const display = Math.abs(number).toFixed(2);
      return `${number >= 0 ? "+" : "-"}${display}%`;
    }

    const columns = columnify(
      [
        { change: "1h", value: data["percent_change_1h"] },
        { change: "1d", value: data["percent_change_24h"] },
        { change: "1w", value: data["percent_change_7d"] },
      ],
      {
        columns: ["change", "value"],
        showHeaders: false,
        config: {
          "change": { // eslint-disable-line
            dataTransform: text => `⌚️️ \`${text}:`,
          },
          "value": { // eslint-disable-line
            align: "right",
            dataTransform: text => `${formatChange(text)}\``,
          },
        },
      }
    );

    const arrow = _.toNumber(data["percent_change_1h"]) >= 0 ? "↗️" : "↘️";
    const [number, units] = coinDisplay(data, "USD");
    const cap = numeral(data["market_cap_usd"])
      .format("0.00 a")
      .toUpperCase();

    await ctx.replyWithMarkdown(dedent`
      ${arrow} *${coin["name"]}*
      🌐 \`${number}\` ${`/${units[0]}_${units[1]}`.replace("_", String.raw`\_`)}
      💰 \`${cap} USD\`

      ${columns}
    `);
  });

  return bot;
};
