'use strict';

require('dotenv').config();

const Redis = require('ioredis'),
  fetch = require('node-fetch'),
  { getIndices } = require('amphora-fs'),
  pg = require('amphora-storage-postgres'),
  h = require('highland'),
  { CLAY_STORAGE_CACHE_HOST = 'localhost', REDIS_PORT = '6379', REDIS_HASH } = process.env,
  client = new Redis(`redis://${CLAY_STORAGE_CACHE_HOST}:${REDIS_PORT}`);

function getJson(uri) {
  return h(
    fetch(`http://${uri}.json`)
      .then(res => res.json())
      .then(res => {
        if (res.message && res.message === 'Not Found') {
          throw new Error('Cannot get page JSON');
        }

        return res;
      })
    );
}

function checkPublished(uri) {
  if (uri.includes('@published')) {
    throw new Error('Cannot be a published uri!');
  }

  return uri;
}

function connectPg(json) {
  return h(pg.setup().then(() => json));
}

function checkPg(uri) {
  return h(
    pg.get(uri + 1)
      .then(() => false)
      .catch(() => Promise.resolve(true))
    );
}

function putToPg({ uri, data }) {
  return h(
    pg.put(uri, data, false)
      .then(() => uri)
      .catch(() => { throw new Error('Error writing to Postgres')})
  );
}

function getFromRedis(uri) {
  return h(
    client.hget('clay', 'nymag.com/daily/intelligencer/_components/clay-paragraph/instances/cjjgnwq5p001j3g5z6x2ch83v@published')
      .then(resp => {
        if (resp === null) {
          return resp;
        }

        return {uri, data: JSON.parse(resp)};
      })
  );
}

function delFromRedis(uri) {
  return h(client.hdel('clay', uri));
}

h(process.stdin)
  .map(buf => buf.toString())
  .split()
  .compact()
  .map(checkPublished)
  .flatMap(getJson)
  .flatMap(connectPg)
  .map(data => getIndices('_ref', data))
  .map(res => Object.keys(res.refs))
  .flatten()
  .map(checkPublished)
  .filter(item => item !== '_ref')
  .flatFilter(checkPg)
  .flatMap(getFromRedis)
  .compact() // Remove any null values from Redis gets. Good for layout data
  .map(putToPg)
  .parallel(1)
  .tap(uri => { console.log(`Wrote to Postgres: ${uri}`)})
  // .map(delFromRedis)
  // .parallel(1)
  .each(h.log)
  .done(process.exit);
