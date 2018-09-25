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
      pg.put(uri, data, false)
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
        if (resp === null) { // check the published instance
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

function delFromRedis(uri) {
  return h(client.hdel('mydb:h', uri));
}

function handleData(stream) {
  return stream
    .map(checkPublished)
    .map(item => item.replace('@published', ''))
    .flatMap(checkPg)
    .flatMap(getFromRedis)
    .compact() // Remove any null values from Redis gets. Good for layout data
    .map(putToPg)
    .parallel(1)
    .tap(item => { if (!item.exists) {console.log(`Wrote to Postgres: ${uri}`) } })
    .map((item) => item.uri)
}

connectPg().then(() => {
  h(process.stdin)
    .map(buf => buf.toString())
    .split()
    .compact()
    .map(checkPublished)
    .flatMap(getJson)
    .map(data => getIndices('_ref', data))
    .map(res => Object.keys(res.refs).filter(item => item !== '_ref'))
    .flatten()
    .through(handleData)
    .each(h.log)
    .done(() => {
      console.log('deleting unpublished keys from redis...');
      //h(allKeys)
        //.map(checkPublished)
        //.map(key => ([ 'hdel', 'mydb:h', key ]))
        //.collect()
        //.map((cmds) => h(client.pipeline(cmds).exec().then((res) => res.map((r, idx) => `${r[0] ? `ERROR: ${r[0]} ${cmds[idx][2]}` : `SUCCESS: ${cmds[idx][2]}` }`))))
        //.merge()
        //.each(h.log)
        //.done(process.exit);
    });
})
