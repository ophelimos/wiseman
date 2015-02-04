(function(){
    "use strict";

    requirejs.config({
        map: {
            '*': {
                'lodash': 'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/2.4.1/lodash.min.js',
            },
        },
        shim: {
            'phaser': {
                exports: 'Phaser'
            },
        },
        bundles: {
            'util': ['Placeholder'],
        },
    });

    require(['game'],
    function(gameState) {
        gameState.to('resolution-select');
    });

})();
