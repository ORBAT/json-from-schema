/**
 * Created by teklof on 27.8.14.
 */

var _ = require('lodash');
var ptr = require('json-ptr');
var RandExpr = require('randexp');
var util = require('util');
var ins = _.partialRight(util.inspect, {depth: 5});

var _resolveRefs = exports._resolveRefs = function _resolveRefs(schema, schemasByIds, topSchema) {
  function isLocal(ref) {
    return ref[0] === '#';
  }

  topSchema = topSchema || schema;
  var pointed;
  var $ref = schema.$ref;
  if ($ref) {
    if (isLocal($ref)) { // JSON pointer
      pointed = ptr.create($ref).get(topSchema);
    } else { // not a JSON pointer so blindly assume it's an ID
      pointed = schemasByIds[$ref];
    }

    if (!pointed) {
      throw new ReferenceError("Pointer " + $ref + " didn't point to anything?");
    }

    if(pointed.$ref) {
      /* if the schema being pointed to isn't the one we started in, topSchema needs to be set to the schema being
       pointed to so its JSON pointers can be dereferenced properly */
      _resolveRefs(pointed, schemasByIds, isLocal(pointed.$ref) ? topSchema : pointed);
    }

    delete schema.$ref;
    _.assign(schema, pointed);
  }

  // this schema didn't have a reference, so go through all subschemas
  _.each(schema, function (subSchema, key) {
    if(_.isPlainObject(subSchema)) {
      _resolveRefs(subSchema, schemasByIds, topSchema);
    }
  });

};

function _default(obj, key, defaultVal) {
  return key in obj ? obj[key] : defaultVal;
}

function JsonFromSchema(schemas) {
  this._schemas = _.reduce(schemas, function (acc, schema) {
    if(!schema.id) {
      throw new Error("All schemas need ids");
    }
    var idLen = schema.id.length;
    var id = schema.id[idLen - 1] === '#' ? schema.id.substring(0, idLen - 1) : schema.id;
    acc[id] = _.cloneDeep(schema);
    return acc;
  }, {});
  var self = this;
  _.each(this._schemas, function (schema) {
    _resolveRefs(schema, self._schemas);
  });
}

// JS uses double precision floats (52 bits in the mantissa), so the maximum representable integer is 2^52
var MAX_INT = Math.pow(2, 52);

