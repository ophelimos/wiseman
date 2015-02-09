define(['lodash', 'phaser', 'Layout', 'StateMachine', 'game'],
function(_, Phaser, Layout, StateMachine, logicState){
    "use strict";

    var global = window;

    var parts = {
        "wise_doorpanel": "wisemanhouse_doorpanel_prelim.jpg",
        "wise_leftroof":  "wisemanhouse_leftroof_prelim.png",
        "wise_plank":     "wisemanhouse_plank_previs.jpg",
        "wise_rightroof": "wisemanhouse_rightroof_prelim.png",
    };

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
        console.dir(["lock", bodyA, bodyB, strength, constraint.breakDistance2]);
    };

    logicState.addState('joshdemo', {
        onPreloadGame: function(game) {
            var state = this;
            var arrow, target, device;
            var scene = [];
            var removedConstraints = [];

            game.state.add('joshdemo', {
                create: function() {
                    // Create or reset the physics system.
                    game.physics.startSystem(Phaser.Physics.P2JS);

                    // x, y, width, height, collide with left, right, top, bottom, setCollisionGroup
                    game.physics.p2.setBounds(0, 0, game.width, game.height + 500, true, false, false, true, false);
                    game.physics.p2.gravity.y = 1000;
                    game.physics.p2.gravity.x = 100;
                    game.physics.p2.restitution = 0.3;
                    game.physics.p2.friction = 1.1;

                    var fixed = Layout.add([
                        ['image', 'sky',    ['bg_' + state.background], { x: 50, y: 80 }, { x: 50, y: 80 } ],
                        ['solid', 'ground',   [1350, 730, { body: { kinematic: 1 } }], 'sky', { x: 0, y: "1310px" } ],
                        ['solid', 'platform', [1000,  30, { body: { kinematic: 1 } }], { x: 0, y: 100 }, 'ground', { x: "100px", y: 0 } ],
                    ]);
                    global.laidout = fixed;
                    global.Layout = Layout;

                    var size, pos, spr;

                    // house
                     size = game.cache.getFrame('wise_doorpanel');
                    // -50 because P2 positions sprites by their center
                    pos = Layout.alignBox(fixed.platform, { x: 20, y: 0 }, size, { x: 20-50, y: 100-50 });
                    spr = game.add.sprite(pos.x, pos.y, 'wise_doorpanel');
                    spr.width = size.width;
                    spr.height = size.height;
                    game.physics.p2.enable(spr);
                    scene.push([spr, spr.body.x, spr.body.y, spr.body.angle]);
                    target = Layout.alignBox({ x: pos.x, y: pos.y, width: spr.height, height: spr.height }, { x: 50, y: 50 });
                    var door = spr;

                    pos.x += size.width / 2;
                    size = game.cache.getFrame('wise_plank');
                    pos.x += size.width / 2;
                    spr = game.add.sprite(pos.x, pos.y, 'wise_plank');
                    spr.width = size.width;
                    spr.height = size.height;
                    game.physics.p2.enable(spr);
                    scene.push([spr, spr.body.x, spr.body.y, spr.body.angle]);
                    var side = spr;
                    
                    pos.x -= 800;
                    pos.y -= 590;
                    size = game.cache.getFrame('wise_leftroof');
                    spr = game.add.sprite(pos.x+size.width/2, pos.y+size.height/2, 'wise_leftroof');
                    game.physics.p2.enable(spr);
                    spr.body.clearShapes();
                    var xerror = -size.width/2, yerror = -size.height/2;
                    spr.body.addPolygon({ skipSimpleCheck: 1 }, [160+xerror,282+yerror, 495+xerror,282+yerror, 495+xerror,60+yerror, 160+xerror,250+yerror]);
                    //spr.body.debug = true;
                    scene.push([spr, spr.body.x, spr.body.y, spr.body.angle]);
                    var roofLeft = spr;
                    global.roof = roofLeft;

                    lock(door, fixed.platform, 1);
                    lock(side, fixed.platform, 1);
                    lock(door, side, 5);
                    lock(roofLeft, door, 5);

                    size = game.cache.getFrame('arrow');
                    pos = Layout.alignBox(game.camera.view, { x: 90, y: 60 }, size, { x: 50, y: 50 });
                    spr = game.add.sprite(pos.x, pos.y, 'arrow');
                    spr.width *= 2;
                    spr.height *= 2;
                    game.physics.p2.enable(spr);
                    arrow = spr.body;
                    arrow.clearShapes();
                    arrow.addPolygon({ skipSimpleCheck: 1 }, [ 1,25, 31,0, 29,15, 49,15, 49,35, 29,35, 31,50 ].map(function(x){return 2*x - spr.width/2}));
                    arrow.angularVelocity = Math.random()*20 - 10;
                    arrow.mass = 25;
                    arrow.motionState = Phaser.Physics.P2.Body.STATIC;
                    arrow.debug = true;
                    scene.push([spr, spr.body.x, spr.body.y, spr.body.angle]);

                    game.input.onUp.add(function(){
                        if (arrow.static) {
                            var angle = arrow.rotation; // radians
                            var tan = Math.tan(angle);
                            var dx = target.x - arrow.x, dy = target.y - arrow.y;
                            var t = Math.sqrt(2 * (dy - dx * tan) / game.physics.p2.gravity.y);
                            var vx = dx / t;
                            var vy = vx * tan;
                            arrow.velocity.x = vx * 1.31;
                            arrow.velocity.y = vy * 1.1;
                            arrow.motionState = Phaser.Physics.P2.Body.DYNAMIC;
                        }
                    });
                },
                update: function() {
                    var angle = (game.input.y * -75/game.height) + 60;
                    if (arrow.static) {
                        arrow.angle = angle;
                    } else {
                        var anyMoving = false;
                        game.world.forEachExists(function(obj){
                            if (obj.body && obj.body.velocity) {
                                if (Math.abs(obj.body.velocity.x) > 3 || Math.abs(obj.body.velocity.y) > 3)
                                    anyMoving = true;
                            }
                        });
                        if (!anyMoving) {
                            for (i in scene) {
                                var entry = scene[i], obj = entry[0]
                                obj.reset(entry[1], entry[2]);
                                obj.body.angle = entry[3];
                            }
                            arrow.angularVelocity = Math.random()*20 - 10;
                            arrow.motionState = Phaser.Physics.P2.Body.STATIC;
                            for (i in removedConstraints) {
                                game.physics.p2.addConstraint(removedConstraints[i]);
                            }
                            removedConstraints = [];
                        } else {
                            var constraintsToRemove = [];
                            for (var i in game.physics.p2.world.constraints) {
                                var constraint = game.physics.p2.world.constraints[i];
                                if (constraint.breakDistance2) {
                                    var bodyA = constraint.bodyA, bodyB = constraint.bodyB;
                                    var dx = bodyB.position[0] - bodyA.position[0], dy = bodyB.position[1] - bodyA.position[1];
                                    var distance2 = dx*dx + dy*dy;
                                    if (distance2 > constraint.breakDistance2)
                                        constraintsToRemove.push(constraint);
                                }
                            }
                            for (i in constraintsToRemove) {
                                game.physics.p2.removeConstraint(constraintsToRemove[i]);
                                removedConstraints.push(constraintsToRemove[i]);
                            }
                            constraintsToRemove = [];
                        }
                    }
                },
            });

            game.load.image('bg_wise', 'assets/bg_wise.jpg');
            game.load.image('bg_fool', 'assets/bg_fool.jpg');
            game.load.image('arrow', 'assets/arrow.png');
            _.forOwn(parts, function(file, key) {
                game.load.image(key, 'assets/building/' + file);
            });
        },
        onEnter: function(prevState, background) {
            this.background = background;
            game.state.start('joshdemo');
        },
    });

    return { };
});
