'use strict';

require('dotenv').config();

const h = require('highland'),
  pg = require('amphora-storage-postgres'),
  args = require('yargs').argv,
  MERGE_LIMIT = args.mergeLimit || 1;

/**
 * PUTs elastic document to the Postgres metadata field for an existing page
 *
 * @param {Object} doc
 * @returns {Stream}
 */
function putMetadata(doc) {
  const { _id, _source } = doc;

  return h(
    pg.putMeta(_id, _source)
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

pg.setup()
  .then(() => {
    h(process.stdin) // read from stdin
      .split()
      .compact()
      .map(JSON.parse) // parse stringified documents
      .map(h.of)
      .mergeWithLimit(MERGE_LIMIT)
      .map(putMetadata)
      .mergeWithLimit(MERGE_LIMIT)
      .map(display)
      .each(h.log)
      .done(() => {
        console.log('Migration finished');
        process.exit();
      });
  });
