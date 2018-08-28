# Redis to Postgres Migration

Amphora v7 introduces the use of a caching layer apart from the main data store. This script scans a redis instance used by Amphora and persists the data stored in redis to the new primary data store (in this case, Postgres).

## Installation

From the root of the `migrations` directory:

```
npm install
```

## Setup

To use amphora-storage-postgres, you must have a postgres host (CLAY_STORAGE_POSTGRES_HOST) environment variable set to establish the initial postgres connection. This script assumes you have Postgres running in your environment. All other arguments can be passed in via command line arguments.

## Usage

```
node v7/redis [options]
```

## Arguments

* `--redisHost` sets the host of the redis instance to import from. Defaults to `127.0.0.1` if not set
* `--redisPort` sets the port of the redis instance to import from. Defaults to `6379` if not set
* `--redisHash` sets the hash key of the redis instance to import from. Defaults to `mydb:h` if not set
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
