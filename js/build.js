define(['lodash', 'phaser', 'Layout', 'StateMachine', 'game', 'Random'],
function(_, Phaser, Layout, StateMachine, logicState, Random){
    "use strict";

    var global = window;

    var bricks;
    var raindrops;
    var brickCollisionGroup;
    var rainCollisionGroup;
    var baseCollisionGroup;
    var mouseBody;
    var mouseConstraint;
    var DROP_VELOCITY_THRESHOLD = 0.02;
    var DROP_COUNT_GEN = Random.poisson(5);
    var DRAG_THRESHOLD = 40;
    var drag = {
        moveCallbackIndex: -1,
        object: undefined,
        delta: { x: 0, y: 0 },
        start: { x: 0, y: 0 },
        passedThreshold: false,
        begin: function(object, x, y) {
            this.game = object.game;
            this.moveCallbackIndex = this.game.input.addMoveCallback(this.move, this);
            this.object = object;
            this.start.x = object.x || 0;
            this.start.y = object.y || 0;
            this.delta.x = x - object.x || 0;
            this.delta.y = y - object.y || 0;
            this.passedThreshold = false;
        },
        move: function(pointer, x, y, down) {
            if (this.object) {
                x = x - this.delta.x;
                y = y - this.delta.y;
                if (!this.passedThreshold) {
                    var d2 = (x-this.start.x)*(x-this.start.x) + (y-this.start.y)*(y-this.start.y);
                    if (d2 > DRAG_THRESHOLD*DRAG_THRESHOLD)
                        this.passedThreshold = true;
                }
                if (this.passedThreshold) {
                    this.object.x = x;
                    this.object.y = y;
                }
            }
        },
        end: function(x, y) {
            this.object = undefined;
            if (this.moveCallbackIndex !== -1) {
                this.game.input.deleteMoveCallback(this.moveCallbackIndex);
                this.moveCallbackIndex = -1;
            }
        }
    };
    // Mass per pixel; large wall with door has ~335,000 pixels.
    // Masses around 500 start to visibly sink into the ground.
    var WOOD_DENSITY = 0.001;
    var PIECE_SCALE = 1;
    var pieceMap = {}, pieces = [
        {
            image: 'wisemanhouse_leftroof_prelim.png',
            outline: [
                495, 283,
                495, 66,
                183, 230,
                183, 283,
            ],
            baseline: [
                183, 283,
                495, 283,
            ],
            density: WOOD_DENSITY,
        },
        {
            image: 'wisemanhouse_rightroof_prelim.png',
            outline: [
                330, 283,
                330, 230,
                0, 60,
                0, 283,
            ],
            baseline: [
                330, 230,
                330, 283,
            ],
            density: WOOD_DENSITY,
        },
        {
            image: 'wisemanhouse_doorpanel_prelim.jpg',
            density: WOOD_DENSITY,
        },
        {
            image: 'wisemanhouse_plank_previs.jpg',
            density: WOOD_DENSITY,
        },
    ];

    var sumOverPolyEdges = function(poly, f) {
        var sum = 0, i = 0, n = poly.length;
        if (n < 4)
            return sum;
        for (n -= 2; i < n; i += 2)
            sum += f(poly[i + 0], poly[i + 1], poly[i + 2], poly[i + 3]);
        sum += f(poly[i + 0], poly[i + 1], poly[0], poly[1]);
        return sum;
    };
    var measurePoly = function(poly) {
        var area = 1/2 * sumOverPolyEdges(poly, function(x1, y1, x2, y2) {
            return (y2 + y1) * (x2 - x1);
        });
        return {
            area: area,
            // centroid == center of mass
            cx: 1/(6*area) * sumOverPolyEdges(poly, function(x1, y1, x2, y2) {
                    return (x1 + x2) * (x2*y1 - x1*y2);
                }),
            cy: 1/(6*area) * sumOverPolyEdges(poly, function(x1, y1, x2, y2) {
                    return (y1 + y2) * (x2*y1 - x1*y2);
                }),
        };
    };
    // May be called multiple times if the state is re-entered; needs to be idempotent.
    var updatePiecePhysics = function(piece, image) {
        var area = 0;
        if (piece.outline) {
            var measure = measurePoly(piece.outline);
            area = measure.area;
            if (area < 0) {
                // Points are in the wrong order, reverse them.
                // (Aside from negative area here, physics will freak out.)
                var old = piece.outline, i = old.length;
                piece.outline = [];
                while (i) {
                    i -= 2;
                    piece.outline.push(old[i+0], old[i+1]);
                }
                area = -area;
            }
            piece.centroid = { x: measure.cx, y: measure.cy };
        } else {
            area = image.width * image.height;
        }
        piece.mass = piece.density * area;
        if (!piece.baseline)
            piece.baseline = [
                0, image.height,
                image.width, image.height
            ];
        // TODO: adjust baseline
    };

    var buttonFont = {
        font: "bold 67px 'Verdana'",
        fill: '#000',
        stroke: 'rgba(255,255,255,0.5)',
        strokeThickness: 5,
        shadowOffsetX: 0,
        shadowOffsetY: 4,
        shadowBlur: 9,
        shadowColor: "rgba(0,0,0,0.7)",
        align: 'center'
    };
    var disabledFont = _.defaults({ fill: 'rgba(0,0,0,0.5)', stroke: 'rgba(255,255,255,0.2)' }, buttonFont);

    logicState.addState('build', {
        onPreloadGame: function(game) {
            var state = this;
            this.game = game;
            // The "world" game state is shared by both the "build" and "storm" logic states.
            game.state.add('world', {
                create: function() {
                    // Create or reset the physics system.
                    game.physics.startSystem(Phaser.Physics.P2JS);

                    // x, y, width, height, collide with left, right, top, bottom, setCollisionGroup
                    game.physics.p2.setBounds(0, 0, game.width, game.height + 500, false, false, false, true, false);
                    game.physics.p2.gravity.y = 10000;
                    game.physics.p2.gravity.x = 0;
                    game.physics.p2.restitution = 0.2;
                    game.physics.p2.friction = 10000;

                    state.layout = Layout.add([
                        ['image', 'sky', ['bg_' + state.background], { x: 50, y: 80 }, { x: 50, y: 80 } ],
                        ['solid', 'ground',   [1850, 730, { body: { kinematic: 1 } }], 'sky', { x: "-500px", y: "1310px" } ],
                        ['solid', 'platform', [1000,  30, { body: { kinematic: 1 } }], { x: 0, y: 100 }, 'ground', { x: "600px", y: 0 } ],
                        ['image', 'palette', ['palette'], { x: 100, y: 50 }, { x: "100%-36px", y: 50 } ],
                        ['button', 'done', [['256x164', 0, 0, 0, 0, buttonFont], "I’m\nDone!"], 'palette', { x: "293px", y: "839px" } ],
                        ['button', 'more', [['246x164', 0, 0, 0, 0, disabledFont], "More"], 'palette', { x: "31px", y: "839px" } ],
                        ['sprite', 'material0', ['material0', 0, { scale: 0.4 }], { x: 50, y: 50 }, 'palette', { x: "154px", y: "165px" } ],
                        ['sprite', 'material1', ['material1', 0, { scale: 0.4 }], { x: 50, y: 50 }, 'palette', { x: "421px", y: "165px" } ],
                        ['sprite', 'material2', ['material2', 0, { scale: 0.4 }], { x: 50, y: 50 }, 'palette', { x: "154px", y: "435px" } ],
                        ['sprite', 'material3', ['material3', 0, { scale: 0.4 }], { x: 50, y: 50 }, 'palette', { x: "421px", y: "435px" } ],
                    ]);

                    // Collisions must be two-way: each collision group must be set to
                    // collide with all other collision groups.  One-way collisions
                    // don't happen.
                    brickCollisionGroup = game.physics.p2.createCollisionGroup();
                    rainCollisionGroup = game.physics.p2.createCollisionGroup();
                    baseCollisionGroup = game.physics.p2.createCollisionGroup();

                    //  This part is vital if you want the objects with their own collision groups to still collide with the world bounds
                    //  (which we do) - what this does is adjust the bounds to use its own collision group.
                    game.physics.p2.updateBoundsCollisionGroup();

                    // Allow collision events
                    game.physics.p2.setImpactEvents(true);

                    _.forEach(['ground', 'platform'], function(key) {
                        state.layout[key].body.setCollisionGroup(baseCollisionGroup);
                        state.layout[key].body.collides([brickCollisionGroup, rainCollisionGroup]);
                    });

                    // Sprites for the actual materials
                    _.forOwn(pieceMap, function(pieceDef, key) {
                        state.layout[key].inputEnabled = true;
                        logicState.addHandler(state.layout[key].events, 'onInputDown');
                        updatePiecePhysics(pieceDef, game.cache.getFrame(key));
                    });

                    // We don't actually create bricks until they click on one to create
                    bricks = game.add.group(game.world, "bricks", false, true, Phaser.Physics.P2);

                    raindrops = game.add.group(game.world, "raindrops", false, true, Phaser.Physics.P2);

                    // create physics body for mouse which we will use for dragging clicked bodies
                    mouseBody = new p2.Body();
                    game.physics.p2.world.addBody(mouseBody);

                    // attach pointer events for dragging
                    logicState.addHandler(game.input, 'onDown');
                    logicState.addHandler(game.input, 'onUp');
                }
            });

            game.load.image('palette', 'assets/palette.png');
            game.load.image('snapguide', 'assets/snapguide.png');
            _.forEach(pieces, function(piece, index) {
                var key = 'material' + index;
                game.load.image(key, 'assets/building/' + piece.image);
                pieceMap[key] = piece;
            });
        },
        onEnter: function(prevState, background) {
            this.background = background;
            this.game.state.start('world');
        },
        onButton: function(which) {
            if (which === 'done') {
                // Rain
                logicState.to('storm');
            }
        },
        onLeave: function(nextState) {
            var state = this;
            if (nextState === 'storm') {
                // Remove build UI.
                _.forEach(['palette', 'done', 'more'].concat(_.keys(pieceMap)), function(item) {
                    state.layout[item].destroy();
                });
                bricks.forEach(function(brick) {
                    brick.inputEnabled = false;
                });
            }
        },
        onInputDown: function(events, button) {
            var game = this.game;
            var key = button.name;
            var brickSprite = bricks.create(game.input.activePointer.x, game.input.activePointer.y, key);
            brickSprite.scale.x = PIECE_SCALE;
            brickSprite.scale.y = PIECE_SCALE;
            brickSprite.name = key;
            brickSprite.inputEnabled = true;
            brickSprite.input.useHandCursor = true;
            game.physics.p2.enable(brickSprite);
            if (pieceMap[key].outline) {
                brickSprite.body.clearShapes();
                var poly = [], i, polygon = pieceMap[key].outline, n = polygon.length;
                for (i = 0; i < n; i += 2) {
                    var x = polygon[i+0], y = polygon[i+1];
                    poly.push(PIECE_SCALE * x - brickSprite.width/2);
                    poly.push(PIECE_SCALE * y - brickSprite.height/2);
                }
                brickSprite.body.addPolygon({ skipSimpleCheck: 1 }, poly);
                // P2 internally adjusts the polygon so that its centroid aligns with the sprite anchor.
                // We need to adjust the sprite anchor to match. (where 0 = top/left, 0.5 = center, 1 = bottom/right)
                brickSprite.anchor.x = PIECE_SCALE * pieceMap[key].centroid.x / brickSprite.width;
                brickSprite.anchor.y = PIECE_SCALE * pieceMap[key].centroid.y / brickSprite.height;
            }
            brickSprite.body.setCollisionGroup(brickCollisionGroup);
            brickSprite.body.collides([brickCollisionGroup, baseCollisionGroup, rainCollisionGroup]);
            // Try and make these things a little more realistic
            // brickSprite.body.damping = 0.9;
            brickSprite.body.mass = pieceMap[key].mass;
            // Make sure inertia is sane when physics start to apply.
            brickSprite.body.inertia = 0;

            drag.begin(brickSprite.body, game.input.activePointer.x, game.input.activePointer.y);
            drag.object.motionState = Phaser.Physics.P2.Body.STATIC;
        },
        onDown: function(input, event) {
            // Check if we hit a brick
            var brickbodies = [];
            bricks.forEach([].push, brickbodies);
            
            var hitbodies = this.game.physics.p2.hitTest(event.position, brickbodies);
            
            if (hitbodies.length)
            {
                drag.begin(hitbodies[0].parent, event.position.x, event.position.y);
                drag.object.motionState = Phaser.Physics.P2.Body.STATIC;
            }
        },
        onUp: function(input, event) {
            if (drag.object) {
                drag.object.motionState = Phaser.Physics.P2.Body.DYNAMIC;
                drag.object.velocity.mx = drag.object.velocity.my = 0;
                drag.end(event.position.x, event.position.y);
            }
        },
    });

    logicState.addState('storm', {
        onPreloadGame: function(game) {
            this.game = game;

            game.load.image('raindrop', 'assets/raindrop.png');
            game.load.spritesheet('raindrops', 'assets/raindrops.png', 15, 25);
        },
        onEnter: function(prevState) {
            var game = this.game;
            if (game.state.current !== 'world')
                game.state.start('world');

            // Create some raindrops
            for (var i = 0; i < 100; i++) {
                var drop = raindrops.create(0, 0, "raindrops");
                game.physics.p2.enable(drop);
                drop.animations.add('splash', [0, 1, 2, 3], 10, false);
                drop.body.setCollisionGroup(rainCollisionGroup);
                drop.body.collides([brickCollisionGroup, baseCollisionGroup], function(raindrop) {
                    raindrop.sprite.animations.play('splash', 15, false, true);
                });
            }
            game.time.events.loop(100, this.dropRain, this);
        },
        dropRain: function() {
            var game = this.game;
            // Kill any stationary drops.
            raindrops.forEachAlive(function(drop) {
                // Don't kill splashing drops; wait for them to finish.
                if (drop.animations.currentAnim && !drop.animations.currentAnim.isFinished)
                    return;
                // Also kill any that have somehow fallen out of the world.
                if (drop.body.y > game.height) {
                    drop.kill();
                    return;
                }
                var velocity = drop.body.velocity;
                var speed2 = velocity.x*velocity.x + velocity.y*velocity.y;
                if (speed2 < DROP_VELOCITY_THRESHOLD*DROP_VELOCITY_THRESHOLD)
                    drop.kill();
            });
            var n = DROP_COUNT_GEN();
            while (n--) {
                // Find a raindrop and drop it
                var drop = raindrops.getFirstDead();
                if (drop) {
                    drop.body.x = Math.random() * (game.world.width - drop.width);
                    drop.body.y = Math.random() * -2000;
                    drop.body.velocity.x = 0;
                    drop.body.velocity.y = 500 + Math.random() * 2000;
                    drop.revive();
                    drop.frame = 0;
                }
            }
        },
    });

});
