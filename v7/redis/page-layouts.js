'use strict';

require('dotenv').config();

const Redis = require('ioredis'),
  client = new Redis(`redis://localhost:6379`),
  h = require('highland'),
  args = require('yargs').argv,
  { REDIS_HOST, REDIS_PORT, REDIS_HASH, LAYOUTS_WHITELIST } = process.env,
  MERGE_LIMIT = args.mergeLimit || 1,
  BATCH_LIMIT = args.batch || 10,
  MATCH_PATTERN = args.match || '*',
  scanOpts = { match: MATCH_PATTERN, count: 1000 };

h(client.hscanStream(REDIS_HASH, scanOpts))
  .flatten()
  .batch(2)
  .map(arr => ({ key: arr[0], value: JSON.parse(arr[1]) }))
  .map((op) => {
    if (op.value.layout) {
      op.value.layout = op.value.layout.replace('_components', '_layouts');
    }

    return ['hset', REDIS_HASH, op.key, JSON.stringify(op.value)];
  })
  .batch(BATCH_LIMIT)
  .map((cmds) => h(client.pipeline(cmds).exec().then((res) => res.map((r, idx) => `${r[0] ? `ERROR: ${r[0]} ${cmds[idx][2]}` : `SUCCESS: ${cmds[idx][2]}` }`))))
  .mergeWithLimit(MERGE_LIMIT)
  .each(h.log)
  .done(process.exit);
