(function(){
    "use strict";

    var global = window;
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
    var alignBox = function(ref, refAlign, obj, objAlign) {
        var box = obj ? { x: obj.width * objAlign.x, y: obj.height * objAlign.y, width: obj.width, height: obj.height } : { x: 0, y: 0 };
        box.x = ref.x + (ref.width * refAlign.x - box.x) / 100;
        box.y = ref.y + (ref.height * refAlign.y - box.y) / 100;
        return box;
    };
    
    [
    //   element id, sprite, scale, existing elements to connect to, position relative to first connected element
        ["door", "wise_doorpanel", ["base"], []],
        ["wall", "wise_plank", ["door", "base"], []],
        ["leftroof", "wise_leftroof", ["door"], []],
        ["rightroof", "wise_rightroof", ["wall", "leftroof"], []]
    ];
    
    var game;

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
    
    var start = function(screenMode) {
        document.body.className = "game";
        var ratio = screenModes[screenMode].ratio();
        // Clamp the screen ratio for full-screen with odd resolutions.
        if (ratio < 4/3) ratio = 4/3;
        if (ratio > 16/9) ratio = 16/9;
        var width = 2048, height = width / ratio;

        var arrow, target, device;
        var scene = [];
        var removedConstraints = [];
        game = new Phaser.Game(width, height, Phaser.AUTO, 'container', {
            preload: function() {
                game.load.image('bg', 'assets/bg_' + screenModes[screenMode].background + '.jpg');
                game.load.image('arrow', 'assets/arrow.png');
                game.load.spritesheet('planks', 'assets/planks.jpg', 90, 600);
                _.forOwn(parts, function(file, key) {
                    game.load.image(key, 'assets/building/' + file);
                });
            },
            create: function() {
                var size, pos, spr;

                game.physics.startSystem(Phaser.Physics.P2JS);
                // x, y, width, height, collide with left, right, top, bottom, setCollisionGroup
                game.physics.p2.setBounds(0, 0, width, height, true, true, false, true, false);
                game.physics.p2.gravity.y = 1000;
                game.physics.p2.gravity.x = 100;
                game.physics.p2.restitution = 0.3;
                game.physics.p2.friction = 1.1;

                // scale up the sky to fit as necessary
                size = game.cache.getFrame('bg');
                size = { width: size.width, height: size.height };
                if (width > size.width) {
                    size.height = size.height * width / size.width;
                    size.width = width;
                }
                if (height > size.height) {
                    size.width = size.width * height / size.height;
                    size.height = height;
                }
                // center the sky
                pos = alignBox(game.camera.view, { x: 50, y: 50 }, size, { x: 50, y: 50 });
                spr = game.add.image(pos.x, pos.y, 'bg');
                spr.width = size.width;
                spr.height = size.height;
                global.sky = spr;

                // throw it on the ground
                var platform = { x: 200, y: 1280, width: 800, height: 20 };
                // adjust for background position
                platform.y += (height - 1536) / 2;
                var groundBitmap = game.add.bitmapData(2048, 1);
                //groundBitmap.fill(0x00, 0x99, 0xCC, 1);
                var ground = game.add.sprite(0 + groundBitmap.width/2, platform.y + groundBitmap.height/2, groundBitmap);
                game.physics.p2.enable(ground);
                ground.body.motionState = Phaser.Physics.P2.Body.KINEMATIC;
                global.ground = ground;

                // house
                size = game.cache.getFrame('wise_doorpanel');
                // -50 because P2 positions sprites by their center
                pos = alignBox(platform, { x: 0, y: 0 }, size, { x: 0-50, y: 100-50 });
                spr = game.add.sprite(pos.x, pos.y, 'wise_doorpanel');
                spr.width = size.width;
                spr.height = size.height;
                game.physics.p2.enable(spr);
                scene.push([spr, spr.body.x, spr.body.y, spr.body.angle]);
                target = alignBox({ x: pos.x, y: pos.y, width: spr.height, height: spr.height }, { x: 50, y: 50 });
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

                lock(door, ground, 10);
                lock(side, ground, 10);
                lock(door, side, 5);

                /*
                // planky
                size = game.cache.getFrameByIndex('planks', 0);
                size = { width: size.width, height: size.height };
                size.width *= 0.4;
                size.height *= 0.4;
                // -50 because P2 positions sprites by their center
                pos = alignBox(platform, { x: 25, y: 0 }, size, { x: 50-50, y: 100-50 });
                spr = game.add.sprite(pos.x, pos.y, 'planks', Math.random()*10|0);
                spr.width = size.width;
                spr.height = size.height;
                game.physics.p2.enable(spr);
                scene.push([spr, spr.body.x, spr.body.y, spr.body.angle]);
                target = alignBox({ x: pos.x, y: pos.y, width: spr.height, height: spr.height }, { x: 50, y: 50 });
                var leftWall = spr;

                pos.x += size.height - size.width;
                spr = game.add.sprite(pos.x, pos.y, 'planks', Math.random()*10|0);
                spr.width = size.width;
                spr.height = size.height;
                game.physics.p2.enable(spr);
                scene.push([spr, spr.body.x, spr.body.y, spr.body.angle]);
                var rightWall = spr;

                pos.x -= size.height/2 - size.width/2;
                pos.y -= size.height/2 + size.width/2;
                spr = game.add.sprite(pos.x, pos.y, 'planks', Math.random()*10|0);
                spr.width = size.width;
                spr.height = size.height;
                game.physics.p2.enable(spr);
                spr.body.x = pos.x;
                spr.body.y = pos.y;
                spr.body.angle = 90;
                scene.push([spr, spr.body.x, spr.body.y, spr.body.angle]);
                var ceiling = spr;

                lock(ceiling, leftWall, 5);
                lock(ceiling, rightWall, 5);
                */

                size = game.cache.getFrame('arrow');
                pos = alignBox(game.camera.view, { x: 90, y: 60 }, size, { x: 50, y: 50 });
                spr = game.add.sprite(pos.x, pos.y, 'arrow');
                spr.width *= 2;
                spr.height *= 2;
                game.physics.p2.enable(spr);
                arrow = spr.body;
                arrow.clearShapes();
                arrow.addPolygon({ skipSimpleCheck: 1 }, [ 1,25, 31,0, 29,15, 49,15, 49,35, 29,35, 31,50 ].map(function(x){return 2*x}));
                arrow.angularVelocity = Math.random()*20 - 10;
                arrow.mass = 15;
                arrow.motionState = Phaser.Physics.P2.Body.STATIC;
                scene.push([spr, spr.body.x, spr.body.y, spr.body.angle]);

                // scale input to use canvas pixels rather than screen pixels
                game.input.scale.x = game.input.scale.y = width / game.canvas.offsetWidth;
                
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
                var angle = (game.input.y * -75/height) + 60;
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
            }
        });

        // make it globally visible for debugging
        global.game = game;
    };

    var setUpPrestart = function(device) {
        var handler = function() {
            start(this.id);
            if (this.id.substr(-11) === 'full_screen')
                document.body[device.requestFullscreen]();
            for (var mode in screenModes)
                document.getElementById(mode).removeEventListener('click', handler);
        };
        for (var mode in screenModes)
            document.getElementById(mode).addEventListener('click', handler);
    };

    // When the browser is done loading everything, take down the static loading text and get ready to start the game.
    var onComplete = function() {
        if (document.readyState === 'complete') {
            document.removeEventListener('readystatechange', onComplete);
            document.body.className = "prestart";
            Phaser.Device.whenReady(setUpPrestart);
        }
    };
    document.addEventListener("readystatechange", onComplete);
    onComplete();
    
})();
