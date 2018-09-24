'use strict';

require('dotenv').config();

const Redis = require('ioredis'),
  fetch = require('node-fetch'),
  { getIndices } = require('amphora-fs'),
  h = require('highland'),
  { CLAY_STORAGE_CACHE_HOST = 'localhost', REDIS_PORT = '6379', REDIS_HASH } = process.env,
  client = new Redis(`redis://${CLAY_STORAGE_CACHE_HOST}:${REDIS_PORT}`);

function getJson(uri) {
  return h(fetch(`http://${uri}.json`).then(res => res.json()))
}

function checkPublished(uri) {
  if (uri.includes('@published')) {
    throw new Error('Cannot be a published uri!');
  }

  return uri;
}

h(process.stdin)
  .map(buf => buf.toString())
  .split()
  .compact()
  .map(checkPublished)
  .flatMap(getJson)
  .map(data => getIndices('_ref', data))
  .map(res => Object.keys(res.refs))
  .flatten()
  .map(checkPublished)
  .filter(item => item !== '_ref')
  .map(ref => ['hdel', REDIS_HASH, ref])
  .collect()
  .map((cmds) => h(client.pipeline(cmds).exec().then((res) => res.map((r, idx) => `${r[0] ? `ERROR: ${r[0]} ${cmds[idx][2]}` : `SUCCESS: ${cmds[idx][2]}` }`))))
  .merge()
  .each(h.log)
  .done(process.exit);
