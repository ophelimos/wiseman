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

    var noiseBox;
    define('Random',
    ['lodash'],
    function(_) {
        return {
            // Poisson distribution: number of events in an arbitrary fixed interval given an expected average.
            // http://en.wikipedia.org/wiki/Poisson_distribution#Generating_Poisson-distributed_random_variables
            poisson: function(expected) {
                return function() {
                    var x = 0, p = Math.exp(-expected), s = p, u = Math.random();
                    while (u > s) {
                        x += 1;
                        p *= expected / x;
                        s += p;
                    }
                    return x;
                };
            },
            noise1d: function(index) {
                if (!noiseBox) {
                    noiseBox = [];
                    for (var i = 0; i < 256; ++i)
                        noiseBox.push(i);
                    noiseBox = _.shuffle(noiseBox);
                }
                return function(t) {
                    var t0 = Math.floor(t),
                        k0 = noiseBox[(noiseBox[(noiseBox[index & 255] + t0) & 255] + (t0 >> 8)) & 255],
                        t1 = t0 + 1,
                        k1 = noiseBox[(noiseBox[(noiseBox[index & 255] + t1) & 255] + (t1 >> 8)) & 255],
                        f = t - t0;
                    // Scale the output to 0 to 1 range.
                    k0 = (k0 & 15) / 15;
                    k1 = (k1 & 15) / 15;
                    // Smooth so derivative is 0 at all integral t.
                    f = 3*f*f - 2*f*f*f;
                    // Interpolate and scale to -1 .. +1.
                    return ((f * k1 + (1 - f) * k0) - 0.5) * 2;
                };
            },
        };
    });

    define('Util',
    ['lodash'],
    function(_) {
        return {
            SumAcc: (function(){
                var SumAcc = function(init) { this.sum = init || 0; };
                SumAcc.prototype.add = function(x) { this.sum += x; };
                return SumAcc;
            })(),
            ConcatAcc: (function(){
                var ConcatAcc = function(init) { this.sum = init || []; };
                ConcatAcc.prototype.add = function(x) { this.sum.push(x); };
                return ConcatAcc;
            })(),
        };
    });

})();
