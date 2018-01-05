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
  const { logger, config, info } = options;

  const { format } = formatter([moneyData.crypto, moneyData.fiat]);

  function coinDisplay(coin, unit) {
    const key = `price_${_.toLower(unit)}`;
    const [number, symbol] = format(parse(coin[key], _.toUpper(unit)), { code: true }).split(" ");
    return [number, [coin["symbol"], symbol]];
  }

  function arrowDisplay(change = 0, emoji = false) {
    if (Math.abs(change) > 10.0 && change >= 0) {
      return emoji ? "⬆️" : "↑";
    } else if (Math.abs(change) > 10.0 && change < 0) {
      return emoji ? "⬇️" : "↓";
    } else if (Math.abs(change) > 5.0 && change < 0) {
      return emoji ? "⤵️" : "⤵︎";
    } else if (Math.abs(change) > 5.0 && change >= 0) {
      return emoji ? "⤴️" : "⤴︎";
    } else if (Math.abs(change) > 3.0 && change < 0) {
      return emoji ? "↘️" : "↘︎";
    } else if (Math.abs(change) > 3.0 && change >= 0) {
      return emoji ? "↗️" : "↗︎";
    } else if (Math.abs(change) > 1.0 && change >= 0) {
      return emoji ? "➡️" : "→";
    } else {
      return emoji ? "⏺" : "—";
    }
  }

  const bot = new Telegraf(config.get("TELEGRAM:TOKEN"), {
    username: config.get("TELEGRAM:USERNAME"),
  });
  bot.telegram.setWebhook(`${config.get("URL")}/${config.get("TELEGRAM:SECRET_PATH")}`);

  // First middleware
  bot.use(async (ctx, next) => {
    logger.info("Message received", {
      text: ctx.message.text,
      chat: ctx.chat,
    });

    // Error handler
    try {
      await next();
    } catch (e) {
      await ctx.reply("Uncaught error :(");
      throw e;
    }
  });

  // Error logger
  bot.catch(err => {
    logger.error("Uncaught error", err);
  });

  // FIXME: group chat hack
  // See: https://github.com/telegraf/telegraf/issues/287#issuecomment-354140157
  bot.use((ctx, next) => {
    if (ctx.message && typeof ctx.message.text !== "undefined") {
      ctx.message.text = ctx.message.text.replace(new RegExp("@" + bot.options.username, "i"), "");
    }
    return next(ctx);
  });

  bot.command("start", ctx => {
    ctx.replyWithMarkdown(dedent`
      👋 Hi there! This is Cryptowl Bot 🦉🔮

      This bot uses coinmarketcap.com as it's main source of information.

      👉 Type /help to see available commands.
      👉 Type /donations to keep this bot alive 🙂
    `);
  });

  bot.command("help", ctx => {
    ctx.replyWithMarkdown(dedent`
      *Some commands:*

      \`/top[number][_convert]\`
      Ranked coins and optionally convert the _fiat_ value.
      /top /top\_CLP /top20 /top20\_CLP

      \`/(coin)[_convert]\`
      Particular coin and optionally convert the _fiat_ value.
      /BTC /eth /MIOTA\_CLP /neo\_eur

      👉 Type /donations to keep this bot alive 🙂
    `);
  });

  bot.command("about", ctx => {
    ctx.replyWithMarkdown(dedent`
      *@cryptowl_bot (${info.version})*
      *License:* ${info.license}
      *Repository:* ${info.repository.url}

      *coinmarketcap.com is the main source of information*

      👤 *Author:*
      • ${info.author.name}
      • ${info.author.email}
      • ${info.author.url}
      • @${info.author.username}

      👉 Type /donations to keep this bot alive 🙂
    `);
  });

  bot.command("donations", ctx => {
    const wallets = ["BTC", "ETH", "DASH", "BCH", "LTC", "CHA", "ADA"];
    ctx.replyWithMarkdown(dedent`
      *Thanks for caring about the project!*
      It cost \`5 USD\` monthly to keep this bot alive.

      ${wallets
        .map(wallet => {
          return dedent`
            *${wallet}*:
            \`${config.get(["DONATIONS", wallet].join(":"))}\`
          `;
        })
        .join("\n\n")}
    `);
  });

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

      const arrow = arrowDisplay(change);

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

    const change = _.toNumber(data["percent_change_1h"]);
    const arrow = arrowDisplay(change, true);
    const [number, units] = coinDisplay(data, _.toUpper(convert));
    const cap = numeral(data[`market_cap_${_.toLower(convert)}`])
      .format("0.00 a")
      .toUpperCase();

    await ctx.replyWithMarkdown(dedent`
      ${arrow} *${coin["name"]}*
      🌐 \`${number}\` ${`/${units[0]}_${units[1]}`.replace("_", String.raw`\_`)}
      💰 \`${cap} ${_.toUpper(convert)}\`
      🏆 \`#${data["rank"]}\`

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
