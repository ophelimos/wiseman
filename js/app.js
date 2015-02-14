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
            'util': ['Util', 'Placeholder', 'Random'],
        },
    });

    require(['game', 'joshdemo', 'build'],
    function(logicState) {
        logicState.to('resolution-select');
    });

})();
