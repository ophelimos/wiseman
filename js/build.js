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
    var DRAG_THRESHOLD = 50;
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

    function pickUpBody(clickedBody, pointer) {
        clickedBody.sprite.alive = false;

        // p2 uses different coordinate system, so convert the pointer position to p2's coordinate system
        var physicsPos = [game.physics.p2.pxmi(pointer.position.x), game.physics.p2.pxmi(pointer.position.y)];
        var localPointInBody = [0, 0];
        // this function takes physicsPos and converts it to the body's local coordinate system
        clickedBody.toLocalFrame(localPointInBody, physicsPos);

        // use a revoluteContraint to attach mouseBody to the clicked body
        //mouseConstraint = this.game.physics.p2.createRevoluteConstraint(mouseBody, [0, 0], clickedBody, [game.physics.p2.mpxi(localPointInBody[0]), game.physics.p2.mpxi(localPointInBody[1]) ]);
        mouseConstraint = global.game.physics.p2.createLockConstraint(mouseBody, clickedBody);
        
    }

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
                    game.physics.p2.setBounds(0, 0, game.width, game.height, false, false, false, true, false);
                    game.physics.p2.gravity.y = 10000;
                    game.physics.p2.gravity.x = 0;
                    game.physics.p2.restitution = 0.2;
                    game.physics.p2.friction = 10000;

                    state.layout = Layout.add([
                        ['image', 'sky', ['bg_' + state.background], { x: 50, y: 80 }, { x: 50, y: 80 } ],
                        ['solid', 'ground', [2048, 1, { body: { static: 1 } }], 'sky', { x: 0, y: "1280px" } ],
                        ['image', 'palette', ['palette'], { x: 100, y: 50 }, { x: "100%-36px", y: 50 } ],
                        ['button', 'done', [['256x164', 0, 0, 0, 0, buttonFont], "I’m\nDone!"], 'palette', { x: "293px", y: "839px" } ],
                        ['button', 'more', [['246x164', 0, 0, 0, 0, disabledFont], "More"], 'palette', { x: "31px", y: "839px" } ],
                        ['sprite', 'material1', ['material1', 0, { scale: 0.4 }], { x: 50, y: 50 }, 'palette', { x: "154px", y: "165px" } ],
                        ['sprite', 'material2', ['material2', 0, { scale: 0.4 }], { x: 50, y: 50 }, 'palette', { x: "421px", y: "165px" } ],
                        ['sprite', 'material3', ['material3', 0, { scale: 0.4 }], { x: 50, y: 50 }, 'palette', { x: "154px", y: "435px" } ],
                        ['sprite', 'material4', ['material4', 0, { scale: 0.4 }], { x: 50, y: 50 }, 'palette', { x: "421px", y: "435px" } ],
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

                    state.layout.ground.body.setCollisionGroup(baseCollisionGroup);
                    state.layout.ground.body.collides([brickCollisionGroup, rainCollisionGroup]);

                    // Sprites for the actual materials
                    var i;
                    for (i = 1; i <= 4; ++i) {
                        state.layout['material'+i].inputEnabled = true;
                        logicState.addHandler(state.layout['material'+i].events, 'onInputDown');
                    }

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
            game.load.image('material1', 'assets/building/wisemanhouse_leftroof_prelim.png');
            game.load.image('material2', 'assets/building/wisemanhouse_rightroof_prelim.png');
            game.load.image('material3', 'assets/building/wisemanhouse_plank_previs.jpg');
            game.load.image('material4', 'assets/building/wisemanhouse_doorpanel_prelim.jpg');
            game.load.physics('physicsData', 'assets/physics/materials.json');
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
                _.forEach(['palette', 'done', 'more', 'material1', 'material2', 'material3', 'material4'], function(item) {
                    state.layout[item].destroy();
                });
                bricks.forEach(function(brick) {
                    brick.inputEnabled = false;
                });
            }
        },
        onInputDown: function(events, button) {
            var game = this.game;
            var brick = button.name;
            var brickSprite = bricks.create(game.input.activePointer.x, game.input.activePointer.y, brick);
            brickSprite.name = brick;
            // The physics body will not scale with the sprite, so scaling is not useful with physics data
            //brickSprite.scale.setTo(0.25, 0.25);
            brickSprite.inputEnabled = true;
            brickSprite.input.useHandCursor = true;
            // Doesn't work with p2, we have to enable drag in a different way
            //brickSprite.input.enableDrag();
            game.physics.p2.enable(brickSprite);
            // Unnecessary, since this is what it does by default
            //brickSprite.body.setRectangleFromSprite();
            if ( brickSprite.name == "material1" || brickSprite.name == "material2" ) {
                brickSprite.body.clearShapes();
                brickSprite.body.loadPolygon('physicsData', brickSprite.name);
            }
            brickSprite.body.setCollisionGroup(brickCollisionGroup);
            brickSprite.body.collides([brickCollisionGroup, baseCollisionGroup, rainCollisionGroup]);
            // Try and make these things a little more realistic
            // brickSprite.body.damping = 0.9;
            brickSprite.body.mass = 1000;
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
