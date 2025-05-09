# hmpo-cached-model
Cached polling model.

An extension of [`hmpo-model`](https://github.com/UKHomeOffice/hmpo-model) that provides automatic caching of data fetched from an external API using a persistent store (like Redis). This helps to reduce the load on external APIs and provides quicker access to data within your application by serving it from a local cache.

The model manages caching by:
1.  Periodically loading data from the store on a configurable interval (`storeInterval`).
2.  Periodically fetching fresh data from the source API on a configurable interval (`apiInterval`).
3.  Storing the fetched API data, its last modified timestamp, and the next scheduled API check time in the store.
4.  Skipping store loads if the data in the store is not newer than the data currently in the model instance.
5.  Skipping API fetches if the next scheduled check time has not yet passed.

## Installation

---

```bash
npm install hmpo-cached-model
# or
yarn add hmpo-cached-model
```

## Testing

---

```bash
npm test
```

## Usage

---

```
const HmpoCachedModel = require('hmpo-cached-model');

let redisFactory = {
    getClient() {
        return redisInstance;
    }
}

let model = new HmpoCachedModel(
    { // optional seed data
        foo: 'bar',
        boo: 'baz'
    },
    { // options
        url: 'http://example.com/api',
        key: 'root-key',
        store: redisFactory,
        storeInterval: 1000,
        apiInterval: 2000
    }
);

// start polling
model.start();


let data = model.get('data');


// stop polling
countriesLib.stop();
```

If the API returns an object, all keys are saved to the model, otherwise the data from the API is saved to the `data` key.

Extend and override `parse()` to change the way the incomming data from the API is processed.

## API

---

`new HmpoCachedModel(initialData = {}, options)`

| Parameter     | Type     | Required | Default | Description                                     |
| ------------- | -------- | -------- | ------- | ----------------------------------------------- |
| `initialData` | `Object` | No       | `{}`    | Seed values stored in memory before first poll. |
| `options`     | `Object` | Yes      | —       | Configuration options (see below).              |

| Option          | Type             | Required | Description                                                                |
| --------------- | ---------------- | -------- |----------------------------------------------------------------------------|
| `key`           | `string`         | Yes      | Store key prefix under which to save related cache entries (data, timers). |
| `store`         | `Object`         | Yes      | Object exposing getClient(): A store client for storing/fetching cache.    |
| `storeInterval` | `number` (ms)    | No       | Interval in milliseconds to attempt loading data from the store cache.     |
| `apiInterval`   | `number` (ms)    | No       | Interval in milliseconds to attempt fetching fresh data from the API.      |

## Instance Methods

---

### model.start(): void        
Starts the background timers for loading from the store and fetching from the API, based on the `storeInterval` and `apiInterval` options provided in the constructor. 
It clears any previously running timers before starting new ones. 
If an interval option is not provided, the corresponding timer is not started.

### model.stop(): void         
Clears the background timers for loading from the store and fetching from the API. 
Call this method when you no longer need the model to perform background updates (e.g., during application shutdown).

### model.get(key: string) 
Retrieve the current value of an attribute from the in-memory model instance (inherited from hmpo-model).


## Upgrading

---

The deprecated `request` library has been replaced with `got` in `hmpo-model`.
The new `got` library doesn't automativally use the proxy environment variables so you would need to use something like `global-agent` in your
app if you need to specify proxies by environment arguments.
