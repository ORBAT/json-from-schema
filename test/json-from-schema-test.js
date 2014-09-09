/**
 * Created by teklof on 28.8.14.
 */
var chai = require('chai');
var should = chai.should();
var _ = require('lodash');
var jfs = require('../json-from-schema');
var ZSchema = require('z-schema');
var zs = new ZSchema();
var util = require('util');
var ins = _.partialRight(util.inspect, {depth: 5});


function _validate(these, schema) {
  _.each(these, function (item) {
    var ok = zs.validate(item, schema);
    if(!ok) {
      console.log("%s\nschema validation error: %s", ins(item), ins(zs.getLastErrors()));
    }
    ok.should.be.true;
  });
}

describe("JSON from schema", function() {

  describe('$ref resolution', function () {
    it('should resolve JSON pointer references', function () {
      var s = {
        id: "derp",
        type: "object",
        properties: {
          hurrProp: {
            $ref: "#/definitions/hurr",
            pattern: ".*"
          }
        },

        definitions: {
          hurr: {
            type: "string",
            $ref: "#/definitions/lengths"
          },
          lengths: {
            minLength: 5,
            maxLength: 10
          }
        }
      };

      jfs._resolveRefs(s, {'derp': s});
      s.properties.hurrProp.type.should.equal("string");
      s.properties.hurrProp.minLength.should.equal(5);
      s.properties.hurrProp.pattern.should.equal('.*');
      s.properties.hurrProp.maxLength.should.equal(10);
    });

    it('should resolve schema ID references', function () {
      var derpSchema = {
        id: "derp",
        type: "object",
        properties: {
          hurrProp: {
            $ref: "hurr"
          },
          unf: {
            type: "integer"
          }
        }
      };

      var hurrSchema = {
        id: "hurr",
        type: "object",
        properties: {
          dohoi: {
            type: "object",
            additionalProperties: true
          },
          bleh: {
            type: "string",
            maxLength: 666
          }
        }
      };

      jfs._resolveRefs(derpSchema, {'derp': derpSchema, 'hurr': hurrSchema});
      derpSchema.properties.unf.type.should.equal('integer');
      var hurrProp = derpSchema.properties.hurrProp;
      hurrProp.type.should.equal("object");
      hurrProp.properties.should.have.keys(['dohoi', 'bleh']);
      hurrProp.properties.dohoi.type.should.equal('object');
      hurrProp.properties.dohoi.additionalProperties.should.be.true;
      hurrProp.properties.bleh.type.should.equal('string');
      hurrProp.properties.bleh.maxLength.should.equal(666);
    });

    it('should resolve all references', function () {
      var derpSchema = {
        id: "derp",
        type: "object",
        properties: {
          hurrProp: {
            type: "array",
            items: {$ref: "#/definitions/hurrs"}
          },
          unf: {
            $ref: "#/definitions/unfs"
          }
        },

        definitions: {
          unfs: {
            enum: ['pak', 'chooie']
          },
          hurrs: {
            $ref: "hurr"
          }
        }
      };

      var hurrSchema = {
        id: "hurr",
        type: "object",
        properties: {
          dohoi: {
            type: "object",
            $ref: "#/definitions/dohois"
          },
          bleh: {
            type: "string",
            maxLength: 666
          }
        },

        definitions: {
          dohois: {
            additionalProperties: true
          }
        }
      };

      jfs._resolveRefs(derpSchema, {'derp': derpSchema, 'hurr': hurrSchema});
      derpSchema.properties.unf.enum.should.have.members(['pak', 'chooie']);
      var items = derpSchema.properties.hurrProp.items;
      items.type.should.equal('object');
      items.properties.should.have.keys(['dohoi', 'bleh']);
      items.properties.dohoi.additionalProperties.should.be.true;
      items.properties.bleh.type.should.equal('string');
    });

  });


  describe('formatters', function () {
    var gen;
    beforeEach(function () {
      gen = new jfs.JsonFromSchema();
    });

    it('should generate ipv6 addresses', function () {
      var schema = {type: 'string', format: 'ipv6'};
      var ipv6s = _.times(20, function () {
        return gen._generators.string(schema);
      });

      _validate(ipv6s, schema);
    });

    it('should generate ipv4 addresses', function () {
      var schema = {type: 'string', format: 'ipv4'};
      var ipv4s = _.times(20, function () {
        return gen._generators.string(schema);
      });
      _validate(ipv4s, schema);
    });

    it('should generate date-times', function() {
      var schema = {type: 'string', format: 'date-time'};
      var dates = _.times(20, function () {
        return gen._generators.string(schema);
      });

      _validate(dates, schema);
    })

  });

  describe('generators', function () {
    var gen;
    beforeEach(function () {
      gen = new jfs.JsonFromSchema();
    });

    it('should generate booleans', function () {
      gen._generators.boolean().should.be.a('boolean');
    });

    it('should generate numbers', function () {
      var schema = {type: 'number', minimum: 13.5, maximum: 22.6};
      var nums = _.times(20, function () {
        return gen._generators.number(schema);
      });
      _validate(nums, schema);
    });

    it('should generate integers', function () {
      var schema = {type: 'integer', minimum: -500, maximum: 500};
      var ints = _.times(20, function () {
        return gen._generators.integer(schema);
      });

      _validate(ints, schema);
    });

    it('should generate strings', function () {
      var schema = {type: 'string', minLength: 5, maxLength: 10};
      var strings = _.times(20, function () {
        return gen._generators.string(schema);
      });

      _validate(strings, schema);
    });

    it('should generate strings with custom character sets', function () {
      var charSet = _(_.union(_.range(48, 58), _.range(65, 91), _.range(97, 123))).map(function(n) {
        return String.fromCharCode(n);
      }).valueOf();

      var schema = {type: 'string', minLength: 10, maxLength: 10};

      var strings = _.times(20, function () {
        return gen._generators.string(schema, {charSet: charSet});
      });

      var notInCharSet = _(_.map(strings, function (str) {
        return _.reject(str, function (ch) {
          return _.contains(charSet, ch);
        });
      })).reduce(function(acc, str) {
          return acc + str.length;
        }, 0).valueOf();
      notInCharSet.should.equal(0);
    });

    it("should generate strings with patterns", function () {
      var schema = {type: 'string', pattern: '^\\d{1,4}x\\d{1,4}$'};
      var strings = _.times(20, function () {
        return gen._generators.string(schema);
      });

      _validate(strings, schema);
    });

    it("should generate enums", function () {
      var enumSet = ['herp', 'derp', 'hurr', 'durr'];
      var schema = {enum: enumSet};
      var enums = _.times(20, function () {
        return gen._generators.enum(schema);
      });

      _validate(enums, schema);
    });

    it("should generate random objects", function () {
      var obj = gen._generators._randomObject({minRandomKeys:5, maxRandomKeys: 15});
      _.isPlainObject(obj).should.be.true;
      _.keys(obj).length.should.be.above(4);
      _.keys(obj).length.should.be.below(16);
    });

    it('should handle anyOf', function () {
      var schema = {
        id: 'cor'
        , type: 'object'
        , additionalProperties: false
        , required: ['one1', 'one2']
        , properties: {
          one1: {
            anyOf: [
              {'enum': ['hng', 'yoink']}
              , {type: 'string', pattern: "[a-z]{1,5}"}
            ]
          }

          , one2: {
            type: 'string'
            , anyOf: [
              {minLength: 5, maxLength: 5}
              , {pattern: "[10]{1,10}"}
            ]
          }
        }
      };

      var objs = _.times(20, function () {
        return gen._generators._generate(schema, {});
      });

      _validate(objs, schema);
    });

    it('should handle oneOf', function () {
      var schema = {
        id: 'cor'
        , type: 'object'
        , additionalProperties: false
        , required: ['one1', 'one2']
        , properties: {
          one1: {
            oneOf: [
              {type: 'string', minLength: 5, maxLength:10}
              , {type: 'integer', minimum: 0, maximum: 100}
            ]
          }

          , one2: {
            type: 'string'
            , oneOf: [
              {pattern: "(wub){1,10}"}
              , {pattern: "q{1,10}"}
            ]
          }
        }
      };

      var objs = _.times(20, function () {
        return gen._generators._generate(schema, {});
      });

      _validate(objs, schema);
    });

    describe('object generation', function () {
      it('should generate objects (no schema references)', function () {
        var schema = {
          id: 'herp'
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
        var gen = new jfs.JsonFromSchema([schema]);
        var objs = _.times(20, function () {
          return gen.generate('herp');
        });

        _validate(objs, schema);
      });

      it('should generate objects with schema references', function () {
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
            herps: {type: "array", items: {$ref: 'http://www.example.com/herp'}, minItems: 1, maxItems: 3}
            , ip: {type: "string", format: "ipv4"}
          }
          , required: ['herps', 'ip']
        };
        // clone so z-schema's __$.* properties don't end up in the schemas themselves
        zs.validateSchema([_.cloneDeep(schema1), _.cloneDeep(schema2)]).should.be.true;
        var gen = new jfs.JsonFromSchema([schema1, schema2]);
        var objs = _.times(20, function () {
          return gen.generate('http://www.example.com/derp');
        });

        _validate(objs, schema2);

      });

    });

  });

});