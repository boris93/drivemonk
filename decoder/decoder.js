var socket = require('socket.io-client')('http://127.0.0.1:3000');
var ss = require('socket.io-stream');
var fs = require('fs');
var stdin = process.openStdin();
var opus = require('node-opus');
var ogg = require('ogg');
var state = require('./state');
var console = require('./console');
const constants = require('./constants');

var decoderPreference = require('./preference.json');

var stdinListener;

socket.on('connect', function () {
    state.initializing = true;
    console.print("Enter language preference : ");
    stdin.removeAllListeners();
    stdin.once('data', function (input) {
        decoderPreference.lang = input.toString().trim().toLowerCase();
        console.print("Language preference : " + decoderPreference.lang + "\n" + "Waiting for invitation");
        socket.emit('decoder-connect', {
            decoderPreference: decoderPreference
        });
        state.init();
        state.removeAllListeners();
        state.on(state.events.idle, function () {
            socket.emit('decoder-available');
        }).on(state.events.audioPlaying, function () {
            console.print("Playing speech");
        }).on(state.events.audioPlayed, function () {
            console.print("ENTER to replay, or type text : ");
        });
        state.setIdle();
        stdin.on('data', stdinListener);
    });
});

socket.on('decoder-availability-check-ping', function (requestParams) {
    if (state.isBusy()) {
        requestParams.decoderAvailable = false;
        socket.emit('decoder-availability-check-response', requestParams);
    }
    else {
        console.print("Press ENTER to accept invitation : ");
        state.setTaskInvitation(requestParams);
    }
});

socket.on('invitation-closed', function () {
    state.endInvitation();
    console.print("Invitation closed");
});

socket.on('abrupt-end', function (requestParams) {
    state.closeRequest();
    console.print("Closed by user\nWaiting for new Invitation");
});

ss(socket).on('audio-stream', function (oggStream, requestParams) {
    if (!state.isRequestPending()) {
        state.setRequestParams(requestParams);
        var oggDecoder = ogg.Decoder();
        oggDecoder.on('stream', function (opusStream) {
            var opusDecoder = new opus.Decoder(constants.AUDIO_OUTPUT_SAMPLE_RATE, constants.AUDIO_OUTPUT_CHANNELS, constants.OPUS_FRAME_SIZE);
            opusDecoder.on('format', function (rawPCMFormat) {
                state.setPCMFormat(rawPCMFormat);
                var speaker = state.getSpeaker();
                opusDecoder.on('data', function (buffer) {
                    speaker.write(buffer);
                    state.currentAudioBuffer = Buffer.concat([state.currentAudioBuffer, buffer]);
                }).on('end', function () {
                    speaker.end();
                });
            }).on('error', console.error);
            opusStream.pipe(opusDecoder);
        });
        oggStream.pipe(oggDecoder);
    }
});

socket.on('disconnect', function () {
    console.log("ServerSocket disconnected");
});

stdinListener = function (buffer) {
    if (!state.initializing) {
        var input = buffer.toString().trim();
        switch (input) {
            // Pressed enter key
            case '':
                if (state.isTaskInvitationPending()) {
                    // Decoder wants to accept invitation
                    var requestParams = state.taskInvitation;
                    requestParams.decoderAvailable = true;
                    state.acceptTaskInvitation();
                    socket.emit('decoder-availability-check-response', requestParams);
                    console.log("Accepted in : " + (Date.now() - state.invitationTime) + " ms");
                }
                else if (state.isRequestReadyForResponse()) {
                    // Decoder wants to replay
                    var speaker = state.getSpeaker();
                    speaker.write(state.currentAudioBuffer);
                    speaker.end();
                }
                break;
            default:
                if (state.isRequestReadyForResponse()) {
                    // Speech-to-text
                    // '-' signifies a PASS
                    state.setTextForRequest(input == '-' ? '' : input);
                    socket.emit('speech-to-text', state.getRequestParams());
                    // A decoder can respond to a request only once
                    state.closeRequest();
                    console.print("Text sent\nWaiting for Invitation");
                }
        }
    }
};