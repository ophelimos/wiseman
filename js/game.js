define(['lodash', 'phaser', 'Layout', 'StateMachine'],
function(_, Phaser, Layout, StateMachine){
    "use strict";

    var global = window;
    var cur_objects = Object();
    var $1 = document.querySelector.bind(document), $s = document.querySelectorAll.bind(document);
    var screenModes = {
        'fool_full_screen': { background: 'fool', ratio: function(){ return window.screen.width / window.screen.height; }, full: 1 },
        'fool_4_3': { background: 'fool', ratio: function(){ return 4/3; } },
        'fool_16_9': { background: 'fool', ratio: function(){ return 16/9; } },
        'wise_full_screen': { background: 'wise', ratio: function(){ return window.screen.width / window.screen.height; }, full: 1 },
        'wise_4_3': { background: 'wise', ratio: function(){ return 4/3; } },
        'wise_16_9': { background: 'wise', ratio: function(){ return 16/9; } },
    };
    
    var parts = {
        "wise_doorpanel": "wisemanhouse_doorpanel_prelim.jpg",
        "wise_leftroof":  "wisemanhouse_leftroof_prelim.png",
        "wise_plank":     "wisemanhouse_plank_previs.jpg",
        "wise_rightroof": "wisemanhouse_rightroof_prelim.png",
    };

    // position an axis-aligned box relative to another axis-aligned box
    var alignBox = Layout.alignBox;

    // James' globals
    var inJames = false;
    var bricks;
    var instructionText;
    var raindrops;
    var brickCollisionGroup;
    var rainCollisionGroup;
    var baseCollisionGroup;
    var mouseBody;
    var mouseConstraint;
    var startButton;
    
    [
    //   element id, sprite, scale, existing elements to connect to, position relative to first connected element
        ["door", "wise_doorpanel", ["base"], []],
        ["wall", "wise_plank", ["door", "base"], []],
        ["leftroof", "wise_leftroof", ["door"], []],
        ["rightroof", "wise_rightroof", ["wall", "leftroof"], []]
    ];
    
    var game, logicState = new StateMachine("logicState", {});

    // Lock two bodies together in their current orientation.
    var lock = function(bodyA, bodyB, strength) {
        var dx = bodyB.body.x-bodyA.body.x, dy = bodyB.body.y-bodyA.body.y;
        // rotate bodyB into bodyA's reference frame
        // Radians, so use .rotation rather than .angle.
        var dtheta = bodyB.body.rotation-bodyA.body.rotation;
        var sin = Math.sin(dtheta), cos = -Math.cos(dtheta);
        var dx_ = dy * sin + dx * cos, dy_ = dy * cos - dx * sin;

        var constraint = game.physics.p2.createLockConstraint( bodyA, bodyB, [dx_, dy_], dtheta);

        var bodyA = constraint.bodyA, bodyB = constraint.bodyB;
        var dx_ = bodyB.position[0] - bodyA.position[0], dy_ = bodyB.position[1] - bodyA.position[1];
        constraint.breakDistance2 = (dx_*dx_ + dy_*dy_) * (1 + (strength || 3)/1000);
    };
    
    var loadBuildingChunk = function(basePosition, description) {
        // clean up any existing building or create a new one
        if (game.building) {
            game.building.removeAll(true);
        } else {
            // not sure whether we want to add to stage or world, so keeping the default for now
            game.building = game.add.group(undefined, 'building', false, true, Phaser.Physics.P2);
            game.building = game.add.physicsGroup(Phaser.Physics.P2, undefined, 'building', true);
        }

        var buildingPositions = { base: basePosition };
        description.forEach(function(piece) {
            var reference = reference = buildingPositions[piece.ref];
            var size;
            if (piece.frame)
                size = game.cache.getFrameByIndex(piece.key, piece.frame);
            else
                size = game.cache.getFrame(piece.key);
            if (!piece.align)
                piece.align = { ref: { x: 0, y: 0 }, obj: { x: 0, y: 100 } };
            var position = alignBox(reference, piece.align.ref, size, piece.align.obj);
            position.body = game.building.create(position.x, position.y, piece.key, piece.frame);
            buildingPositions[piece.id] = position;

            piece.lock.forEach(function(lockTarget) {
                lock(position.body, buildingPositions[lockTarget].body);
            });
        });
    };
    
    Layout.buttonStyles = {
    // [key, overFrame, outFrame, downFrame, upFrame, textStyle]
        mainMenu: ['menubtn', 1, 0, 2, 3, { }],
    };

    global.logicState = logicState;

    logicState.addState('mainmenu', {
        onPreloadGame: function(game) {
            game.state.add('mainmenu', {
                create: function() {
                    var layout = Layout.add([
                        ['image', 'sky',    ['menubg'], { x: 50, y: 80 }, { x: 50, y: 80 } ],
                        ['solid', 'shade',  [game.width, game.height, { fill: [0,0,0,0.5] }], { x: 0, y: 0 } ],
                        ['text', 'welcome', ["Welcome to the Parable\nof the Wise and Foolish Builders!",
                                { font: "bold 36px 'Verdana'", fill: '#FFF', stroke: '#000', strokeThickness: 4, align: 'center' }
                            ], { x: 50, y: 0 }, { x: 50, y: '50px' } ],
                        ['button', 'buildw', ['mainMenu', "Build on rock"], { x: 50, y: 0 }, '^', { x: 50, y: "100%+150px" }],
                        ['button', 'buildf', ['mainMenu', "Build on sand"], { x: 50, y: 0 }, '^', { x: 50, y: "100%+20px" }],
                    ]);
                    global.layout = layout;
                }
            });

            game.load.image('menubg', 'assets/backgrounds/sea-361802_1920.jpg');
            game.load.spritesheet('menubtn', 'assets/menu/button.png', 600, 100);
        },
        onEnter: function(prevState) {
            game.state.start('mainmenu');
        },
        onButton: function(which) {
            var fn = {
                buildw: function() { logicState.to('build', 'wise'); },
                buildf: function() { logicState.to('build', 'fool'); },
                joshdemow: function() { logicState.to('joshdemo', 'wise'); },
                joshdemof: function() { logicState.to('joshdemo', 'fool'); },
            }[which];
            if (fn)
                fn();
        },
    });

    logicState.addState('start', {
        onEnter: function(prevState, screenMode) {
            document.body.className = "game";
            var ratio = screenModes[screenMode].ratio();
            // Clamp the screen ratio for full-screen with odd resolutions.
            if (ratio < 4/3) ratio = 4/3;
            if (ratio > 16/9) ratio = 16/9;
            var width = 2048, height = width / ratio;
            game = new Phaser.Game(width, height, Phaser.AUTO, 'container', {
                preload: function() {
                    game.load.image('menubg', 'assets/backgrounds/sea-361802_1920.jpg');
                    game.load.spritesheet('menubtn', 'assets/menu/button.png', 600, 100);
                    logicState.invokeAll('onPreloadGame', game);
                },
                create: function() {
                    // scale input to use canvas pixels rather than screen pixels
                    game.scale.scaleMode = Phaser.ScaleManager.EXACT_FIT;
                    game.scale.fullScreenScaleMode = Phaser.ScaleManager.SHOW_ALL;

                    global.game = game;
                    Layout.world = game.world;
                    // We can't always create things at the right position because some things don't have a size until they are created.
                    // So create in three phases: construct at 0,0; move into position; add to group/world.
                    Layout.context = {
                        nothing: function(name, group, positioner, width, height) {
                            var obj = { width: width, height: height };
                            var pos = positioner(obj);
                            obj.x = pos.x;
                            obj.y = pos.y;
                            return obj;
                        },
                        button: function(name, group, positioner, style, text, textAlign, textAnchor) {
                            if (typeof style === 'string')
                                style = Layout.buttonStyles[style];
                            if (typeof style[0] === 'string') {
                                var dim = style[0].match(/^\s*(\d+)\s*x\s*(\d+)\s*$/);
                                if (dim)
                                    style[0] = new Phaser.BitmapData(game, "texture_" + name, dim[1], dim[2]);
                            }
                            var obj = new Phaser.Button(game, 0, 0, style[0],
                                function(){ logicState.invoke('onButton', name); }, null,
                                style[1], style[2], style[3], style[4]);
                            if (text) {
                                var label = new Phaser.Text(game, 0, 0, text, style[5]);
                                var pos = Layout.alignBox(obj, textAnchor || { x: 50, y: 50 }, label, textAlign || { x: 50, y: 50 });
                                label.position.set(pos.x, pos.y);
                                obj.addChild(label);
                            }
                            var pos = positioner(obj);
                            obj.position.set(pos.x, pos.y);
                            return group.add(obj, true);
                        },
                        group: function(name, group, positioner, width, height) {
                            var obj = new Phaser.Group(game, null, name);
                            var pos = positioner({ width: width, height: height });
                            obj.position.set(pos.x, pos.y);
                            return group.add(group, true);
                        },
                        image: function(name, group, positioner, key, frame) {
                            var obj = new Phaser.Image(game, 0, 0, key, frame);
                            var pos = positioner(obj);
                            obj.position.set(pos.x, pos.y);
                            return group.add(obj, true);
                        },
                        solid: function(name, group, positioner, width, height, options) {
                            var texture = new Phaser.BitmapData(game, "texture_" + name, width, height);
                            if (options.fill)
                                texture.fill.apply(texture, options.fill);
                            return this.sprite(name, group, positioner, texture, undefined, options);
                        },
                        sprite: function(name, group, positioner, key, frame, options) {
                            var obj = new Phaser.Sprite(game, 0, 0, key, frame);
                            var scale = 1;
                            if (options.scale) {
                                scale = options.scale;
                                obj.width  *= options.scale;
                                obj.height *= options.scale;
                            }
                            if (options.body) {
                                game.physics.p2.enable(obj);
                                if (options.body.polygon) {
                                    obj.body.clearShapes();
                                    var poly = [], i, n = options.body.polygon.length;
                                    for (i = 0; i < n; i += 2) {
                                        var x = options.body.polygon[i+0], y = options.body.polygon[i+1];
                                        poly.push(scale * x - obj.width/2);
                                        poly.push(scale * y - obj.height/2);
                                    }
                                    obj.body.addPolygon({ skipSimpleCheck: 1 }, poly);
                                }
                                // Default to static because we probably won't add dynamic objects via layout.
                                if (options.body.kinematic) {
                                    // It doesn't move, but it does interact with other physics objects.
                                    obj.body.motionState = Phaser.Physics.P2.Body.KINEMATIC;
                                } else if (!options.body.dynamic) {
                                    // According to the docs you can set body.static/.dynamic to false to change state.
                                    // In practice, not so much.
                                    obj.body.motionState = Phaser.Physics.P2.Body.STATIC;
                                }
                            }
                            // TODO: account for rotation
                            var pos = positioner(obj);
                            if (options.body) {
                                obj.position.set(pos.x, pos.y);
                                obj.body.x = pos.x + obj.width/2;
                                obj.body.y = pos.y + obj.height/2;
                            } else {
                                obj.position.set(pos.x, pos.y);
                            }
                            obj.name = name;
                            return group.add(obj, true);
                        },
                        text: function(name, group, positioner, text, style) {
                            var obj = new Phaser.Text(game, 0, 0, text, style);
                            var pos = positioner(obj);
                            obj.position.set(pos.x, pos.y);
                            return group.add(obj, true);
                        },
                    };

                    logicState.invokeAll('onCreateGame', game);
                    logicState.to('mainmenu');
                },
            });
        },
    });

    logicState.addState('resolution-select', {
    onEnter: function() {
            var setUpPrestart = function(device) {
                var handler = function() {
                    if (this.id.substr(-11) === 'full_screen')
                        document.body[device.requestFullscreen]();
                    for (var mode in screenModes) {
                        var el = document.getElementById(mode);
                        if (el)
                            el.removeEventListener('click', handler);
                    }
                    logicState.to('start', this.id);
                };
                for (var mode in screenModes) {
                    var el = document.getElementById(mode);
                    if (el)
                        el.addEventListener('click', handler);
                }
                document.removeEventListener("readystatechange", onComplete);
            };

            // When the browser is done loading everything, take down the static loading text and get ready to start the game.
            var onComplete = function() {
                if (document.readyState === 'complete') {
                    document.removeEventListener('readystatechange', onComplete);
                    document.body.className = "prestart";

                    // Detect full screen capability.
                    var device = { };
                    _.forEach(['requestFullscreen', 'webkitRequestFullscreen', 'mozRequestFullScreen', 'msRequestFullscreen'], function(name) {
                        if (!device.requestFullscreen && document.body[name])
                            device.requestFullscreen = name;
                    });
                    _.forEach(['exitFullscreen', 'webkitExitFullscreen', 'mozCancelFullScreen', 'msExitFullscreen'], function(name) {
                        if (!device.exitFullscreen && document[name])
                            device.exitFullscreen = name;
                    });
                    setUpPrestart(device);
                }
            };
            document.addEventListener("readystatechange", onComplete);
            onComplete();
        }
    });

    return logicState;
});
