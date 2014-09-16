// Copyright 2014 Google Inc. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
//     You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//     See the License for the specific language governing permissions and
// limitations under the License.

(function(shared, scope, testing) {

  var sequenceNumber = 0;

  var AnimationPlayerEvent = function(target, currentTime, timelineTime) {
    this.target = target;
    this.currentTime = currentTime;
    this.timelineTime = timelineTime;

    this.type = 'finish';
    this.bubbles = false;
    this.cancelable = false;
    this.currentTarget = target;
    this.defaultPrevented = false;
    this.eventPhase = Event.AT_TARGET;
    this.timeStamp = Date.now();
  };

  scope.Player = function(source) {
    this._sequenceNumber = sequenceNumber++;
    this._currentTime = 0;
    this._startTime = NaN;
    this.paused = false;
    this._playbackRate = 1;
    this._inTimeline = true;
    this._finishedFlag = false;
    this.onfinish = null;
    this._finishHandlers = [];
    this._source = source;
    this._inEffect = this._source._update(0);
    this._idle = false;
  };

  scope.Player.prototype = {
     // TODO: Do we need to touch/check the idle state here?
    _ensureAlive: function() {
      this._inEffect = this._source._update(this._currentTime);
      // if (!this._inTimeline && !this._idle && (this._inEffect || !this._finishedFlag)) {
      if (!this._inTimeline && (this._inEffect || !this._finishedFlag)) {
        this._inTimeline = true;
        document.timeline._players.push(this);
      }
    },
    _tickCurrentTime: function(newTime, ignoreLimit) {
      if (newTime != this._currentTime) {
        this._currentTime = newTime;
        if (this.finished && !ignoreLimit)
          this._currentTime = this._playbackRate > 0 ? this._totalDuration : 0;
        this._ensureAlive();
      }
    },
    get currentTime() {
      // if (this.playState == 'pending' || this._idle) ???
      if (this._idle)
        return NaN;
      return this._currentTime;
    },
    set currentTime(newTime) {
      if (scope.restart())
        this._startTime = NaN;
      if (!this.paused && !isNaN(this._startTime)) {
        this._startTime = this._timeline.currentTime - newTime / this._playbackRate;
      }
      if (this._currentTime == newTime)
        return;
      this._tickCurrentTime(newTime, true);
      scope.invalidateEffects();
    },
    get startTime() {
      return this._startTime;
    },
    set startTime(newTime) {
      if (this.paused)
        return;
      this._startTime = newTime;
      this._tickCurrentTime((this._timeline.currentTime - this._startTime) * this.playbackRate);
      scope.invalidateEffects();
    },
    get playbackRate() { return this._playbackRate; },
    get finished() {
      return !this._idle && (this._playbackRate > 0 && this._currentTime >= this._totalDuration ||
          this._playbackRate < 0 && this._currentTime <= 0);
    },
    get _totalDuration() { return this._source._totalDuration; },
    get playState() {
      if (this._idle)
        return 'idle';
      if (isNaN(this._startTime) && !this.paused && this.playbackRate != 0)
        return 'pending';
      if (this.paused)
        return 'paused';
      if (this.finished)
        return 'finished';
      return 'running';
    },
    play: function() {
      this.paused = false;
      if (this.finished) {
        this._currentTime = this._playbackRate > 0 ? 0 : this._totalDuration;
        scope.invalidateEffects();
      }
      this._finishedFlag = false;
      if (!scope.restart()) {
        this._startTime = this._timeline.currentTime - this._currentTime / this._playbackRate;
      }
      else
        this._startTime = NaN;
      // FIXME: Not sure if I should set idle above or below the restart(). I
      // think below (since if it was idle and you restart it then it was
      // restarted this frame).
      this._idle = false;
      this._ensureAlive();
    },
    pause: function() {
      this.paused = true;
      this._startTime = NaN;
    },
    finish: function() {
      // TODO: Native impl sets startTime to 0. Do we need to do that?
      this.currentTime = this._playbackRate > 0 ? this._totalDuration : 0;
      this._idle = false;
    },
    cancel: function() {
      // this._source = scope.NullAnimation(this._source._clear);
      this._inEffect = false;

      // FIXME: The native impl sets startTime to null upon cancel. Do we need
      // to do that? I don't think so. I think setting currentTime does it. See below.

      // FIXME: Here we set idle = true, then we set currentTime, which calls
      // restart() which will return true. Do we want to set idle = true
      // before or after setting currentTime? I think setting it before
      // setting currentTime is fine, because restart() should return true
      // again next time anyway.
      this._idle = true;
      this.currentTime = 0;
    },
    reverse: function() {
      this._playbackRate *= -1;
      this.play();
    },
    addEventListener: function(type, handler) {
      if (typeof handler == 'function' && type == 'finish')
        this._finishHandlers.push(handler);
    },
    removeEventListener: function(type, handler) {
      if (type != 'finish')
        return;
      var index = this._finishHandlers.indexOf(handler);
      if (index >= 0)
        this._finishHandlers.splice(index, 1);
    },
    _fireEvents: function(baseTime) {
      var finished = this.finished;
      var idle = this._idle;
      if ((finished || idle) && !this._finishedFlag) {
        var event = new AnimationPlayerEvent(this, this.currentTime, baseTime);
        var handlers = this._finishHandlers.concat(this.onfinish ? [this.onfinish] : []);
        setTimeout(function() {
          handlers.forEach(function(handler) {
            handler.call(event.target, event);
          });
        }, 0);
      }
      this._finishedFlag = finished;
    },
    _tick: function(timelineTime) {
      if (!this.paused && isNaN(this._startTime)) {
        this.startTime = timelineTime - this._currentTime / this.playbackRate;
      } else if (!(this.paused || this.finished || this._idle)) {
        this._tickCurrentTime((timelineTime - this._startTime) * this.playbackRate);
      }

      this._fireEvents(timelineTime);

      return !this._idle && (this._inEffect || !this._finishedFlag);
    },
  };

  if (WEB_ANIMATIONS_TESTING) {
    testing.Player = scope.Player;
  }

})(webAnimationsShared, webAnimationsMinifill, webAnimationsTesting);
