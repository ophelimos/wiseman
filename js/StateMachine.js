(function(){
    "use strict";
    var global = window;

    var NULL_STATE_NAME = null;
    var NULL_STATE_OBJECT = {};
    var ATTACH_METHOD_NAME = 'onAttach'; // onAttach(StateMachine);
    var ENTER_METHOD_NAME  = 'onEnter';  // onEnter(String previousStateName, ...);
    var LEAVE_METHOD_NAME  = 'onLeave';  // onLeave(String nextStateName);
    var DETACH_METHOD_NAME = 'onDetach'; // onDetach(StateMachine);
    var DEBUG = false;

    var log = function(label, message) {
        if (label)
            message = label + ": " + message;
        console.log.apply(console, [message].concat(_.drop(arguments, 2)));
    };
    var error = function(label, message) {
        if (label)
            message = label + ": " + message;
        console.error.apply(console, [message].concat(_.drop(arguments, 2)));
    };

    // Create a state machine with a set of states attached.
    // The state machine will start in the null state.
    var StateMachine = function(name, states) {
        var self = this;
        // Always create an object, even if called as a function.
        if (self === undefined) // undefined because of "use strict"
            return new StateMachine(name, states);

        if (DEBUG)
            self._debug = DEBUG;
        // name is optional.
        if (typeof name !== "object")
            self._name = name;
        else
            states = name;
        self._currentStateName = NULL_STATE_NAME;
        self._currentState = NULL_STATE_OBJECT;
        self._states = states = states || {};
        _.forOwn(states, function(state) {
            state[ATTACH_METHOD_NAME] && state[ATTACH_METHOD_NAME](self);
        });
    };

    // Invoke a method on the current state with an argument list. (analogous to Function.apply)
    StateMachine.prototype.invokeWith = function(methodName, argumentList) {
        var state = this._currentState;
        if (DEBUG && !state) {
            error(this._name, "%s.%s(%s) %s", this._currentStateName, methodName, argumentList.toString(), "INVALID STATE");
            return;
        }
        if (DEBUG && this._debug)
            log(this._name, "%s.%s(%s) %s", this._currentStateName, methodName, argumentList.toString(), (state[methodName] ? "" : "ignored"));
        if (state && state[methodName])
            return state[methodName].apply(state, argumentList);
    };

    // Invoke a method on the current state. (analogous to Function.call)
    StateMachine.prototype.invoke = function(methodName /*, ... */) {
        return this.invokeWith(methodName, _.tail(arguments));
    };

    // Change state, invoking onLeave and onEnter methods.
    // Additional arguments are passed to the new state's onEnter method.
    StateMachine.prototype.to = function(stateName /*, ... */) {
        var oldStateName = this._currentStateName, newState = this._states[stateName];
        if (DEBUG && !newState) {
            error(this._name, "%s -> INVALID STATE %s", oldStateName, stateName);
            return;
        }
        if (this._currentState)
            this.invoke(LEAVE_METHOD_NAME, stateName);
        if (DEBUG && this._debug)
            log(this._name, "%s -> %s", oldStateName, stateName);
        this._currentStateName = stateName;
        this._currentState = newState;
        this.invokeWith(ENTER_METHOD_NAME,  [oldStateName].concat(_.tail(arguments)));
    };

    // Attach a new state to an existing state machine.
    StateMachine.prototype.addState = function(stateName, state) {
        this._states[stateName] = state;
        state[ATTACH_METHOD_NAME] && state[ATTACH_METHOD_NAME](this);
    };

    // Remove a state from a state machine.
    StateMachine.prototype.removeState = function(stateName) {
        if (DEBUG && stateName === this._currentStateName) {
            error(this._name, "Removing current state.");
            this.invoke(LEAVE_METHOD_NAME, NULL_STATE_NAME);
            this._currentStateName = NULL_STATE_NAME;
            this._currentState = NULL_STATE_OBJECT;
        }
        var state = this._states[stateName];
        if (state) {
            state[DETACH_METHOD_NAME] && state[DETACH_METHOD_NAME](this);
            delete this._states[stateName];
        }
    };

    // Remove all states from a state machine, to ensure there are no circular references.
    StateMachine.prototype.destroy = function() {
        var self = this;
        self.invoke(LEAVE_METHOD_NAME, NULL_STATE_NAME);
        self._currentStateName = NULL_STATE_NAME;
        self._currentState = NULL_STATE_OBJECT;
        // Remove states.
        _.forOwn(self._states, function(state) {
            state[DETACH_METHOD_NAME] && state[DETACH_METHOD_NAME](self);
        });
        self._states = {};
        // Remove any extra properties someone might have stuck on here.
        _.forOwn(self, function(value, property) {
            if (property.charAt(0) !== '_')
                delete self[property];
        });
    };

    global.StateMachine = StateMachine;
})();
