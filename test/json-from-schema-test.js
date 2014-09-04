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

  describe('generators', function () {
    var gen;
    beforeEach(function () {
      gen = new jfs.JsonFromSchema();
    });

    it('should generate booleans', function () {
      gen._generators.boolean().should.be.a('boolean');
    });

    it('should generate numbers', function () {
      var nums = _.times(20, function () {
        return gen._generators.number({type: 'number', minimum: 13.5, maximum: 22.6});
      });

      _.each(nums, function (num) {
        num.should.be.a('number');
        num.should.be.above(13.5);
        num.should.be.below(22.6);
      });
    });

    it('should generate integers', function () {
      var ints = _.times(20, function () {
        return gen._generators.integer({type: 'integer', minimum: -500, maximum: 500});
      });

      _.each(ints, function (int) {
        int.should.be.a('number');
        int.should.be.above(-501);
        int.should.be.below(501);
      });
    });

    it('should generate strings', function () {
      var strings = _.times(20, function () {
        return gen._generators.string({minLength: 5, maxLength: 10});
      });

      _.each(strings, function (str) {
        str.should.have.length.above(4);
        str.should.have.length.below(11);
      });
    });

    it('should generate strings with custom character sets', function () {
      var charSet = _(_.union(_.range(48, 58), _.range(65, 91), _.range(97, 123))).map(function(n) {
        return String.fromCharCode(n);
      }).valueOf();

      var strings = _.times(20, function () {
        return gen._generators.string({minLength: 10, maxLength: 10}, {charSet: charSet});
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
      var pat = '^\\d{1,4}x\\d{1,4}$';
      var regExp = new RegExp(pat);
      var strings = _.times(20, function () {
        return gen._generators.string({minLength: 5, maxLength: 10, pattern: pat});
      });

      _.each(strings, function (str) {
        (!!str.match(regExp)).should.be.true;
      });
    });

    it("should generate enums", function () {
      var gen = new jfs.JsonFromSchema();
      var enumSet = ['herp', 'derp', 'hurr', 'durr'];
      var enums = _.times(20, function () {
        return gen._generators.enum({enum: enumSet});
      });

      _.each(enums, function (str) {
        _.contains(enumSet, str).should.be.true;
      });
    });

    it("should generate random objects", function () {
      var gen = new jfs.JsonFromSchema();
      var obj = gen._generators._randomObject({minRandomKeys:5, maxRandomKeys: 15});
      _.isPlainObject(obj).should.be.true;
      _.keys(obj).length.should.be.above(4);
      _.keys(obj).length.should.be.below(16);
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

        _.each(objs, function (obj) {
          var ok = zs.validate(obj, schema);
          if(!ok) {
            console.log("%s\nschema validation error: %s", util.inspect(obj, {depth: 5}), util.inspect(zs.getLastErrors(), {depth: 5}));
          }
          ok.should.be.true;
        });

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

        _.each(objs, function (obj) {
          console.log("obj", util.inspect(obj, {depth: 5}));
          var ok = zs.validate(obj, schema2);
          if(!ok) {
            console.log("%s\nschema validation error: %s", util.inspect(obj, {depth: 5}), util.inspect(zs.getLastErrors(), {depth: 5}));
          }
          ok.should.be.true;
        });

      });

    });

  });

});