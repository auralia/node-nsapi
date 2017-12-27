# nsapi #

[![npm version](https://badge.fury.io/js/nsapi.svg)](https://badge.fury.io/js/nsapi)

nsapi is a free and open source library that allows Node.js applications to 
easily access the NationStates API without worrying about making HTTP requests, 
decoding XML, caching or rate limiting.

nsapi features the following:

* a complete interface to the NationStates API (supports the nation, region,
  world, World Assembly, telegram, and authentication APIs)
* rate-limiting to prevent blocked access to the API, including for the 
  telegram API (recruitment and non-recruitment)
* optional URI-based request caching
* XML decoding (all data is returned in simple JavaScript data structures)
* support for version 9 of the NationStates API

## Usage ##

You can install nsapi using npm: `npm install nsapi`.

You can also build nsapi from source using Gulp. There are two main targets: 
`prod` and `dev`. The only difference between them is that `dev` includes
source maps. There is also a `docs` target to generate documentation.

Consult [the documentation](https://auralia.github.io/node-nsapi/) for more 
information on API structure and methods.

nsapi targets ES5 but requires support for ES6 promises, so if you're not 
using a runtime that supports them natively, you'll have to use a polyfill.

## Examples ##

The following is a simple example that retrieves a nation's full name and prints 
it to the console.

```js
const { NsApi } = require("nsapi");

// TODO: Replace the user agent with your own
const api = new NsApi("Your nation's name");
return api.nationRequest("Auralia", ["fullname"])
  .then(data => {
    console.log(data.fullname);
  })
  .then(() => {
    api.cleanup();
  });
```

For additional examples, consult the examples/example.js file.

## License ##

nsapi is licensed under the [Apache License 2.0](http://www.apache.org/licenses/LICENSE-2.0).
