"use strict";

const Telegraf = require("telegraf");
const Bluebird = require("bluebird");
const dedent = require("dedent");
const numeral = require("numeral");
const columnify = require("columnify");
const util = require("util");
const _ = require("lodash");

const parse = require("@cryptolw/money-parse");
const formatter = require("@cryptolw/money-format");
const moneyData = require("@cryptolw/money-data");

const coins = require("./data/meta");
const { getCountry } = require("./data/countries");
const { watchPairs } = require("./providers/exchanges");
const CoinMarketCap = require("./providers/CoinMarketCap");

module.exports = function createBot(options) {
  const { logger, config, info } = options;

  const { sources } = watchPairs(options);

  const { format } = formatter([moneyData.crypto, moneyData.fiat]);
  const cmc = new CoinMarketCap();

  function link(u1, u2) {
    return `/${u1}_${u2}`.replace("_", String.raw`\_`);
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
    } catch (err) {
      // See: https://github.com/axios/axios#handling-errors
      if (err.response) {
        await ctx.reply("External API error.");
      } else if (err.request) {
        await ctx.reply("Internal connection error.");
      } else {
        await ctx.reply("Uncaught error :(");
      }
      throw err;
    }
  });

  // Error logger
  bot.catch(err => {
    try {
      logger.error("Uncaught error", util.inspect(err));
    } catch (e) {
      console.error("Can't even parse log error", err); // eslint-disable-line no-console
    }
  });

  // FIXME: group chat hack
  // See: https://github.com/telegraf/telegraf/issues/287#issuecomment-354140157
  bot.use((ctx, next) => {
    if (ctx.message && typeof ctx.message.text !== "undefined") {
      ctx.message.text = ctx.message.text.replace(new RegExp("@" + bot.options.username, "i"), "");
    }
    return next(ctx);
  });

  bot.command("start", async ctx => {
    await ctx.replyWithMarkdown(dedent`
      👋 Hi there! This is Cryptowl Bot 🦉🔮

      This bot uses coinmarketcap.com as it's main source of information.

      👉 Type /help to see available commands.
      👉 Type /donations to keep this bot alive 🙂
    `);
  });

  bot.command("help", async ctx => {
    await ctx.replyWithMarkdown(dedent`
      *Some commands:*

      \`/top[number][_convert]\`
      Ranked coins and optionally convert the _fiat_ value.
      /top
      /top\_CLP
      /top20
      /top20\_CLP

      \`/(coin)[_convert]\`
      Particular coin and optionally convert the _fiat_ value.
      /BTC
      /eth
      /MIOTA\_CLP
      /neo\_eur

      \`/exchanges_(coin)_(convert)\`
      Get exchanges with that pair
      /exchanges\_BTC\_CLP
      /exchanges\_ETH\_CLP

      \`/rates_(coin)[_convert]\`
      Get global exchange rates for that pair and convert
      /rates\_BTC
      /rates\_BTC\_CLP

      👉 Type /donations to keep this bot alive 🙂
    `);
  });

  bot.command("about", async ctx => {
    await ctx.replyWithMarkdown(dedent`
      *@cryptowl_bot (${info.version})*
      *License:* ${info.license}
      *Repository:* ${info.repository.url.replace("_", String.raw`\_`)}

      *coinmarketcap.com is the main source of information*

      👤 *Author:*
      • ${info.author.name}
      • ${info.author.email}
      • ${info.author.url}
      • @${info.author.username}

      👉 Type /donations to keep this bot alive 🙂
    `);
  });

  bot.command("donations", async ctx => {
    const wallets = ["BTC", "ETH", "DASH", "BCH", "LTC", "CHA", "ADA"];
    await ctx.replyWithMarkdown(dedent`
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
    bot.telegram.sendChatAction(ctx.from.id, "typing"); // TODO: ctx.replyWithChatAction("typing") is broken

    const [, limit, convert] = ctx.match;

    const { result, options } = await cmc.getTop({ limit, convert });

    const data = result.map(coin => {
      const [number, units] = cmc.format(coin, options.convert);
      const change = _.toNumber(coin["percent_change_1h"]);

      const arrow = arrowDisplay(change);

      return {
        change: arrow,
        value: number,
        units: link(...units),
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
    /exchanges_BTC_CLP
  */
  bot.hears(/^\/exchanges_([A-z0-9]+)_([A-z0-9]+)$/, async ctx => {
    bot.telegram.sendChatAction(ctx.from.id, "typing"); // TODO: ctx.replyWithChatAction("typing") is broken

    const [, coinId, convert] = ctx.match.map(s => s.toUpperCase());

    const houses = [];
    const identifier = [coinId, convert].join("/");
    if (sources.value.has(identifier)) {
      const exchanges = sources.value.get(identifier) || [];
      const queries = exchanges
        .map(exchange => exchange.getCurrent([[coinId, convert]]))
        .map(p => Bluebird.resolve(p).reflect());

      const results = await Bluebird.all(queries);

      const data = results
        .filter(inspection => inspection.isFulfilled())
        .map(inspection => inspection.value()[0])
        .map(
          exchange => dedent`
            🏦 *${exchange.exchange}* (${link(...exchange.pair)}):
            📤 BID: \`${format(exchange.ask, { code: true })}\`
            📥 ASK: \`${format(exchange.bid, { code: true })}\`
            📊 Volumen: \`${format(exchange.volume, { code: true })}\`
        `
        );

      houses.push(...data);
    }

    // Put additional and sources steps here.

    if (_.isEmpty(houses)) {
      await ctx.replyWithMarkdown(dedent`
        Missing exchanges with that support :(
      `);
    } else {
      await ctx.replyWithMarkdown(dedent`
        ${houses.join("\n\n")}
      `);
    }
  });

  /*
    Example:
    /rates_BTC_CLP
  */
  bot.hears(/^\/rates_([A-z0-9]+)_([A-z0-9]+)$/, async ctx => {
    bot.telegram.sendChatAction(ctx.from.id, "typing"); // TODO: ctx.replyWithChatAction("typing") is broken

    const [, coinId, convert] = ctx.match.map(s => s.toUpperCase());

    const data = await cmc.getCoin(coinId, { convert });
    const { rates, markets } = await cmc.getCoinRates(coinId, { convert });
    const to = _.toUpper(convert);

    if (!data) {
      return ctx.reply("Coin not found.");
    } else if (!rates[to]) {
      return ctx.reply("Conversion not supported yet.");
    }

    const [, units] = cmc.format(data, to);

    const rate = rates[to];
    const rows = CoinMarketCap.aggregateMarkets(markets, { limit: 10 }).map(market => {
      const share = numeral(market.share).format("0.00%");
      const price = parse(market.price["USD"][0] / rate, to);
      const value = format(price, { code: true }).split(" ")[0];
      const about = getCountry(market.symbol) || coins.find(item => _.toUpper(item["symbol"]) === market.symbol) || {};
      const emoji = about.emoji || "💎";
      return dedent`
        💱 ${link(units[0], market.symbol)} ➔ ${share}
        ${emoji} \`${value}\` ${link(...units)}
      `;
    });

    await ctx.replyWithMarkdown(dedent`
      ${rows.join("\n----\n")}

      _rate: ${rate < 1 ? `1 USD = ${1 / rate} ${to}` : `1 ${to} = ${rate} USD`}_
    `);
  });

  /*
    Example:
    /rates_BTC
    TODO: DRY
  */
  bot.hears(/^\/rates_([A-z0-9]+)$/, async ctx => {
    bot.telegram.sendChatAction(ctx.from.id, "typing"); // TODO: ctx.replyWithChatAction("typing") is broken

    const [, coinId] = ctx.match.map(s => s.toUpperCase());

    const data = await cmc.getCoin(coinId);
    const { markets } = await cmc.getCoinRates(coinId);

    if (!data) {
      return ctx.reply("Coin not found.");
    }

    const [, units] = cmc.format(data, "USD");

    const rows = CoinMarketCap.aggregateMarkets(markets, { limit: 10 }).map(market => {
      const share = numeral(market.share).format("0.00%");
      const price = parse(market.price["USD"][0], "USD");
      const value = format(price, { code: true }).split(" ")[0];
      const about = getCountry(market.symbol) || coins.find(item => _.toUpper(item["symbol"]) === market.symbol) || {};
      const emoji = about.emoji || "💎";
      return dedent`
        💱 ${link(units[0], market.symbol)} ➔ ${share}
        ${emoji} \`${value}\` ${link(...units)}
      `;
    });

    await ctx.replyWithMarkdown(dedent`
      ${rows.join("\n----\n")}
    `);
  });

  /*
    Example:
    /BTC_CLP
  */
  bot.hears(/^\/([A-z0-9]+)_([A-z0-9]+)$/, async ctx => {
    bot.telegram.sendChatAction(ctx.from.id, "typing"); // TODO: ctx.replyWithChatAction("typing") is broken

    const [, coinId, convert] = ctx.match.map(s => s.toUpperCase());

    const data = await cmc.getCoin(coinId, { convert });
    const { rates } = await cmc.getCoinRates(coinId, { convert });
    const to = _.toUpper(convert);

    if (!data) {
      return ctx.reply("Coin not found.");
    } else if (!rates[to]) {
      return ctx.reply("Conversion not supported yet.");
    }

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
    const [number, units] = cmc.format(data, to);
    const cap = numeral(data[`market_cap_${_.toLower(convert)}`])
      .format("0.00 a")
      .toUpperCase();

    const rate = rates[to];

    const header = dedent`
      ${arrow} *${data.info["name"]}*
      🌐 \`${number}\` ${link(...units)}
      💰 \`${cap} ${_.toUpper(convert)}\`
      🏆 \`#${data["rank"]}\`
    `;

    const links = dedent`
      💡 /${data.info["symbol"]}
      💡 /exchanges\_${data.info["symbol"]}\_${to}
      💡 /rates\_${data.info["symbol"]}\_${to}
    `;

    const conversions = dedent`
      _rate: ${rate < 1 ? `1 USD = ${1 / rate} ${to}` : `1 ${to} = ${rate} USD`}_
    `;

    await ctx.replyWithMarkdown(dedent`
      ${header}

      ${columns}

      ${links}

      ${conversions}
    `);
  });

  /*
    Example:
    /BTC
  */
  bot.hears(/^\/([A-z0-9]+)$/, async ctx => {
    bot.telegram.sendChatAction(ctx.from.id, "typing"); // TODO: ctx.replyWithChatAction("typing") is broken

    const [, coinId] = ctx.match.map(s => s.toUpperCase());

    const data = await cmc.getCoin(coinId);

    if (!data) {
      return ctx.reply("Coin not found.");
    }

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
    const [number, units] = cmc.format(data, "USD");
    const cap = numeral(data["market_cap_usd"])
      .format("0.00 a")
      .toUpperCase();

    const header = dedent`
      ${arrow} *${data.info["name"]}*
      🌐 \`${number}\` ${link(...units)}
      💰 \`${cap} USD\`
      🏆 \`#${data["rank"]}\`
    `;

    const links = dedent`
      💡 /${data.info["symbol"]}\_CLP
      💡 /rates\_${data.info["symbol"]}
    `;

    await ctx.replyWithMarkdown(dedent`
      ${header}

      ${columns}

      ${links}
    `);
  });

  return bot;
};
