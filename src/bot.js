"use strict";

const Telegraf = require("telegraf");

module.exports = function createBot(options) {
  const { config } = options;

  const bot = new Telegraf(config.get("TELEGRAM:TOKEN"), {
    username: config.get("TELEGRAM:USERNAME"),
  });
  bot.telegram.setWebhook(`${config.get("URL")}/${config.get("TELEGRAM:SECRET_PATH")}`);

  // TODO: commands should accept RegEx.

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
