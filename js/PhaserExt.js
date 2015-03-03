define(['lodash', 'phaser'],
function(_, Phaser) {
    "use strict";

    var PhaserExt = {};

    PhaserExt.makeFrameGrid = function(game, totalWidth, totalHeight, definition) {
        totalWidth = totalWidth | 0;
        totalHeight = totalHeight | 0;
        var countX = definition.x | 0, countY = definition.y | 0;
        var frameData = new Phaser.FrameData(), i = 0;
        if (countX < 1 || countY < 1) {
            console.error("Invalid grid definition: ", definition);
            return;
        }
        var frameWidth = totalWidth / countX | 0, frameHeight = totalHeight / countY | 0, x, y;
        var names = definition.names || [], baseName = definition.baseName || '';
        for (y = 0; y < totalHeight; y = y + frameHeight | 0) {
            for (x = 0; x < totalWidth; x = x + frameWidth | 0) {
                var uuid = game.rnd.uuid();
                frameData.addFrame(new Phaser.Frame(i, x, y, frameWidth, frameHeight, names[i] || baseName + i, uuid));
                ++i;
            }
        }
        if (x != totalWidth || y != totalHeight)
            console.warn("Image of ", totalWidth, "x", totalHeight, " did not divide evenly: ", definition);
        return frameData;
    };

    return PhaserExt;
});