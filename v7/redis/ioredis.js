'use strict';

const Redis = require('ioredis'),
  client = new Redis(`redis://${process.env.REDIS_BUS_HOST}`);


  var stream = client.scanStream({
    // only returns keys following the pattern of `user:*`
    match: 'www.grubstreet.com/*',
    // returns approximately 100 elements per call
    count: 1000
  });

  // Create a readable stream (object mode)

  stream.on('data', function (resultKeys) {
    // `resultKeys` is an array of strings representing key names.
    // Note that resultKeys may contain 0 keys, and that it will sometimes
    // contain duplicates due to SCAN's implementation in Redis.
    for (var i = 0; i < resultKeys.length; i++) {
      console.log(resultKeys[i]);
    }
  });
  stream.on('end', function () {
    console.log('all keys have been visited');
  });
