(function(){
    "use strict";
    var global = window;

    // Return a function for getting values at arbitrarily depth inside an object.
    // getPath('a.b.c') is equivalent to function(obj) { return obj.a.b.c; }
    // except that it will return undefined if obj, obj.a, or obj.a.b is undefined/falsey.
    // Arrays can also be indexed, eg getPath('0.x')([{x:1}]) returns 1
    var getPath = function(path) {
        // Natively we need something like getPath(['a','b','c']), but who wants to type that?
        if (typeof path === 'string')
            path = path.split('.');
        return function(obj) {
            _.forEach(path, function(segment) {
                if (obj) obj = obj[segment];
            });
            return obj;
        };
    };

    define('Placeholder',
    ['lodash'],
    function(_) {
        // Placeholders that will let us fill templates without having to parse tons of strings.
        var Placeholder = function(getter) {
            if (typeof getter == 'string')
                getter = getPath(getter);
            this.fill = getter;
        }
        Placeholder.fill = function(pattern, context) {
            if (typeof pattern !== 'object')
                return pattern;
            if (pattern instanceof Placeholder)
                return pattern.fill(context);
            if (pattern instanceof Array)
                return _.map(pattern, function(subpattern) { return Placeholder.fill(subpattern, context); });
            return _.mapValues(pattern, function(subpattern) { return Placeholder.fill(subpattern, context); });
        };
        Placeholder.set = function() {
            var paths = _.flatten(arguments);
            return _(paths).zipObject().transform(function(result, _, path) {
                result[path.replace(/\./g, '_')] = new Placeholder(getPath(path));
            }).value();
        };
        return Placeholder;
    });

})();
