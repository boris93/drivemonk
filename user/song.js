var Speaker = require('speaker');
const EventEmitter = require('events');
const util = require('util');
var streamMeter = require('stream-meter');

var song = function (params) {
    var song = this;
    EventEmitter.call(this);
    this.states = {
        INIT: 'init',
        PLAYING: 'playing',
        PAUSED: 'paused',
        STOPPED: 'stopped',
        ENDED: 'ended'
    };
    this.state = this.states.INIT;
    this.emitState = function () {
        this.emit(this.state);
    };
    this.onPlaying = function () {
        this.state = this.states.PLAYING;
        this.emitState();
    };
    this.onPaused = function () {
        this.state = this.states.PAUSED;
        this.emitState();
    };
    this.onEnded = function () {
        this.state = this.states.ENDED;
        this.emitState();
    };
    this.onStopped = function () {
        this.state = this.states.STOPPED;
        this.emitState();
    };

    this.songInfo = params.songInfo;

    this.pcmFormat = params.pcmFormat || {};
    this.speakerStream = new Speaker(this.pcmFormat);
    this.speakerStream.once('close', function () {
        song.onEnded();
    });
    this.pcmSourceStream = params.pcmStream;
    this.pcmCounterStream = new streamMeter();
    this.pcmCounterStream.pipe(this.speakerStream);
};
util.inherits(song, EventEmitter);

song.prototype.play = function () {
    if (this.isInitialized() || this.isPaused()) {
        this.pcmSourceStream.pipe(this.pcmCounterStream);
        this.onPlaying();
    }
};

song.prototype.pause = function () {
    if (this.isPlaying()) {
        this.pcmSourceStream.unpipe(this.pcmCounterStream);
        this.onPaused();
    }
};

song.prototype.stop = function () {
    if (!(this.isEnded() || this.isStopped())) {
        this.speakerStream.removeAllListeners('close');
        var song = this;
        this.speakerStream.once('close', function () {
            song.onStopped();
        });
        this.speakerStream.end();
    }
    else {
        this.onStopped();
    }
};

song.prototype.isInitialized = function () {
    return this.state == this.states.INIT;
};
song.prototype.isPlaying = function () {
    return this.state == this.states.PLAYING;
};
song.prototype.isPaused = function () {
    return this.state == this.states.PAUSED;
};
song.prototype.isStopped = function () {
    return this.state == this.states.STOPPED;
};
song.prototype.isEnded = function () {
    return this.state == this.states.ENDED;
};

song.prototype.getPlayedDuration = function () {
    if (this.pcmFormat.sampleRate == 'undefined' || this.pcmFormat.bitDepth == 'undefined' || this.pcmFormat.channels == 'undefined') {
        return console.log("Invalid pcmFormat");
    }
    var samplesPerSecond = this.pcmFormat.sampleRate;
    var bytesPerSample = this.pcmFormat.bitDepth * this.pcmFormat.channels / 8;
    var bytesPerSecond = bytesPerSample * samplesPerSecond;
    return Math.round(this.pcmCounterStream.bytes / bytesPerSecond);
};

song.prototype.getInfo = function () {
    this.songInfo.playedDuration = this.getPlayedDuration();
    return this.songInfo;
};

module.exports = song;