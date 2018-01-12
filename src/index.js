"use strict";

const Koa = require("koa");
const bodyParser = require("koa-bodyparser");
const koaLogger = require("koa-logger");
const Router = require("koa-router");

const dedent = require("dedent");
const _ = require("lodash");
const moment = require("moment");

const SurBTC = require("@cryptolw/exchange-surbtc");
const CryptoMKT = require("@cryptolw/exchange-cryptomkt");

const configuration = require("./configuration");
const createBot = require("./bot");
const createLogger = require("./logger");
const info = require("../package.json");

const config = configuration();

const logger = createLogger(config);

const services = [new SurBTC(), new CryptoMKT()];

// eslint-disable-next-line no-unused-vars
const bot = createBot({
  logger,
  services,
  config,
  info,
});

const app = new Koa();
const router = new Router();

router.use(koaLogger());
router.use(bodyParser());

router.get("/", ctx => {
  ctx.body = "Hello world";
});

router.post(`/${config.get("TELEGRAM:SECRET_PATH")}`, async ctx => {
  ctx.body = "ok";
  return bot.handleUpdate(ctx.request.body, ctx.response);
});

app.use(router.routes());
app.use(router.allowedMethods());

app.listen(config.get("PORT"), err => {
  if (err) {
    console.error(err); // eslint-disable-line no-console
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(dedent`
    Bot Started with:
    - NODE_ENV: ${config.get("NODE_ENV")}
    - URL: ${config.get("URL")}
    - PORT: ${config.get("PORT")}
    - BOT: ${config.get("TELEGRAM:USERNAME")}
    - TOKEN: ${_.fill([...config.get("TELEGRAM:TOKEN")], "*", 0, -5).join("")}
    - STARTED: ${moment().format()}
  `);
});
