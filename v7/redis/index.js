'use strict';

require('dotenv').config();

const { promisify } = require('util'),
  _ = require('lodash'),
  redis = require('redis'),
  clayUtil = require('clayutils'),
  h = require('highland'),
  pg = require('amphora-storage-postgres'),
  args = require('yargs').argv,
  { REDIS_HOST, REDIS_PORT, REDIS_HASH, LAYOUTS_WHITELIST } = process.env,
  MERGE_LIMIT = args.mergeLimit || 1,
  MATCH_PATTERN = args.match || '*';

let redisClient, client, LAYOUTS;

/**
 * scan the redis db recursively until cursor is 0 again
 * track results in the accumulator
 *
 * @param {Number} cursor
 * @param {Array} accu
 * @param {String} match
 * @returns {Promise}
 */
function scan(cursor, accu, match) {
  return client.hscan(REDIS_HASH, cursor, 'MATCH', match)
    .then((results) => {
      _.forEach(_.chunk(results[1], 2), (cmpt) => {
        accu.push({ key: cmpt[0], value: cmpt[1] })
      });

      if (results[0] === '0') {
        return accu;
      } else {
        return scan(parseInt(results[0]), accu, match);
      }
    });
}

/**
 * Validates to make sure the key isn't the default published instance (persisted by mistake from poorly written bootstraps).
 * @param {String} key
 * @returns {boolean}
 */
function isPublishedDefaultInstance(cmpt) {
  return clayUtil.isPublished(cmpt.key) && clayUtil.isDefaultComponent(clayUtil.replaceVersion(cmpt.key));
}

function splitDataAndMeta(item) {
  let data, meta, val;

  if (!clayUtil.isPage(item.key)) return item;

  val = JSON.parse(item.value);

  data = _.omit(val, ['customUrl', 'urlHistory', 'lastModified']);
  meta = _.pick(val, ['customUrl', 'urlHistory', 'lastModified', 'url']);

  if (meta.customUrl) {
    meta.url = meta.customUrl;

    _.unset(meta, 'customUrl');
  }

  if (meta.lastModified) {
    meta.publishTime = new Date(meta.lastModified).toISOString();

    _.unset(meta, 'lastModified');
  }

  item.value = JSON.stringify(data);
  item.meta = meta;

  return item;
}

/**
 * inserts a single component to postgres db
 *
 * @param {Object} item
 * @returns {Stream}
 */
function insertItem(item) {
  return h(
    pg.put(item.key, item.value)
      .catch((e) => {
        console.log(`Error persisting ${item.key}: ${e.message}`, item.value);
        item.error = true;
      })
      .then(() => item)
  );
}

function insertMeta(item) {
  const uri = clayUtil.replaceVersion(item.key);

  if (!clayUtil.isPage(item.key) || !item.meta || !clayUtil.isPublished(item.key)) return h(Promise.resolve(item));

  return h(
    pg.getMeta(uri)
      .then((meta) => {
        // patch doesnt work if the meta object is NULL, so do a put in that case
        if (meta) {
          return pg.patchMeta(uri, item.meta);
        }

        return pg.putMeta(uri, JSON.stringify(item.meta))
      })
      .catch((e) => {
        console.log(`Error persisting metadata for ${uri}: ${e.message}`, item.meta);
        item.error = true;
      })
      .then(() => item)
  );
}

/**
 * Looks for components from the layouts whitelist and changes their uri to use the _layouts path
 * Looks for pages and updates uris for a layout to use the _layouts path
 *
 * @param {Object} item
 * @returns {Object}
 */
function transformLayoutRef(item) {
  const componentName = clayUtil.getComponentName(item.key);
  let pageLayout, pageObj;

  if (LAYOUTS.some((layoutName) => layoutName === componentName)) {
    item.key = item.key.replace('_components', '_layouts');
  }

  if (clayUtil.isPage(item.key)) {
    pageObj = JSON.parse(item.value);
    pageLayout = pageObj.layout;

    if (pageLayout) {
      pageObj.layout = pageLayout.replace('_components', '_layouts');
      item.value = JSON.stringify(pageObj);
    }
  }

  return item;
}

function insertItems(items) {
  h(items)
    .reject(isPublishedDefaultInstance)
    .map(h.of)
    .mergeWithLimit(MERGE_LIMIT)
    .map(splitDataAndMeta)
    .map(transformLayoutRef)
    .map(insertItem)
    .mergeWithLimit(MERGE_LIMIT)
    .map(insertMeta)
    .mergeWithLimit(MERGE_LIMIT)
    .map(display)
    .each(h.log)
    .done(() => {
      console.log('Migration finished');
      process.exit();
    });
}

function display(item) {
  return `${item.error ? 'ERROR' : 'SUCCESS'}: ${item.key}`;
}

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

redisClient = redis.createClient(REDIS_PORT, REDIS_HOST);
client = { hscan: promisify(redisClient.hscan).bind(redisClient) };

pg.setup()
  .then(() => scan(0, [], MATCH_PATTERN)) // match can be changed to '*_pages*' '*_components*' etc to only scan for certain types
  .then((items) => {
    console.log(`Scan finished, ${items.length} items found`);
    console.log('starting postgres migration...');

    return Promise.resolve(items);
  })
  .then(insertItems)

