# Page Metadata Migration

Amphora v7 marries the storage of page data and page metadata so both are persisted into the same store (postgres). Previously, page metadata was stored in ElasticSearch, so this script listens to a stream of elastic data and persists it as metadata for a page that exists in postgres. This script should be run _after_ the [redis -> postgres migration script](https://github.com/clay/migrations/tree/master/v7/redis).

## Installation

From the root of the `migrations` directory:

```
npm install
```

## Setup

This script assumes you have postgres running in your environment. You'll need to have the following environment variable in a .env file at the root of this directory.

```
CLAY_STORAGE_POSTGRES_HOST=# the host of the Postgres instance to PUT metadata to
```

## Usage

### ElasticSearch Streamer

This script is set up to read from standard in and expects a stream of elastic docs to be piped to it. An easy way to stream elastic docs from an index is by using the [ElasticSearch Streamer](https://www.npmjs.com/package/elasticsearch-streamer)

To get started, install `ess` globally to use it from the command line

```
npm install -g elasticsearch-streamer
```

You should then be able to run ess commands that can pipe results directly into this script.

### Piping to this script

Once ess is setup, use the GET command to retrieve a stream of elastic documents from the pages index you want to migrate data from, then simply pipe the results into an invocation of this script.

Here is an example that migrates all the documents in a local pages index:

```
ess get localhost:9200/local_pages | node v7/metadata [options]
```

## Arguments

* `--mergeLimit` sets the number of concurrent PUT requests to Postgres. Defaults to `1` if not set

## Examples

```
ess get localhost:9200/local_pages | node v7/metadata
```

Persists local pages metadata into postgres

```
ess get localhost:9200/local_layouts | node v7/metadata
```

Persists local layouts metadata into postgres
