define(['lodash', 'phaser', 'Layout', 'StateMachine', 'game', 'Random', 'Util'],
function(_, Phaser, Layout, StateMachine, logicState, Random, Util){
    "use strict";

    var global = window;

    // Mass per pixel; large wall with door has ~335,000 pixels.
    // Masses around 500 start to visibly sink into the ground.
    var WOOD_DENSITY = 0.001;
    var PIECE_SCALE = 1;
    // Rain drops below this speed are killed.
    var DROP_VELOCITY_THRESHOLD = 0.02;
    // Generator for the number of new rain drops in each period.
    var DROP_COUNT_GEN = Random.poisson(5);
    // Number of milliseconds between raid drop periods.
    var DROP_TIMER_PERIOD = 100;
    var DRAG_THRESHOLD = 40;
    var SNAP_ANGLE_THRESHOLD = 10;
    var SNAP_DISTANCE_THRESHOLD = 40;
    var COS_SNAP_ANGLE_THRESHOLD = Math.cos(SNAP_ANGLE_THRESHOLD * Math.PI / 180);
    var SQR_SNAP_DISTANCE_THRESHOLD = SNAP_DISTANCE_THRESHOLD*SNAP_DISTANCE_THRESHOLD;
    var WIND_GEN = Random.noise1d(17);
    var MAX_WIND_STRENGTH = 2000;

    var bricks;
    var raindrops;
    var brickCollisionGroup;
    var rainCollisionGroup;
    var baseCollisionGroup;
    var mouseBody;
    var mouseConstraint;
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
                    trySnap(this.object);
                }
            }
        },
        end: function(x, y) {
            if (this.object) {
                var snap = trySnap(this.object);
                if (snap) {
                    if (snap.sprite)
                        lock(this.object.sprite, snap.sprite, 5);
                    getEdges(this.object.sprite, snapPool);
                } else {
                    this.object.sprite.destroy(true);
                }
            }
            this.object = undefined;
            if (this.moveCallbackIndex !== -1) {
                this.game.input.deleteMoveCallback(this.moveCallbackIndex);
                this.moveCallbackIndex = -1;
            }
        }
    };
    var pieceMap = {}, pieces = [
        {
            image: 'wisemanhouse_leftroof_prelim.png',
            outline: [
                495, 283,
                495, 66,
                183, 230,
                183, 283,
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

    var sumOverPolyEdges = function(poly, f, acc) {
        if (!acc)
            acc = new Util.SumAcc();
        var i = 0, n = poly.length;
        if (n < 4)
            return acc.sum;
        for (n -= 2; i < n; i += 2)
            acc.add(f(poly[i + 0], poly[i + 1], poly[i + 2], poly[i + 3]));
        acc.add(f(poly[i + 0], poly[i + 1], poly[0], poly[1]));
        return acc.sum;
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
            piece.width = image.width;
            piece.height = image.height;
            area = image.width * image.height;
        }
        piece.mass = piece.density * area;
    };
    var snapPool = [];
    var getEdges = function(sprite, list) {
        var piece, poly;
        piece = pieceMap[sprite.name];
        if (piece.outline)
            poly = piece.outline;
        else
            poly = [
                0, 0,
                0, piece.height,
                piece.width, piece.height,
                piece.width, 0,
            ];
        // origin, scaled
        // The sprite position is updated weirdly from the body position, so we have to take the body position.
        // Updating the sprite position directly doesn't help for some reason.
        var x0 = sprite.body.x - sprite.width * sprite.anchor.x, y0 = sprite.body.y - sprite.height * sprite.anchor.y;
        var sin = Math.sin(sprite.rotation), cos = Math.cos(sprite.rotation);
        return sumOverPolyEdges(poly, function(x1, y1, x2, y2) {
            // Convert from template to instance coordinate space.
            // (rotate, scale, translate)
            var xr, yr;
            xr = cos * x1 + sin * y1;
            yr = cos * y1 - sin * x1;
            x1 = x0 + xr * sprite.scale.x;
            y1 = y0 + yr * sprite.scale.y;
            xr = cos * x2 + sin * y2;
            yr = cos * y2 - sin * x2;
            x2 = x0 + xr * sprite.scale.x;
            y2 = y0 + yr * sprite.scale.y;
            // Make a ray segment from the edge.
            var dx = x2 - x1, dy = y2 - y1, length = Math.sqrt(dx*dx + dy*dy);
            return {
                sprite: sprite,
                edge: {
                    start:  { x: x1, y: y1 },
                    center: { x: (x1+x2)/2, y: (y1+y2)/2 },
                    end:    { x: x2, y: y2 },
                    dx: dx / length,
                    dy: dy / length,
                    length: length,
                },
            };
        }, new Util.ConcatAcc(list));
    };
    // Returns an offset and rotation to make object snap to target.
    // @param target The ray segment in the world to potentially snap to.
    // @param object The ray segment of the object.
    // @param pivot  The point around which the object segment will rotate.
    var snapDelta = function(target, object, pivot) {
        // Dot product of normalized vectors = cosine of angle between them.
        // Negative because we want them to be anti-parallel vectors.
        // (On opposite sides of their respective geometry.)
        var cos = -(target.dx * object.dx + target.dy * object.dy);
        if (cos < COS_SNAP_ANGLE_THRESHOLD)
            return null;

        // Get distance from center of object to infinite target line.
        var dx = object.center.x - target.start.x, dy = object.center.y - target.start.y;
        // This time the dot product is a projection object-target vector onto the target vector.
        var t = dx * target.dx + dy * target.dy;
        // That gives us the closest point on the infinite target line to that object center.
        var x = target.start.x + t * target.dx, y = target.start.y + t * target.dy;
        // ...and we can just get the distance between that point and the center.
        dx = x - object.center.x; dy = y - object.center.y;
        var dsqr = dx * dx + dy * dy;
        if (dsqr > SQR_SNAP_DISTANCE_THRESHOLD)
            return null;

        // It's close enough to the line to snap, but maybe not close enough to the finite segment.
        // But while we're looking at the target length, also figure out where we'd snap to along it.

        // The actual snap distances.
        dx = object.end.x - target.start.x; dy = object.end.y - target.start.y;
        var dsqrStart = dx * dx + dy * dy;
        dx = object.center.x - target.center.x; dy = object.center.y - target.center.y;
        var dsqrCenter = dx * dx + dy * dy;
        dx = object.start.x - target.end.x; dy = object.start.y - target.end.y;
        var dsqrEnd = dx * dx + dy * dy;

        var snapStart  = dsqrStart  <= SQR_SNAP_DISTANCE_THRESHOLD;
        var snapCenter = dsqrCenter <= SQR_SNAP_DISTANCE_THRESHOLD;
        var snapEnd    = dsqrEnd    <= SQR_SNAP_DISTANCE_THRESHOLD;

        if (!snapStart && !snapCenter && !snapEnd) {
            // Rejection snap distances.
            dx = object.start.x - target.start.x; dy = object.start.y - target.start.y;
            var dsqrRejectStart = dx * dx + dy * dy;
            dx = object.end.x - target.end.x; dy = object.end.y - target.end.y;
            var dsqrRejectEnd = dx * dx + dy * dy;

            // If either wrong end is closer than the right end, reject it.
            if (dsqrRejectStart < dsqrStart && dsqrRejectStart < dsqrEnd)
                return null;
            if (dsqrRejectEnd < dsqrStart && dsqrRejectStart < dsqrEnd)
                return null;
        }

        // Now we know we can snap -- just gotta figure out how.

        // Resolve conditions where we could snap multiple points.
        if (snapStart && snapEnd) {
            if (dsqrStart < dsqrEnd) {
                snapEnd = snapCenter = false;
            } else if (dsqrStart == dsqrEnd) {
                snapStart = snapEnd = false;
                snapCenter = true;
            } else {
                snapStart = snapCenter = false;
            }
        } else if (snapStart && snapCenter) {
            if (dsqrCenter < dsqrStart)
                snapStart = false;
            else
                snapCenter = false;
        } else if (snapEnd && snapCenter) {
            if (dsqrCenter < dsqrEnd)
                snapEnd = false;
            else
                snapCenter = false;
        }

        // We have at most one snap point now and can calculate the result.
        var result = {};

        // Need angle first because ends are going to rotate around the pivot.
        // We can't reuse the original dot product for angle, because it can't distinguish cw/ccw angles.
        // We could probably use atan2 here, but we need both sin and cos anyway for snapping distance.
        // Negative here because we want to rotate backwards by the angle between them.
        var sin = -(object.dx * target.dy - object.dy * target.dx);
        result.rotation = Math.asin(sin);
        // Using Phaser nomenclature, where rotation is radians and angle is degrees.
        result.angle = result.rotation * 180 / Math.PI;

        if (snapStart) {
            x  = target.start.x;  y  = target.start.y;
            dx = object.end.x;    dy = object.end.y;
            result.snap = 'start';
        } else if (snapCenter) {
            x  = target.center.x; y  = target.center.y;
            dx = object.center.x; dy = object.center.y;
            result.snap = 'center';
        } else if (snapEnd) {
            x  = target.end.x;    y  = target.end.y;
            dx = object.start.x;  dy = object.start.y;
            result.snap = 'end';
        } else {
            // x, y are already the closest point on target to (unrotated) center
            dx = object.center.x; dy = object.start.y;
            result.snap = 'nearest';
        }
        // Rotate around pivot.
        dx -= pivot.x; dy -= pivot.y;
        var rotatedx = pivot.x + cos * dx + sin * dy;
        var rotatedy = pivot.y + cos * dy - sin * dx;
        // Move rotated object point to target point.
        result.dx = x - rotatedx;
        result.dy = y - rotatedy;
        result.x = pivot.x + result.dx;
        result.y = pivot.y + result.dy;
        // Need a way to pick a snap when there are multiple choices.
        result.score =
            3 * result.rotation * result.rotation +
            1 * result.dx * result.dx +
            1 * result.dy * result.dy +
            -20 * (snapStart || snapCenter || snapEnd);

        return result;
    };
    var trySnap = function(body) {
        var edges = getEdges(body.sprite), bestSnap, bestSnapScore = 1/0;
        _.map(snapPool, function(target) {
            _.map(edges, function(object) {
                var snap = snapDelta(target.edge, object.edge, body);
                if (snap && snap.score < bestSnapScore) {
                    bestSnap = snap;
                    bestSnap.sprite = target.sprite;
                    bestSnapScore = snap.score;
                }
            });
        });
        if (bestSnap) {
            body.rotation = bestSnap.rotation;
            body.x = bestSnap.x;
            body.y = bestSnap.y;
        }
        return bestSnap;
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
    var backgrounds = {
        wise: {
            layout: [
                ['image', 'sky', ['bg_wise'], { x: 50, y: 80 }, { x: 50, y: 80 } ],
                ['solid', 'ground',   [1850, 730, { body: { kinematic: 1 } }], 'sky', { x: "-500px", y: "1310px" } ],
                ['solid', 'platform', [1000,  30, { body: { kinematic: 1 } }], { x: 0, y: 100 }, 'ground', { x: "600px", y: 0 } ],
            ],
            platform: {
                lock: 'platform',
                x: 190,
                y: 1280,
                width: 819,
            },
        },
        fool: {
            layout: [
                ['image', 'sky', ['bg_fool'], { x: 50, y: 80 }, { x: 50, y: 80 } ],
                ['solid', 'ground',   [3000, 730, { body: { kinematic: 1 } }], 'sky', { x: "-500px", y: "1310px" } ],
                ['solid', 'sand1',  [40,  40, { body: { dynamic: 1 } }], { x: 0, y: 100 }, 'ground', { x: "600px", y: 0 } ],
                ['solid', 'sand2',  [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand3',  [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand4',  [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand5',  [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand6',  [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand7',  [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand8',  [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand9',  [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand10', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand11', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand12', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand13', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand14', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand15', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand16', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand17', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand18', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand19', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand20', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand21', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand22', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand23', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand24', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand25', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand26', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand27', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand28', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand29', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand30', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand31', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand32', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
                ['solid', 'sand33', [40,  40, { body: { dynamic: 1 } }], '^', { x: 100, y: 0 } ],
            ],
            platform: {
                x: 190,
                y: 1280,
                width: 819,
            },
        },
    };

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

                    state.layout = Layout.add(backgrounds[state.background].layout.concat([
                        ['image', 'palette', ['palette'], { x: 100, y: 50 }, { x: "100%-36px", y: 50 } ],
                        ['button', 'done', [['256x164', 0, 0, 0, 0, buttonFont], "I’m\nDone!"], 'palette', { x: "293px", y: "839px" } ],
                        ['button', 'more', [['246x164', 0, 0, 0, 0, disabledFont], "More"], 'palette', { x: "31px", y: "839px" } ],
                        ['sprite', 'material0', ['material0', 0, { scale: 0.4 }], { x: 50, y: 50 }, 'palette', { x: "154px", y: "165px" } ],
                        ['sprite', 'material1', ['material1', 0, { scale: 0.4 }], { x: 50, y: 50 }, 'palette', { x: "421px", y: "165px" } ],
                        ['sprite', 'material2', ['material2', 0, { scale: 0.4 }], { x: 50, y: 50 }, 'palette', { x: "154px", y: "435px" } ],
                        ['sprite', 'material3', ['material3', 0, { scale: 0.4 }], { x: 50, y: 50 }, 'palette', { x: "421px", y: "435px" } ],
                    ]));

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
                        if (!state.layout[key])
                            return;
                        state.layout[key].body.setCollisionGroup(baseCollisionGroup);
                        state.layout[key].body.collides([baseCollisionGroup, brickCollisionGroup, rainCollisionGroup]);
                    });
                    for (var i = 1; i <= 33; ++i) {
                        var sprite = state.layout['sand' + i];
                        if (!sprite)
                            break;
                        sprite.body.clearShapes();
                        sprite.body.addCircle(sprite.width/2, 0, 0);
                        sprite.body.setCollisionGroup(baseCollisionGroup);
                        sprite.body.collides([baseCollisionGroup, brickCollisionGroup]);
                    }

                    // Initialize the snap pool with the platform.
                    var platform = backgrounds[state.background].platform;
                    var x1 = platform.x + platform.width, y1 = state.layout.sky.y + platform.y;
                    var x2 = platform.x, y2 = state.layout.sky.y + platform.y;
                    snapPool = [
                        {
                            sprite: platform.lock && state.layout[platform.lock],
                            edge: {
                                start:  { x: x1, y: y1 },
                                center: { x: (x1+x2)/2, y: (y1+y2)/2 },
                                end:    { x: x2, y: y2 },
                                dx: -1,
                                dy: 0,
                                length: platform.width,
                            },
                        }
                    ];

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
                },
            update: function() {
                    logicState.invoke('updatePhysics');
                },
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
                if (bricks.length === 0) {
                    // Didn't build anything...
                    Layout.add([
                        ['text', 'complainy', [
                                "All that behold it\n" +
                                "begin to mock him, saying,\n" +
                                "“This man began to build,\n" +
                                "and was not able to finish.”",
                                { font: "bold 48px 'Verdana'", fill: '#FFF', stroke: '#000', strokeThickness: 4, align: 'center'}
                            ], { x: 50, y: 50 }, { x: 50, y: 50 } ],
                    ], this.layout);
                }
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
            var hitbodies = this.game.physics.p2.hitTest(event.position, bricks.children);
            
            if (hitbodies.length)
                drag.begin(hitbodies[0].parent, event.position.x, event.position.y);
        },
        onUp: function(input, event) {
            if (drag.object) {
                drag.object.velocity.mx = drag.object.velocity.my = 0;
                drag.end(event.position.x, event.position.y);
            }
        },
    });

    var removedConstraints = [];
    var peakDropCount = 0;
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

            bricks.forEach(function(sprite) {
                sprite.body.motionState = Phaser.Physics.P2.Body.DYNAMIC;
            });

            // Create some raindrops
            for (var i = 0; i < 100; i++) {
                var drop = raindrops.create(0, 0, "raindrops");
                game.physics.p2.enable(drop);
                drop.animations.add('splash', [0, 1, 2, 3], 10, false);
                drop.body.setCollisionGroup(rainCollisionGroup);
                drop.body.collides([brickCollisionGroup, baseCollisionGroup], function(raindrop) {
                    raindrop.sprite.animations.play('splash', 15, false, true);
                });
                drop.kill();
            }
            game.time.events.loop(DROP_TIMER_PERIOD, this.dropRain, this);
        },
        dropRain: function() {
            var game = this.game, dropCount = 0;
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
                if (speed2 < DROP_VELOCITY_THRESHOLD*DROP_VELOCITY_THRESHOLD) {
                    drop.kill();
                    return;
                }
                dropCount += 1;
            });
            var n = DROP_COUNT_GEN();
            while (n--) {
                // Find a raindrop and drop it
                var drop = raindrops.getFirstDead(), speed;
                if (drop) {
                    drop.body.x = Math.random() * (game.world.width - drop.width);
                    drop.body.y = Math.random() * -2000;
                    speed = 0.05 + Math.random() * 0.2;
                    drop.body.velocity.x = game.physics.p2.gravity.x * speed;
                    drop.body.velocity.y = game.physics.p2.gravity.y * speed;
                    drop.revive();
                    // As a last resort, kill anything that survives for 10 seconds.
                    drop.lifespan = 10000;
                    drop.frame = 0;
                    dropCount += 1;
                }
            }
            if (dropCount > peakDropCount) {
                peakDropCount = dropCount;
                if (dropCount > 40)
                    console.log("Peak drop count: ", dropCount);
            }
        },
        updatePhysics: function() {
            var game = this.game;
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
            var t = game.time.totalElapsedSeconds(), wind = 0.75 * WIND_GEN(t * 0.3) + 0.25 * WIND_GEN(t * 0.8);
            game.physics.p2.gravity.x = wind * MAX_WIND_STRENGTH;
        },
    });

});
