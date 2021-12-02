# hmpo-cached-model
Cached polling model.

Poll an API at a given interval and save the data to a data storoe such as redis. Multiple nodes can synchronise by sharing the redis instance and key.

## Usage

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


## Upgrading

The deprecated `request` library has been replaced with `got` in `hmpo-model`.
The new `got` library doesn't automativally use the proxy environment variables so you would need to use something like `global-agent` in your
app if you need to specify proxies by environment arguments.
