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

    // Layout.bounds = { x:0, y:0, width:screenWidth, height:screenHeight };
    // Layout.context = game.add;
    // Layout.getSize = function(key) { return game.cache.getFrame(key); };
    // Layout.add([
    //     [game.add.bitmap, "foo", []]
    // ]);
    Layout.add = function(layout, bounds) {
        if (!Layout.hasOwnProperty('context'))
            console.error("You might want to set Layout.context.");
        var layoutMap = { _: bounds || Layout.bounds };
        _.forEach(layout, function(item, index) {
            var createFunc, name, createArgs, size, reference = '_', refAlign, i;
            // 6: [createFunc, name, createArgs, size, reference, refAlign] fsaoso
            // 5: [createFunc, name, createArgs, reference, refAlign] fsaso
            // 5: [createFunc, name, createArgs, size, refAlign] fsaoo
            // 4: [createFunc, name, createArgs, refAlign] fsao
            i = 0;
            createFunc = item[i++]; // string
            name       = item[i++]; // string
            createArgs = item[i++]; // array
            if (typeof item[i] === 'object' && item.length > 3)
                size = item[i++]; // object
            else
                size = Layout.getSize(name);
            size = _.defaults({}, size, { x:0, y:0, width:0, height:0 });
            if (typeof item[i] === 'string')
                reference  = item[i++]; // string
            else
                reference  = '_';
            refAlign = item[i++]; // object

            if (typeof reference === 'string')
                // Name of existing layout object. ("_" for bounds)
                reference = layoutMap[reference];

            var align = Layout.alignBox(reference, refAlign, size, size);
            layoutMap[name] = align;

            // game.add.bitmapText(x, y, font, text, size, group)
            // game.add.button(x, y, key, callback, callbackContext, overFrame, outFrame, downFrame, upFrame, group)
            layoutMap[name].object = createFunc.apply(Layout.context, Placeholder.fill(createArgs, {
                name:  name,
                align: align,
            }));
        });
        return layoutMap;
    };

    return Layout;
});
