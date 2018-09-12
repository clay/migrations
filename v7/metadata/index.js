'use strict';

require('dotenv').config();

const h = require('highland'),
  pg = require('amphora-storage-postgres'),
  args = require('yargs').argv,
  clayUtil = require('clayutils'),
  MERGE_LIMIT = args.mergeLimit || 1;

/**
 * PUTs elastic document to the Postgres metadata field for an existing page
 *
 * @param {Object} doc
 * @returns {Stream}
 */
function saveMetadata(doc) {
  const { _id, _source } = doc;

  return h(
    pg.getMeta(_id)
      .then((meta) => {
        if (meta) {
          return pg.patchMeta(_id, _source);
        }

        return pg.putMeta(_id, _source);
      })
      .catch((e) => {
        console.log(`Error persisting metadata for ${_id}: ${e.message}`, _source);
        doc.error = true;
      })
      .then(() => ({ key: _id, value: _source, error: doc.error }))
  );
}

function display(doc) {
  return `${doc.error ? 'ERROR' : 'SUCCESS'}: ${doc.key}`;
}

/**
 * Transforms component refs into layout refs. This script will only be used with either the pages index or the layouts index
 * so we can safely assume that all components encountered will be layout components
 *
 * @param {Object} doc
 * @returns {Object}
 */
function sanitizeDoc(doc) {
  if (clayUtil.isComponent(doc._id)) {
    doc._id = doc._id.replace('_components', '_layouts');
  }

  if (doc._source.uri) {
    delete doc._source.uri; // remove unused uri field (its the same as the _id)
  }

  return doc;
}

function formatTimeStamps(doc) {
  const src = Object.assign({}, doc._source);

  if (src.createdAt) {
    src.createdAt = new Date(src.createdAt).toISOString();
  }

  doc._source = src;

  return doc;
}

pg.setup()
  .then(() => {
    h(process.stdin) // read from stdin
      .split()
      .compact()
      .map(JSON.parse) // parse stringified documents
      .map(h.of)
      .mergeWithLimit(MERGE_LIMIT)
      .map(sanitizeDoc)
      .map(formatTimeStamps)
      .map(saveMetadata)
      .mergeWithLimit(MERGE_LIMIT)
      .map(display)
      .each(h.log)
      .done(() => {
        console.log('Migration finished');
        process.exit();
      });
  });
