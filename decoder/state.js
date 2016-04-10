var Speaker = require('speaker');
var events = require('events');

var state = new events.EventEmitter();

state.events = {
    idle: 'idle',
    audioPlaying: 'audio-playing',
    audioPlayed: 'audioPlayed'
};

state.init = function () {
    this.idle = true;
    this.initializing = false;
    this.audioPlaying = false;
    this.audioPlayed = false;
    this.currentRequestParams = null;
    this.currentAudioBuffer = new Buffer([]);
    this.taskInvitation = null;
    this.invitationTime = null;
    this.speaker = null;
    this.pcmFormat = {};
    this.invitationAcceptanceTimeoutDuration = 5000; // ms
    this.invitationAcceptanceTimer = null;
};

state.setIdle = function () {
    this.idle = true;
    this.emit(this.events.idle);
};

state.setBusy = function () {
    this.idle = false;
};

state.isBusy = function () {
    return !this.idle;
};

state.setPCMFormat = function (pcmFormat) {
    this.pcmFormat = pcmFormat;
};

state.getSpeaker = function () {
    this.speaker = new Speaker(this.pcmFormat);
    this.speaker.on("open", function () {
        state.audioPlaying = true;
        state.emit(state.events.audioPlaying);
    }).on("close", function () {
        state.audioPlaying = false;
        state.audioPlayed = true;
        state.emit(state.events.audioPlayed);
    });
    return this.speaker;
};

state.endSpeaker = function () {
    if (this.speaker != null)
        this.speaker.end();
};

state.resetAudioBuffer = function () {
    this.currentAudioBuffer = new Buffer([]);
};

state.setTaskInvitation = function (requestParams) {
    this.taskInvitation = requestParams;
    this.invitationTime = Date.now();
    this.setBusy();
    this.invitationAcceptanceTimer = setTimeout(state.endInvitation, this.invitationAcceptanceTimeoutDuration)
};

state.acceptTaskInvitation = function () {
    clearTimeout(this.invitationAcceptanceTimer);
    this.taskInvitation = null;
    this.setBusy();
};

// This can be called inside the timeout function, mind usage of 'this'
state.endInvitation = function () {
    state.taskInvitation = null;
    state.setIdle();
};

state.isTaskInvitationPending = function () {
    return this.taskInvitation != null;
};

state.setRequestParams = function (requestParams) {
    this.currentRequestParams = requestParams;
    this.setBusy();
};

state.getRequestParams = function () {
    return this.currentRequestParams;
};

state.setTextForRequest = function (text) {
    this.currentRequestParams.speechToText = text.trim().toLowerCase();
};

state.closeRequest = function () {
    this.currentRequestParams = null;
    this.audioPlayed = false;
    this.resetAudioBuffer();
    this.endSpeaker();
    this.setIdle();
};

state.isRequestPending = function () {
    return this.currentRequestParams != null;
};

state.isRequestReadyForResponse = function () {
    return this.isRequestPending() && !this.audioPlaying && this.audioPlayed;
};

module.exports = state;