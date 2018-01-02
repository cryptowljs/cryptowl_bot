"use strict";

const _ = require("lodash");

const coins = require("../data/meta");

async function main() {
  for (const coin of _.slice(coins, 0, 100)) {
    process.stdout.write(`${_.toLower(coin["symbol"])} - ${coin["name"]}\n`);
  }
}

main();
