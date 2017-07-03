import instances from 'api/players';

define([
    'api/timer',
    'controller/controller',
    'plugins/plugins',
    'events/events',
    'events/states',
    'utils/backbone.events',
    'utils/helpers',
    'utils/underscore',
    'version'
], function(Timer, Controller, plugins,
            events, states, Events, utils, _, version) {

    let instancesCreated = 0;

    /**
     * Factory method for creating new controllers before calling `jwplayer().setup()`.
     * @param {Api} api
     * @param {HTMLElement} element
     */
    function setupController(api, element) {
        const controller = new Controller(element);

        // capture the ready event and add setup time to it
        controller.on(events.JWPLAYER_READY, (event) => {
            api._qoe.tick('ready');
            event.setupTime = api._qoe.between('setup', 'ready');
        });
        controller.on('all', (type, event) => {
            api.trigger(type, event);
        });

        return controller;
    }

    /**
     * Detach Api events listeners and destroy the controller.
     * @param {Api} api
     * @param {Controller} controller
     */
    function resetPlayer(api, controller) {
        api.off();
        controller.off();
        // so players can be removed before loading completes
        if (controller.playerDestroy) {
            controller.playerDestroy();
        }
    }

    /**
     * Remove the Api instance from the list of active players.
     * The instance will no longer be queryable via `jwplayer()`
     * @param {Api} api
     */
    function removePlayer(api) {
        for (let i = instances.length; i--;) {
            if (instances[i].uniqueId === api.uniqueId) {
                instances.splice(i, 1);
                break;
            }
        }
    }

    /** Class representing the jwplayer() API
     */
    class Api {

        /**
         * Create a player instance.
         * @param {HTMLElement} element - The element that will be replaced by the player's div container.
         */
        constructor(element) {
            // Add read-only properties which access privately scoped data
            // TODO: The alternative to pass this to the controller/model and access it from there
            const uniqueId = instancesCreated++;
            const id = element.id;
            const qoeTimer = new Timer();
            const pluginsMap = {};

            Object.defineProperties(this, {
                /**
                 * The player's query id.
                 * This matches the id of the element used to create the player at the time is was setup.
                 * @memberOf Api
                 * @type string
                 * @readonly
                 * @instance
                 */
                id: {
                    get: function() {
                        return id;
                    }
                },
                /**
                 * The player's unique id. It's value represents the number of player instances created on the page.
                 * @memberOf Api
                 * @type number
                 * @readonly
                 * @instance
                 */
                uniqueId: {
                    get: function() {
                        return uniqueId;
                    }
                },
                /**
                 * A map of plugin instances.
                 * @memberOf Api
                 * @type object
                 * @readonly
                 * @instance
                 */
                plugins: {
                    get: function() {
                        return pluginsMap;
                    }
                },
                /**
                 * The internal QoE Timer.
                 * @memberOf Api
                 * @type Timer
                 * @readonly
                 * @instance
                 */
                _qoe: {
                    get: function() {
                        return qoeTimer;
                    }
                }
            });

            /**
             * A map of event listeners.
             * @memberOf Api
             * @type object
             * @readonly
             * @instance
             */
            this._events = {};

            qoeTimer.tick('init');

            let _controller = setupController(this, element);

            /**
             * Call an internal method on the player's controller.
             * @param {string} name - The method to call.
             * @param {...*} [args] - Any arguments made after the name are passed to the internal method.
             * @return {*} Returns the result or null if the method is undefined.
             * @deprecate maybe - need a controller that only exposes the interface used here.
             */
            this.callInternal = function(name, ...args) {
                if (_controller[name]) {
                    return _controller[name].apply(_controller, args);
                }
                return null;
            };

            /**
             * Creates a new player on the page. Setup is asynchronous.
             * A "ready" event is triggered once successful.
             * A "setupError" event is triggered if setup fails.
             * @param {object} options - The player configuration options.
             * @returns {Api}
             */
            this.setup = function(options) {
                qoeTimer.clear('ready');
                qoeTimer.tick('setup');

                resetPlayer(this, _controller);
                _controller = setupController(this, element);

                // bind event listeners passed in to the config
                utils.foreach(options.events, (evt, val) => {
                    // TODO: if 'evt' starts with 'on' convert to event name and register event with `on` method
                    const fn = this[evt];
                    if (typeof fn === 'function') {
                        fn.call(this, val);
                    }
                });

                options.id = this.id;
                _controller.setup(options, this);

                return this;
            };

            /** Remove the player from the page. Remove is synchronous.
             * A "remove" event is fired [EDIT] as the player is removed.
             * Playback is stopped. The DOM used by the player is reset.
             * All event listeners attached to the player are removed.
             * @returns {Api}
             */
            this.remove = function() {
                // Remove from array of players
                removePlayer(this);

                // TODO: [EDIT] This should be fired after `resetPlayer`. Why is it fired before?
                // terminate state
                this.trigger('remove');

                // Unbind listeners and destroy controller/model/...
                resetPlayer(this, _controller);

                return this;
            };

        }

        /**
         * @return {string} The Player API version.
         * @readonly
         */
        get version() {
            return version;
        }

        /**
         * Provide Events module access to plugins from the player instance.
         * @deprecated TODO: in version 8.0.0-0
         * @readonly
         */
        get Events() {
            return Events;
        }

        /**
         * Provide plugins with access to utils from the player instance.
         * @deprecated TODO: in version 8.0.0-0
         * @readonly
         */
        get utils() {
            return utils;
        }

        /**
         * Provide plugins with access to underscore from the player instance.
         * @deprecated TODO: in version 8.0.0-0
         * @readonly
         */
        get _() {
            return _;
        }

        /**
         * Add an event listener.
         * @param {string} name - The event name. Passing "all" will bind the callback to all events fired.
         * @param {function} callback - The event callback.
         * @param {any} [context] - The context to apply to the callback function's invocation.
         * @return {Api}
         */
        on(name, callback, context) {
            return Events.on.call(this, name, callback, context);
        }

        /**
         * Add an event listener to only be triggered a single time.
         * After the first time the callback is invoked, it will be removed.
         * @param {string} name - The event name. Passing "all" will bind the callback to all events fired.
         * @param {function} callback - The event callback.
         * @param {any} [context] - The context to apply to the callback function's invocation.
         * @return {Api}
         */
        once(name, callback, context) {
            return Events.once.call(this, name, callback, context);
        }

        /**
         * Remove one or many callbacks.
         * @param {string} [name] - The event name. If null, removes all bound callbacks for all events.
         * @param {function} [callback] - If null, removes all callbacks for the event.
         * @param {any} [context] - If null, removes all callbacks with that function.
         * @return {Api}
         */
        off(name, callback, context) {
            return Events.off.call(this, name, callback, context);
        }

        /**
         * Trigger one or many events.
         * By default, the player will invoke callbacks inside a try-catch block
         * to prevent exceptions from breaking normal player behavior.
         * To disable this safety measure set `jwplayer.debug` to `true`.
         * @param {string} name - The event name.
         * @param {object} [args] - An object containing the event properties.
         * @return {Api}
         */
        trigger(name, args) {
            if (_.isObject(args)) {
                args = _.extend({}, args);
            } else {
                args = {};
            }
            args.type = name;
            const jwplayer = window.jwplayer;
            if (jwplayer && jwplayer.debug) {
                return Events.trigger.call(this, name, args);
            }
            return Events.triggerSafe.call(this, name, args);
        }

        /**
         * Trigger event callback inside a try catch block.
         * @deprecated TODO: in version 8.0.0-0
         */
        triggerSafe(type, args) {
            return Events.triggerSafe.call(this, type, args);
        }

        /**
         * Get the QoE properties of the player and current playlist item.
         * @returns {PlayerQoE}
         */
        qoe() {
            const qoeItem = this.callInternal('getItemQoe');

            const setupTime = this._qoe.between('setup', 'ready');
            const firstFrame = qoeItem.getFirstFrame();

            /** Player QoE returned from {@link Api#qoe jwplayer().qoe()}
             * @typedef {object} PlayerQoE
             * @property {number} setupTime - The number of milliseconds from `jwplayer().setup()` to the "ready" event.
             * @property {number} firstFrame - The number of milleseconds from the "playAttempt" event to the "firstFrame" event.
             * @property {TimerMetrics} player - The QoE metrics of the player.
             * @property {TimerMetrics} item - The QoE metrics of the current playlist item.
             */
            // {setupTime: number, firstFrame: number, player: object, item: object}
            return {
                setupTime: setupTime,
                firstFrame: firstFrame,
                player: this._qoe.dump(),
                item: qoeItem.dump()
            };
        }

        /**
         * Get the list of available audio tracks.
         * @returns {Array.<AudioTrackOption>}
         */
        getAudioTracks() {
            return this.callInternal('getAudioTracks');
        }

        /**
         * Get the percentage of the media's duration which has been buffered.
         * @returns {number} A number from 0-100 indicating the percentage of media buffered.
         */
        getBuffer() {
            return this.callInternal('get', 'buffer');
        }

        /**
         * Get custom captions styles.
         * @returns {object}
         */
        getCaptions() {
            return this.callInternal('get', 'captions');
        }

        // defined in controller/captions
        /**
         * Captions Track information for tracks returned by {@link Api#getCaptionsList jwplayer().getCaptionsList()}
         * @typedef {object} CaptionsTrackOption
         * @property {string} id
         * @property {string} label
         */

        /**
         * Get the list of available captions tracks.
         * The first item in the array will always be the "off" option,
         * regardless of whether the media contains captions.
         * @returns {Array.<CaptionsTrackOption>}
         */
        getCaptionsList() {
            return this.callInternal('getCaptionsList');
        }

        /**
         * Get a static representation of the player model.
         * @returns {object}
         */
        getConfig() {
            return this.callInternal('getConfig');
        }

        /**
         * Get the player's top level DOM element.
         * @returns {HTMLElement}
         */
        getContainer() {
            return this.callInternal('getContainer');
        }

        /**
         * Get whether or not controls are enabled.
         * @returns {boolean}
         */
        getControls() {
            return this.callInternal('get', 'controls');
        }

        /**
         * Get the index of the active audio track.
         * @returns {number} The index of the active audio track. -1 if there are no alternative audio tracks.
         */
        getCurrentAudioTrack() {
            return this.callInternal('getCurrentAudioTrack');
        }

        /**
         * Get the index of the active captions option.
         * @returns {number} The index of the active captions option. 0 when captions are off.
         */
        getCurrentCaptions() {
            return this.callInternal('getCurrentCaptions');
        }

        /**
         * Get the index of the active quality option.
         * @returns {number}
         */
        getCurrentQuality() {
            return this.callInternal('getCurrentQuality');
        }

        /**
         * Get the duration of the current playlist item.
         * @returns {number} The duration in seconds.
         * Live streams always return `Infinity`.
         * DVR streams return a negative value, indicating how far back from the live edge the stream goes.
         */
        getDuration() {
            return this.callInternal('get', 'duration');
        }

        /**
         * Get the player fullscreen state.
         * @returns {boolean} Whether or not the player is in fullscreen mode.
         */
        getFullscreen() {
            return this.callInternal('get', 'fullscreen');
        }

        /**
         * Get the player height.
         * @returns {number} The height of the player in pixels.
         */
        getHeight() {
            return this.callInternal('getHeight');
        }

        /**
         * Alias of `getPlaylistIndex()`
         * @deprecated TODO: in version 8.0.0-0
         */
        getItem() {
            return this.getPlaylistIndex();
        }

        /**
         * Get all the metadata for the current playlist item, merged into one object.
         * @returns {object}
         */
        getItemMeta() {
            return this.callInternal('get', 'itemMeta') || {};
        }

        /**
         * Alias of `getItemMeta()`
         * @deprecated TODO: in version 8.0.0-0
         */
        getMeta() {
            return this.getItemMeta();
        }

        /**
         * Get the player mute state.
         * @returns {boolean} Whether or not the player is muted.
         */
        getMute() {
            return this.callInternal('getMute');
        }

        /**
         * Get the rate at which playback should occur when media is playing.
         * @default 1.0
         * @returns {number} The playback rate of the media element (`HTMLMediaElement.playbackRate`).
         * @since v7.12.0
         */
        getPlaybackRate() {
            return this.callInternal('get', 'playbackRate');
        }

        /**
         * Get the player playlist.
         * @returns {Array.<PlaylistItem>}
         */
        getPlaylist() {
            return this.callInternal('get', 'playlist');
        }

        /**
         * Get the index of the current playlist item.
         * @returns {number}
         */
        getPlaylistIndex() {
            return this.callInternal('get', 'item');
        }

        /**
         * Get the current playlist item, or the item specified by `index`.
         * @param {number} [index] When specified, get the playlist item a this 0-based index.
         * @returns {PlaylistItem|null} Returns `null` when `index` is out of range.
         */
        getPlaylistItem(index) {
            if (!utils.exists(index)) {
                return this.callInternal('get', 'playlistItem');
            }
            const playlist = this.getPlaylist();
            if (playlist) {
                return playlist[index];
            }
            return null;
        }

        /**
         * Get the current playback time of the active media item.
         * @returns {number} The current playback time in seconds.
         * Live streams return the number of seconds played relative to when playback started (not since the live stream started).
         * DVR streams return a negative value, indicating how far playback is from the live edge.
         */
        getPosition() {
            return this.callInternal('get', 'position');
        }

        /**
         * @typedef {object} ProviderInfo
         * @property {string} name - The name of the provider handling playback.
         */

        /**
         * Get information about the player is handling playback.
         * @returns {ProviderInfo}
         */
        getProvider() {
            return this.callInternal('getProvider');
        }

        /**
         * Get the list of available quality options.
         * @returns {Array.<QualityOption>}
         */
        getQualityLevels() {
            return this.callInternal('getQualityLevels');
        }

        /**
         * @typedef {object} SafeRegion
         * @property {number} x - The position in pixels from the left of the player, not covered by controls.
         * @property {number} y -  The position in pixels from the top of the player, not covered by controls.
         * @property {number} width - The width of the safe region.
         * @property {number} height - The height of the safe region.
         */

        /**
         * Get the area of the player not obscured by controls.
         * @returns {SafeRegion}
         */
        getSafeRegion() {
            return this.callInternal('getSafeRegion');
        }

        /**
         * Get the player state.
         * @returns {'idle'|'buffering'|'playing'|'paused'|'complete'} The current state of the player.
         */
        getState() {
            return this.callInternal('getState');
        }

        /** Get the mode of stretching used to fit media in the player.
         * @returns {'uniform'|'exactfit'|'fill'|'none'}
         */
        getStretching() {
            return this.callInternal('get', 'stretching');
        }

        /**
         * Get player viewability.
         * @returns {1|0} Returns `1` when more than half the player is in the document viewport and the page's tab is active.
         * Also returns `1` when the player is in fullscreen mode. `0` otherwise.
         * @since v7.10.0
         */
        getViewable() {
            return this.callInternal('get', 'viewable');
        }

        /**
         * @typedef {object} VisualQuality
         * @property {QualityOption} level - The quality option associated with the active visual quality.
         * @property {'auto'|'manual'} mode - Whether the quality was selected automatically (adaptive quality switch) or manually.
         * @property {string|'initial choice'|'auto'|'api'} reason - The reason for the quality change.
         * @property {number} [bitrate] - The bitrate of the the active visual quality.
         */

        /**
         * Get information about the visual quality of the active media.
         * @returns {VisualQuality}
         */
        getVisualQuality() {
            return this.callInternal('getVisualQuality');
        }

        /**
         * Get the player volume level.
         * @returns {number} A number from 0-100.
         */
        getVolume() {
            return this.callInternal('get', 'volume');
        }

        /**
         * Get the player width.
         * @returns {number} The width of the player in pixels.
         */
        getWidth() {
            return this.callInternal('getWidth');
        }

        /**
         * Sets custom captions styles.
         * @param {object} captionsStyles
         * @returns {Api}
         * @since v7.5.0
         */
        setCaptions(captionsStyles) {
            this.callInternal('setCaptions', captionsStyles);
            return this;
        }

        /**
         * Update player config options.
         * @param options
         * @returns {Api}
         * @since v7.12.0
         */
        setConfig(options) {
            this.callInternal('setConfig', options);
            return this;
        }

        /**
         * Toggle player controls.
         * @param {boolean} [toggle] - Specifies whether controls should be enabled or disabled.
         * @returns {Api}
         */
        setControls(toggle) {
            this.callInternal('setControls', toggle);
            return this;
        }

        /**
         * Set the active audio track.
         * @param {number} index
         */
        setCurrentAudioTrack(index) {
            this.callInternal('setCurrentAudioTrack', index);
            // TODO: return this;
        }

        /**
         * Set the active captions option.
         * @param {number} index
         */
        setCurrentCaptions(index) {
            this.callInternal('setCurrentCaptions', index);
            // TODO: return this;
        }

        /**
         * Set the active quality option.
         * @param {number} index
         */
        setCurrentQuality(index) {
            this.callInternal('setCurrentQuality', index);
            // TODO: return this;
        }

        /**
         * Toggle fullscreen state. Most browsers require a user gesture to trigger entering fullscreen mode.
         * @param {boolean} [toggle] - Specifies whether to enter or exit fullscreen mode.
         * @returns {Api}
         */
        setFullscreen(toggle) {
            this.callInternal('setFullscreen', toggle);
            return this;
        }

        /**
         * Toggle the player mute state.
         * @param {boolean} [toggle] - Specifies whether to mute or unmute the player.
         * @returns {Api}
         */
        setMute(toggle) {
            this.callInternal('setMute', toggle);
            return this;
        }

        /**
         * Set the player default playerback rate. During playback, the rate of the current media will be set immediately if supported. Not supported when streaming live.
         * @param {number} playbackRate - The desired rate of playback. Limited to values between 0.25-4.0.
         * @returns {Api}
         * @since v7.12.0
         */
        setPlaybackRate(playbackRate) {
            this.callInternal('setPlaybackRate', playbackRate);
            return this;
        }

        /**
         * @typedef {object} SliderCue
         * @property {number} begin - The time at which the cue should be placed in seconds.
         * @property {string} text - The text label of the cue.
         */

        /**
         * Sets the list of cues to be displayed on the time slider.
         * @param {Array.<SliderCue>} sliderCues - The list of cues.
         * @returns {Api}
         */
        setCues(sliderCues) {
            this.callInternal('setCues', sliderCues);
            return this;
        }

        /**
         * Set the player volume level.
         * @param {number} level - A value from 0-100.
         * @returns {Api}
         */
        setVolume(level) {
            this.callInternal('setVolume', level);
            return this;
        }

        /**
         * Stop any active playback, and load either a new playlist, a new playlist item,
         * or an item already in the current playlist.
         * @param {string|Array.<PlaylistItem>|PlaylistItem|number} toLoad - The feed url, playlist,
         * playlist item, or playlist item index to load.
         * @param {object} [feedData] - The feed data to associate with playlist items.
         * Only applied when passing in a playlist or playlist items.
         * @returns {Api}
         */
        load(toLoad, feedData) {
            this.callInternal('load', toLoad, feedData);
            return this;
        }

        /**
         * Toggle or un-pause playback.
         * @param {boolean} [state] - An optional argument that indicates whether to play (true) or pause (false).
         * @param {object} [meta] - An optional argument used to specify cause.
         * @return {Api}
         */
        play(state, meta) {
            if (_.isObject(state) && state.reason) {
                meta = state;
            }
            if (!meta) {
                meta = { reason: 'external' };
            }
            if (state === true) {
                this.callInternal('play', meta);
                return this;
            } else if (state === false) {
                this.callInternal('pause', meta);
                return this;
            }

            state = this.getState();
            switch (state) {
                case states.PLAYING:
                case states.BUFFERING:
                    this.callInternal('pause', meta);
                    break;
                default:
                    this.callInternal('play', meta);
            }

            return this;
        }

        /**
         * Toggle or pause playback.
         * @param {boolean} [state] - An optional argument that indicates whether to pause (true) or play (false).
         * @param {object} [meta] - An optional argument used to specify cause.
         * @return {Api}
         */
        pause(state, meta) {
            // TODO: meta should no longer be accepted from the base API, it should be passed in to the controller by special wrapped interfaces
            if (_.isBoolean(state)) {
                return this.play(!state, meta);
            }

            return this.play(meta);
        }

        /**
         * Seek to a specific time in the active media. Resumes playback if the player is paused.
         * @param {number} position - The time to seek to.
         * @param [meta] - An optional argument used to specify cause.
         * @returns {Api}
         */
        seek(position, meta = { reason: 'external' }) {
            this.callInternal('seek', position, meta);
            return this;
        }

        /**
         * Stop any active playback, and play the item at the 0-based index in the playlist.
         * @param {number} index - If outside the range of the playlist,
         * the value will be wrapped to the playlist length.
         * @param [meta] - An optional argument used to specify cause.
         * @returns {Api}
         */
        playlistItem(index, meta = { reason: 'external' }) {
            this.callInternal('playlistItem', index, meta);
            return this;
        }

        /**
         * Stop any active playback, and play the next item in the playlist.
         * When the player is at the end of the playlist, this plays the first playlist item.
         * @param [meta] - An optional argument used to specify cause.
         * @returns {Api}
         */
        playlistNext(meta = { reason: 'external' }) {
            this.callInternal('playlistNext', meta);
            return this;
        }

        /**
         * Stop any active playback, and play the previous item in the playlist.
         * When the player is at the beginning of the playlist, this plays the last playlist item.
         * @param [meta] - An optional argument used to specify cause.
         * @returns {Api}
         */
        playlistPrev(meta = { reason: 'external' }) {
            this.callInternal('playlistPrev', meta);
            return this;
        }

        /**
         * Stop any active playback, and play the next up item specified by the related plugin.
         * The next up item is the next playlist item, or the first recommended video when at the end of the playlist.
         * @returns {Api}
         * @since v7.7.0
         */
        next() {
            this.callInternal('next');
            return this;
        }

        /**
         * Toggle the presence of the Airplay button in Safari (calls `HTMLMediaElement.webkitShowPlaybackTargetPicker`).
         * Does not affect the Chromecast button in Chrome.
         * @returns {Api}
         */
        castToggle() {
            this.callInternal('castToggle');
            return this;
        }

        /**
         * Creates a new instance of the instream adapter. If present, the previous instance created is destroyed first.
         * @returns {InstreamAdapter}
         */
        createInstream() {
            return this.callInternal('createInstream');
        }

        /**
         * Calls `skipAd` on the active instream adapter instance if present.
         * @returns {Api}
         */
        skipAd() {
            this.callInternal('skipAd');
            return this;
        }

        /**
         * Stop any active playback.
         * @returns {Api}
         */
        stop() {
            this.callInternal('stop');
            return this;
        }

        /**
         * Set the player width and height.
         * @param {number|string} width - Set the width in pixel (number) or CSS measurement units ('100%', '100em')
         * @param {number|string} [height] - Set the height in pixel (number) or CSS measurement units ('100%', '100em')
         * When specified, the "aspectratio" option included at setup is cleared.
         * @returns {Api}
         */
        resize(width, height) {
            this.callInternal('resize', width, height);
            return this;
        }

        /** Add or update a button in the player doc. The button is only displayed when controls are active.
         * @param {string} img - An image URL to use as the button icon.
         * @param {string} tooltip - A tooltip label to display when the button is hovered over.
         * @param {function} callback - A callback to invoke when the button is clicked.
         * @param {string} id - The id of the button to add or update.
         * @param {string} [btnClass] - CSS class(es) to add to the button element.
         * @returns {Api}
         */
        addButton(img, tooltip, callback, id, btnClass) {
            this.callInternal('addButton', img, tooltip, callback, id, btnClass);
            return this;
        }

        /**
         * Remove a button from the player doc.
         * @param {string} id - The id of the button to remove.
         * @returns {Api}
         */
        removeButton(id) {
            this.callInternal('removeButton', id);
            return this;
        }

        /**
         * Resume normal playback after an ad break
         * @deprecated TODO: in version 8.0.0-0
         */
        attachMedia() {
            this.callInternal('attachMedia');
            return this;
        }

        /**
         * Detach player state from current playback media before an ad break
         * @deprecated TODO: in version 8.0.0-0
         */
        detachMedia() {
            this.callInternal('detachMedia');
            return this;
        }

        /**
         * Check if the player has finished playing the current playlist item,
         * and has not yet transitioned to the "complete" state or started the next item.
         * This state is entered when playing postroll ads.
         * @returns {boolean}
         */
        isBeforeComplete() {
            this.callInternal('isBeforeComplete');
        }

        /**
         * Check if the player has yet to begin playback after playback has been requested.
         * This state is entered when playing preroll ads.
         * @returns {boolean}
         */
        isBeforePlay() {
            this.callInternal('isBeforePlay');
        }

        /**
         * Return the specified plugin instance.
         * @param {string} name - The name of the plugin.
         * @return {any} The plugin instance.
         */
        getPlugin(name) {
            return this.plugins[name];
        }

        /**
         * Add a plugin instance to the player instance.
         * @param {string} name - The name of the plugin.
         * @param {any} pluginInstance - The plugin instance.
         */
        addPlugin(name, pluginInstance) {
            this.plugins[name] = pluginInstance;

            this.on('ready', pluginInstance.addToPlayer);

            // A swf plugin may rely on resize events
            if (pluginInstance.resize) {
                this.on('resize', pluginInstance.resizeHandler);
            }
        }

        /**
         * Register a plugin class with the library.
         * @param {string} name - The name of the plugin.
         * @param {string} minimumVersion - The minimum player version required by the plugin.
         * @param {function} constructor - The plugin function or class to instantiate with new player instances.
         * @param {function} [constructor2] - (TODO: Deprecated in 8.0.0) When passed in, the previous argument is a path to the flash plugin and this argument is the JS contructor.
         */
        registerPlugin(name, minimumVersion, constructor, constructor2) {
            plugins.registerPlugin(name, minimumVersion, constructor, constructor2);
        }

        /**
         * Check for the presence of an ad blocker. Implementation is done in jwplayer-commercial.
         * @returns {boolean} - Returns true when an ad blocker is detected, otherwise false.
         */
        getAdBlock() {
            return false;
        }

        /**
         * Play an ad. Implementation is done in ad plugin.
         * @param {string|Array} adBreak - The ad tag or waterfall array.
         */
        playAd(/* eslint-disable no-unused-vars */adBreak/* eslint-enable no-unused-vars */) {
        }

        /**
         * Play an ad. Implementation is done in ad plugin.
         * @param {boolean} toggle - Specifies whether ad playback should be paused or resumed.
         */
        pauseAd(/* eslint-disable no-unused-vars */toggle/* eslint-enable no-unused-vars */) {
        }

        /**
         * @deprecated since version 7.0. TODO: remove in 8.0.0-0
         */
        getRenderingMode() {
            return 'html5';
        }

        /**
         * @deprecated TODO: in version 8.0.0-0
         */
        dispatchEvent() {
            this.trigger.apply(this, arguments);
        }

        /**
         * @deprecated TODO: in version 8.0.0-0
         */
        removeEventListener() {
            this.off.apply(this, arguments);
        }

        /**
         * @deprecated TODO: in version 8.0.0-0
         */
        onBuffer(callback) {
            this.on('buffer', callback);
        }

        onPause(callback) {
            this.on('pause', callback);
        }

        onPlay(callback) {
            this.on('play', callback);
        }

        onIdle(callback) {
            this.on('idle', callback);
        }

        onBufferChange(callback) {
            this.on(events.JWPLAYER_MEDIA_BUFFER, callback);
        }

        onBufferFull(callback) {
            this.on(events.JWPLAYER_MEDIA_BUFFER_FULL, callback);
        }

        onError(callback) {
            this.on(events.JWPLAYER_ERROR, callback);
        }

        onSetupError(callback) {
            this.on(events.JWPLAYER_SETUP_ERROR, callback);
        }

        onFullscreen(callback) {
            this.on(events.JWPLAYER_FULLSCREEN, callback);
        }

        onMeta(callback) {
            this.on(events.JWPLAYER_MEDIA_META, callback);
        }

        onMute(callback) {
            this.on(events.JWPLAYER_MEDIA_MUTE, callback);
        }

        onPlaylist(callback) {
            this.on(events.JWPLAYER_PLAYLIST_LOADED, callback);
        }

        onPlaylistItem(callback) {
            this.on(events.JWPLAYER_PLAYLIST_ITEM, callback);
        }

        onPlaylistComplete(callback) {
            this.on(events.JWPLAYER_PLAYLIST_COMPLETE, callback);
        }

        onReady(callback) {
            this.on(events.JWPLAYER_READY, callback);
        }

        onResize(callback) {
            this.on(events.JWPLAYER_RESIZE, callback);
        }

        onComplete(callback) {
            this.on(events.JWPLAYER_MEDIA_COMPLETE, callback);
        }

        onSeek(callback) {
            this.on(events.JWPLAYER_MEDIA_SEEK, callback);
        }

        onTime(callback) {
            this.on(events.JWPLAYER_MEDIA_TIME, callback);
        }

        onVolume(callback) {
            this.on(events.JWPLAYER_MEDIA_VOLUME, callback);
        }

        onBeforePlay(callback) {
            this.on(events.JWPLAYER_MEDIA_BEFOREPLAY, callback);
        }

        onBeforeComplete(callback) {
            this.on(events.JWPLAYER_MEDIA_BEFORECOMPLETE, callback);
        }

        onDisplayClick(callback) {
            this.on(events.JWPLAYER_DISPLAY_CLICK, callback);
        }

        onControls(callback) {
            this.on(events.JWPLAYER_CONTROLS, callback);
        }

        onQualityLevels(callback) {
            this.on(events.JWPLAYER_MEDIA_LEVELS, callback);
        }

        onQualityChange(callback) {
            this.on(events.JWPLAYER_MEDIA_LEVEL_CHANGED, callback);
        }

        onCaptionsList(callback) {
            this.on(events.JWPLAYER_CAPTIONS_LIST, callback);
        }

        onCaptionsChange(callback) {
            this.on(events.JWPLAYER_CAPTIONS_CHANGED, callback);
        }

        onAdError(callback) {
            this.on(events.JWPLAYER_AD_ERROR, callback);
        }

        onAdClick(callback) {
            this.on(events.JWPLAYER_AD_CLICK, callback);
        }

        onAdImpression(callback) {
            this.on(events.JWPLAYER_AD_IMPRESSION, callback);
        }

        onAdTime(callback) {
            this.on(events.JWPLAYER_AD_TIME, callback);
        }

        onAdComplete(callback) {
            this.on(events.JWPLAYER_AD_COMPLETE, callback);
        }

        onAdCompanions(callback) {
            this.on(events.JWPLAYER_AD_COMPANIONS, callback);
        }

        onAdSkipped(callback) {
            this.on(events.JWPLAYER_AD_SKIPPED, callback);
        }

        onAdPlay(callback) {
            this.on(events.JWPLAYER_AD_PLAY, callback);
        }

        onAdPause(callback) {
            this.on(events.JWPLAYER_AD_PAUSE, callback);
        }

        onAdMeta(callback) {
            this.on(events.JWPLAYER_AD_META, callback);
        }

        onCast(callback) {
            this.on(events.JWPLAYER_CAST_SESSION, callback);
        }

        onAudioTrackChange(callback) {
            this.on(events.JWPLAYER_AUDIO_TRACK_CHANGED, callback);
        }

        onAudioTracks(callback) {
            this.on(events.JWPLAYER_AUDIO_TRACKS, callback);
        }
    }

    return Api;
});
