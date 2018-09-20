'use strict';

require('dotenv').config();

const Redis = require('ioredis'),
  client = new Redis(`redis://${process.env.REDIS_HOST}:6379`),
  _ = require('lodash'),
  h = require('highland'),
  STREAM = h();


  var stream = client.hscanStream('mydb:h', {
    // only returns keys following the pattern of `user:*`
    match: 'www.grubstreet.com/*',
    // returns approximately 100 elements per call
    count: 1000
  });

  stream.pipe(STREAM);

STREAM.each(h.log)

  // Create a readable stream (object mode)

  // stream.on('data', function (resultKeys) {
  //   // `resultKeys` is an array of strings representing key names.
  //   // Note that resultKeys may contain 0 keys, and that it will sometimes
  //   // contain duplicates due to SCAN's implementation in Redis.
  //   // for (var i = 0; i < resultKeys.length; i++) {
  //     console.log(_.chunk(resultKeys, 2));
  //   // }
  // });
  // stream.on('end', function () {
  //   console.log('all keys have been visited');
  // });
