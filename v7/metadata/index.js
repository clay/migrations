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
      .catch((e) => console.log(`Error persisting metadata for ${_id}: ${e.message}`, _source))
      .then(() => ({ key: _id, value: _source }))
  );
}

pg.setup()
  .then(() => {
    h(process.stdin) // read from stdin
      .split()
      .compact()
      .map(JSON.parse) // parse stringified documents
      .map(putMetadata)
      .mergeWithLimit(MERGE_LIMIT)
      .each(h.log)
      .done(() => {
        console.log('Migration finished');
        process.exit();
      });
  });
