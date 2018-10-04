'use strict';

require('dotenv').config();

const Redis = require('ioredis'),
  client = new Redis(`redis://${process.env.REDIS_HOST}:6379`),
  _ = require('lodash'),
  h = require('highland'),
  pg = require('amphora-storage-postgres'),
  args = require('yargs').argv,
  { REDIS_HOST, REDIS_PORT, REDIS_HASH, LAYOUTS_WHITELIST } = process.env,
  MATCH_PATTERN = args.match || '*';
let LAYOUTS;


pg.setup()
  .then(() => {
    h(client.hscanStream('mydb:h', {
      match: MATCH_PATTERN,
      count: 1000
    }))
    .flatten()
    .batch(2)
    .map(arr => {
      return { key: arr[0], value: arr[1] }
    })
    .each(h.log)
    .done(() => {
      process.exit();
    });
  });


if (!REDIS_HOST) {
  throw new Error('No redis host set');
}

if (!REDIS_PORT) {
  throw new Error('No redis port set');
}

if (!REDIS_HASH) {
  throw new Error('No redis hash set');
}

if (LAYOUTS_WHITELIST && !_.isArray(LAYOUTS_WHITELIST)) {
  try {
    LAYOUTS = JSON.parse(LAYOUTS_WHITELIST);
  } catch(err) {
    throw err;
  }
} else {
  LAYOUTS = LAYOUTS_WHITELIST || [];
}
