# json-from-schema

json-from-schema generates random JSON based on [JSON Schema draft v4 schemas](http://json-schema.org).

# Usage

```javascript
var jfs = require('json-from-schema');
var schema1 = {
  id: 'http://www.example.com/herp#'
  , type: "object"
  , properties: {
    someString: {type: 'string', pattern: 'bl(a){1,10}h'}
    , someInt: {type: 'integer', minimum: 23, maximum: 42}
    , someEnum: {$ref: '#/definitions/blaEnum'}
    , someEnumArray: {type: 'array', items: {$ref: '#/definitions/blaEnum'}, minItems: 5, maxItems: 8}
    , someObject: {
      type: 'object'
      , properties: {
        derp: {type: 'string', minLength:1, maxLength:5}
        , herp: {type: 'string', minLength:5, maxLength:10}
      }

      , patternProperties: {
        'pat-\\d+': {type: 'string', pattern: 'patStr-\\w{1,20}'}
      }

      , additionalProperties: true
      , required: ['derp']
    }
  }

  , additionalProperties: false
  , required: ['someString', 'someObject']
  , definitions: {
    blaEnum: {enum: ['bla', 'dohoi', 666]}
  }
};

var schema2 = {
  id: 'http://www.example.com/derp#'
  , type: "object"
  , properties: {
    herps: {type: "array", items: {$ref: 'http://www.example.com/herp'}}
  }
};

var gen = new jfs.JsonFromSchema([schema1, schema2])
var sampleDerp = gen.generate('http://www.example.com/derp'); // note: no hash at the end

var sampleHerp = gen.generate('http://www.example.com/herp');

```

## generate() options

`generate()` takes an options object as its second parameter. The following options are supported:

* `minCharCode` and `maxCharCode` (integers): random strings are generated so that the character codes are between these two values
* `charSet` (array): generate random strings using this character set. Each element of the array should be a single character
* `minRandomKeys` and `maxRandomKeys` (integers): the minimum and maximum number of randomly generated keys an object can have when additionalProperties is true
* `minPatternProperties` and `maxPatternProperties` (integers): minimum and maximum number of pattern properties to randomly generate
* `overrideMinItems` and `overrideMaxItems` (integers): override array minItems and maxItems for *all* arrays when generating array contents. Useful for generating a certain minimum amount of test data, for example
* `requireAll` (boolean): behave like all properties of an object were required

# Supported

* $ref (JSON pointers and schema URIs)
* string
  * pattern
  * format
    * ipv4
    * ipv6
    * date-time
* array
  * maxItems
  * minItems
  * items (single schema)
* number
  * minimum
  * maximum
* integer
  * minimum
  * maximum
  * exclusiveMinimum
  * exclusiveMaximum
* boolean
* enum
* null
* object
  * properties
  * patternProperties
  * required
  * additionalProperties (boolean)
* oneOf
* anyOf
* type keyword with an array (`type: ['string', 'integer']`)

# TODO

* number
  * exclusiveMinimum / exclusiveMaximum
* number / integer
  * multipleOf
* array
  * uniqueItems
  * additionalItems
  * items (array of schemas)
* object
  * dependencies
  * maxProperties
  * minProperties
  * additionalProperties (schema)
* allOf
* not
* string
  * more formats