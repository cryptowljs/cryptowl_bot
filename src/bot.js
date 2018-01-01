"use strict";

const Telegraf = require("telegraf");
const axios = require("axios");
const columnify = require("columnify");
const _ = require("lodash");

const parse = require("@cryptolw/money-parse");
const formatter = require("@cryptolw/money-format");
const moneyData = require("@cryptolw/money-data");

module.exports = function createBot(options) {
  const { config } = options;

  const { format } = formatter([moneyData.crypto, moneyData.fiat]);

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

    const data = response.data.map(coin => ({
      symbol: coin["symbol"],
      value: format(parse(coin[`price_${_.toLower(options.convert)}`], _.toUpper(options.convert)), { code: true }),
    }));

    const columns = columnify(data, {
      columns: ["symbol", "value"],
      showHeaders: false,
      paddingChr: " ", // alt+space
      config: {
        "symbol": { // eslint-disable-line
          dataTransform: text => `🌐 /${text}:`,
        },
        "value": { // eslint-disable-line
          dataTransform: text => `\`${text}\``,
        },
      },
    });

    await ctx.replyWithMarkdown(columns);
  });

  /*
    Example:
    /BTC_CLP_USD
  */
  bot.hears(/^\/([A-z0-9]+)_([A-z0-9]+)_([A-z0-9]+)$/, async ctx => {
    const [, coin, change, convert] = ctx.match.map(s => s.toUpperCase());
    ctx.reply([coin, change, convert]);
  });

  /*
    Example:
    /BTC_CLP
  */
  bot.hears(/^\/([A-z0-9]+)_([A-z0-9]+)$/, async ctx => {
    const [, coin, change] = ctx.match.map(s => s.toUpperCase());
    ctx.reply([coin, change]);
  });

  /*
    Example:
    /BTC
  */
  bot.hears(/^\/([A-z0-9]+)$/, async ctx => {
    const [, coin] = ctx.match.map(s => s.toUpperCase());
    ctx.reply([coin]);
  });

  return bot;
};
