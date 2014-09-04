/**
 * Created by teklof on 27.8.14.
 */

var _ = require('lodash');
var ptr = require('json-ptr');
var RandExpr = require('randexp');
var util = require('util');

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
    self._resolveRefs(schema, self._schemas);
  });
}

// JS uses double precision floats (52 bits in the mantissa), so the maximum representable integer is 2^52
var MAX_INT = Math.pow(2, 52);

JsonFromSchema.prototype._resolveRefs = exports._resolveRefs = function _resolveRefs(schema, schemasByIds, topSchema) {
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

// this monstrosity is based on https://stackoverflow.com/questions/53497/regular-expression-that-matches-valid-ipv6-addresses
var ipv6re = /(([0-9a-f]{1,4}:){7,7}[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,7}:|([0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,5}(:[0-9a-f]{1,4}){1,2}|([0-9a-f]{1,4}:){1,4}(:[0-9a-f]{1,4}){1,3}|([0-9a-f]{1,4}:){1,3}(:[0-9a-f]{1,4}){1,4}|([0-9a-f]{1,4}:){1,2}(:[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:((:[0-9a-f]{1,4}){1,6})|:((:[0-9a-f]{1,4}){1,7}))/;

JsonFromSchema.prototype._generators = {

  '_ipv6randExp': new RandExpr(ipv6re)

  , '_randomNumber': function _randomNumber(schema, options) {
    options = options || {};
    var integer = schema.type === 'integer'
      , minimum = schema.minimum || (integer ? -MAX_INT : -MAX_INT*0.671)// note: just random constants to make float generation work
      , maximum = schema.maximum || (integer ? MAX_INT : MAX_INT*0.5663);

    if (schema.exclusiveMinimum && integer) { // TODO: floats
      minimum += 1;
    }

    if (schema.exclusiveMaximum && integer) { // TODO: floats
      maximum -= 1;
    }

    return _.random(minimum, maximum, !integer);
  }

  , 'boolean': function () {
    return !!_.random(1);
  }

  , '_format': function(schema, options) {
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

  , 'string': function(schema, options) {
    options = options || {};
    schema = schema || {};
    var minCharCode = options.minCharCode || 32
      , maxCharCode = options.maxCharCode || 126
      , charSet = options.charSet
      , minLength = schema.minLength || 0
      , maxLength = schema.maxLength || 32
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

  , 'number': function(schema, options) {
    schema = schema || {type: 'number'};
    return this._randomNumber(schema, options);
  }

  , 'integer': function (schema, options) {
    schema = schema || {type: 'integer'};
    return this._randomNumber(schema, options);
  }

  , 'enum': function(schema) {
    return _.sample(schema.enum);
  }

  , 'array': function(schema, options) {
    options = options || {};
    schema = schema || {};
    var itemSchema = schema.items || {type: 'string'}
      , itemType = itemSchema.type || ('enum' in itemSchema && 'enum')
      , minItems = schema.minItems || 0
      , maxItems = schema.maxItems || 10
      , len = _.random(minItems, maxItems);

    var self = this;
    return _.times(len, function () {
      return self[itemType](itemSchema, options);
    });
  }

  , '_randomObject': function(options) {
    var numKeys = _.random(options.minRandomKeys || 0, options.maxRandomKeys || 10);
    var self = this;

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

  , 'object': function(schema, options) {

    options = options || {};
    schema = schema || {};

    var self = this
      , required = schema.required || []
      , props = schema.properties && Object.keys(schema.properties) || []
      , patternProps = schema.patternProperties && Object.keys(schema.patternProperties) || []
      , additionals = "additionalProperties" in schema ? !!schema.additionalProperties : true
      , minPatternProps = options.minPatternProps || 0
      , maxPatternProps = options.maxPatternProps || 10
      , nonRequiredProps = _.difference(props, required)
      // generate all required properties plus a random amount of non-required properties
      , propsToGenerate = _.union(required, _.sample(nonRequiredProps, _.random(nonRequiredProps.length)));

    var obj = _.reduce(propsToGenerate, function(acc, propName) {
      var propSchema = schema.properties[propName];

      var type = propSchema.type || propSchema.enum && 'enum';
      acc[propName] = self[type](propSchema, options);
      return acc;
    }, {});

    if(patternProps.length) {
      var nPats = _.random(minPatternProps, maxPatternProps);

      var ppObj = _(_.times(nPats, function () {
        return _.sample(patternProps);
      })).reduce(function(acc, propPattern) {
          var propSchema = schema.patternProperties[propPattern];
          var propName = self.string({pattern: propPattern});
          var type = propSchema.type || propSchema.enum && 'enum';
          acc[propName] = self[type](propSchema, options);
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

  var type = schema.type || schema.enum && 'enum';
  return this._generators[type](schema, options);
};

/**
 * Creates a new instance of JsonFromSchema
 * @param {Array} schemas Register these schemas.
 * @constructor
 */
exports.JsonFromSchema = JsonFromSchema;