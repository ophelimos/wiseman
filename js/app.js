(function(){
    "use strict";

    var lodash = 'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/2.4.1/lodash.min.js';
    var phaser = 'https://cdnjs.cloudflare.com/ajax/libs/phaser/2.2.2/phaser.min.js';

    var config = {
        map: {
            '*': {
                'lodash': lodash,
                'phaser': phaser,
            },
        },
        shim: { },
        bundles: {
            'util': ['Util', 'Placeholder', 'Random'],
        },
    };
    config.shim[phaser] = { exports: 'Phaser' };

    requirejs.config(config);

    require(['game', 'build'],
    function(logicState) {
        logicState.to('resolution-select');
    });

})();
