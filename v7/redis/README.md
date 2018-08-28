# Redis to Postgres Migration

Amphora v7 introduces the use of a caching layer apart from the main data store. This script scans a redis instance used by Amphora and persists the data stored in redis to the new primary data store (in this case, Postgres).

## Installation

From the root of the `migrations` directory:

```
npm install
```

## Setup

This script assumes you have postgres running in your environment. A few environment variables must also be set in a .env file in this directory.

```
CLAY_STORAGE_POSTGRES_HOST=# the host of the Postgres instance to PUT to
REDIS_HOST=# the host of the redis instance to scan for data
REDIS_PORT=# the port of the redis instance to scan for data
REDIS_HASH=# the hash key of the redis instance to scan for data
```

## Usage

```
node v7/redis [options]
```

## Arguments

* `--mergeLimit` sets the number of concurrent PUT requests to Postgres. Defaults to `1` if not set
* `--match` sets the [matching regex](https://redis.io/commands/scan#the-match-option) to use to filter redis keys to import. Defaults to `'*'` (all keys) if not set

## Examples

```
node v7/redis --match *_components*
```

migrates only component data from redis to postgres

```
node v7/redis --match www.site.com/*
```

migrates all the data from a certain site
