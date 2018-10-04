'use strict';

require('dotenv').config();

const Redis = require('ioredis'),
  fetch = require('node-fetch'),
  { getIndices } = require('amphora-fs'),
  pg = require('amphora-storage-postgres'),
  h = require('highland'),
  clayutils = require('clayutils'),
  { CLAY_STORAGE_CACHE_HOST = 'localhost', REDIS_PORT = '6379', REDIS_HASH } = process.env,
  client = new Redis(`redis://${CLAY_STORAGE_CACHE_HOST}:${REDIS_PORT}`);
let allKeys = [];

function getJson(uri) {
  return h(
    fetch(`http://${uri}.json`)
      .then(res => res.json())
      .then(data => {
        if (data.message && data.message === 'Not Found') {
          throw new Error('Cannot get page JSON');
        }

        return { uri, data };
      })
    .catch((e) => {
      console.log(`error getting page json for ${uri}`);
      return {}
    })
    );
}

function connectPg() {
  return pg.setup();
}

function checkPg(uri) {
  return h(
    pg.get(uri)
      .then(() => ({ uri, exists: true }))
      .catch(() => ({ uri, exists: false }))
    );
}

function putToPg(item) {
  if (item.data) {
    return h(
      pg.put(item.uri, item.data, false)
        .then(() => item)
        .catch(() => { throw new Error('Error writing to Postgres')})
    );
  } else {
    return h.of(item);
  }
}

function getFromRedis(item) {
  const { uri } = item;

  if (!item.exists) {
    return h(
      client.hget('mydb:h', uri)
      .then(resp => {
        if (resp === null && !clayutils.isPublished(uri)) { // check the published instance
          return client.hget('mydb:h', clayutils.replaceVersion(uri, 'published'))
            .then((resp) => {
              if (resp === null) { return resp } // we're SOL

              // replace references to published components
              return { uri, data: JSON.parse(resp.replace(/@published\"/g, '"')) };
            });
        }

        return {uri, data: JSON.parse(resp)};
      })
    );
  }

  return h.of(item);
}

function handleData(stream) {
  return stream
    .compact()
    .flatMap(checkPg)
    .flatMap(getFromRedis)
    .compact() // Remove any null values from Redis gets. Good for layout data
    .map(putToPg)
    .parallel(1)
    .tap(item => { if (!item.exists) {console.log(`Wrote to Postgres: ${item.uri}`) } })
    .map((item) => item.uri)
}

connectPg().then(() => {
  h(process.stdin)
    .map(buf => buf.toString())
    .split()
    .compact()
    .ratelimit(1, 1000)
    .compact()
    .tap((uri) => console.log(`Migrating ${uri}`))
    .flatMap(getJson)
    .map(page => getIndices(page.uri, page.data))
    .map(res => Object.keys(res.refs))
    .flatten()
    .through(handleData)
    .merge()
    .done(process.exit);
})