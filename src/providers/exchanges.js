const Rx = require("rxjs");
const util = require("util");
const ms = require("millisecond");

exports.watchPairs = function watchPairs({ services, logger }) {
  const sources = new Rx.BehaviorSubject();
  const observable = Rx.Observable.interval(ms("1 min"))
    .startWith(0)
    .mergeMap(async () => {
      const mapping = new Map();
      for (const service of services) {
        try {
          const markets = await service.getMarkets();
          for (const market of markets) {
            const identifier = market.join("/");
            mapping.has(identifier)
              ? mapping.set(identifier, [...mapping.get(identifier), service])
              : mapping.set(identifier, [service]);
          }
        } catch (err) {
          logger.error("Service getMarket error", util.inspect(err));
        }
      }
      return mapping;
    })
    .subscribe(sources);

  return { sources, observable };
};
