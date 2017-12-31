"use strict";

const Telegraf = require("telegraf");

module.exports = function createBot(options) {
  const { config } = options;

  const bot = new Telegraf(config.get("TELEGRAM:TOKEN"), {
    username: config.get("TELEGRAM:USERNAME"),
  });
  bot.telegram.setWebhook(`${config.get("URL")}/${config.get("TELEGRAM:SECRET_PATH")}`);

  bot.command("help", ctx => ctx.reply("Try send a sticker!"));
  bot.hears("hi", ctx => ctx.reply("Hey there!"));

  return bot;
};