// this monstrosity is based on https://stackoverflow.com/questions/53497/regular-expression-that-matches-valid-ipv6-addresses
var ipv6re = /(([0-9a-f]{1,4}:){7,7}[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,7}:|([0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,5}(:[0-9a-f]{1,4}){1,2}|([0-9a-f]{1,4}:){1,4}(:[0-9a-f]{1,4}){1,3}|([0-9a-f]{1,4}:){1,3}(:[0-9a-f]{1,4}){1,4}|([0-9a-f]{1,4}:){1,2}(:[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:((:[0-9a-f]{1,4}){1,6})|:((:[0-9a-f]{1,4}){1,7}))/;

var _generators = {

  '_ipv6randExp': new RandExpr(ipv6re)

  , '_randomNumber': function _randomNumber(schema, options) {
    options = options || {};
    var integer = schema.type === 'integer'
      , minimum = _default(schema, 'minimum', integer ? -MAX_INT : -MAX_INT * 0.671) // note: just random constants to make float generation work
      , maximum = _default(schema, 'maximum', integer ? MAX_INT : MAX_INT*0.671);

    if (schema.exclusiveMinimum && integer) { // TODO: floats
      minimum += 1;
    }

    if (schema.exclusiveMaximum && integer) { // TODO: floats
      maximum -= 1;
    }

    return _.random(minimum, maximum, !integer);
  }

  , '_type': function _type(schema) {
    return schema.type || schema.enum && 'enum'
  }

  , 'boolean': function boolean() {
    return !!_.random(1);
  }

  , '_format': function _format(schema, options) {
    switch (schema.format) {
      case 'ipv4':
        return util.format("%s.%s.%s.%s", _.random(0, 255), _.random(0, 255), _.random(0, 255), _.random(0, 255));
      break;
      case 'ipv6':
        return this._ipv6randExp.gen();
      default: // unsupported format, so just return a plain 'ol string for now. This'll probably fail schema verification
        return this.string(_.omit(schema, 'format'), options);
    }
  }

  , 'string': function string(schema, options) {
    options = options || {};
    schema = schema || {};
    var minCharCode = _default(options, 'minCharCode', 32)
      , maxCharCode = _default(options, 'maxCharCode', 126)
      , charSet = options.charSet
      , minLength = _default(schema, 'minLength', 0)
      , maxLength = _default(schema, 'maxLength', 32)
      ;

    if (schema.enum) {
      return this.enum(schema);
    }

    if(schema.format) {
      return this._format(schema, options);
    }

    if (schema.pattern) {
      var re = new RandExpr(schema.pattern);
      re.anyRandChar = function () {
        return String.fromCharCode(_.random(minCharCode, maxCharCode));
      };
      // FIXME: randexp's max doesn't work as I expected; this needs a fix so it doesn't generate strings that go over maxLength
      re.max = maxLength;
      return re.gen();
    }

    if(charSet && _.isArray(charSet)) {
      return _.times(_.random(minLength, maxLength), function () {
        return _.sample(charSet);
      }).join('');
    } else {
      var charCodes = _.times(_.random(minLength, maxLength), function () {
        return _.random(minCharCode, maxCharCode);
      });
      return String.fromCharCode.apply(null, charCodes);
    }
  }

  , 'number': function number(schema, options) {
    schema = schema || {type: 'number'};
    return this._randomNumber(schema, options);
  }

  , 'integer': function integer(schema, options) {
    schema = schema || {type: 'integer'};
    return this._randomNumber(schema, options);
  }

  , 'enum': function $enum(schema) {
    return _.sample(schema.enum);
  }

  , 'array': function array(schema, options) {
    options = options || {};
    schema = schema || {};
    var itemSchema = schema.items || {type: 'string'}
      , minItems = _default(schema, 'minItems', 0)
      , maxItems = _default(schema, 'maxItems', 10)
      , len = _.random(minItems, maxItems);

    var self = this;
    return _.times(len, function () {
      return self._generate(itemSchema, options);
    });
  }

  , '_randomObject': function _randomObject(options) {
    var minRandomKeys = _default(options, 'minRandomKeys', 0)
      , maxRandomKeys = _default(options, 'maxRandomKeys', 10)
      , numKeys = _.random(minRandomKeys, maxRandomKeys)
      , self = this;

    var gens = [
      _.partial(this.array, {items: {type: 'integer'}})
      , _.partial(this.array, {items: {type: 'number'}})
      , _.partial(this.array, {items: {type: 'string'}})
      , _.partial(this.string, {minLength: 0, maxLength: 15})
      , _.partial(this._randomNumber, {type: 'integer'})
      , _.partial(this._randomNumber, {type: 'number'})

    ];

    return _(_.times(numKeys, function () {
      return self.string({minLength: 1, maxLength: 15}, options);
    })).reduce(function (acc, key) {
        acc[key] = _.sample(gens).call(self, options);
        return acc;
      }, {}).valueOf();
  }

  , 'object': function object(schema, options) {

    options = options || {};
    schema = schema || {};

    var self = this
      , required = schema.required || []
      , props = schema.properties && Object.keys(schema.properties) || []
      , patternProps = schema.patternProperties && Object.keys(schema.patternProperties) || []
      , additionals = !!_default(schema, 'additionalProperties', true)
      , minPatternProps = _default(options, 'minPatternProps', 0)
      , maxPatternProps = _default(options, 'maxPatternProps', 10)
      , nonRequiredProps = _.difference(props, required)
      // generate all required properties plus a random amount of non-required properties
      , propsToGenerate = _.union(required, _.sample(nonRequiredProps, _.random(nonRequiredProps.length)));

    var obj = _.reduce(propsToGenerate, function(acc, propName) {
      var propSchema = schema.properties[propName];

      acc[propName] = self._generate(propSchema, options);
      return acc;
    }, {});

    if(patternProps.length) {
      var nPats = _.random(minPatternProps, maxPatternProps);

      var ppObj = _(_.times(nPats, function () {
        return _.sample(patternProps);
      })).reduce(function(acc, propPattern) {
          var propSchema = schema.patternProperties[propPattern];
          var propName = self.string({pattern: propPattern});
          acc[propName] = self._generate(propSchema, options);
          return acc;
        }, {}).valueOf();
      _.defaults(obj, ppObj);
    }

    if(additionals) { // if additionalProperties is true, add some random properties to the object
      _.defaults(obj, this._randomObject(options));
    }


    return obj;
  }

};

_generators._generate = _oneOfDecorator.bind(_generators)(function _generate(schema, options) {
  schema = schema || {};
  options = options || {};
  var type = this._type(schema);
  return this[type](schema, options);
});

JsonFromSchema.prototype._generators = _generators;

function _oneOfDecorator(base) {
  var self = this;
  return function _oneOf(schema, options) {
    if(schema.oneOf) {
      var oneOfs = schema.oneOf;
      var finalSchema = _.merge(_.cloneDeep(schema), _.sample(oneOfs));
      delete finalSchema.oneOf;
      return base.call(self, finalSchema, options);
    } else {
      return base.call(self, schema, options);
    }
  }
}

/**
 *
 * Generates random JSON objects according to a JSON schema.
 *
 * @param {String} schemaId ID of schema to generate (*without* the hash at the end)
 * @param {Object} [options]
 *   options.minCharCode and options.maxCharCode (integers): random strings are generated so that the character codes are between these two values
 *
 * options.charSet (array): generate random strings using this character set. Each element of the array should be a single character.
 *
 * options.minRandomKeys and options.maxRandomKeys (integers): the minimum and maximum number of randomly generated keys an object can have when additionalProperties is true
 *
 * options.minPatternProperties and options.maxPatternProperties (integers): minimum and maximum number of pattern properties to randomly generate
 *
 * @returns {object} randomly generated JSON object that complies with given schema
 */
JsonFromSchema.prototype.generate = function generate(schemaId, options) {
  var schema = this._schemas[schemaId];

  if(!schema) {
    throw new ReferenceError("No schema with ID " + schemaId + " registered");
  }

  return this._generators._generate(schema, options);
};

/**
 * Creates a new instance of JsonFromSchema
 * @param {Array} schemas Register these schemas.
 * @constructor
 */
exports.JsonFromSchema = JsonFromSchema;