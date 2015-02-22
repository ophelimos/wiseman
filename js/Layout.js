define(['lodash', 'Placeholder'],
function(_, Placeholder) {
    "use strict";

    var Layout = function(){};

    // ##.#% + ##px
    var positionRegex = /^\s*(?:(\d+(?:[.]\d+)?)\s*%)?\s*(?:([+-]?)\s*(\d+)\s?px)?\s*$/;

    Layout.decodePosition = function(zero, size, position) {
        var percent = 0, sign = '', pixels = 0;
        if (typeof position === 'string') {
            var matches = position.match(positionRegex);
            // This will throw an exception if the syntax is wrong.
            // Don't get the syntax wrong.
            percent = matches[1] - 0 || 0;
            sign    = matches[2];
            pixels  = matches[3] - 0 || 0;
            if (sign === '-')
                pixels = -pixels;
        } else {
            percent = position;
        }
        return zero + size * percent / 100 + pixels;
    };

    // position an axis-aligned box relative to another axis-aligned box
    Layout.alignBox = function(ref, refAlign, obj, objAlign) {
        var box = obj
            ? { x: Layout.decodePosition(0, obj.width,  objAlign.x),
                y: Layout.decodePosition(0, obj.height, objAlign.y),
                width:  obj.width,
                height: obj.height }
            : { x: 0, y: 0 };
        box.x = Layout.decodePosition(ref.x, ref.width,  refAlign.x) - box.x;
        box.y = Layout.decodePosition(ref.y, ref.height, refAlign.y) - box.y;
        return box;
    };

    // recommended usage: var $layout = Layout.$;
    Layout.$ = Placeholder.set('name', 'align.x', 'align.y', 'align.width', 'align.height');

    // Layout.context[createFunc](name, positionFunc, ...);

    // Layout.world = game.world;
    // Layout.context = game.add;
    // Layout.getSize = function(key) { return game.cache.getFrame(key); };
    // Layout.add([
    //     [game.add.bitmap, "foo", []]
    // ]);
    Layout.add = function(group, layout, layoutMap) {
        if (!Layout.hasOwnProperty('context'))
            console.error("You might want to set Layout.context.");
        if (group instanceof Array) {
            layoutMap = layout;
            layout = group;
            group = Layout.world;
        }
        if (!layoutMap)
            layoutMap = { '': group };
        _.forEach(layout, function(item, index) {
            var createFunc, name, createArgs, reference, refAlign, objAlign;
            var pattern = "".concat.apply("", _.map(item, function(x) { return (typeof x)[0]; } )).substr(3);
            // 6: [createFunc, name, createArgs, objAlign, reference, refAlign] fso|oso
            // 5: [createFunc, name, createArgs, reference, refAlign] fso|so
            // 5: [createFunc, name, createArgs, objAlign, refAlign] fso|oo
            // 4: [createFunc, name, createArgs, refAlign] fso|o
            var i = 0;
            createFunc = item[i++]; // string|function
            if (typeof createFunc === 'string')
                createFunc = Layout.context[createFunc];
            name       = item[i++]; // string
            createArgs = item[i++]; // array
            if (pattern === 'oso' || pattern === 'oo')
                objAlign = item[i++];
            if (typeof item[i] === 'string')
                reference = item[i++]; // string
            else
                reference = '';
            refAlign = item[i++]; // object
            if (!objAlign)
                objAlign = { x: 0, y: 0 };

            if (typeof reference === 'string')
                // Name of existing layout object. ("" for bounds)
                reference = layoutMap[reference];

            var positioner = function(obj) {
                return Layout.alignBox(reference, refAlign, obj, objAlign);
            };
            layoutMap['^'] = layoutMap[name] = createFunc.apply(Layout.context, [name, group, positioner].concat(createArgs));
        });
        return layoutMap;
    };

    return Layout;
});
